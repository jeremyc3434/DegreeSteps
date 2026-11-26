import test from 'node:test';
import {assertTESUPlacementInventory} from './test-support/tesu-placement-inventory.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadKit,kitsRoot} from './scripts/pathway-factory/lib.mjs';
import {compileKit} from './scripts/pathway-factory/compile.mjs';
import {hasReviewedCourseEligibility,classifyModelFindings} from './scripts/pathway-quality.mjs';
const kit=await loadKit(kitsRoot+'/tesu'),compiledModels=compileKit(kit).doc.models,model=compiledModels.find(model=>model.id==='curriculum-tesu-ba-english');
const requirement=model.requirements.find(row=>row.options.some(option=>option.courseEligibilityResolution)),option=requirement.options.find(option=>option.courseEligibilityResolution);
const asOf='2026-11-26',clone=value=>structuredClone(value);
test('an exact current institution-submitted course claim resolves only course eligibility, preserving provisional provider governance',()=>{
 assert(hasReviewedCourseEligibility(model,requirement,option,{asOf}));
 assert.equal(option.eligibilityReview.providerReviewPending,true);assert.equal(option.eligibilityReview.fullyApproved,false);assert.equal(option.courseEligibilityResolution.individualApproval,false);
 const all=classifyModelFindings(model,{asOf});assert(!all.some(finding=>finding.code==='provider-eligibility'&&finding.optionIds.includes(option.id)));
 const unresolved=model.requirements.flatMap(row=>row.options.map(candidate=>({row,candidate}))).find(({candidate})=>candidate.eligibilityReview?.providerReviewPending&&!candidate.courseEligibilityResolution);
 assert(unresolved,'Unreviewed provider candidates remain in the same model');assert.equal(hasReviewedCourseEligibility(model,unresolved.row,unresolved.candidate,{asOf}),false);
});
test('course resolution rejects changed academic identity, dates, authority, hashes and quotations',()=>{
 const cases=[
  value=>{delete value.courseEligibilityResolution;},value=>{value.eligibilityReview.eligibleToStart=false;},
  value=>{value.courseEligibilityResolution.individualApproval=true;},value=>{value.courseEligibilityResolution.providerApprovalStatusUnchanged=false;},
  value=>{value.courseEligibilityResolution.targetCatalog='Another catalog';},value=>{value.courseEligibilityResolution.catalogYear='2027-2028';},
  value=>{value.courseEligibilityResolution.courseVersion+=1;},value=>{value.courseEligibilityResolution.providerCourseCode='SOPH-9999';},
  value=>{value.courseEligibilityResolution.receivingCode='MAT-9999';},value=>{value.courseEligibilityResolution.credits=6;},
  value=>{value.courseEligibilityResolution.creditSystem='quarter';},value=>{value.courseEligibilityResolution.creditOrigin='institutional';},
  value=>{value.courseEligibilityResolution.checkedOn='2027-01-01';},value=>{value.recommendationEnd=value.courseEligibilityResolution.recommendationEnd='2026-11-25';},
  value=>{value.recommendationEnd=value.courseEligibilityResolution.recommendationEnd='2035-01-01';},
  value=>{value.sourceCredits=6;},value=>{value.sourceCredits=6;value.sourceCreditVerification.credits=6;},value=>{delete value.courseEligibilityResolution.recommendationPeriodSelection;},value=>{value.courseEligibilityResolution.recommendationPeriodSelection.courseId='00000000-0000-4000-8000-000000000000';},value=>{value.courseEligibilityResolution.sourceHashes[value.courseEligibilityResolution.sourceIds[0]]='0'.repeat(64);},
  value=>{value.courseEligibilityResolution.quotes[0].text='A forged academic claim that is not in the captured source.';},
  value=>{value.mappingEvidence.claimOrigin='provider-published';}
 ];
 for(const [index,change]of cases.entries()){const value=clone(option);change(value);assert.equal(hasReviewedCourseEligibility(model,requirement,value,{asOf}),false,'Mutation '+index);}
 for(const change of [value=>{value.school='Different University';},value=>{value.format='Hybrid';},value=>{value.catalog='Another program catalog';},value=>{value.creditSystem='competency-unit';}]){const value=clone(model);change(value);assert.equal(hasReviewedCourseEligibility(value,requirement,option,{asOf}),false);}
});
test('original recommended credits and the institution receiving award remain independently bound when they differ',()=>{
 const example=compileKit(kit).doc.models.flatMap(model=>model.requirements.flatMap(row=>row.options.map(option=>({model,row,option})))).find(({option})=>option.code==='SOPH-0061'&&option.courseEligibilityResolution);
 assert(example,'The current exact 1-to-3 award is actually modeled');assert.equal(example.option.sourceCredits,1);assert.equal(example.option.credits,3);assert(hasReviewedCourseEligibility(example.model,example.row,example.option,{asOf}));
 const changed=clone(example.option);changed.sourceCredits=3;changed.sourceCreditVerification.credits=3;assert.equal(hasReviewedCourseEligibility(example.model,example.row,changed,{asOf}),false);
});
test('a course-specific resolution cannot legitimize a substituted primary source or future/stale proof',()=>{
 for(const change of [source=>{source.url='https://study.com/university-map';},source=>{source.capture='../../outside.txt';},source=>{source.kind='provider';},source=>{source.sha256='0'.repeat(64);},source=>{source.checked='2026-12-01';}]){
  const value=clone(model),source=value.sources.find(source=>source.id===option.courseEligibilityResolution.receivingSourceIds[0]);change(source);assert.equal(hasReviewedCourseEligibility(value,requirement,option,{asOf}),false);
 }
 assert.equal(hasReviewedCourseEligibility(model,requirement,option,{asOf:'2026-12-27'}),false);
});
test('joint declaration changes cannot substitute partial receiving codes or another organization course ID',()=>{
 const receiving=option.receivingCode,prefix=receiving.split('-')[0];
 for(const code of [prefix,prefix+'-',receiving.slice(0,-1),receiving+'0',receiving+'X','X'+receiving,receiving+'-extra','UNRELATED-9999']){
  const changed=clone(option);changed.receivingCode=changed.mappingEvidence.receivingCode=changed.courseEligibilityResolution.receivingCode=code;
  assert.equal(hasReviewedCourseEligibility(model,requirement,changed,{asOf}),false,'Full receiving-course identity: '+code);
 }
 const organizationId=option.providerCourseCode;
 for(const code of ['UNRELATED-999',organizationId.slice(0,-1),organizationId+'0','X'+organizationId]){
  const changed=clone(option);changed.providerCourseCode=changed.mappingEvidence.providerOrganizationCode=changed.courseEligibilityResolution.providerOrganizationCode=code;
  assert.equal(hasReviewedCourseEligibility(model,requirement,changed,{asOf}),false,'Exact printed organization course ID: '+code);
 }
 const changed=clone(option),partial=option.code.slice(0,-1);changed.code=changed.aceId=changed.mappingEvidence.providerCourseCode=changed.courseEligibilityResolution.providerCourseCode=partial;
 assert.equal(hasReviewedCourseEligibility(model,requirement,changed,{asOf}),false,'Exact printed ACE course identity also stays bounded');
});
test('all1297 scoped TESU placements retain the original996 and resolve after exact source field boundary checks',()=>{
 let count=0;
 for(const program of compiledModels)for(const row of program.requirements)for(const candidate of row.options)if(candidate.courseEligibilityResolution){count++;assert.equal(hasReviewedCourseEligibility(program,row,candidate,{asOf}),true,program.id+'/'+row.id+'/'+candidate.code);}
 assert.equal(count,1297);assertTESUPlacementInventory(compiledModels);
});
test('a full legitimate source quotation cannot bind an unrelated receiving credit quantity to the course row',()=>{
 const changed=clone(option),resolution=changed.courseEligibilityResolution,sourceId=resolution.receivingSourceIds[0],source=model.sources.find(source=>source.id===sourceId),body=readFileSync(new URL(source.capture,import.meta.url),'utf8');
 changed.credits=changed.mappingEvidence.credits=resolution.credits=6;
 const quote=resolution.quotes.find(quote=>quote.sourceId===sourceId&&quote.text.includes(resolution.catalogYear));assert(quote);quote.text=body;
 assert.equal(hasReviewedCourseEligibility(model,requirement,changed,{asOf}),false);
 const valid=clone(option),validQuote=valid.courseEligibilityResolution.quotes.find(quote=>quote.sourceId===sourceId&&quote.text.includes(resolution.catalogYear));validQuote.text=body;
 assert.equal(hasReviewedCourseEligibility(model,requirement,valid,{asOf}),true,'A larger quotation remains usable when it contains the exact current receiving row');
});
