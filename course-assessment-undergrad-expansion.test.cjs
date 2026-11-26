/* Prospective assessment metadata creates neither receiving awards nor personal credit. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const Assessment=require('./dist/course-assessment.js'),packet=require('./content/discovery/course-assessment-reviews.json');
const reviews=packet.reviews.filter(review=>/undergraduate-expansion-assessments-20261126$/.test(review.id)),unknown=packet.reviews.find(review=>review.id==='study-legacy-label-assessments-unresolved-20261126');
const outside=(provider,code)=>({id:'assessment-only-'+code,provider,code,title:code,credits:3});

test('18 newly bound ACE identities and14 established titles inherit only their own provider assessment policies',()=>{
 assert.equal(reviews.length,3);assert.deepEqual(reviews.map(review=>[review.provider,review.courseCodes.length,review.status]),[['Sophia',24,'unmonitored'],['CLEP',6,'monitored'],['Study.com',2,'unmonitored']]);
 for(const review of reviews){
  assert.equal(review.scope,'provider-policy');assert.equal(review.checkedOn,'2026-11-26');assert.equal(review.programBindings,undefined);assert.equal(review.courseIdentityBindings.length,review.courseCodes.length);
  for(const binding of review.courseIdentityBindings){
   assert.equal(binding.identityOnly,true);assert.equal(binding.provider,review.provider);assert(review.courseCodes.includes(binding.courseCode));assert(binding.primarySources.length>0,binding.courseCode+' exact original identity source');assert.deepEqual(binding.sourceIds,binding.primarySources.map(source=>source.id));
   for(const source of binding.primarySources){
    assert.equal(new URL(source.url).protocol,'https:');assert(/(?:^|\.)(?:sophia\.org|acenet\.edu|study\.com|collegeboard\.org)$/.test(new URL(source.url).hostname),binding.courseCode+' provider or ACE primary evidence');assert(source.checkedOn<='2026-11-26',binding.courseCode+' original source date');
    if(source.capture){const body=fs.readFileSync(source.capture,'utf8'),meta=JSON.parse(fs.readFileSync(source.capture.replace(/\.txt$/,'.json'),'utf8')),digest=createHash('sha256').update(body).digest('hex');assert.equal(source.sha256||String(source.sourceContentHash||'').replace(/^sha256:/,''),digest,binding.courseCode+' retained body');assert.equal(meta.url,source.url);}
   }
   const option=outside(review.provider,binding.courseCode),fact=Assessment.describe(null,option,'2026-11-26');assert.equal(fact.reviewId,review.id);assert.equal(fact.status,review.status);assert.equal(fact.scope,'provider-policy');assert(fact.sources.length>0);
   for(const field of ['evidence','credits','receivingCode','mappingEvidence','individualApproval','studentCreditsAwarded'])assert.equal(binding[field],undefined,'Assessment identity metadata cannot create '+field);
  }
 }
 assert.equal(Assessment.describe(null,outside('Another provider','SOPH-0084'),'2026-11-26').status,'unknown');assert.equal(Assessment.describe(null,outside('Sophia','unknown-new-course'),'2026-11-26').reviewId,null);
 assert.equal(Assessment.describe(null,outside('University','C216'),'2026-11-26').status,'unknown','A provider policy never determines university assessment requirements');
});

test('unmatched legacy Study labels remain explicitly unknown and excluded from every reviewed baseline',()=>{
 assert(unknown);assert.equal(unknown.courseCodes.length,7);assert.equal(unknown.status,'unknown');assert.equal(unknown.identityStatus,'unresolved-legacy-label');assert.equal(unknown.excludedFromReviewedStartingPlans,true);assert.equal(unknown.transferAcceptanceClaim,false);assert(!/you must|you need to|confirm with|verify with/i.test(unknown.detail),'DegreeSteps owns the missing identity research');
 const published=new Set(require('./dist/data/publication-index.json').plans.filter(plan=>plan.publicationReady).map(plan=>plan.modelId)),baselines=Object.values(require('./dist/data/baseline-index.json').baselines).filter(plan=>published.has(plan.modelId));
 for(const code of unknown.courseCodes){const fact=Assessment.describe(null,outside('Study.com',code),'2026-11-26');assert.equal(fact.status,'unknown');assert.equal(fact.reviewId,unknown.id);assert(!baselines.some(plan=>plan.qualityReady&&plan.rows.some(row=>row.provider==='Study.com'&&row.code===code)),code+' cannot enter a reviewed starting plan');}
 const fact=Assessment.describe(null,outside('Study.com','Accounting 102'),'2026-11-26');assert.equal(fact.status,'unmonitored','The independently identified Accounting102 alias remains distinct from the seven unmatched labels');
});

test('all six new selected Sophia identities have explicit unmonitored facts without changing their course or transfer records',()=>{
 const ids=['SOPH-0010','SOPH-0023','SOPH-0069','SOPH-0084','SOPH-0092','SOPH-0096'],registry=require('./dist/data/curriculum-registry.json'),baselines=Object.values(require('./dist/data/baseline-index.json').baselines),seen=new Set();let placements=0;
 for(const entry of registry.models.filter(entry=>entry.id.startsWith('curriculum-tesu-'))){const pack=require('./dist/'+entry.path),model=pack.models.find(model=>model.id===entry.id),before=JSON.stringify(model);for(const baseline of baselines.filter(plan=>plan.modelId===model.id&&plan.qualityReady))for(const row of baseline.rows.filter(row=>row.provider==='Sophia'&&ids.includes(row.code))){const option=model.requirements.find(requirement=>requirement.id===row.requirementId).options.find(option=>option.id===row.optionId),fact=Assessment.describe(model,option,'2026-11-26');assert.equal(fact.status,'unmonitored',row.code);assert.equal(option.evidence,'published');assert.equal(row.status,'planned');assert.equal(option.sourceCreditSystem,'semester');assert(option.sourceCredits>0);assert(Assessment.allowsOption(model,option,{proctoringPreference:'avoid'}));seen.add(row.code);placements++;}assert.equal(JSON.stringify(model),before,'Assessment lookup leaves transfer source facts and quantities untouched');}
 assert.deepEqual([...seen].sort(),ids);assert(placements>=27,'The metadata reaches all27 newly selected course placements');
});
