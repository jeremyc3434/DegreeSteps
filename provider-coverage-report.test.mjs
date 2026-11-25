import test from 'node:test';
import assert from 'node:assert/strict';
import {buildProviderCoverageReport,assertProviderCoverageReport} from './scripts/build-provider-coverage-report.mjs';
const clone=value=>JSON.parse(JSON.stringify(value)),asOf='2026-11-25';
const directory={sources:[{id:'upi-study',name:'UPI Study',kind:'alternative-provider',status:'current-offer'},{id:'sophia',name:'Sophia Learning',kind:'alternative-provider'}]};
const assessment={schemaVersion:1,sources:[],reviews:[]};
const publication={registryRevision:'academic-v1:fixture',plans:[]};
const base=()=>({directory:clone(directory),courseCatalogs:[],models:[],publication:clone(publication),baselines:{registryRevision:publication.registryRevision,baselines:{}},rates:{sources:[],providers:[]},assessment:clone(assessment),asOf});
const course=(changes={})=>({id:'upi-stats',provider:'UPI Study',code:'UPIS-0003',credits:3,creditSystem:'semester',courseVersion:1,recommendationStart:'2024-09-01',recommendationEnd:'2027-08-31',...changes});
function model(id='degree-a'){
 const sources=[{id:'identity',kind:'ace',roles:['provider-identity'],url:'https://www.acenet.edu/National-Guide/Pages/Course.aspx?cid=identity',checkedOn:asOf},{id:'award',kind:'university',publisher:'Example University',roles:['receiving-map'],url:'https://example.edu/transfer/upi',checkedOn:asOf}];
 const option={id:'upi-stats',provider:'UPI Study',code:'UPIS-0003',courseVersion:1,sourceCredits:3,sourceCreditSystem:'semester',recommendationStart:'2024-09-01',recommendationEnd:'2027-08-31',identitySourceIds:['identity'],sourceCreditStatus:'verified',sourceCreditVerification:{credits:3,creditSystem:'semester',sourceIds:['identity']},credits:4,creditSystem:'semester',receivingCode:'STAT-101',evidence:'published',evidenceType:'official-receiving-school-equivalency',mappingResearchClosed:true,receivingMapStatus:'published-institutional-course',sourceIds:['award','identity'],mappingEvidence:{schoolName:'Example University',provider:'UPI Study',providerCourseCode:'UPIS-0003',receivingCode:'STAT-101',credits:4,creditSystem:'semester',sourceIds:['award'],publisher:'Example University',claimOrigin:'official-receiving-school-public-catalog'}};
 return{id,school:'Example University',title:'Example degree',catalog:'2026-2027',format:'Online',level:'bachelor',creditSystem:'semester',defaultProviders:['UPI Study'],sources,requirements:[{id:'stats',code:'STAT-101',credits:4,options:[option]}]};
}
const upi=report=>report.providers.find(row=>row.id==='upi-study');

test('a directory profile alone never counts as usable courses, receiving awards or a ready plan',()=>{
 const r=buildProviderCoverageReport(base()),u=upi(r);assert.equal(r.summary.directoryProviders,2);assert.equal(r.summary.indexedProviders,0);assert.equal(r.summary.directoryOnlyProviders,2);assert.equal(u.stage,'directory-only');assert.equal(u.indexedIdentities,0);assert.equal(u.receivingClaims.total,0);assert.equal(u.publicationReadyBaselineModels,0);assert(u.gaps.includes('no-indexed-courses'));assert.equal(r.publicationAllowed,false);assert.equal(r.studentCreditAwarded,false);
});
test('indexed identities deduplicate duplicate entries but preserve original version, quantity and unit unknowns',()=>{
 const input=base();input.courseCatalogs=[{courses:[course(),course({id:'copy'}),course({id:'unknown-version',courseVersion:null}),course({id:'quarter',creditSystem:'quarter'}),course({id:'different-original-quantity',credits:4})]},{courses:[course({id:'same-index-copy',provider:'UPIStudy',courseVersion:'1'})]}];
 const r=buildProviderCoverageReport(input);assert.equal(upi(r).indexedIdentities,4);assert.equal(r.summary.indexedProviders,1);assert.equal(r.summary.indexedIdentities,4);assert.equal(upi(r).sourceReviewedMappedIdentities,0);assert.equal(upi(r).assessment.unknownIndexedIdentities,4);
});
test('one receiving award reused across degrees and requirements remains one award and separate placements',()=>{
 const input=base(),a=model(),b=model('degree-b');b.requirements.push({...clone(b.requirements[0]),id:'elective'});input.models=[a,b];input.courseCatalogs=[{courses:[course()]}];
 const r=buildProviderCoverageReport(input),u=upi(r);assert.equal(u.receivingClaims.institutionSourceBound,1);assert.equal(u.placements.institutionSourceBound,3);assert.equal(u.modelsWithOptions,2);assert.equal(u.modelsEnabledByDefault,2);assert.equal(u.sourceReviewedMappedIdentities,1);assert.equal(u.indexedIdentities,1);assert.equal(u.publicationReadyAlternativeModels,0);
});
test('provider-published and unresolved claims never become institution-source-bound merely from a verified label',()=>{
 const input=base(),a=model();a.requirements[0].options[0].evidenceType='provider-published';a.requirements[0].options[0].mappingEvidence.claimOrigin='provider-published';a.sources[1]={id:'award',kind:'provider',url:'https://www.upistudy.com/pages/tesu',checkedOn:asOf};input.models=[a];let u=upi(buildProviderCoverageReport(input));assert.equal(u.receivingClaims.institutionSourceBound,0);assert.equal(u.receivingClaims.providerPublished,1);
 a.requirements[0].options[0].mappingEvidence.sourceIds=['missing'];u=upi(buildProviderCoverageReport(input));assert.equal(u.receivingClaims.providerPublished,0);assert.equal(u.receivingClaims.unresolved,1);
});
test('existing legacy receiving-agreement records and ACE university-submitted records retain their real authority',()=>{
 const input=base(),a=model(),o=a.requirements[0].options[0];delete o.mappingResearchClosed;delete o.receivingMapStatus;o.mappingReviewId='reviewed-current';o.mappingChecked=asOf;o.universityMapRecord={agreementId:5,mappingId:10};input.models=[a];assert.equal(upi(buildProviderCoverageReport(input)).receivingClaims.institutionSourceBound,1);
 o.mappingResearchClosed=false;assert.equal(upi(buildProviderCoverageReport(input)).receivingClaims.institutionSourceBound,0);
 o.mappingResearchClosed=true;o.receivingMapStatus='published-school-submitted';o.evidence='conditional';o.evidenceType='school-submitted-equivalency';o.mappingEvidence.claimOrigin='receiving-institution-submitted';a.sources[1]={id:'award',kind:'ace',roles:['receiving-institution-submitted-equivalency'],url:'https://www.acenet.edu/National-Guide/Pages/Course.aspx?cid=award',checkedOn:asOf};assert.equal(upi(buildProviderCoverageReport(input)).receivingClaims.institutionSourceBound,1);assert.equal(upi(buildProviderCoverageReport(input)).publicationReadyBaselineModels,0);
});
test('separately bound Liberty guide and placement packets are counted without fabricating a typed award',()=>{
 const input=base(),a=model(),o=a.requirements[0].options[0];a.school='Liberty University';delete o.mappingEvidence;o.sourceIds=['award'];o.degreePlacementEvidence={modelId:a.id,receivingCode:o.receivingCode,credits:o.credits,creditSystem:o.creditSystem,sourceIds:['placement']};a.sources[1]={id:'award',provider:'UPI Study',evidenceType:'official-receiving-school-equivalency',modality:'online',sourceContentHash:'sha256:'+'a'.repeat(64),url:'https://www.liberty.edu/online/wp-content/uploads/provider-guide.pdf',checkedOn:asOf};a.sources.push({id:'placement',url:'https://catalog.liberty.edu/degree',checkedOn:asOf});input.models=[a];assert.equal(upi(buildProviderCoverageReport(input)).receivingClaims.institutionSourceBound,1);
 a.sources[1].url='https://www.upistudy.com/provider-guide.pdf';assert.equal(upi(buildProviderCoverageReport(input)).receivingClaims.institutionSourceBound,0);
});
test('fixed university-calculator awards stay distinct from issuer eligibility and variable award ranges',()=>{
 const input=base(),a=model(),o=a.requirements[0].options[0];input.directory.sources.push({id:'christian-leaders',name:'Christian Leaders Institute'});a.school='Liberty University';delete o.mappingEvidence;delete o.mappingResearchClosed;o.provider='Christian Leaders Institute';o.evidence='conditional';o.sourceIds=['award'];o.evidenceType='official-receiving-school-calculator';o.receivingMapStatus='published-university-calculator';o.mappingChecked=asOf;o.mappingReviewId='calculator-review';o.calculatorInstitutionCode='M12424';o.calculatorAwardRange={low:4,high:4};a.sources[1]={id:'award',kind:'university',roles:['receiving-map'],evidenceType:o.evidenceType,url:'https://webapi.liberty.edu/transfer-credits/?institution=M12424&term=NULL',captureSha256:'b'.repeat(64),checkedOn:asOf};input.models=[a];let r=buildProviderCoverageReport(input),u=r.providers.find(row=>row.id==='christian-leaders');assert.equal(u.receivingClaims.institutionSourceBound,1);assert.equal(u.publicationReadyBaselineModels,0);
 o.calculatorAwardRange.low=3;r=buildProviderCoverageReport(input);u=r.providers.find(row=>row.id==='christian-leaders');assert.equal(u.receivingClaims.institutionSourceBound,0);
});
test('source binding, receiving award quantity, school and current source dates govern institutional claim counts',()=>{
 for(const change of [a=>a.sources[1].checkedOn='2026-10-26',a=>a.sources[1].checkedOn='2026-11-26',a=>a.requirements[0].options[0].mappingEvidence.credits=3,a=>a.requirements[0].options[0].mappingEvidence.schoolName='Different University',a=>a.requirements[0].options[0].mappingEvidence.sourceIds=[],a=>a.sources[1].roles=['provider-directory']]){
  const input=base(),a=model();change(a);input.models=[a];assert.equal(upi(buildProviderCoverageReport(input)).receivingClaims.institutionSourceBound,0);
 }
});
test('original quantities and units are independent from receiving awards',()=>{
 const input=base(),a=model();input.models=[a];assert.equal(a.requirements[0].options[0].credits,4);assert.equal(upi(buildProviderCoverageReport(input)).sourceReviewedMappedIdentities,1);
 a.requirements[0].options[0].sourceCreditVerification.credits=4;assert.equal(upi(buildProviderCoverageReport(input)).sourceReviewedMappedIdentities,0);
 a.requirements[0].options[0].sourceCreditVerification.credits=3;a.requirements[0].options[0].sourceCreditVerification.creditSystem='quarter';assert.equal(upi(buildProviderCoverageReport(input)).sourceReviewedMappedIdentities,0);
});
test('ready alternatives differ from selected providers in a ready published route baseline',()=>{
 const input=base(),a=model();a.requirements[0].options.push({...clone(a.requirements[0].options[0]),id:'sophia',provider:'Sophia',code:'SOPH-0012'});input.models=[a];input.publication.plans=[{modelId:a.id,publicationReady:true,routeIds:['route-a']}];
 input.baselines.baselines.first={modelId:a.id,pathwayId:'route-a',rows:[{provider:'UPI Study'}]};input.baselines.baselines.unpublished={modelId:a.id,pathwayId:'old-route',rows:[{provider:'Sophia'}]};const r=buildProviderCoverageReport(input);assert.equal(upi(r).publicationReadyBaselineModels,1);assert.equal(r.providers.find(row=>row.id==='sophia').publicationReadyAlternativeModels,1);assert.equal(r.providers.find(row=>row.id==='sophia').publicationReadyBaselineModels,0);assert.equal(r.summary.providersUsedInReadyBaselines,1);assert.equal(r.summary.publicationReadyPlans,1);
 assert.throws(()=>buildProviderCoverageReport({...input,baselines:{registryRevision:'different'}}),/different academic registry/);
});
test('rates remain a separate current scoped indicator, never a complete price or academic approval',()=>{
 const input=base();input.rates={providers:[{provider:'UPI Study',amount:99,sourceIds:['price']}],sources:[{id:'price',url:'https://www.upistudy.com/pages/pricing',checkedOn:asOf}]};let u=upi(buildProviderCoverageReport(input));assert.equal(u.pricing.currentSourceBoundProviderRates,1);assert.equal(u.pricing.eligibleRateScopeRequired,true);assert.equal(u.pricing.completePriceGuaranteed,false);assert.equal(u.receivingClaims.total,0);
 input.rates.sources[0].checkedOn='2026-10-26';u=upi(buildProviderCoverageReport(input));assert.equal(u.pricing.currentSourceBoundProviderRates,0);
});
test('assessment coverage uses the existing exact-code policy engine rather than directory prose',()=>{
 const input=base();input.courseCatalogs=[{courses:[course(),course({id:'other',code:'UPIS-0004'})]}];input.assessment={schemaVersion:1,sources:[{id:'exam',url:'https://www.upistudy.com/academic-integrity',title:'Assessment policy',checkedOn:asOf}],reviews:[{id:'upi-exam',provider:'UPI Study',scope:'provider-policy',courseCodes:['UPIS-0003'],status:'monitored',label:'Proctored final',detail:'Published current assessment policy.',sourceIds:['exam']}]};
 const r=buildProviderCoverageReport(input);assert.equal(upi(r).assessment.knownIndexedIdentities,1);assert.equal(upi(r).assessment.unknownIndexedIdentities,1);assert.equal(upi(r).receivingClaims.total,0);
});
test('unlisted observed providers are reported without treating university coursework as a source provider',()=>{
 const input=base();input.courseCatalogs=[{courses:[course({provider:'University'}),course({provider:'New Provider'})]}];const r=buildProviderCoverageReport(input);assert.equal(r.summary.directoryProviders,2);assert.equal(r.summary.observedProviders,3);assert.equal(r.providers.find(row=>row.id==='unlisted-newprovider').directoryListed,false);assert(!r.providers.some(row=>row.name==='University'));
});
test('report generation is deterministic, immutable, and rejects inconsistent or privately sourced summaries',()=>{
 const input=base();input.models=[model()];const copy=clone(input),r=buildProviderCoverageReport(input);assert.deepEqual(input,copy);assert.deepEqual(buildProviderCoverageReport(input),r);
 for(const change of [x=>x.privateStudentRecordsIncluded=true,x=>x.publicationAllowed=true,x=>x.summary.indexedProviders=7,x=>x.providers[0].indexedIdentities=-1,x=>x.providers[0].publicationReadyBaselineModels=99,x=>x.providers.push(clone(x.providers[0]))]){const bad=clone(r);change(bad);assert.throws(()=>assertProviderCoverageReport(bad));}
 assert.throws(()=>buildProviderCoverageReport({...input,models:[model(),model()]}),/distinct/);
 const privateModel=model();privateModel.auditProvenance={status:'student-provided'};assert.throws(()=>buildProviderCoverageReport({...input,models:[privateModel]}),/Private student/);
 assert.throws(()=>buildProviderCoverageReport({...input,courseCatalogs:[{privateStudentRecordsIncluded:true,courses:[]}]}),/Private student/);
});
