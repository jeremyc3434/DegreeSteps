/** Stage an uploaded public research inventory. Never publishes curricula or executes workbook expressions. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const root=resolve(import.meta.dirname,'..');
const defaults={input:resolve(root,'outputs/research/ace-program-inventory/workbook.json'),output:resolve(root,'content/research-batches/ace-inventory-2026-11-18.json')};
const string=v=>typeof v==='string'?v.trim():v==null?'':String(v);
const number=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const norm=v=>string(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const titleKey=v=>norm(string(v).toLowerCase().replace(/\b(?:bachelor|master|associate)(?:['’]s)?\s+(?:of\s+)?(?:science|arts|business administration)\b/g,'').replace(/\b(?:b\.?s\.?|b\.?a\.?|bba|bsba)\b/g,''));
const url=v=>{try{const u=new URL(string(v));return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
const links=(r,cols)=>[...new Set(cols.map(c=>url(r[c])).filter(Boolean))];
const table=(workbook,name,header)=>{
 if(!Array.isArray(workbook?.[name]?.rows))throw Error('Missing inventory sheet: '+name);
 return workbook[name].rows.filter(r=>r.row>header).map(r=>({_row:r.row,...Object.fromEntries(r.cells.map(c=>[c.column,c.value]))}));
};
const key=r=>JSON.stringify(['A','B','C','D'].map(c=>string(r[c])));
const hash=v=>createHash('sha256').update(v).digest('hex');
const sourceIds=v=>[...string(v).matchAll(/\b[A-Z]{3,6}-\d{4,}\b/g)].map(m=>m[0]);
const scope=value=>/future bridge/i.test(value)?'future-bridge-catalog':/future/i.test(value)?'future-catalog':/pre.nursing/i.test(value)?'pre-nursing-phase':/optional certificate/i.test(value)?'optional-credential':/partial/i.test(value)?'partial-degree-map':/50%/i.test(value)?'workbook-reported-50-percent-route':'published-provider-map';

export function stageInventory(workbook,{programCatalog={programs:[]},registry={models:[]}}={}){
 const maps=table(workbook,'Program maps',4),matches=table(workbook,'Course matches',4),qualifying=table(workbook,'Meets 50% ACE',1),university=table(workbook,'University credit',4);
 const all=[...(programCatalog.programs||[]),...(registry.models||[]).flatMap(m=>(m.routeIds||[m.id]).map(id=>({id,school:m.school,title:m.title,modelId:m.id})))];
 const byId=new Map(all.map(p=>[p.id,p]));
 const grouped=new Map();for(const r of matches){const k=key(r);if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(r);}
 const scenarios=[],seen=new Set(),errors=[];
 for(const r of maps){
  const k=key(r);if(seen.has(k))throw Error('Duplicate school/degree/catalog/provider scenario at row '+r._row);seen.add(k);
  const rows=grouped.get(k)||[],chosen=new Set();let chosenSum=0;
  const courseMappings=rows.map(row=>{
   const ids=sourceIds(row.I),selected=ids.length>0;
   if(selected){if(!(number(row.F)>0))errors.push('Selected mapping lacks positive receiving quantity at Course matches row '+row._row);chosenSum+=number(row.F)||0;}
   for(const id of ids){if(chosen.has(id))errors.push('Repeated chosen ACE identity '+id+' in '+r.A+' / '+r.B+' / '+r.D);chosen.add(id);}
   return {workbookRow:row._row,receivingRequirement:string(row.E),receivingAward:{quantity:number(row.F),unit:string(row.G)||null},acceptableIdentifierExpression:string(row.H),chosenIdentifierExpression:string(row.I),chosenIdentifiers:ids,chosenCourseNames:string(row.J)||null,selected,treatment:string(row.K),originalSourceCredit:{quantity:null,unit:null,status:'not-separately-stated-in-workbook'},creditOrigin:'reported-ACE-recommended-learning',originalIssuer:null,originalIssuerStatus:'requires-provider-course-identity-review',evidenceUrls:links(row,['L','M']),verificationStatus:'staged-unreviewed'};
  });
  if(Math.abs(chosenSum-(number(r.F)||0))>0.000001)errors.push('Chosen receiving-unit sum does not equal Program maps row '+r._row);
  const supplied=string(r.K),existing=byId.get(supplied),validSupplied=existing&&norm(existing.school)===norm(r.A);
  const candidates=[...new Set(all.filter(p=>norm(p.school)===norm(r.A)&&titleKey(p.title)===titleKey(r.B)).map(p=>p.id))].sort();
  scenarios.push({id:'ace-inventory-'+hash(k).slice(0,20),workbookRow:r._row,school:string(r.A),degree:string(r.B),catalog:string(r.C),provider:string(r.D),scope:scope(string(r.E)),workbookScopeLabel:string(r.E),mappedReceivingQuantity:number(r.F),receivingUnit:string(r.G)||null,workbookExplanation:string(r.H),workbookSchoolPotentialQuantity:number(r.I),workbookDegreeQuantity:number(r.J),suppliedCatalogId:supplied||null,reconciliation:{status:validSupplied?'existing-id-requires-scope-review':candidates.length?'possible-existing-program-requires-scope-review':'unresolved-program-identity',existingId:validSupplied?supplied:null,candidateExistingIds:candidates,requiredDimensions:['school','degree','track','catalog','delivery-format','provider-course-version']},evidenceUrls:links(r,['L','M']),validation:{chosenReceivingQuantity:chosenSum,chosenIdentitiesUnique:true,quantityReconciled:Math.abs(chosenSum-(number(r.F)||0))<=0.000001},publicationAllowed:false,verificationStatus:'staged-unreviewed',courseMappings});
 }
 for(const k of grouped.keys())if(!seen.has(k))errors.push('Course mappings have no matching Program maps scenario: '+k);
 if(errors.length)throw Error(errors.join('\n'));
 const qualificationClaims=qualifying.map(r=>{
  const q=number(r.E),d=number(r.F),share=number(r.G);
  if(!(q>0&&d>0&&q<=d&&share>=0.5&&Math.abs(q/d-share)<0.000001))throw Error('Inconsistent 50 percent workbook claim at row '+r._row);
  return {workbookRow:r._row,school:string(r.A),degree:string(r.B),catalog:string(r.C),provider:string(r.D),reportedMappedQuantity:q,reportedDegreeQuantity:d,reportedShare:share,unit:string(r.H),finishLocation:string(r.I),evidenceUrls:links(r,['J','K']),status:'workbook-claim-not-independent-verification',publicationAllowed:false};
 });
 const priorityMap=new Map();for(const q of qualificationClaims){if(q.school==='Western Governors University'&&q.degree==='BS Business Management')continue;const k=JSON.stringify([q.school,q.degree,q.catalog]);if(!priorityMap.has(k))priorityMap.set(k,{school:q.school,degree:q.degree,catalog:q.catalog,reason:'Workbook reports at least 50 percent mapped ACE units; complete-degree, format, policy and provider-version review still required.',sourceClaimRows:[],evidenceUrls:[],status:'research-candidate',publicationAllowed:false});const t=priorityMap.get(k);t.sourceClaimRows.push(q.workbookRow);t.evidenceUrls=[...new Set([...t.evidenceUrls,...q.evidenceUrls])];}
 const institutionalMappings=university.map(r=>({workbookRow:r._row,receivingSchool:string(r.A),degreeAndCatalog:string(r.B),sourceCourse:string(r.C),originalIssuer:/UMPI YourPace/.test(string(r.C))?'University of Maine at Presque Isle':/Arizona State University/.test(string(r.C))?'Arizona State University':/U of I Independent Study/.test(string(r.C))?'University of Idaho':null,creditOrigin:'reported-institutionally-taught-coursework',receivingEquivalent:string(r.D),degreeRequirement:string(r.E),receivingAward:{quantity:number(r.F),unit:'semester credits'},originalSourceCredit:{quantity:null,unit:null,status:'not-separately-stated-in-workbook'},deliveryAndAssessment:string(r.G),reportedPrice:string(r.H),evidenceUrls:links(r,['I','J','K']),verificationStatus:'staged-unreviewed',publicationAllowed:false}));
 const countBy=name=>Object.fromEntries([...new Set(scenarios.map(s=>s[name]))].sort().map(v=>[v,scenarios.filter(s=>s[name]===v).length]));
 return {schemaVersion:1,batchId:'ace-inventory-2026-11-18',sourceType:'user-supplied-public-program-research',sourceDocumentTitle:'DegreeSteps ACE Program Inventory',sourceDate:'2026-11-18',stagedOn:'2026-11-19',sourceDigest:hash(JSON.stringify(workbook)),status:'research-staging-only',publicationAllowed:false,privateStudentRecordsIncluded:false,sourceInstructionsExecuted:false,summary:{scenarioCount:scenarios.length,courseMappingCount:matches.length,selectedMappingCount:scenarios.reduce((n,s)=>n+s.courseMappings.filter(c=>c.selected).length,0),receivingSchools:new Set(scenarios.map(s=>s.school)).size,distinctDegreeLabels:new Set(scenarios.map(s=>s.school+'|'+s.degree)).size,qualificationScenarioClaims:qualificationClaims.length,qualificationDegreeClaims:new Set(qualificationClaims.map(q=>q.school+'|'+q.degree)).size,newPriorityDegreeCandidates:priorityMap.size,institutionalCourseMappings:institutionalMappings.length,scopeCounts:countBy('scope'),providerScenarioCounts:countBy('provider'),allChosenReceivingTotalsReconciled:true,allChosenIdsUniqueWithinScenario:true},reviewRules:['The workbook is research evidence, not a university award or independently verified complete degree plan.','Empty workbook catalog IDs do not establish that a degree is new; reconcile existing IDs and exact scope.','Keep source credit quantity and receiving award quantity separate. Unknown original quantities stay unknown.','Future catalogs, pre-nursing phases, partial maps and optional credentials cannot be promoted as current complete degrees.','A selected source course is counted once per scenario; bundles remain explicit identifier expressions.','Review remaining degree requirements, major and upper-level rules, residency, prerequisites, grades, dates, eligibility and prices before publication.','Preserve the original teaching institution. An ACE course copied to an institutional transcript does not become an institutionally taught course.','Idaho writing alternatives fill the same degree slot; USM English and Psychology are alternative destinations, not additive credits.'],candidatePriorities:[...priorityMap.values()],campusResearchStrategy:{priority:'student-demand-and-transfer-feasibility',institutionalSourceOpportunity:'Evaluate UMPI-taught YourPace coursework as a source for desirable residential destinations, with exact receiving awards.',usmScope:'Local-fit example and demonstration of a transfer method; not the default national campus recommendation.',targetCampusFactors:['student location','desired school or campus','academic and career fit','campus experience','applicable transfer routes','remaining semesters and total cost']},qualificationClaims,scenarios,institutionalMappings};
}

export async function stageFile({input=defaults.input,output=defaults.output}={}){
 const workbook=JSON.parse(await readFile(input,'utf8'));
 const programCatalog=JSON.parse(await readFile(resolve(root,'dist/data/program-catalog.json'),'utf8'));
 const registry=JSON.parse(await readFile(resolve(root,'dist/data/curriculum-registry.json'),'utf8'));
 const batch=stageInventory(workbook,{programCatalog,registry});
 await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(batch,null,2)+'\n');
 return {output,summary:batch.summary,publicationAllowed:false,status:batch.status};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2);if(args.length>2)throw Error('Usage: node scripts/stage-ace-inventory.mjs [parsed-workbook.json] [research-batch.json]');
 console.log(JSON.stringify(await stageFile({...(args[0]?{input:resolve(args[0])}:{}),...(args[1]?{output:resolve(args[1])}:{})})));
}
