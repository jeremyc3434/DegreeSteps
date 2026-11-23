/** Pathway Factory automation: batch drafting (mocked Message Batches API), the draft-run PR body, the weekly freshness check (mocked fetch) and the site's "Rechecking" note. No network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readJSON,writeJSON,loadKit,sha256} from './scripts/pathway-factory/lib.mjs';
import {capture} from './scripts/pathway-factory/capture.mjs';
import {draftBatch,parseUrlList,runBatch,BATCHES_URL,MODEL,MAX_BATCH_URLS,estimateTokens,draftParams} from './scripts/pathway-factory/draft.mjs';
import {verifyKit} from './scripts/pathway-factory/verify.mjs';
import {draftRunMarkdown} from './scripts/pathway-factory/run-report.mjs';
import {checkFreshness,planFreshness,summaryMarkdown,FRESHNESS_USER_AGENT} from './scripts/pathway-factory/freshness.mjs';
import {freshnessFor,freshnessNoteHTML,loadPlanFreshness} from './scripts/public-plan-pages.mjs';

const html=body=>'<html><body>'+body+'</body></html>';
const page=(url,text,{status=200,type='text/html'}={})=>({ok:status>=200&&status<300,status,url,headers:{get:()=>type},text:async()=>text});
const json=value=>({ok:true,status:200,json:async()=>value,text:async()=>JSON.stringify(value)});
const draftFor=(title,rows)=>({title,level:'bachelor',catalog:'2026',totalCredits:rows.length*3,creditSystem:'semester',totalCreditsQuote:`Total: ${rows.length*3} credits`,gaps:[],requirements:rows.map(([code,name])=>({code,title:name,credits:3,category:'core',institutionalOnly:false,quote:`${code} ${name} 3 credits`}))});
const message=(draft,extra={})=>({id:'msg_x',type:'message',role:'assistant',model:MODEL,stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(draft)}],usage:{input_tokens:1200,output_tokens:900},...extra});

async function kitFixture({school=true}={}){
  const base=await mkdtemp(join(tmpdir(),'factory-automation-')),dir=join(base,'kits','demo'),captures=join(base,'captures');
  if(school)await writeJSON(join(dir,'school.json'),{kind:'pathway-kit-school',version:1,id:'demo',name:'Demo University',creditSystem:'semester',checkedOn:'2026-11-01',sources:[]});
  await mkdir(join(base,'kits','providers'),{recursive:true});
  return {base,dir,captures,cleanup:()=>rm(base,{recursive:true,force:true})};
}

test('batch mode submits every draft as one Message Batch without fallbacks, polls until it ends and writes each result by custom_id',async()=>{
  const f=await kitFixture();
  const pages={
    'https://demo.example/finance':html('<h1>Demo Finance</h1><p>FIN 201 Corporate Finance 3 credits</p><p>MTH 120 Statistics 3 credits</p><p>Total: 6 credits</p>'),
    'https://demo.example/history':html('<h1>Demo History</h1><p>HIS 101 World History 3 credits</p><p>Total: 3 credits</p>'),
    'https://demo.example/secret':html('<p>Something the model declines.</p>'),
    'https://demo.example/huge':html('<p>A page whose ledger is too long.</p>'),
  };
  const calls=[],polls=[];let batchPolls=0;
  const fetchImpl=async(url,init={})=>{
    calls.push({url,init});
    if(url===BATCHES_URL&&init.method==='POST')return json({id:'msgbatch_test',type:'message_batch',processing_status:'in_progress',request_counts:{processing:4,succeeded:0,errored:0,canceled:0,expired:0},results_url:null});
    if(url===BATCHES_URL+'/msgbatch_test'){batchPolls++;polls.push(url);return json({id:'msgbatch_test',type:'message_batch',processing_status:batchPolls<2?'in_progress':'ended',request_counts:{processing:batchPolls<2?4:0,succeeded:3,errored:1,canceled:0,expired:0},results_url:batchPolls<2?null:'https://api.anthropic.com/v1/messages/batches/msgbatch_test/results'});}
    if(url==='https://api.anthropic.com/v1/messages/batches/msgbatch_test/results'){
      // Out of order on purpose: results are keyed by custom_id, never by position.
      const lines=[
        {custom_id:'draft-4',result:{type:'succeeded',message:message({},{stop_reason:'max_tokens',content:[{type:'text',text:'{"title":'}]})}},
        {custom_id:'draft-2',result:{type:'succeeded',message:message(draftFor('Demo History',[['HIS 101','World History']]))}},
        {custom_id:'draft-3',result:{type:'succeeded',message:message({},{stop_reason:'refusal',stop_details:{type:'refusal',category:'cyber'},content:[]})}},
        {custom_id:'draft-1',result:{type:'succeeded',message:message(draftFor('Demo Finance',[['FIN 201','Corporate Finance'],['MTH 120','Statistics']]))}},
        {custom_id:'draft-5',result:{type:'errored',error:{type:'error',error:{type:'invalid_request_error',message:'bad'}}}},
      ];
      return {ok:true,status:200,text:async()=>lines.map(l=>JSON.stringify(l)).join('\n')+'\n'};
    }
    if(url==='https://demo.example/missing')return page(url,'',{status:404});
    if(pages[url])return page(url,pages[url]);
    throw Error('unexpected fetch '+url);
  };
  const logs=[];
  try{
    const urls=[...Object.keys(pages),'https://demo.example/missing'];
    const summary=await draftBatch({kitDir:f.dir,programUrls:urls,apiKey:'test-key',fetchImpl,today:'2026-11-20',captureDir:f.captures,base:f.base,log:m=>logs.push(m),pollMs:0,sleep:async()=>{}});
    const create=calls.find(c=>c.url===BATCHES_URL&&c.init.method==='POST'),body=JSON.parse(create.init.body);
    assert.equal(create.init.headers['x-api-key'],'test-key');
    assert.equal(create.init.headers['anthropic-version'],'2023-06-01');
    assert.equal(create.init.headers['anthropic-beta'],undefined,'no beta header in batch mode');
    assert.deepEqual(body.requests.map(r=>r.custom_id),['draft-1','draft-2','draft-3','draft-4'],'the failed capture is never submitted');
    for(const r of body.requests){
      assert.match(r.custom_id,/^[a-zA-Z0-9_-]{1,64}$/);
      assert.equal(r.params.model,'claude-opus-5-5');assert.equal(r.params.max_tokens,16000);
      assert.equal(r.params.output_config.effort,'high');assert.equal(r.params.output_config.format.type,'json_schema');
      assert.equal('fallbacks' in r.params,false,'batches cannot carry server-side fallbacks');
      assert.equal('stream' in r.params,false);
    }
    assert.match(body.requests[0].params.messages[0].content[0].text,/FIN 201 Corporate Finance 3 credits/);
    assert.equal(polls.length,2,'polled until processing_status was ended');
    assert.ok(logs.some(l=>/Estimated tokens \(offline/.test(l))&&logs.some(l=>/Estimated batch cost/.test(l)),'prints the estimate before submitting');
    assert.ok(logs.findIndex(l=>/Estimated tokens/.test(l))<logs.findIndex(l=>/Submitted batch/.test(l)));
    const by=Object.fromEntries(summary.items.map(i=>[i.url,i]));
    assert.equal(summary.batchId,'msgbatch_test');
    assert.equal(by['https://demo.example/finance'].status,'drafted');assert.deepEqual(by['https://demo.example/finance'].errors,[]);
    assert.deepEqual(by['https://demo.example/finance'].usage,{input:1200,output:900});
    assert.equal(by['https://demo.example/history'].slug,'demo-history');
    assert.match(by['https://demo.example/secret'].error,/declined.*\(cyber\)/);
    assert.match(by['https://demo.example/huge'].error,/max_tokens/);
    assert.match(by['https://demo.example/missing'].error,/HTTP 404/);
    for(const item of summary.items)assert.equal('text' in item||'params' in item,false,'the summary holds no page text');
    const kit=await loadKit(f.dir);
    assert.deepEqual(kit.programs.map(p=>[p.slug,p.status,p.review.status]),[['demo-finance','draft','draft'],['demo-history','draft','draft']]);
    const check=await verifyKit(kit,{asOf:'2026-11-20',routeIds:new Set(),base:f.base});
    assert.deepEqual(check.errors,[],'both drafts quote their captures verbatim');
    // The pull request body reports each page, its verification and its coverage.
    const md=draftRunMarkdown({summary,kit,verification:check});
    assert.match(md,/5 catalog page\(s\) submitted; 2 drafted; 2 pass verification/);
    assert.match(md,/demo-finance\.json.*passes.*0% \(0\/6 semester/);
    assert.match(md,/demo\.example\/secret \| failed/);
    assert.match(md,/status: draft/);
  }finally{await f.cleanup();}
});

test('batch mode creates a placeholder school for a new id, caps runs at 25 URLs and cancels a batch that never ends',async()=>{
  assert.throws(()=>parseUrlList(Array.from({length:MAX_BATCH_URLS+1},(_,i)=>'https://demo.example/p'+i).join('\n')),/at most 25/);
  assert.throws(()=>parseUrlList('http://demo.example/insecure'),/https/);
  assert.throws(()=>parseUrlList('\n# only a comment\n'),/No program URLs/);
  assert.deepEqual(parseUrlList('https://a.example/x\n\nhttps://a.example/x\n https://a.example/y \n'),['https://a.example/x','https://a.example/y']);
  const params=draftParams({text:'x'.repeat(3500),url:'https://a.example/x'}),estimate=estimateTokens(params);
  assert.ok(estimate.input>1000&&estimate.input<10000);assert.equal(estimate.maxOutput,16000);

  const f=await kitFixture({school:false});
  try{
    const fetchImpl=async(url,init={})=>{
      if(url===BATCHES_URL)return json({id:'b1',processing_status:'in_progress'});
      if(url===BATCHES_URL+'/b1')return json({id:'b1',processing_status:'ended',results_url:BATCHES_URL+'/b1/results'});
      if(url===BATCHES_URL+'/b1/results')return {ok:true,status:200,text:async()=>JSON.stringify({custom_id:'draft-1',result:{type:'succeeded',message:message(draftFor('New Program',[['NEW 101','Orientation']]))}})};
      return page(url,html('<p>NEW 101 Orientation 3 credits</p><p>Total: 3 credits</p>'));
    };
    const summary=await draftBatch({kitDir:f.dir,programUrls:['https://new.example/program'],apiKey:'k',fetchImpl,today:'2026-11-20',captureDir:f.captures,base:f.base,log:()=>{},pollMs:0,sleep:async()=>{}});
    const school=await readJSON(join(f.dir,'school.json'));
    assert.equal(school.id,'demo');assert.equal(school.creditSystem,'semester');assert.match(school.name,/official school name needed/);
    assert.equal(summary.newSchool,'kits/demo/school.json');assert.equal(summary.items[0].status,'drafted');

    const cancelled=[];let clock=0;
    const never=async(url,init={})=>{if(url.endsWith('/cancel')){cancelled.push(url);return json({id:'b2',processing_status:'canceling'});}return json({id:'b2',processing_status:'in_progress',request_counts:{processing:1}});};
    await assert.rejects(runBatch([{custom_id:'draft-1',params:{}}],{apiKey:'k',fetchImpl:never,pollMs:1,maxWaitMs:-1,sleep:async()=>{clock++;},log:()=>{}}),/cancelled/);
    assert.deepEqual(cancelled,[BATCHES_URL+'/b2/cancel']);
  }finally{await f.cleanup();}
});

test('the freshness check re-fetches every capture politely, reports changed pages with their plans and missing quotes, and records unreachable pages',async()=>{
  const base=await mkdtemp(join(tmpdir(),'factory-freshness-'));
  const kits=join(base,'content/pathway-kits'),captures=join(base,'content/source-captures'),dir=join(kits,'demo');
  const original={
    'https://demo.example/catalog':html('<p>BUS 101 Introduction to Business 3 credits</p><p>Total: 3 credits</p>'),
    'https://demo.example/stable':html('<p>Transfer policy: up to 90 credits.</p>'),
    'https://demo.example/blocked':html('<p>Blocked page</p>'),
    'https://demo.example/slow':html('<p>Slow page</p>'),
    'https://provider.example/orphan':html('<p>An uncited capture</p>'),
  };
  const stored={};
  for(const[url,body]of Object.entries(original))stored[url]=await capture(url,{dir:captures,fetchImpl:async()=>page(url,body),now:()=>new Date('2026-11-01T00:00:00Z')});
  const rel=path=>path.slice(base.length+1);
  await writeJSON(join(dir,'school.json'),{kind:'pathway-kit-school',version:1,id:'demo',name:'Demo University',creditSystem:'semester',checkedOn:'2026-11-01',sources:[
    {id:'demo-catalog',title:'Catalog',url:'https://demo.example/catalog',checked:'2026-11-01',capture:rel(stored['https://demo.example/catalog'].path)},
    {id:'demo-policy',title:'Policy',url:'https://demo.example/stable',checked:'2026-11-01',capture:rel(stored['https://demo.example/stable'].path)},
    {id:'demo-blocked',title:'Blocked',url:'https://demo.example/blocked',checked:'2026-11-01',capture:rel(stored['https://demo.example/blocked'].path)},
    {id:'demo-slow',title:'Slow',url:'https://demo.example/slow',checked:'2026-11-01',capture:rel(stored['https://demo.example/slow'].path)}]});
  await writeJSON(join(dir,'programs','bba.json'),{kind:'pathway-kit-program',version:1,slug:'bba',routeIds:['demo-bba'],title:'BBA',level:'bachelor',catalog:'2026',totalCredits:3,review:{status:'reviewed',reviewer:'R',reviewedOn:'2026-11-01'},
    requirements:[{id:'bba-bus101',code:'BUS 101',title:'Introduction to Business',credits:3,category:'core',institutionalOnly:false,sourceIds:['demo-catalog'],quotes:[{sourceId:'demo-catalog',text:'BUS 101 Introduction to Business 3 credits'}]}]});
  await writeJSON(join(dir,'programs','bsm.json'),{kind:'pathway-kit-program',version:1,slug:'bsm',routeIds:['demo-bsm'],title:'BSM',level:'bachelor',catalog:'2026',totalCredits:3,review:{status:'reviewed',reviewer:'R',reviewedOn:'2026-11-01'},
    requirements:[{id:'bsm-x',code:'BSM 1',title:'X',credits:3,category:'core',institutionalOnly:false,sourceIds:['demo-policy']}]});
  await mkdir(join(kits,'providers'),{recursive:true});
  const live={...original,'https://demo.example/catalog':html('<p>BUS 110 Business Foundations 3 credits</p><p>Total: 3 credits</p>'),'https://demo.example/stable':html('<p>Transfer   policy:  up to 90 credits.</p>')};
  const seen=[];
  const fetchImpl=async(url,init)=>{
    seen.push({url,ua:init.headers['user-agent'],signal:Boolean(init.signal)});
    if(url.endsWith('/blocked'))return page(url,'Forbidden',{status:403});
    if(url.endsWith('/slow'))throw Object.assign(Error('The operation was aborted due to timeout'),{name:'TimeoutError'});
    return page(url,live[url]);
  };
  try{
    const sleeps=[];
    const dry=await checkFreshness({base,asOf:'2026-11-23',fetchImpl,write:false,delayMs:5,sleep:async ms=>{sleeps.push(ms);},log:()=>{}});
    assert.equal((await readdir(captures)).length,10,'a dry run stores no captures');
    assert.equal(seen.length,5);assert.ok(seen.every(s=>s.ua===FRESHNESS_USER_AGENT&&/DegreeSteps/.test(s.ua)&&s.signal),'named user agent and a per-request timeout');
    assert.deepEqual(sleeps,[5,5,5,5],'sequential requests with a pause between them');
    assert.deepEqual(dry.summary,{sources:5,changed:1,unchanged:2,unreachable:2,programs:1,missingQuotes:1});
    assert.deepEqual(dry.unchanged.sort(),['https://demo.example/stable','https://provider.example/orphan'],'whitespace-only differences are not changes');
    assert.deepEqual(dry.unreachable.map(u=>[u.url,u.status]),[['https://demo.example/blocked',403],['https://demo.example/slow',null]]);
    assert.match(dry.unreachable[1].error,/timed out/);
    const [changed]=dry.changed;
    assert.equal(changed.url,'https://demo.example/catalog');assert.equal(changed.newCapture,null);
    assert.notEqual(changed.oldHash,changed.newHash);
    assert.deepEqual(changed.kits,['demo']);
    assert.deepEqual(changed.programs.map(p=>[p.kit,p.slug,p.routeIds]),[['demo','bba',['demo-bba']]],'only the program that cites the page');
    assert.deepEqual(changed.missingQuotes.map(q=>[q.claim,q.text]),[['requirement bba-bus101','BUS 101 Introduction to Business 3 credits']]);

    seen.length=0;
    const real=await checkFreshness({base,asOf:'2026-11-23',fetchImpl,delayMs:0,log:()=>{}});
    const newCapture=real.changed[0].newCapture;
    assert.match(newCapture,/^content\/source-captures\/[0-9a-f]{16}\.txt$/);
    assert.match(await readFile(join(base,newCapture),'utf8'),/BUS 110 Business Foundations/);
    assert.equal((await readJSON(join(base,newCapture.replace(/\.txt$/,'.json')))).url,'https://demo.example/catalog');
    assert.equal((await readdir(captures)).length,12,'one new capture and sidecar for the changed page only');
    assert.equal(JSON.parse(await readFile(join(dir,'school.json'),'utf8')).sources[0].capture,rel(stored['https://demo.example/catalog'].path),'kits are never edited');

    const flags=planFreshness(real.changed,{asOf:'2026-11-23',previous:{plans:{'demo-bba':{status:'rechecking',since:'2026-11-16'}}}});
    assert.deepEqual(flags.plans,{'demo-bba':{status:'rechecking',since:'2026-11-16'}},'an earlier detection date is kept');
    assert.deepEqual(planFreshness(real.changed,{asOf:'2026-11-23'}).plans,{'demo-bba':{status:'rechecking',since:'2026-11-23'}});
    assert.deepEqual(planFreshness([],{asOf:'2026-11-23'}).plans,{});
    const md=summaryMarkdown(real,{planFlags:1});
    assert.match(md,/5 captured source page\(s\) re-fetched: 1 changed, 2 unchanged, 2 unreachable/);
    assert.match(md,/missing quote \(demo requirement bba-bus101\)/);
    assert.match(md,/Unreachable \(not treated as changed\)/);
  }finally{await rm(base,{recursive:true,force:true});}
});

test('plans flagged in plan-freshness.json show a neutral rechecking note; a missing or empty file changes nothing',async()=>{
  const dist=await mkdtemp(join(tmpdir(),'plan-freshness-'));
  try{
    assert.deepEqual(await loadPlanFreshness(dist),{},'missing file');
    await mkdir(join(dist,'data'),{recursive:true});
    await writeFile(join(dist,'data/plan-freshness.json'),'');
    assert.deepEqual(await loadPlanFreshness(dist),{},'empty file');
    await writeFile(join(dist,'data/plan-freshness.json'),JSON.stringify({kind:'plan-freshness',version:1,plans:{'demo-bba':{status:'rechecking',since:'2026-11-23'},'demo-bad':{status:'rechecking',since:'soon'}}}));
    const plans=await loadPlanFreshness(dist);
    assert.deepEqual(freshnessFor(plans,'demo-bba'),{status:'rechecking',since:'2026-11-23'});
    assert.equal(freshnessFor(plans,'demo-bad'),null);assert.equal(freshnessFor(plans,'other'),null);
    assert.equal(freshnessNoteHTML(null),'');
    assert.equal(freshnessNoteHTML(freshnessFor(plans,'demo-bba')),'<p class="public-plan-freshness" role="note">Rechecking: the school updated a source page on November 23, 2026.</p>');
  }finally{await rm(dist,{recursive:true,force:true});}
  // The finder card and the worksheet read the same optional file and render the same wording.
  for(const file of ['dist/programs.js','dist/sheet.js']){
    const source=await readFile(file,'utf8');
    assert.match(source,/fetch\('data\/plan-freshness\.json'\)/,file);
    assert.match(source,/Rechecking: the school updated a source page on /,file);
  }
});
