import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import Planner from './dist/planner.js';
import {assessPathwayQuality} from './scripts/pathway-quality.mjs';

const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const doc=read('./content/curricula/wgu.json');
const packet=read('./content/curricula/snapshots/wgu/bshr-202509-approved-maps-20261117.json');
const expansion=read('./content/reuse/wgu-business-awards.json');
const raw=doc.models.find(model=>model.id===packet.scope.modelId);
const historical=structuredClone(raw);
for(const row of historical.requirements)row.options=row.options.filter(option=>option.mappingReviewId===packet.id);
function withNamedUniversityOptions(){
 const model=structuredClone(raw);model.sources=structuredClone(doc.sources);model.evidenceCheckedOn=doc.checkedOn;
 for(const row of model.requirements)row.options.push({id:'university-'+row.id,provider:'University',title:row.title,code:row.code,credits:row.credits,creditSystem:'competency-unit',creditOrigin:'institutional',sourceIds:row.sourceIds,evidence:'published'});
 return model;
}

test('HR review rejects changed program, receiving quantities, approval status and private source fields',()=>{
 const python=String.raw`
import sys,copy,json
from pathlib import Path
sys.path.insert(0,'scripts')
from wgu_bshr_articulations import validate_review,apply_bshr_articulations
p=json.loads(Path('content/curricula/snapshots/wgu/bshr-202509-approved-maps-20261117.json').read_text())
d=json.loads(Path('content/curricula/wgu.json').read_text())
# Test the original review against exactly its independently reviewed identity
# pool. Later additive provider research must not alter this packet's 39 awards.
historical_reviews={p['scope']['modelId']:p['id'],'curriculum-wgu-catalog-ecceaa488637ac83':'wgu-bsmgt-240-approved-20261117'}
for model in d['models']:
 if model['id']in historical_reviews:
  for row in model['requirements']:
   row['options']=[o for o in row['options']if o.get('mappingReviewId')==historical_reviews[model['id']]]
assert sum(len(r['options'])for m in d['models']if m['id']==p['scope']['modelId']for r in m['requirements'])==39
assert sum(len(r['options'])for m in d['models']if m['id']=='curriculum-wgu-catalog-ecceaa488637ac83'for r in m['requirements'])==36
validate_review(p)
def changed(change):
 q=copy.deepcopy(p);change(q)
 try:validate_review(q)
 except AssertionError:return
 raise RuntimeError('A changed receiving-map claim was accepted')
for change in [lambda q:q['scope'].update(programId=240),lambda q:q['program'].update(catalogTerm='202605'),lambda q:q['agreements'][0].update(published=False),lambda q:q['receivingClaims'][0].update(programId=240),lambda q:q['receivingClaims'][0].update(agreementRecordVersion=185),lambda q:q['receivingClaims'][0].update(credits=12),lambda q:q['requirements'][0].update(credits=12),lambda q:q['program'].update(modifiedBy='staff'),lambda q:q['receivingClaims'][0].update(approvedSourceCodes=['SDCM-9999'])]:changed(change)
for field,value in [('catalog','202605'),('totalCredits',120),('creditSystem','semester')]:
 q=copy.deepcopy(d);m=next(m for m in q['models']if m['id']==p['scope']['modelId']);m[field]=value
 try:apply_bshr_articulations(q,p)
 except AssertionError:continue
 raise RuntimeError('Changed degree identity was accepted')
q=copy.deepcopy(d);m=next(m for m in q['models']if m['id']==p['scope']['modelId']);row=next(r for r in m['requirements']if r['code']=='C273');old=next(o for o in row['options']if o['code']=='SOPH-0051');old['id']='existing-saved-choice'
updated=apply_bshr_articulations(q,p);row=next(r for r in next(m for m in updated['models']if m['id']==p['scope']['modelId'])['requirements']if r['code']=='C273')
assert next(o for o in row['options']if o['code']=='SOPH-0051')['id']=='existing-saved-choice'
q=copy.deepcopy(d);m=next(m for m in q['models']if m['id']==p['scope']['modelId']);row=next(r for r in m['requirements']if r['code']=='C273');old=next(o for o in row['options']if o['code']=='SOPH-0051');old['id']='different-original-course';old['code']='SOPH-9999'
updated=apply_bshr_articulations(q,p)
assert not any(o['id']=='different-original-course'for r in next(m for m in updated['models']if m['id']==p['scope']['modelId'])['requirements']for o in r['options'])
print('WGU HR source and degree identity drift rejected')
`;
 const result=spawnSync('python',['-c',python],{cwd:import.meta.dirname,encoding:'utf8',timeout:10000});
 assert.equal(result.status,0,result.stderr||result.stdout);assert.match(result.stdout,/identity drift rejected/);
});

test('all39 original HR options retain their exact program209 receiving claims and separately reviewed source credits',()=>{
 assert.equal(raw.requirements.length,39);assert.equal(raw.totalCredits,117);assert.equal(raw.catalog,'202509');assert.deepEqual(raw.unresolved,[]);
 const refs=new Map(doc.sources.map(source=>[source.id,source]));let count=0;
 for(const row of historical.requirements)for(const option of row.options){
  count++;const claim=packet.receivingClaims.find(value=>value.provider===option.provider&&value.receivingCode===row.code);
  assert(claim);assert(claim.approvedSourceCodes.includes(option.code));assert.equal(option.evidence,'published');
  assert.equal(option.universityMapRecord.programId,209);assert.equal(option.universityMapRecord.catalogTerm,'202509');assert.equal(option.universityMapRecord.mappingId,claim.mappingId);assert.equal(option.universityMapRecord.agreementRecordVersion,claim.agreementRecordVersion);
  assert.equal(option.mappingEvidence.programId,209);assert.equal(option.mappingEvidence.programName,raw.title);assert.equal(option.mappingEvidence.catalogYear,'202509');assert.equal(option.mappingEvidence.receivingCode,row.code);assert.equal(option.credits,row.credits);assert.equal(option.creditSystem,'competency-unit');
  assert.equal(option.sourceCredits,3);assert.equal(option.sourceCreditSystem,'semester');assert.equal(option.sourceCreditStatus,'verified');assert(option.identitySourceIds.length);
  for(const id of option.identitySourceIds)assert(refs.has(id));
  for(const id of option.sourceIds){const source=refs.get(id);assert.equal(source.programId,209);assert.equal(source.scope.catalogYear,'202509');assert.equal(source.kind,'university');assert(source.roles.includes('receiving-map'));assert.equal(source.checked,'2026-11-17');}
  assert(!option.sourceIds.some(id=>/bsmgt/.test(id)),'Another degree receiving map cannot become HR evidence');
 }
 assert.equal(count,39);
 const management=raw.requirements.find(row=>row.code==='C483').options.find(option=>option.code==='SOPH-0054');assert.equal(management.credits,4);assert.equal(management.sourceCredits,3);
 const operations=raw.requirements.find(row=>row.code==='D079').options.find(option=>option.code==='SOPH-0086');assert.equal(operations.credits,2);assert.equal(operations.sourceCredits,3);
 assert(raw.requirements.find(row=>row.code==='D360').institutionalOnly);assert.deepEqual(raw.requirements.find(row=>row.code==='D360').options,[]);
});

test('expanded HR options retain their own receiving revision and independent source quantity across all four providers',()=>{
 const review=expansion.existingPrograms.find(value=>value.modelId===raw.id),refs=new Map(doc.sources.map(source=>[source.id,source])),providers=new Set();let count=0;
 assert.equal(review.programId,209);assert.equal(review.catalogTerm,'202509');
 for(const row of raw.requirements)for(const option of row.options){
  providers.add(option.provider);assert.equal(option.evidence,'published');assert.equal(option.sourceCreditStatus,'verified');
  assert.equal(option.mappingEvidence.programId,209);assert.equal(option.mappingEvidence.catalogYear,'202509');assert.equal(option.mappingEvidence.receivingCode,row.code);
  assert.equal(option.credits,row.credits);assert.equal(option.creditSystem,'competency-unit');assert.equal(option.sourceCreditSystem,'semester');assert.equal(option.sourceCredits,option.sourceCreditVerification.credits);
  assert(option.identitySourceIds.length);assert(option.sourceCreditVerification.sourceIds.every(id=>option.identitySourceIds.includes(id)&&refs.has(id)));assert(!option.identitySourceIds.some(id=>option.sourceIds.includes(id)));
  if(option.mappingReviewId===packet.id)continue;
  count++;assert.equal(option.mappingReviewId,expansion.id);
  const claim=review.receivingClaims.find(value=>value.provider===option.provider&&value.receivingCode===row.code);
  assert(claim?.sourceExpression.executableAsSingleCourse);assert(claim.approvedSourceCodes.includes(option.code));
  for(const field of ['programId','catalogTerm','agreementId','agreementRecordVersion','pathwayId','pathwayRecordVersion','mappingId','mappingRecordVersion'])assert.equal(option.universityMapRecord[field],claim[field]);
  for(const id of option.sourceIds){const source=refs.get(id);assert.equal(source.programId,209);assert.equal(source.scope.catalogYear,'202509');assert.equal(source.checked,expansion.checkedOn);assert(source.roles.includes('receiving-map'));}
 }
 assert.equal(count,30);assert.deepEqual([...providers].sort(),['Saylor','Sophia','StraighterLine','Study.com']);
});

test('the actual default optimizer produces a complete78+39 HR route without repeated source courses or credit awards',()=>{
 const model=withNamedUniversityOptions(),providers=[...new Set(model.requirements.flatMap(row=>row.options.map(option=>option.provider)).filter(value=>value!=='University'))];
 const before=JSON.stringify(model),plan=Planner.generate(model,{providers,allowConditional:true,priority:'transfer',nodeBudget:12000});
 assert.equal(JSON.stringify(model),before);assert.equal(plan.totals.external,78);assert.equal(plan.totals.institutional,39);assert.equal(plan.totals.accounted,117);assert.equal(plan.totals.confirmed,0);assert.equal(plan.totals.reported,0);
 assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.validation.policyChecksComplete,true);assert.deepEqual(plan.validation.errors,[]);
 assert.equal(plan.rows.length,39);assert(plan.rows.every(row=>row.status==='planned'&&row.option?.evidence==='published'&&row.option.code));
 const actions=plan.rows.filter(row=>row.option.provider!=='University').map(row=>row.option.provider+':'+row.option.code);assert.equal(new Set(actions).size,actions.length);
 assert.equal(plan.rows.find(row=>row.code==='D360').option.provider,'University');
 const quality=assessPathwayQuality({model,plan,asOf:doc.checkedOn});assert.equal(quality.publication.ready,true);assert.equal(quality.research.blockingFindings,0);assert.equal(quality.research.conditionalFindings,0);
 const noStudy=Planner.generate(model,{providers:['Sophia'],allowConditional:false,priority:'transfer',nodeBudget:12000});assert(noStudy.rows.every(row=>row.option.provider!=='Study.com'));assert.equal(noStudy.validation.academicCountsValid,true);
});

test('the scoped HR review leaves the current Business Management110CU edition intact and is reproducible offline',()=>{
 const bsmgt=doc.models.find(model=>model.id==='curriculum-wgu-catalog-ecceaa488637ac83');assert.equal(bsmgt.catalog,'202605');assert.equal(bsmgt.totalCredits,110);assert.equal(bsmgt.requirements.length,36);assert.deepEqual(bsmgt.unresolved,[]);
 for(const option of bsmgt.requirements.flatMap(row=>row.options)){assert.equal(option.universityMapRecord.programId,240);assert.equal(option.mappingEvidence.catalogYear,'202605');}
 const result=spawnSync('python',['scripts/import-wgu-curricula.py','--check'],{cwd:import.meta.dirname,encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr||result.stdout);
});
