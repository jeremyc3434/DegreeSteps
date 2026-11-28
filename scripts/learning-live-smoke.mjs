/** Explicit, bounded staging exercise with an ephemeral synthetic account.
 * Credentials arrive through stdin, never CLI arguments or a report. This
 * script makes real AI requests only with --allow-live-ai. It never pays for a
 * product, changes another account, or treats an AI response as a quality proof.
 */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

const ORIGIN='https://degreesteps-staging.degreesteps-d215df9a.workers.dev';
assert(process.argv.includes('--allow-live-ai'),'Explicit --allow-live-ai is required.');
let input='';for await(const part of process.stdin){input+=part;if(input.length>16000)throw Error('Invalid test credentials.');if(input.includes('\n'))break;}
const config=JSON.parse(input.trim());input='';
assert(config.origin===ORIGIN,'Only the fixed staging host is allowed.');
assert(/^learning-live-qa-[a-f0-9-]+@example\.invalid$/.test(config.email),'Use only a newly provisioned synthetic test account.');
assert(typeof config.password==='string'&&config.password.length>=24);
assert(/^sb-[a-f0-9-]{36}$/.test(config.expectedUserId));
const reportPath=resolve(config.reportPath||'outputs/learning/live/receipt.json');
assert(reportPath.startsWith(resolve('.')+'/outputs/')||reportPath.startsWith('/workspace/audits/'),'Reports must remain in the ignored QA workspace.');
const report={kind:'degreesteps-learning-live-staging-check',startedAt:new Date().toISOString(),origin:ORIGIN,identity:'Ephemeral synthetic student',checks:[],aiActionsRequested:0,paidPurchases:0};
let cookies=new Map(),course=null,project=null,sample=null;
async function api(path,{method='GET',body,timeout=240000}={}){
  assert(path.startsWith('/api/')&&!path.includes('://'));
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout),started=Date.now();
  try{
    const headers={Accept:'application/json',Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),...(body===undefined?{}:{Origin:ORIGIN,'Content-Type':'application/json',...(path.startsWith('/api/auth/')?{'X-Portal-Request':'1'}:{'X-Learning-Request':'1'})})};
    const response=await fetch(ORIGIN+path,{method,headers,redirect:'manual',signal:controller.signal,...(body===undefined?{}:{body:JSON.stringify(body)})});
    for(const value of response.headers.getSetCookie()){const first=value.split(';',1)[0],at=first.indexOf('=');if(at>0)cookies.set(first.slice(0,at),first.slice(at+1));}
    assert.match(response.headers.get('Cache-Control')||'',/no-store/);
    const text=await response.text();assert(Buffer.byteLength(text)<=2000000);
    let data;try{data=JSON.parse(text);}catch{throw Error('Non-JSON response at '+path);}
    if(!response.ok)throw Object.assign(Error('Request failed at '+path+' ('+response.status+', '+String(data.code||'no_code')+')'),{status:response.status,code:data.code});
    report.checks.push({path:path.replace(/[a-f0-9-]{36}/g,'[synthetic-id]'),method,status:response.status,durationMs:Date.now()-started});
    return data;
  }finally{clearTimeout(timer);}
}
function record(name,details={}){report.checks.push({name,passed:true,...details});}
try{
  const login=await api('/api/auth/login',{method:'POST',body:{email:config.email,password:config.password,returnTo:'/learn.html'}});config.password='';
  assert.equal(login.user.id,config.expectedUserId);record('Provider-verified account sign-in');
  const status=await api('/api/learning/status');assert(status.enabled&&status.signedIn&&status.storageReady&&status.aiConfigured);report.initialUsage=status.usage;
  const billing=await api('/api/learning/billing/status');assert.equal(billing.paymentsEnabled,false);record('Real checkout remains disabled');
  course=(await api('/api/learning/courses',{method:'POST',body:{title:'Operations management — synthetic live QA',provider:'DegreeSteps QA',syllabus:'Practice course. Learn to compare inventory policies, explain assumptions, support business recommendations with evidence and discuss limitations. This is an original synthetic exercise, not a live graded assessment.'}})).item;
  project=(await api('/api/learning/projects',{method:'POST',body:{courseId:course.id,kind:'writing',title:'Inventory recommendation — synthetic live QA',prompt:'Create an approximately 2,500-word working paper about choosing an inventory policy for a fictional small retailer with variable demand and unreliable supplier lead times. Compare economic order quantity, just-in-time and a reorder-point policy with safety stock. The retailer has five products and about 300 customer orders monthly; these are fictional case assumptions, not research findings. Develop a recommendation, explain quantitative inputs that would be needed, tradeoffs and limitations. Use real publicly available sources, cite their stable source IDs and do not invent studies, quotes, personal experience or calculations from missing data.',rubric:'Clear recommendation; accurate explanations of all three approaches; evidence and properly attributed sources; explicit case assumptions; limitations; readable organization; approximately 2,500 words.',studentNotes:'I recommend a reorder-point policy with safety stock while supplier lead times remain unreliable. My reasoning is that preventing stockouts matters more than minimizing every unit of inventory, but excessive stock also ties up cash. I would compare demand variation, holding costs, delivery times and the cost of lost sales before choosing reorder levels. I see just-in-time as more suitable if supplier reliability improves. The fictional case does not provide enough numeric inputs for a trustworthy optimized order quantity.',sources:[]}})).item;
  const planRequest={revision:project.revision,action:'plan',requestId:randomUUID()};report.aiActionsRequested++;
  project=(await api('/api/learning/projects/'+project.id+'/run',{method:'POST',body:planRequest})).item;
  assert(project.artifact?.content&&project.artifact.questions?.length);record('Live research and a usable approach',{sources:project.artifact.sources?.length||0,targetedQuestions:project.artifact.questions.length});
  const draftRequest={revision:project.revision,action:'draft',requestId:randomUUID()};report.aiActionsRequested++;
  const draft=await api('/api/learning/projects/'+project.id+'/run',{method:'POST',body:draftRequest});project=draft.item;sample=project.artifact;
  assert(sample?.content);const wordCount=sample.content.trim().split(/\s+/).length;
  report.paper={wordCount,sources:sample.sources?.length||0,sourceCoverage:sample.sourceChecks?.coverage,unknownCitations:sample.sourceChecks?.unknownCitations||[],claimSupportVerified:sample.sourceChecks?.claimSupportVerified===true};
  assert(wordCount>=2000,'The ten-page exercise returned an unexpectedly short draft.');
  assert((sample.sources?.length||0)>=2,'Research did not return enough traceable source identities.');
  record('Substantial working draft returned',{wordCount});
  const replay=await api('/api/learning/projects/'+project.id+'/run',{method:'POST',body:draftRequest});assert.equal(replay.replayed,true);record('Exact retry replays a saved result');
  const saved=(await api('/api/learning/projects/'+project.id)).item;assert.equal(saved.artifact.content,sample.content);record('Full draft survives a fresh private account read');
  if(config.other){
    assert(/^learning-live-qa-[a-f0-9-]+@example\.invalid$/.test(config.other.email)&&config.other.email!==config.email);
    assert(typeof config.other.password==='string'&&config.other.password.length>=24);
    const primaryCookies=cookies;cookies=new Map();
    try{
      const other=await api('/api/auth/login',{method:'POST',body:{email:config.other.email,password:config.other.password,returnTo:'/learn.html'}});config.other.password='';
      assert.equal(other.user.id,config.other.expectedUserId);
      await assert.rejects(()=>api('/api/learning/projects/'+project.id),error=>error.status===404);
      await assert.rejects(()=>api('/api/learning/courses/'+course.id),error=>error.status===404);
      record('A second real signed-in account cannot read the first account’s course or draft');
      await api('/api/auth/logout',{method:'POST',body:{}});
    }finally{cookies=primaryCookies;}
  }
  const study=(await api('/api/learning/projects',{method:'POST',body:{courseId:course.id,kind:'quiz',title:'Inventory practice — synthetic live QA',prompt:'Create five original multiple-choice practice questions about inventory policy tradeoffs, using the course context. Include explained answers.',studentNotes:'I want to check whether I can distinguish demand uncertainty, lead-time risk and holding costs.',sources:[]}})).item;report.aiActionsRequested++;
  const practice=(await api('/api/learning/projects/'+study.id+'/run',{method:'POST',body:{revision:study.revision,action:'quiz',requestId:randomUUID()}})).item;
  assert(practice.artifact.quiz?.length>=3);record('Live practice quiz returned structured questions',{questions:practice.artifact.quiz.length});
  report.finalUsage=(await api('/api/learning/status')).usage;
  report.passed=true;
}catch(error){report.passed=false;report.failure={message:String(error.message),...(error.code?{code:error.code}:{})};process.exitCode=1;}
finally{
  config.password='';
  if(config.other)config.other.password='';
  if(course){try{const latest=(await api('/api/learning/courses/'+course.id)).item;await api('/api/learning/courses/'+course.id,{method:'DELETE',body:{revision:latest.revision}});record('Synthetic course and all child work removed');}catch{report.cleanupNeedsOperator=true;}}
  try{await api('/api/auth/logout',{method:'POST',body:{}});record('Synthetic session signed out');}catch{report.cleanupNeedsOperator=true;}
  cookies.clear();report.finishedAt=new Date().toISOString();
  await mkdir(dirname(reportPath),{recursive:true});await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
  if(sample)await writeFile(reportPath.replace(/\.json$/,'.md'),sample.content+'\n\n'+(sample.sources||[]).map(s=>'['+s.id+'] '+s.title+' — '+s.url).join('\n')+'\n');
  console.log(JSON.stringify({passed:report.passed,report:reportPath,checks:report.checks.length,paperWords:report.paper?.wordCount,cleanupNeedsOperator:report.cleanupNeedsOperator===true}));
}
