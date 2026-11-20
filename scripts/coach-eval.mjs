/** Degree coach eval: runs content/coach/eval.jsonl through the real coach handler and grades each answer.
 *
 *   node scripts/coach-eval.mjs            plan only: prints the cases and a rough cost estimate, calls nothing
 *   node scripts/coach-eval.mjs --live     calls the Messages API (needs ANTHROPIC_API_KEY; COACH_MODEL optional)
 *   options: --only <id>  --data <dir with plan-library-index/coach-index/coach-knowledge .json>  --out <report.json>
 *
 * Grading is automatic: tool grounding (expected tool called, expected plan ids present in tool results, every link
 * and dollar amount in the answer traceable to a tool result or a known page) plus string checks from the case. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {handleCoach,coachInternals} from '../server/coach.mjs';

const root=resolve(import.meta.dirname,'..');
const BASE_LINKS=new Set(['/programs.html','/portal.html','/faq/','/transfer/','/credits-worth.html','/plan.html']);
const lower=value=>String(value).toLowerCase();

export async function loadCases(path=resolve(root,'content/coach/eval.jsonl')){
  return (await readFile(path,'utf8')).split('\n').filter(line=>line.trim()).map((line,i)=>{
    const value=JSON.parse(line);
    for(const key of ['id','question'])if(typeof value[key]!=='string'||!value[key])throw Error('Eval line '+(i+1)+' needs '+key+'.');
    for(const key of ['expect_tools','expect_plan_ids','must_contain','must_contain_any','must_not_contain','must_link'])if(!Array.isArray(value[key]))throw Error('Eval line '+(i+1)+' needs an array '+key+'.');
    return value;
  });
}
export async function loadData(dir=resolve(root,'dist/data')){
  const read=async name=>JSON.parse(await readFile(resolve(dir,name+'.json'),'utf8'));
  return{library:await read('plan-library-index'),index:await read('coach-index'),knowledge:await read('coach-knowledge')};
}
function memoryDB(){
  const sqlite=new DatabaseSync(':memory:');
  return{sqlite,async init(){const journal=JSON.parse(await readFile(resolve(root,'drizzle/meta/_journal.json'),'utf8'));for(const entry of journal.entries)sqlite.exec(await readFile(resolve(root,'drizzle',entry.tag+'.sql'),'utf8'));return this;},
    prepare(sql){const query=sqlite.prepare(sql);return{bind:(...values)=>({first:async()=>query.get(...values)||null,all:async()=>({results:query.all(...values)}),run:async()=>({meta:{changes:Number(query.run(...values).changes)}})})};}};
}

/** Grades one answer against its case, using everything the tools returned during that conversation. */
export function grade(testCase,{answer,toolsCalled,toolText}){
  const checks=[],check=(name,ok,detail='')=>checks.push({name,ok:Boolean(ok),...(ok?{}:{detail})});
  const text=lower(answer),evidence=lower(toolText);
  check('tool',!testCase.expect_tools.length||testCase.expect_tools.some(tool=>toolsCalled.includes(tool)),'expected one of '+testCase.expect_tools.join(', ')+'; called '+(toolsCalled.join(', ')||'none'));
  for(const id of testCase.expect_plan_ids)check('plan:'+id,evidence.includes(lower(id)),'tool results did not include '+id);
  for(const value of testCase.must_contain)check('contains:'+value,text.includes(lower(value)));
  for(const group of testCase.must_contain_any)check('any:'+group.join('|'),group.some(value=>text.includes(lower(value))));
  for(const value of testCase.must_not_contain)check('not:'+value,!text.includes(lower(value)));
  for(const link of testCase.must_link)check('link:'+link,answer.includes(link));
  const links=[...answer.matchAll(/(?:^|[\s(])(\/[A-Za-z0-9\-._~\/?=&%#+]*)/g)].map(match=>match[1].replace(/[.,;:!?]+$/,''));
  const ungrounded=links.filter(link=>!BASE_LINKS.has(link)&&!toolText.includes(link));
  check('links-grounded',!ungrounded.length,'links not from tools: '+ungrounded.join(', '));
  check('no-external-links',!/https?:\/\//i.test(answer),'answer contains a full web address');
  const amounts=[...answer.matchAll(/\$\s?\d[\d,]*(?:\.\d+)?/g)].map(match=>match[0].replace(/\s/g,''));
  const invented=amounts.filter(amount=>!toolText.includes(amount));
  check('prices-grounded',!invented.length,'prices not from tools: '+invented.join(', '));
  check('no-acceptance-promise',!/\b(will (definitely |certainly )?(accept|transfer)|guaranteed? to (transfer|count|be accepted))\b/i.test(answer.replace(/(?:not|never|can't|cannot|won't) (?:promise|guarantee)[^.]*\./gi,'')),'answer promises acceptance');
  check('length',answer.split(/\s+/).filter(Boolean).length<=170,'over 170 words');
  check('next-step',/next step:/i.test(answer),'missing "Next step:"');
  return{id:testCase.id,passed:checks.every(item=>item.ok),score:checks.filter(item=>item.ok).length/checks.length,checks};
}

/** Runs cases through handleCoach. `fetcher` is the Messages API fetch (mock in tests, real only with --live). */
export async function runEval({cases,data,fetcher,apiKey,model}){
  const DB=await memoryDB().init(),results=[],usage={input:0,output:0,cacheWrite:0,cacheRead:0,micros:0};
  try{
    for(const testCase of cases){
      const requests=[];
      const recording=async(url,options)=>{requests.push(JSON.parse(options.body));return fetcher(url,options);};
      const env={DB,COACH_ENABLED:'1',COACH_HASH_SALT:'coach-eval-local-salt-000',COACH_ANON_DAILY_LIMIT:'500',COACH_DAILY_USD_CAP:'1000',COACH_MODEL:model,COACH_DATA:async()=>data,COACH_RESOLVE_KEY:async()=>apiKey,COACH_FETCH:recording};
      const response=await handleCoach(new Request('https://eval.degreesteps.invalid/api/coach/ask',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://eval.degreesteps.invalid','X-Coach-Request':'1','CF-Connecting-IP':'192.0.2.'+(results.length%250)},body:JSON.stringify({question:testCase.question})}),env);
      const body=await response.json();
      const blocks=requests.flatMap(request=>request.messages.flatMap(message=>Array.isArray(message.content)?message.content:[]));
      const toolsCalled=[...new Set(blocks.filter(block=>block.type==='tool_use').map(block=>block.name))];
      const toolText=blocks.filter(block=>block.type==='tool_result').map(block=>String(block.content)).join('\n');
      const row=DB.sqlite.prepare('SELECT input_tokens,output_tokens,cache_write_tokens,cache_read_tokens,cost_micro_usd FROM coach_questions ORDER BY created_at DESC LIMIT 1').get();
      if(row){usage.input+=row.input_tokens;usage.output+=row.output_tokens;usage.cacheWrite+=row.cache_write_tokens;usage.cacheRead+=row.cache_read_tokens;usage.micros+=row.cost_micro_usd;}
      const graded=response.ok?grade(testCase,{answer:body.answer,toolsCalled,toolText}):{id:testCase.id,passed:false,score:0,checks:[{name:'http',ok:false,detail:response.status+' '+(body.code||'')}]};
      results.push({...graded,status:body.status||body.code,toolsCalled,answer:body.answer||body.error});
    }
  }finally{DB.sqlite.close();}
  return{cases:results.length,passed:results.filter(result=>result.passed).length,meanScore:results.length?Math.round(results.reduce((sum,result)=>sum+result.score,0)/results.length*1000)/1000:0,costUsd:usage.micros/1e6,usage,results};
}

export async function main(args=process.argv.slice(2),{env=process.env,fetcher=fetch,log=console.log}={}){
  const at=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null;};
  let cases=await loadCases();if(at('--only'))cases=cases.filter(item=>item.id===at('--only'));
  const model=env.COACH_MODEL==='claude-sonnet-5-5'?'claude-sonnet-5-5':'claude-haiku-5-5';
  if(!args.includes('--live')){
    const prompt=coachInternals().SYSTEM_PROMPT.length+JSON.stringify(coachInternals().TOOLS).length;
    log(JSON.stringify({mode:'plan only (pass --live to call the API)',cases:cases.length,model,estimatedPrefixTokens:Math.round(prompt/4),note:'Each case makes about 2-3 model calls. See the coach report for per-message cost estimates.'},null,1));
    return null;
  }
  if(typeof env.ANTHROPIC_API_KEY!=='string'||env.ANTHROPIC_API_KEY.length<20)throw Error('Set ANTHROPIC_API_KEY to run the live eval.');
  const report=await runEval({cases,data:await loadData(at('--data')?resolve(at('--data')):undefined),fetcher,apiKey:env.ANTHROPIC_API_KEY,model});
  if(at('--out'))await writeFile(resolve(at('--out')),JSON.stringify(report,null,1)+'\n');
  log(JSON.stringify({cases:report.cases,passed:report.passed,meanScore:report.meanScore,costUsd:report.costUsd,failed:report.results.filter(result=>!result.passed).map(result=>({id:result.id,failed:result.checks.filter(item=>!item.ok)}))},null,1));
  return report;
}
if(import.meta.url===pathToFileURL(process.argv[1]).href)await main();
