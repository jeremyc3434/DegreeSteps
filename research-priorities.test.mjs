import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildResearchPriorities} from './scripts/build-research-priorities.mjs';
import {DIRECTORY_SOURCES,buildProviderDiscovery} from './scripts/provider-directory-discovery.mjs';
import {readFile} from 'node:fs/promises';
const copy=value=>structuredClone(value);
const umpiReview=JSON.parse(await readFile(new URL('./content/curricula/snapshots/umpi/current-primary-review-2026-11-19.json',import.meta.url),'utf8'));
test('current UMPI evidence creates exact research actions without promoting a degree or turning residency arithmetic into an ACE limit',()=>{
 const input=inputs();input.programCatalog.schools.push({id:'umpi',name:'University of Maine at Presque Isle',deliveryModes:['online'],paceModels:['competency-subscription']});
 input.programCatalog.programs.push({id:'umpi-bls',school:'University of Maine at Presque Isle',title:'Liberal Studies BLS',level:'bachelor',modalities:['online'],url:'https://www.umpi.edu/yourpace/academic_programs/liberal-studies/'});
 const before=buildResearchPriorities(input);input.umpiPrimaryReview=copy(umpiReview);const original=copy(input),after=buildResearchPriorities(input),school=after.schools.find(row=>row.id==='umpi');
 assert.deepEqual(input,original);assert.deepEqual(after.summary,before.summary);assert.deepEqual(after.programs,before.programs);assert.equal(school.coverage.models,0);assert.equal(school.coverage.publicationReady,0);
 assert.equal(school.transferEvidence.ace.maximumCredits,null);assert.equal(school.sourceReview.publicationAllowed,false);assert.deepEqual(school.sourceReview.models,[]);
 assert(school.nextActions.some(task=>task.kind==='umpi-current-gec-course-bindings'));assert(school.nextActions.some(task=>task.kind==='umpi-alternative-cap-scope'));assert(school.nextActions.some(task=>task.kind==='umpi-current-minor-ledger'));
 const sources=new Map(school.sourceReview.sources.map(source=>[source.id,source]));
 for(const gate of school.sourceReview.implementationGates)for(const id of gate.sourceIds)assert(school.evidenceUrls.includes(sources.get(id).url));
 assert(school.sourceReview.sourceDiscrepancies.some(issue=>issue.id==='cpl-scope-conflict'));
 assert.notEqual(after.inputFingerprints.umpiPrimaryReview,undefined);assert.notEqual(after.revision,before.revision);
 const unrelatedBefore=before.schools.filter(row=>row.id!=='umpi'),unrelatedAfter=after.schools.filter(row=>row.id!=='umpi');assert.deepEqual(unrelatedAfter,unrelatedBefore);
});
test('a UMPI research packet cannot introduce active models, publication claims or source-less gates',()=>{
 for(const edit of [review=>review.publicationAllowed=true,review=>review.models.push({id:'invented-ready-model'}),review=>review.implementationGates[0].sourceIds=['unreviewed-source'],review=>review.sources[0].url='https://another.edu/umpi-copy']){
  const input=inputs();input.umpiPrimaryReview=copy(umpiReview);edit(input.umpiPrimaryReview);assert.throws(()=>buildResearchPriorities(input),/UMPI primary review/);
 }
});
test('provider discovery remains a separate research stage with unchanged school, program and readiness totals',()=>{
 const input=inputs(),baseline=buildResearchPriorities(input),definition=DIRECTORY_SOURCES.find(source=>source.id==='hfcc-provider-directory');
 input.providerDiscovery=buildProviderDiscovery({version:1,sources:[{...definition,checkedOn:'2026-11-19',status:'limited',note:'Historical research lead.'}],observations:[{sourceId:definition.id,provider:'Sophia',name:'Unreviewed New University',relation:'matrix-listed',url:definition.url,observedOn:'2026-11-19',sourceDate:'2021-04-20'}]});
 const queue=buildResearchPriorities(input);assert.deepEqual(queue.summary,baseline.summary);assert.deepEqual(queue.programs,baseline.programs);assert.deepEqual(queue.schools,baseline.schools);assert.deepEqual(queue.inventoryCandidates,baseline.inventoryCandidates);assert.equal(queue.providerDiscovery.summary.candidates,1);assert.equal(queue.providerDiscovery.summary.eligibleStudentPlans,0);assert.equal(queue.schools.some(row=>row.name==='Unreviewed New University'),false);assert.notEqual(queue.revision,baseline.revision);
 input.providerDiscovery.candidates[0].studentEligible=true;assert.throws(()=>buildResearchPriorities(input),/cannot assert/);
});
function inputs(){return {
 programCatalog:{checkedAt:'2026-11-03',schools:[
  {id:'gcu',name:'Grand Canyon University',deliveryModes:['campus','online'],paceModels:['course-term'],transferPolicy:{institutional:{status:'accepted',maximumCredits:90,sourceUrl:'https://www.gcu.edu/admissions/college-transfer-center.php'},ace:{status:'case-by-case',maximumCredits:30,sourceUrl:'https://gcu.sophia.org/'}}},
  {id:'unknown',name:'Unknown College',deliveryModes:['campus'],transferPolicy:{institutional:{status:'not-verified',maximumCredits:120,sourceUrl:'https://unknown.edu/transfer'},ace:{status:'accepted',maximumCredits:99,sourceUrl:'javascript:alert(1)'}}},
  {id:'flex',name:'Flexible University',deliveryModes:['online'],paceModels:['competency-subscription'],transferPolicy:{institutional:{status:'case-by-case',sourceUrl:'https://flex.edu/transfer'}}}
 ],programs:[
  {id:'gcu-business',school:'Grand Canyon University',title:'Business BS',level:'bachelor',modalities:['campus'],url:'https://www.gcu.edu/degree-programs/business'},
  {id:'gcu-psych',school:'Grand Canyon University',title:'Psychology BS',level:'bachelor',modalities:['campus'],url:'https://www.gcu.edu/degree-programs/psychology'},
  {id:'unknown-one',school:'Unknown College',title:'History BA',level:'bachelor',modalities:['campus'],url:'https://unknown.edu/history'},
  {id:'flex-one',school:'Flexible University',title:'Business BS',level:'bachelor',modalities:['online'],url:'https://flex.edu/business'}
 ]},pathways:{pathways:[]},registry:{version:1,checkedOn:'2026-11-18',models:[{id:'flex-model',path:'data/flex-model.json',status:'reviewed',school:'Flexible University',title:'Business BS',routeIds:['flex-one'],readyTemplate:true,coverage:'complete',modalities:['online']}]},quality:{asOf:'2026-11-18',registryRevision:'fixture-academic-revision',programs:[{modelId:'flex-model',publication:{ready:false,reasonCodes:['policy-unresolved']}}]},schoolInsights:{schools:[]},inventory:{sourceDate:'2026-11-18',stagedOn:'2026-11-19',candidatePriorities:[{school:'Another University',degree:'Business BS',catalog:'2026'}],scenarios:[{id:'inventory-one',school:'Another University',degree:'Business BS',catalog:'2026',provider:'Sophia',scope:'partial-degree-map',mappedReceivingQuantity:60,receivingUnit:'semester credits',workbookDegreeQuantity:120,evidenceUrls:['https://another.edu/map']}]},models:[{id:'flex-model',school:'Flexible University',title:'Business BS',totalCredits:120,creditSystem:'semester',externalMaxCredits:90,alternativeMaxCredits:60,policySourceIds:['policy'],alternativeCapSourceIds:['alternative'],sources:[{id:'policy',url:'https://flex.edu/transfer'},{id:'alternative',url:'https://flex.edu/alternative'}]}]
};}

test('all directory entries get actionable research rows, with GCU institutional and alternative limits kept separate',()=>{
 const input=inputs(),before=copy(input),queue=buildResearchPriorities(input);
 assert.deepEqual(input,before);assert.equal(queue.summary.directoryPrograms,4);assert.equal(queue.summary.programs,4);assert.equal(queue.summary.schools,3);
 for(const p of input.programCatalog.programs)assert(queue.programs.some(row=>row.id===p.id));
 const gcu=queue.schools.find(s=>s.id==='gcu');assert.equal(gcu.groupId,'substantial-transfer-campus-map-gap');assert.equal(gcu.transferEvidence.institutional.maximumCredits,90);assert.equal(gcu.transferEvidence.ace.maximumCredits,30);assert.equal(gcu.coverage.unmappedPrograms,2);assert(gcu.nextActions.some(a=>a.kind==='institutional-course-source-map'));
 assert(queue.programs.filter(p=>p.schoolId==='gcu').every(p=>p.coverageStatus==='directory-only'&&!p.publicationReady));assert.equal(queue.publicationAllowed,false);
});

test('unsupported caps, incomplete models and inventory claims cannot become verified coverage or campus popularity',()=>{
 const queue=buildResearchPriorities(inputs()),unknown=queue.schools.find(s=>s.id==='unknown'),flex=queue.programs.find(p=>p.id==='flex-one');
 assert.equal(unknown.transferEvidence.institutional.maximumCredits,null);assert.equal(unknown.transferEvidence.ace.maximumCredits,null);assert.equal(unknown.transferEvidence.ace.status,'not-verified');assert.equal(unknown.groupId,'campus-transfer-policy-review');
 assert.equal(flex.availableTemplate,true);assert.equal(flex.publicationReady,false);assert.equal(flex.coverageStatus,'available-proposed-template');assert.equal(flex.programPolicy.totalTransferMaximum,90);assert.equal(flex.programPolicy.alternativeCreditMaximum,60);
 assert.equal(queue.inventoryCandidates[0].publicationAllowed,false);assert.equal(queue.inventoryCandidates[0].verificationStatus,'staged-unreviewed');assert.equal(queue.inventoryCandidates[0].prioritized,true);assert.equal(queue.summary.publicationReady,0);
 assert(!Object.keys(unknown).some(k=>/popularity|rating|reputation|score/i.test(k)));
});

test('generation is deterministic and fingerprints change when evidence or coverage changes',()=>{
 const input=inputs(),a=buildResearchPriorities(input),b=buildResearchPriorities(copy(input));assert.deepEqual(a,b);assert.equal(a.asOf,'2026-11-19');
 const next=copy(input);next.programCatalog.schools[0].transferPolicy.ace.maximumCredits=24;const changed=buildResearchPriorities(next);assert.notEqual(changed.revision,a.revision);assert.notEqual(changed.inputFingerprints.programCatalog,a.inputFingerprints.programCatalog);assert.equal(changed.inputFingerprints.registry,a.inputFingerprints.registry);
 const reviewed=copy(input);reviewed.quality.programs[0].publication.ready=true;const complete=buildResearchPriorities(reviewed);assert.equal(complete.programs.find(p=>p.id==='flex-one').groupId,'maintain-publication-ready');assert.equal(complete.summary.publicationReady,1);
});

test('explicit mapped variants avoid duplicate directory research without claiming unseen formats or policies',()=>{
 const input=inputs();
 input.registry.routes=[{id:'gcu-business-campus',parentId:'gcu-business',school:'Grand Canyon University',title:'Business BS',level:'bachelor',modalities:['campus'],url:'https://www.gcu.edu/degree-programs/business'}];
 input.registry.models.push({id:'gcu-model',path:'data/gcu.json',status:'reviewed',school:'Grand Canyon University',title:'Business BS',routeIds:['gcu-business-campus'],readyTemplate:true,coverage:'complete',modalities:['campus']});
 input.models.push({id:'gcu-model',school:'Grand Canyon University',title:'Business BS',totalCredits:120,creditSystem:'semester',externalMaxCredits:90,alternativeMaxCredits:30,policyEvidence:{alternativeMaxCredits:{value:30,creditSystem:'semester',sourceIds:['gcu-alternative-policy']}},sources:[{id:'gcu-alternative-policy',url:'https://www.gcu.edu/transfer'}]});
 const queue=buildResearchPriorities(input),parent=queue.programs.find(p=>p.id==='gcu-business'),child=queue.programs.find(p=>p.id==='gcu-business-campus');
 assert.deepEqual(parent.coveredByVariantIds,['gcu-business-campus']);
 assert.equal(parent.coverageStatus,'covered-by-planning-variant');
 assert.equal(parent.publicationReady,false);
 assert.equal(parent.nextActions.some(task=>task.kind==='map-degree-requirements'),false);
 assert.equal(child.programPolicy.totalTransferMaximum,null);
 assert.equal(child.programPolicy.alternativeCreditMaximum,30);
 assert.equal(queue.schools.find(s=>s.id==='gcu').coverage.unmappedPrograms,1);
 const pending=copy(input);pending.registry.models.at(-1).status='pending';
 assert.equal(buildResearchPriorities(pending).programs.find(p=>p.id==='gcu-business').coverageStatus,'directory-only');
 const unlinked=copy(input);delete unlinked.registry.routes[0].parentId;
 assert.equal(buildResearchPriorities(unlinked).programs.find(p=>p.id==='gcu-business').coverageStatus,'directory-only');
 input.programCatalog.programs[0].modalities=['campus','online'];
 const broader=buildResearchPriorities(input).programs.find(p=>p.id==='gcu-business');
 assert.equal(broader.coverageStatus,'directory-only');
 input.models.at(-1).policyEvidence.alternativeMaxCredits.sourceIds=['missing-policy'];
 assert.equal(buildResearchPriorities(input).programs.find(p=>p.id==='gcu-business-campus').programPolicy.alternativeCreditMaximum,null);
});


test('TESU indexed exam leads remain a source-recovery task without promoting courses, schools or plans',async()=>{
 const review=JSON.parse(await readFile(new URL('./content/research-batches/tesu-current-exam-source-audit-2026-11-19.json',import.meta.url),'utf8'));
 const input=inputs();input.programCatalog.schools.push({id:'tesu',name:review.school,deliveryModes:['online']});
 input.programCatalog.programs.push({id:'tesu-liberal',school:review.school,title:'Liberal Studies BA',level:'bachelor',modalities:['online'],url:'https://www.tesu.edu/academics/ba/liberal-studies/'});
 const before=buildResearchPriorities(input);input.tesuExamReview=copy(review);const after=buildResearchPriorities(input),school=after.schools.find(school=>school.id==='tesu');
 assert.deepEqual(after.summary,before.summary);assert.deepEqual(after.programs,before.programs);assert.equal(school.coverage.publicationReady,0);
 assert.equal(school.examSourceReview.publicationAllowed,false);assert(school.nextActions.some(task=>task.label.includes('404')));
 assert(school.examSourceReview.candidateExams.every(exam=>exam.degreePlacementVerified===false));
 for(const edit of [value=>value.publicationAllowed=true,value=>value.candidateExams[0].enrollmentReady=true,value=>value.sources[0].url='https://copied.example/tesu/']){
  const invalid=copy(input);edit(invalid.tesuExamReview);assert.throws(()=>buildResearchPriorities(invalid),/TESU exam review/);
 }
});
