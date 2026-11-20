import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadCases,loadData,grade,runEval,main} from './coach-eval.mjs';

const fixtureDir=new URL('../test-support/fixtures/coach/',import.meta.url).pathname;
const reply=(content,stop_reason)=>new Response(JSON.stringify({id:'m',type:'message',role:'assistant',content,stop_reason,usage:{input_tokens:1500,output_tokens:120,cache_creation_input_tokens:0,cache_read_input_tokens:2600}}),{status:200});

test('eval cases are well formed and reference real plans and pages from the coach data',async()=>{
  const cases=await loadCases();assert(cases.length>=25);assert.equal(new Set(cases.map(item=>item.id)).size,cases.length);
  const index=JSON.parse(readFileSync(new URL('../dist/data/coach-index.json',import.meta.url),'utf8'));
  const pages=new Set([...Object.values(index.plans).map(plan=>plan.page).filter(Boolean),...index.courses.map(course=>course.path)]);
  for(const item of cases){
    for(const id of item.expect_plan_ids)assert(index.plans[id],item.id+' expects unknown plan '+id);
    for(const link of item.must_link)assert(pages.has(link)||['/programs.html','/faq/','/guides/ace-nccrs-and-accreditation/'].includes(link)||/^\/portal\.html\?usePlan=[a-z0-9-]+$/.test(link)&&index.plans[link.split('=')[1]],item.id+' links to unknown page '+link);
    for(const tool of item.expect_tools)assert(['search_plans','get_plan','find_course_credit','explain'].includes(tool));
  }
});

test('grader catches invented prices, outside links, acceptance promises and missing grounding',()=>{
  const item={id:'x',question:'q',expect_tools:['get_plan'],expect_plan_ids:['wgu-catalog-ecceaa488637ac83'],must_contain:['$9,169'],must_contain_any:[['Planning estimate']],must_not_contain:['guaranteed price'],must_link:['/degree-plans/wgu-business-management/']};
  const toolText=JSON.stringify({plan:{plan_id:'wgu-catalog-ecceaa488637ac83',cost:'Planning estimate $9,169–$18,036',links:{plan_page:'/degree-plans/wgu-business-management/'}}});
  const good=grade(item,{answer:'Planning estimate $9,169–$18,036 for WGU Business Management.\n- Plan: /degree-plans/wgu-business-management/\nNext step: Open /portal.html',toolsCalled:['get_plan'],toolText});
  assert.equal(good.passed,true,JSON.stringify(good.checks.filter(c=>!c.ok)));
  const bad=grade(item,{answer:'It costs $7,500 and WGU will accept your credits. See https://wgu.edu and /degree-plans/made-up/',toolsCalled:[],toolText});
  const failed=bad.checks.filter(c=>!c.ok).map(c=>c.name);
  for(const name of ['tool','contains:$9,169','links-grounded','no-external-links','prices-grounded','no-acceptance-promise','next-step','link:/degree-plans/wgu-business-management/'])assert(failed.includes(name),name);
});

test('runEval drives the real coach handler with a mocked model and grades tool grounding',async()=>{
  const data=await loadData(fixtureDir),cases=(await loadCases()).filter(item=>['excelsior-psych-confirmation','unknown-course'].includes(item.id));
  const fetcher=async(url,options)=>{
    const body=JSON.parse(options.body),last=body.messages.at(-1),results=Array.isArray(last.content)?last.content.filter(block=>block.type==='tool_result'):[];
    const question=body.messages[0].content[0].text;
    if(!results.length)return reply([/Excelsior/.test(question)?{type:'tool_use',id:'t1',name:'get_plan',input:{plan_id:'excelsior-bs-psychology'}}:{type:'tool_use',id:'t1',name:'find_course_credit',input:{provider:'Study.com',course:'Business 101'}}],'tool_use');
    const result=JSON.parse(results[0].content);
    if(result.plan)return reply([{type:'text',text:'Excelsior’s B.S. in Psychology needs school confirmation. '+result.plan.open_questions[0]+' Cost: '+result.plan.cost+'.\nNext step: Open /portal.html?usePlan=excelsior-bs-psychology'}],'end_turn');
    return reply([{type:'text',text:'That course is not in DegreeSteps’ data yet, so ask the school.\nNext step: Browse /transfer/'}],'end_turn');
  };
  const report=await runEval({cases,data,fetcher,apiKey:'sk-ant-eval-mock-'+'x'.repeat(24),model:'claude-haiku-5-5'});
  assert.equal(report.cases,2);assert.equal(report.passed,2,JSON.stringify(report.results.map(r=>r.checks.filter(c=>!c.ok))));
  assert(report.costUsd>0);assert.deepEqual(report.results[0].toolsCalled,['get_plan']);
});

test('without --live the eval prints a plan and never calls the API',async()=>{
  let called=0;const lines=[];
  const result=await main([],{env:{ANTHROPIC_API_KEY:'sk-ant-'+'x'.repeat(30)},fetcher:async()=>{called++;},log:line=>lines.push(line)});
  assert.equal(result,null);assert.equal(called,0);assert.match(lines[0],/plan only/);
  await assert.rejects(main(['--live'],{env:{},fetcher:async()=>{called++;},log:()=>{}}),/ANTHROPIC_API_KEY/);assert.equal(called,0);
});
