import test from 'node:test';
import assert from 'node:assert/strict';
import {assessPathwayQuality,classifyModelFindings} from './scripts/pathway-quality.mjs';

const copy=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const sources=[{id:'degree',url:'https://example.edu/degree',checked:'2026-11-17'},{id:'map',url:'https://example.edu/transfers',checked:'2026-11-17'},{id:'provider',url:'https://provider.example/course',checked:'2026-11-17'}];
 const outside={id:'outside-one',provider:'Sophia',code:'SOPH-1',receivingCode:'ENG-1010',credits:3,sourceCredits:3,sourceCreditSystem:'semester',evidence:'published',sourceIds:['map','provider']};
 const university={id:'university-two',provider:'University',code:'CAP-4000',credits:3,evidence:'published',sourceIds:['degree']};
 const model={id:'fixture',school:'Example University',title:'Exact degree',level:'bachelor',format:'Online',catalog:'2026-2027',creditSystem:'semester',totalCredits:6,institutionMinCredits:3,externalMaxCredits:3,upperMinCredits:3,policySourceIds:['degree'],sources,requirements:[{id:'one',code:'ENG-1010',title:'Composition',credits:3,options:[outside]},{id:'two',code:'CAP-4000',title:'Capstone',credits:3,options:[university]}],policyReview:[],unresolved:[]};
 const plan={rows:model.requirements.map(requirement=>({requirementId:requirement.id,credits:requirement.credits,status:'planned',selectionRequired:false,option:copy(requirement.options[0])})),validation:{academicCountsValid:true,policyChecksComplete:true,errors:[]},costs:{costComplete:false,total:null,knownSubtotal:200,universityTuition:null},timing:{scenarioWeeks:null,assumptions:[]}};
 const route={id:'fixture-route',modelId:model.id,school:model.school,level:'bachelor',modalities:['online']};
 return {model,plan,route,asOf:'2026-11-18'};
}
test('source research, personal execution and incomplete cost estimates remain independent and do not mutate input',()=>{
 const input=fixture();input.model.unresolved=[{message:'Submit the original transcript.',status:'personal-task',owner:'student',sourceIds:['degree']}];
 input.studentPlan={rows:[{status:'reported',title:'Private learner Jane Doe',learningId:'private-123'},{status:'confirmed'}]};
 const before=JSON.stringify(input),quality=assessPathwayQuality(input);
 assert.equal(quality.status,'research-ready');assert.equal(quality.publication.ready,true);assert.equal(quality.metrics.feasibleOutsideCredits,3);assert.equal(quality.metrics.outsideFraction,.5);
 assert.equal(quality.execution.reportedRecordsCount,1);assert.equal(quality.execution.confirmedRecordsCount,1);assert.equal(quality.execution.awardedCreditsInBaseline,0);assert.equal(quality.estimates.cost.status,'partial-estimate');assert.equal(quality.estimates.cost.total,null);
 assert.equal(JSON.stringify(input),before);assert(!JSON.stringify(quality).includes('Jane Doe'));assert(!JSON.stringify(quality).includes('private-123'));
 input.plan.rows[0].status='reported';assert.throws(()=>assessPathwayQuality(input),/fresh baseline/);
});
test('only narrow recognized scope notes are reclassified; unknown or typed open academic questions stay blockers',()=>{
 const input=fixture();input.model.unresolved=['Individual catalog eligibility, state CPA eligibility, course currency and registration availability depend on the student; this plan does not make a licensure or admissions decision.','Published tuition is a planning basis; books, provider subscriptions and applicable fees are separate.'];
 let result=assessPathwayQuality(input);assert.equal(result.status,'research-ready');assert(result.findings.every(finding=>finding.code==='baseline-scope'&&!finding.blocking));
 input.model.unresolved.push('Confirm the exact laboratory residency rule.');result=assessPathwayQuality(input);assert.equal(result.status,'needs-research');assert(result.findings.some(finding=>finding.code==='unresolved-research'));
 input.model.unresolved=[];input.model.policyReview=[{field:'institutionMinCredits',status:'unverified',message:'The institutional minimum is not established.'}];result=assessPathwayQuality(input);assert.equal(result.status,'needs-research');assert.equal(result.findings.find(finding=>finding.code==='policy-unresolved').field,'institutionMinCredits');
 input.model.policyReview=[];input.model.unresolved=[{message:'Published tuition is a planning basis; books, provider subscriptions and applicable fees are separate.',field:'actual-policy',status:'unverified'}];assert.equal(assessPathwayQuality(input).status,'needs-research');
});
test('documented receiving maps do not clear genuine provisional provider acceptance',()=>{
 const input=fixture(),option=input.model.requirements[0].options[0];Object.assign(option,{evidence:'conditional',mappingResearchClosed:true,receivingMapStatus:'published-school-submitted',eligibilityReview:{eligibleToStart:false,sourceIds:['degree']}});input.plan.rows[0].option=copy(option);
 const result=assessPathwayQuality(input);assert.equal(result.status,'conditional');assert.equal(result.publication.ready,false);assert.equal(result.findings.find(finding=>finding.code==='provider-eligibility').mappingDocumented,true);
 delete option.eligibilityReview;option.conditions=['Submit your individual official transcript and earn the minimum grade.'];input.plan.rows[0].option=copy(option);
 const personal=assessPathwayQuality(input);assert.equal(personal.status,'research-ready');assert.equal(personal.execution.personalTasks.length,1);
});
test('school scope and exact receiving applicability are not inferred from a provider partnership or another degree',()=>{
 const input=fixture(),option=input.model.requirements[0].options[0];option.evidence='conditional';option.evidenceType='provider-partnership';option.conditions=['Equivalencies vary by degree.'];input.plan.rows[0].option=copy(option);
 assert.equal(assessPathwayQuality(input).status,'needs-research');
 option.evidence='published';option.mappingScope='Same-school receiving-course award researched in another degree; exact degree and format require confirmation.';input.plan.rows[0].option=copy(option);
 assert(assessPathwayQuality(input).findings.some(finding=>finding.code==='mapping-scope'));
 option.mappingScope='';option.sourceIds=['missing'];input.plan.rows[0].option=copy(option);assert(assessPathwayQuality(input).findings.some(finding=>finding.code==='mapping-evidence'));
});

test('pending provider review is a research condition, not an assertion that the school forbids enrollment',()=>{
 const input=fixture(),option=input.model.requirements[0].options[0];
 option.eligibilityReview={providerReviewPending:true,fullyApproved:false,sourceIds:['map']};input.plan.rows[0].option=copy(option);
 const result=assessPathwayQuality(input),condition=result.findings.find(item=>item.code==='provider-eligibility');
 assert.equal(result.publication.ready,false);assert.equal(condition.category,'conditional-policy');assert.equal(condition.blocking,true);
 assert.match(condition.message,/provider review remains provisional/);assert(!/forbid|prohibit|rejected/i.test(condition.message));
 option.mappingScope='Same-school receiving-course award researched in another degree; exact degree and format require confirmation.';input.plan.rows[0].option=copy(option);
 const scope=assessPathwayQuality(input);assert.equal(scope.status,'needs-research');assert(scope.findings.some(item=>item.code==='provider-eligibility'));assert(scope.findings.some(item=>item.code==='mapping-scope'),'A pending provider cannot hide an independently missing course scope.');
 delete option.mappingScope;
 delete option.eligibilityReview.providerReviewPending;option.eligibilityReview.fullyApproved=true;option.evidence='conditional';input.plan.rows[0].option=copy(option);
 assert.equal(assessPathwayQuality(input).publication.ready,false,'Approved provider status cannot establish its course award.');
});
test('candidate conditions are scoped to actual baseline choices and findings retain every affected slot',()=>{
 const input=fixture(),optional={...copy(input.model.requirements[0].options[0]),id:'conditional-unused',evidence:'conditional'};input.model.requirements[0].options.push(optional);
 assert.equal(assessPathwayQuality(input).status,'research-ready');assert(classifyModelFindings(input.model,{asOf:input.asOf}).some(finding=>finding.optionIds.includes(optional.id)));
 const duplicate=copy(input.model.requirements[0]);duplicate.id='third';input.model.requirements.push(duplicate);
 const grouped=classifyModelFindings(input.model,{asOf:input.asOf}).find(finding=>finding.optionIds.includes(optional.id));assert.deepEqual(grouped.requirementIds,['one','third']);
});
test('source recheck dates affect freshness without silently refreshing evidence or changing semantic finding IDs',()=>{
 const input=fixture();input.model.sources.find(source=>source.id==='map').checked='2026-10-01';const stale=assessPathwayQuality(input);assert.equal(stale.status,'needs-research');assert(stale.findings.some(finding=>finding.code==='source-review-due'));
 const future=fixture();future.model.sources[0].checked='2026-12-01';assert.equal(assessPathwayQuality(future).status,'needs-research');
 const candidate=fixture();candidate.model.policyReview=[{field:'cap',status:'unknown',message:'Resolve the exact cap.',sourceIds:['degree']}];const first=classifyModelFindings(candidate.model,{asOf:'2026-11-18'});candidate.model.sources[0].checked='2026-11-18';const second=classifyModelFindings(candidate.model,{asOf:'2026-11-19'});assert.deepEqual(second.map(finding=>finding.id),first.map(finding=>finding.id));
 assert.throws(()=>assessPathwayQuality({...input,asOf:'2026-02-30'}),/real quality-review/);
});
test('50-percent transfer eligibility is separate from research, and sourced self-paced programs have a separate mechanism',()=>{
 const input=fixture();input.model.requirements[0].options[0].provider='University';input.model.requirements[0].options[0].sourceIds=['degree'];input.plan.rows[0].option=copy(input.model.requirements[0].options[0]);
 let result=assessPathwayQuality(input);assert.equal(result.status,'research-ready');assert.equal(result.acceleration.eligible,false);assert.equal(result.publication.ready,false);
 input.model.level='master';input.route.level='master';input.model.paceModel='competency-subscription';input.model.pricing={model:'subscription',amount:1000,sourceUrl:'https://example.edu/degree',sourceIds:['degree']};
 result=assessPathwayQuality(input);assert.equal(result.status,'research-ready');assert.equal(result.acceleration.mechanism,'self-paced');assert.equal(result.publication.ready,true);
 input.model.pricing.sourceIds=['missing'];assert.equal(assessPathwayQuality(input).acceleration.eligible,false);
});
test('current-catalog identity, numeric academic validation and unsupported course choices fail closed',()=>{
 const input=fixture();input.model.catalog='Current catalog';assert.equal(assessPathwayQuality(input).status,'needs-research');
 input.model.catalogIdentity={kind:'reviewed-current-catalog',label:input.model.catalog,sourceUrl:'https://example.edu/degree',checkedOn:'2026-11-17'};assert.equal(assessPathwayQuality(input).status,'research-ready');
 input.plan.validation.academicCountsValid=false;assert.equal(assessPathwayQuality(input).status,'unavailable');input.plan.validation.academicCountsValid=true;
 input.plan.rows[0].option.id='invented';assert.equal(assessPathwayQuality(input).status,'needs-research');
 input.plan.rows[0].option=copy(input.model.requirements[0].options[0]);input.plan.rows[0].status='unresolved';assert.equal(assessPathwayQuality(input).status,'unavailable');input.plan.rows[0].status='planned';
 input.model.requirements[0].credits=4;assert.equal(assessPathwayQuality(input).status,'unavailable');
});
test('a fabricated complete price or unsupported duration cannot receive publication approval',()=>{
 const input=fixture();input.plan.costs.costComplete=true;input.plan.costs.total=null;let result=assessPathwayQuality(input);assert.equal(result.status,'research-ready');assert.equal(result.publication.ready,false);assert(result.findings.some(finding=>finding.code==='invalid-complete-cost'));
 input.plan.costs={costComplete:false,total:null};input.plan.timing={scenarioWeeks:4,verified:false,assumptions:[]};result=assessPathwayQuality(input);assert.equal(result.publication.ready,false);assert(result.findings.some(finding=>finding.code==='unsupported-duration'));
});
test('derived validation research and policy errors cannot disappear from a quality assessment',()=>{
 const input=fixture();input.plan.validation.researchNotes=[{code:'program_research',message:'Review the original source version.',requirementId:'one',optionId:'outside-one',sourceIds:['map'],missingEvidence:'reviewed-source-identity',blocking:false},{code:'program_research',message:'Review duplicate-award exclusions for this learning.',requirementId:'one',sourceIds:['map'],blocking:false}];
 let result=assessPathwayQuality(input);assert.equal(result.status,'needs-research');const identity=result.findings.find(finding=>finding.code==='selected-source-identity');assert.equal(identity.blocking,true);assert.equal(identity.legacyBlocking,false);assert.equal(identity.derivedFrom,'validation.researchNotes');assert.deepEqual(identity.requirementIds,['one']);assert(identity.sourceIds.includes('map'));assert(result.findings.some(finding=>finding.code==='duplicate-award-research'));
 input.plan.validation.researchNotes=[];input.plan.validation.errors=[{code:'mapping_tampered',message:'The chosen source quantity changed.',requirementId:'one'}];result=assessPathwayQuality(input);assert.equal(result.status,'needs-research');assert(result.findings.some(finding=>finding.code==='validation-mapping_tampered'));
});
test('source identity warnings close only with actual reviewed identity bindings; derived conditional personal steps stay separate',()=>{
 const input=fixture();input.model.unresolved=[{message:'Review original provider identity.',scope:'selected-options',missingEvidence:'reviewed-source-identity',sourceIds:['map'],blocking:false}];assert.equal(assessPathwayQuality(input).status,'needs-research');
 const option=input.model.requirements[0].options[0];Object.assign(option,{identitySourceIds:['provider'],mappingReviewId:'identity-review',mappingChecked:'2026-11-17',evidence:'conditional',mappingResearchClosed:true,receivingMapStatus:'published-school-submitted',conditions:['Submit your individual transcript and earn a passing grade.']});input.plan.rows[0].option=copy(option);input.plan.validation.errors=[{code:'conditional_mapping',message:'The individual documented conditions require attention.',requirementId:'one',provider:'Sophia'}];
 const result=assessPathwayQuality(input);assert.equal(result.status,'research-ready');assert.equal(result.execution.personalTasks.length,1);assert(!result.findings.some(finding=>finding.code==='selected-source-identity'));
});
test('a complete cost claim must reconcile its tuition, provider and fees without unresolved assumptions',()=>{
 const input=fixture();input.plan.costs={costComplete:true,total:200,knownSubtotal:200,universityTuition:100,fees:10,providerCosts:[{provider:'Sophia',amount:90}],missing:[]};let result=assessPathwayQuality(input);assert.equal(result.estimates.cost.status,'complete-estimate');assert.equal(result.estimates.cost.total,200);assert.equal(result.publication.ready,true);
 input.plan.costs.missing=['Transcript fees'];result=assessPathwayQuality(input);assert.equal(result.publication.ready,false);assert.equal(result.estimates.cost.total,null);
 input.plan.costs.missing=[];input.plan.costs.providerCosts[0].amount=100;assert.equal(assessPathwayQuality(input).publication.ready,false);
});
