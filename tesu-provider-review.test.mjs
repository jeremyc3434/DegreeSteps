import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadKit,kitsRoot} from './scripts/pathway-factory/lib.mjs';
import {compileKit,runGuards} from './scripts/pathway-factory/compile.mjs';
import {providerReview,tesuProviderEligibility,applyTESUProviderReview} from './scripts/tesu-provider-review.mjs';
import {hasReviewedCourseEligibility} from './scripts/pathway-quality.mjs';
const kit=await loadKit(kitsRoot+'/tesu'),{doc}=compileKit(kit);
const clone=x=>JSON.parse(JSON.stringify(x));

test('TESU current provider review binds an intact live capture and keeps Study.com separate from provisional providers',async()=>{
 const text=await readFile(providerReview.source.capture,'utf8'),meta=JSON.parse(await readFile(providerReview.source.capture.replace('.txt','.json'),'utf8'));
 assert.equal(createHash('sha256').update(text).digest('hex'),meta.sha256);
 assert.equal(meta.status,200);assert.equal(meta.url,providerReview.source.url);
 assert.ok(meta.fetchedAt.startsWith(providerReview.checkedOn));
 const policy=await readFile(providerReview.policySource.capture,'utf8'),policyMeta=JSON.parse(await readFile(providerReview.policySource.capture.replace('.txt','.json'),'utf8'));
 assert.equal(createHash('sha256').update(policy).digest('hex'),policyMeta.sha256);
 assert.equal(policyMeta.status,200);assert.equal(policyMeta.url,providerReview.policySource.url);
 assert.match(policy,/does not guarantee 100% acceptance/);
 const cutoff=text.indexOf('Provisionally Approved');assert.ok(cutoff>0);
 for(const provider of ['Study.com','University Pathways International'])assert.ok(text.indexOf(provider)>0&&text.indexOf(provider)<cutoff,provider+' is approved');
 assert.ok(providerReview.approved.includes('UPI Study'));
 assert.equal(providerReview.directoryNames['UPI Study'],'University Pathways International');
 for(const provider of ['SOPHIA Learning, LLC','StraighterLine','Saylor Academy',"College Board's College-Level Examination Program (CLEP)"])assert.ok(text.normalize('NFKC').replaceAll('’',"'").indexOf(provider)>cutoff,provider+' is provisional');
 assert.equal(providerReview.publicationPromotionAllowed,false);
});

test('all five TESU models keep provider governance distinct from exact resolved course awards and conditional candidates',async()=>{
 assert.equal(doc.models.length,5);await runGuards(kit,doc);
 let resolved=0,conditional=0;
 for(const model of doc.models){
  assert.ok(model.sources.some(s=>s.id===providerReview.source.id));
  assert.equal(model.providerEligibilityReview.checkedOn,'2026-11-25');
  for(const row of model.requirements)for(const option of row.options){
   if(option.provider==='University')continue;
   if(option.courseEligibilityResolution){resolved++;assert.equal(option.evidence,'published');assert.equal(hasReviewedCourseEligibility(model,row,option,{asOf:'2026-11-26'}),true,'Independent exact course evidence resolves '+option.id);assert.equal(option.eligibilityReview.providerReviewPending,true);assert.equal(option.eligibilityReview.fullyApproved,false);}
   else{conditional++;assert.equal(option.evidence,'conditional','Provider approval alone never promotes '+option.id);}
   assert.equal(option.eligibilityReview.individualApproval,false);
   assert.equal(option.eligibilityReview.fullyApproved,providerReview.approved.includes(option.provider));
   assert.equal(option.eligibilityReview.providerReviewPending,!providerReview.approved.includes(option.provider));
   assert.equal(Object.hasOwn(option.eligibilityReview,'eligibleToStart'),false);
  }
 }
 assert.equal(resolved,996);assert(conditional>0);assert.equal(kit.equivalencies.equivalencies.filter(row=>row.authored&&row.extra?.courseEligibilityResolution).length,35);
});

test('provider-review application is idempotent and never invents source dates, receiving awards or quantities',()=>{
 const input={school:providerReview.school,sources:[],requirements:[{id:'statistics',credits:3,options:[{id:'study-stat',provider:'Study.com',eligibilityReview:{eligibleToStart:true},evidence:'conditional',credits:3,sourceCredits:3,mappingChecked:'2026-10-30',mappingScope:'Exact degree placement not established',conditions:['Receiving award is not yet verified.']},{id:'soph-stat',provider:'Sophia',evidence:'conditional',credits:3,eligibilityReview:{eligibleToStart:false,recommendationPeriodStatus:'pending'}}]}]};
 const result=applyTESUProviderReview(input);
 assert.deepEqual(applyTESUProviderReview(result),result);assert.equal(input.sources.length,0);
 const strip=option=>{const {eligibilityReview,...rest}=option;return rest;};
 assert.deepEqual(result.requirements[0].options.map(strip),input.requirements[0].options.map(strip));
 assert.equal(result.requirements[0].options[1].eligibilityReview.recommendationPeriodStatus,'pending');
 assert.equal(result.requirements[0].options[1].eligibilityReview.providerReviewPending,true);
 assert.equal(Object.hasOwn(result.requirements[0].options[1].eligibilityReview,'eligibleToStart'),false);
 assert.deepEqual(tesuProviderEligibility('Unknown provider',{status:'not-reviewed'}),{status:'not-reviewed'});
});

test('TESU guards reject a provisional-provider promotion and an unbound approved-provider assertion',async()=>{
 const provisional=clone(doc),p=provisional.models[0].requirements.flatMap(r=>r.options).find(o=>o.provider==='Sophia');p.eligibilityReview.providerReviewPending=false;
 await assert.rejects(()=>runGuards(kit,provisional),/provisionally approved|restricted|review remains pending/);
 const approved=clone(doc),s=approved.models[0].requirements.flatMap(r=>r.options).find(o=>o.provider==='Study.com');s.eligibilityReview.sourceIds=['unknown'];
 await assert.rejects(()=>runGuards(kit,approved),/provider status cites its source/);
 for(const permission of [true,false]){const unsupported=clone(doc),o=unsupported.models[0].requirements.flatMap(r=>r.options).find(o=>o.provider==='Study.com');o.eligibilityReview.eligibleToStart=permission;await assert.rejects(()=>runGuards(kit,unsupported),/does not establish enrollment permission/);}
});
