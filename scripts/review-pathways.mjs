/* Research operations only. This report never activates models or edits a student's plan. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Catalog=require('../dist/program-catalog.js');
const root=resolve(import.meta.dirname,'..'),day=86400000,list=v=>Array.isArray(v)?v:[];
const prioritySchools=new Set(['Liberty University','Thomas Edison State University','Southern New Hampshire University','Western Governors University','University of Maine at Presque Isle']);
function date(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;const parsed=Date.parse(value+'T00:00:00Z');return Number.isFinite(parsed)&&new Date(parsed).toISOString().slice(0,10)===value?parsed:null;}
const reviewTimestamps=new Set(['checked','checkedOn','checkedAt','evidenceCheckedOn','mappingCheckedOn','retrievedAt','updatedAt']);
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).filter(k=>!reviewTimestamps.has(k)).sort().map(k=>[k,stable(value[k])]));return value;}
function url(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
export function requirementsFingerprint(model){
  // Rechecking a URL does not create a different degree; changing its academic facts does.
  const facts={};
  for(const name of ['id','school','title','level','catalog','creditSystem','totalCredits','institutionMinCredits','alternativeMaxCredits','externalMaxCredits','upperMinCredits','majorResidencyMinCredits','majorResidencyFraction','majorResidencyBasis','requirements','overlaps','graduationRequirements','pricing'])if(model[name]!==undefined)facts[name]=model[name];
  return createHash('sha256').update(JSON.stringify(stable(facts))).digest('hex');
}
export function buildReviewQueue({catalog,models,registry={models:[]},asOf}){
  const stamp=date(asOf);if(stamp===null)throw Error('Use a real review date in YYYY-MM-DD format.');
  const indexed=new Map(list(registry.models).map(entry=>[entry.id,entry])),byId=new Map();
  for(const model of models){if(byId.has(model.id))throw Error('Duplicate curriculum model: '+model.id);byId.set(model.id,model);}
  const sourceMap=new Map(),reviews=[];
  for(const model of models){
    const entry=indexed.get(model.id)||{},routes=list(catalog.pathways).filter(route=>route.modelId===model.id),requirements=list(model.requirements);
    const problems=[],allocated=requirements.reduce((sum,row)=>sum+(Number.isFinite(row.credits)?row.credits:0),0);
    const unresolved=requirements.filter(row=>row.researchGap||row.category==='unresolved').reduce((sum,row)=>sum+row.credits,0);
    const ledgerComplete=Number.isFinite(model.totalCredits)&&Math.abs(allocated-model.totalCredits)<0.001&&unresolved===0;
    if(!ledgerComplete)problems.push({kind:'requirements',detail:'Resolve the actual degree requirements and exact total before adding transfer choices.'});
    let candidateCredits=0,withoutOutside=0;
    for(const row of requirements){if(row.institutionalOnly||row.researchGap||row.category==='unresolved')continue;if(list(row.options).some(option=>option.provider&&option.provider!=='University'))candidateCredits+=row.credits;else withoutOutside+=row.credits;}
    if(['associate','bachelor'].includes(model.level||routes[0]?.level)&&withoutOutside>0)problems.push({kind:'course-mappings',detail:withoutOutside+' receiving credits have no researched outside option. Some may need university study; investigate before claiming transfer coverage.'});
    const policies=list(model.policyReview).filter(rule=>['unverified','unknown','needs-review'].includes(rule.status));
    if(policies.length)problems.push({kind:'policies',detail:'Confirm '+[...new Set(policies.map(rule=>rule.field))].join(', ')+'.'});
    const sourceIds=[];
    for(const source of list(model.sources)){
      const address=url(source.url);if(!address)continue;let record=sourceMap.get(address);
      if(!record){record={url:address,titles:[],modelIds:[],dates:[],hasUndatedReference:false};sourceMap.set(address,record);}
      record.titles=[...new Set([...record.titles,source.title||'Source reference'])];record.modelIds=[...new Set([...record.modelIds,model.id])];sourceIds.push(address);
      const checked=source.checkedOn||source.checked||source.checkedAt;
      if(date(checked)!==null)record.dates.push(checked);else record.hasUndatedReference=true;
    }
    const checkedOn=model.evidenceCheckedOn||entry.checkedOn||null,checkedStamp=date(checkedOn),due=checkedStamp===null||stamp-checkedStamp>=30*day||checkedStamp>stamp;
    if(due)problems.push({kind:'monthly-review',detail:checkedStamp===null?'The model needs a dated evidence review.':checkedStamp>stamp?'The model has a future evidence date; review the source metadata.':'The model evidence review is at least 30 days old.'});
    reviews.push({modelId:model.id,routeIds:routes.map(route=>route.id),school:model.school,title:model.title,creditSystem:model.creditSystem||null,totalCredits:model.totalCredits,allocatedRequirementCredits:allocated,unresolvedRequirementCredits:unresolved,requirementLedgerComplete:ledgerComplete,candidateReceivingCredits:candidateCredits,requirementsWithoutOutsideOptionCredits:withoutOutside,policyQuestions:policies.map(rule=>({field:rule.field,message:rule.message||''})),evidenceCheckedOn:checkedOn,reviewDue:due,requirementsFingerprint:requirementsFingerprint(model),sourceUrls:[...new Set(sourceIds)],problems,priority:(prioritySchools.has(model.school)?100:0)+(ledgerComplete?0:50)+(due?20:0)+(policies.length?10:0)+Math.min(19,Math.round(withoutOutside/(model.totalCredits||1)*19))});
  }
  const unmapped=list(catalog.pathways).filter(route=>!byId.has(route.modelId)&&route.routeType!=='career-guide'&&!['planned','upcoming','inactive','approval-pending'].includes(route.status));
  const directoryQueue=unmapped.map(route=>({routeId:route.id,school:route.school,title:route.title,level:route.level||'unsure',modalities:list(route.modalities),sourceUrl:url(route.url)||null,prioritySchool:prioritySchools.has(route.school),nextAction:'Import exact requirements and degree-specific transfer policies from the official catalog; do not reuse another degree map.'})).sort((a,b)=>Number(b.prioritySchool)-Number(a.prioritySchool)||a.school.localeCompare(b.school)||a.title.localeCompare(b.title));
  const sources=[...sourceMap.values()].map(source=>{const dates=[...new Set(source.dates)].sort(),oldest=dates[0]||null;return{...source,dates,oldestCheckedOn:oldest,reviewDue:source.hasUndatedReference||!oldest||stamp-date(oldest)>=30*day||dates.some(value=>date(value)>stamp)};}).sort((a,b)=>Number(b.reviewDue)-Number(a.reviewDue)||b.modelIds.length-a.modelIds.length||a.url.localeCompare(b.url));
  reviews.sort((a,b)=>b.priority-a.priority||a.school.localeCompare(b.school)||a.title.localeCompare(b.title));
  return{version:1,asOf,reviewCadenceDays:30,scope:'Research queue, not transfer approval or a count of execution-ready pathways.',summary:{directoryRoutes:list(catalog.pathways).length,requirementModels:reviews.length,balancedRequirementLedgers:reviews.filter(row=>row.requirementLedgerComplete).length,modelsDueForReview:reviews.filter(row=>row.reviewDue).length,directoryRoutesWithoutModel:directoryQueue.length,sourceUrls:sources.length,sourceUrlsDueForReview:sources.filter(source=>source.reviewDue).length},models:reviews,directoryQueue,sources};
}
async function main(){
  const args=process.argv.slice(2);for(let i=0;i<args.length;i++){if(args[i]==='--as-of'){if(!args[++i])throw Error('Add the review date after --as-of.');}else if(args[i]!=='--write')throw Error('Unknown argument: '+args[i]);}
  const asOf=args.includes('--as-of')?args[args.indexOf('--as-of')+1]:new Date().toISOString().slice(0,10),read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
  const registry=await read('dist/data/curriculum-registry.json'),catalog=Catalog.attachRegistry(Catalog.merge(await read('dist/data/pathways.json'),await read('dist/data/program-catalog.json')),registry),models=[];
  for(const path of [...new Set([...registry.models.map(entry=>entry.path),...Catalog.modelFiles])]){const payload=await read('dist/'+path);models.push(...(Array.isArray(payload)?payload:payload.models||[payload]));}
  const report=buildReviewQueue({catalog,models,registry,asOf});
  if(args.includes('--write')){await mkdir(resolve(root,'content/reviews'),{recursive:true});await writeFile(resolve(root,'content/reviews/pathway-review-'+asOf+'.json'),JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify({...report.summary,asOf,reviewCadenceDays:30,...(args.includes('--write')?{report:'content/reviews/pathway-review-'+asOf+'.json'}:{})}));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))main().catch(error=>{console.error(error.message);process.exitCode=1;});
