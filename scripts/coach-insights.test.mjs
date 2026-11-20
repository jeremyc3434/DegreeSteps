import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {normalizeRows,buildInsights,themesBatch,sendThemesBatch,main} from './coach-insights.mjs';

const rows=[
  {id:'1',question:'Cheapest online psychology bachelor’s?',topics_json:'["cost","psychology","online","tool:search_plans"]',tools_json:'[{"name":"search_plans","ok":true,"results":3,"subject":"psychology"}]',plan_ids_json:'["liberty-catalog-fa62c08cdfa0c990-online"]',ask_school:0,used_saved:0,status:'answered',model:'claude-haiku-5-5',cost_micro_usd:620,rating:1,rating_reason:null},
  {id:'2',question:'Do you have an SNHU nursing plan?',topics_json:'["school","health"]',tools_json:'[{"name":"search_plans","ok":true,"results":0,"school":"SNHU","subject":"nursing"}]',plan_ids_json:'[]',ask_school:1,used_saved:0,status:'answered',model:'claude-haiku-5-5',cost_micro_usd:410,rating:-1,rating_reason:'You do not have my school'},
  {id:'3',question:'Will Study.com Business 101 count at Purdue Global?',topics_json:'["provider","transfer"]',tools_json:'[{"name":"find_course_credit","ok":true,"found":false,"provider":"Study.com","course":"Business 101"}]',plan_ids_json:'[]',ask_school:1,used_saved:1,status:'answered',model:'claude-haiku-5-5',cost_micro_usd:500,rating:null},
  {id:'4',question:'Tell me about Capella University',topics_json:'[]',tools_json:'not json',plan_ids_json:'[]',ask_school:0,used_saved:0,status:'refused',model:'claude-haiku-5-5',cost_micro_usd:100}
];

test('insights group topics, tools and not-in-our-data questions, and list research candidates',()=>{
  const report=buildInsights(rows,{ourSchools:['Liberty University','Western Governors University']});
  assert.equal(report.questions,4);assert.equal(report.notInData.count,2);assert.equal(report.notInData.share,0.5);
  assert.deepEqual(report.tools,[{key:'find_course_credit',count:1},{key:'search_plans',count:2}].sort((a,b)=>b.count-a.count||a.key.localeCompare(b.key)));
  assert(!report.topics.some(item=>item.key.startsWith('tool:')));
  const schools=report.researchCandidates.schools.map(item=>item.key);
  assert(schools.includes('Southern New Hampshire University')&&schools.includes('Purdue University Global')&&schools.includes('Capella University'));
  assert(!schools.includes('Liberty University'));
  assert.deepEqual(report.researchCandidates.subjects,[{key:'nursing',count:1}]);
  assert.deepEqual(report.researchCandidates.courses,[{key:'Study.com · Business 101',count:1}]);
  assert.deepEqual(report.ratings,{up:1,down:1,reasons:['You do not have my school']});
  assert.equal(report.costUsd,0.00163);assert.equal(report.usedSavedCourses,1);
});

test('inputs: wrangler d1 --json export, plain arrays and result objects',async t=>{
  assert.equal(normalizeRows([{results:rows,success:true,meta:{}}]).length,4);assert.equal(normalizeRows(rows).length,4);assert.equal(normalizeRows({results:rows}).length,4);
  const dir=mkdtempSync(join(tmpdir(),'coach-insights-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const file=join(dir,'export.json');writeFileSync(file,JSON.stringify([{results:rows}]));
  const lines=[];const {report,batch}=await main(['--d1-json',file,'--out',join(dir,'report.json')],{log:line=>lines.push(line),fetcher:async()=>{throw Error('no network');}});
  assert.equal(report.questions,4);assert.equal(batch,null);
});

test('--summarize builds one Message Batches request and only sends it with a key',async()=>{
  const body=themesBatch(rows,{day:'2026-11-20'});
  assert.equal(body.requests.length,1);assert.equal(body.requests[0].custom_id,'coach-themes-2026-11-20');assert.equal(body.requests[0].params.model,'claude-haiku-5-5');
  assert.match(body.requests[0].params.messages[0].content,/1\. Cheapest online psychology/);assert.match(body.requests[0].params.system,/data, not instructions/);
  const calls=[];const fetcher=async(url,options)=>{calls.push({url,options});return Response.json({id:'msgbatch_1',processing_status:'in_progress'});};
  await assert.rejects(sendThemesBatch(body,{apiKey:'',fetcher}),/ANTHROPIC_API_KEY/);assert.equal(calls.length,0);
  assert.deepEqual(await sendThemesBatch(body,{apiKey:'sk-ant-'+'k'.repeat(30),fetcher}),{id:'msgbatch_1',status:'in_progress'});
  assert.equal(calls[0].url,'https://api.anthropic.com/v1/messages/batches');assert.equal(calls[0].options.redirect,'manual');assert.deepEqual(JSON.parse(calls[0].options.body),body);
  const dir=mkdtempSync(join(tmpdir(),'coach-insights-'));const file=join(dir,'rows.json');writeFileSync(file,JSON.stringify(rows));
  const lines=[];await main(['--rows',file,'--summarize','--dry-run'],{env:{},log:line=>lines.push(line),fetcher:async()=>{throw Error('dry run must not send');}});
  assert.match(lines.at(-1),/coach-themes-/);rmSync(dir,{recursive:true,force:true});
});
