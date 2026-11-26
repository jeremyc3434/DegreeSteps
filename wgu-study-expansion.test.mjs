import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {applyStudyExpansion,loadStudyExpansion,validateStudyExpansion,studyIdentityMatchesReceivingLabel} from './scripts/wgu-study-expansion.mjs';
import {loadKit} from './scripts/pathway-factory/lib.mjs';
import {compileKit,runGuards} from './scripts/pathway-factory/compile.mjs';
import {verifyKit} from './scripts/pathway-factory/verify.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Planner=require('./dist/planner.js');

test('twenty independent current Study identities keep actual source credits and levels',async()=>{
  const packet=await loadStudyExpansion();assert.equal(packet.courses.length,20);assert.equal(packet.sources.length,22);
  const byCode=new Map(packet.courses.map(course=>[course.code,course]));
  assert.equal(byCode.get('SDCM-0255').sourceCredits,4);assert.equal(byCode.get('SDCM-0259').sourceCredits,3);
  assert.equal(byCode.get('SDCM-0253').sourceUpper,true);assert.equal(byCode.get('SDCM-0219').sourceUpper,false);assert.equal(byCode.get('SDCM-0201').sourceUpper,false);
  assert.equal(byCode.get('SDCM-0240').courseVersion,3);assert.equal(byCode.get('SDCM-0240').recommendationEnd,'2029-04-30');assert.equal(byCode.get('SDCM-0259').recommendationStart,'2026-01-01');
  for(const course of packet.courses){assert(!Object.hasOwn(course,'credits'));assert.equal(course.sourceCreditSystem,'semester');}
});
test('unknown, changed, future, or receiving-derived identities fail closed',async()=>{
  const packet=await loadStudyExpansion();
  for(const mutate of [p=>p.courses[0].sourceCredits=4,p=>p.courses[0].sourceCreditSystem='competency-unit',p=>p.courses[0].receivingCode='C955',p=>p.sources[0].url='https://partners.wgu.edu/award',p=>p.sources[0].rawBodyCaptured=true,p=>p.sources[0].reviewedExtract+='changed',p=>p.courses[0].identitySourceIds=['unknown'],p=>p.courses.push(structuredClone(p.courses[0])),p=>p.courses.find(c=>c.code==='SDCM-0240').recommendationStart='2026-12-01',p=>p.courses.find(c=>c.code==='SDCM-0259').courseVersion=2]){const value=structuredClone(packet);mutate(value);assert.throws(()=>validateStudyExpansion(value));}
  assert.throws(()=>validateStudyExpansion(packet,{asOf:'2026-11-24'}));
});
test('independent provider facts merge idempotently and preserve unrelated facts and old source review dates',async()=>{
  const packet=await loadStudyExpansion(),provider=JSON.parse(await readFile('content/pathway-kits/providers/study-com.json','utf8'));
  const before=structuredClone(provider),next=applyStudyExpansion(provider,packet);assert.deepEqual(provider,before);assert.deepEqual(applyStudyExpansion(next,packet),next);
  const codes=new Set(packet.courses.map(course=>course.code));for(const course of before.courses)if(!codes.has(course.code))assert.deepEqual(next.courses.find(item=>item.code===course.code),course);
  for(const source of before.sources)assert.deepEqual(next.sources.find(item=>item.id===source.id),source);
});
test('an applied Study review composes with separately reviewed appended identities without reordering or weakening its own facts',async()=>{
  const packet=await loadStudyExpansion(),provider=JSON.parse(await readFile('content/pathway-kits/providers/study-com.json','utf8'));
  const extension=provider.courses.find(course=>course.code==='SDCM-0218');assert(extension&&extension.sourceCreditStatus==='verified');assert(!packet.courses.some(course=>course.code===extension.code));
  const installed=applyStudyExpansion(provider,packet);installed.courses.reverse();installed.sources.reverse();
  const before=structuredClone(installed);assert.deepEqual(applyStudyExpansion(installed,packet),before,'An independent extension and its position must survive --check unchanged');assert.deepEqual(installed,before);
  const changed=structuredClone(installed),owned=packet.courses[0];changed.courses.find(course=>course.code===owned.code).sourceCredits=999;
  const repaired=applyStudyExpansion(changed,packet);assert.notDeepEqual(repaired,changed,'The ownership check must still detect changed reviewed original credits');assert.equal(repaired.courses.find(course=>course.code===owned.code).sourceCredits,owned.sourceCredits);assert.deepEqual(repaired.courses.find(course=>course.code===extension.code),extension);
  for(const collection of ['courses','sources']){const duplicate=structuredClone(installed),ownedRecord=collection==='courses'?duplicate.courses.find(course=>course.code===owned.code):duplicate.sources.find(source=>source.id===packet.sources[0].id);duplicate[collection].push(structuredClone(ownedRecord));assert.throws(()=>applyStudyExpansion(duplicate,packet));}
  const changedSource=structuredClone(installed);changedSource.sources.find(source=>source.id===packet.sources[0].id).reviewedExtract+=' changed';assert.throws(()=>applyStudyExpansion(changedSource,packet));
});
test('a school typo cannot turn independently identified Business Law into Statistics',()=>{
  const row='*Statistics 101 (SDCM-0068) or Business 212 (SDCM-0025)';
  assert.equal(studyIdentityMatchesReceivingLabel({providerCourseCode:'Business 103',title:'Business 103: Introductory Business Law'},row,'SDCM-0025'),false);
  assert.equal(studyIdentityMatchesReceivingLabel({providerCourseCode:'Statistics 101',title:'Principles of Statistics'},row,'SDCM-0068'),true);
  assert.equal(studyIdentityMatchesReceivingLabel({providerCourseCode:'Computer Science 307'},'*Computer Science 307 (SDCM-0220)','SDCM-0220'),true);
  assert.equal(studyIdentityMatchesReceivingLabel({providerCourseCode:'Physics 112L'},'*Physics 111L (SDCM-0255) or Physics 112L (SDCM-0259)','SDCM-0259'),true);
  assert.equal(studyIdentityMatchesReceivingLabel({providerCourseCode:'Computer Science 107'},'SDCM-0212','SDCM-0212'),true);
});
test('current WGU program-scoped awards reuse verified identities while preserving exact ledgers and dated policies',async()=>{
  const kit=await loadKit('content/pathway-kits/wgu'),verified=await verifyKit(kit,{asOf:'2026-11-26'});assert.deepEqual(verified.errors,[]);
  const {doc}=compileKit(kit);await runGuards(kit,doc);
  const model=doc.models.find(m=>m.id==='curriculum-wgu-catalog-3a9fedcacbfcccae');assert.equal(model.catalog,'202610');assert.equal(model.totalCredits,120);assert.equal(model.requirements.length,39);assert.equal(model.requirements.reduce((n,r)=>n+r.credits,0),120);
  const study=model.requirements.flatMap(row=>row.options.filter(option=>option.provider==='Study.com').map(option=>({row,option})));assert.equal(study.length,27);assert.equal(new Set(study.map(({row})=>row.code)).size,20);
  assert(!model.requirements.find(row=>row.code==='C955').options.some(option=>option.code==='SDCM-0025'));assert(model.requirements.find(row=>row.code==='C955').options.some(option=>option.code==='SDCM-0068'));
  const lab=model.requirements.find(row=>row.code==='E073').options.find(option=>option.code==='SDCM-0255');assert.equal(lab.sourceCredits,4);assert.equal(lab.sourceCreditSystem,'semester');assert.equal(lab.credits,1);assert.equal(lab.creditSystem,'competency-unit');
  for(const {row,option}of study){assert.equal(option.universityMapRecord.programId,254);assert.equal(option.universityMapRecord.catalogTerm,'202610');assert.equal(option.universityMapRecord.agreementRecordVersion,242);assert.equal(option.mappingChecked,'2026-11-25');assert.equal(option.receivingCode,row.code);assert.equal(option.credits,row.credits);assert.equal(option.creditOrigin,'alternative');assert.equal(option.evidence,'published');}
  const sources=new Map(doc.sources.map(s=>[s.id,s]));assert.equal(sources.get('wgu-bsswe-202610-curriculum-20261123').checked,'2026-11-23');assert.equal(model.policyCheckedOn,'2026-11-23');
  const conflict=model.transferEvidenceReview.providerCoverage['Study.com'].sourceIdentityConflictsHeld;assert.equal(conflict.length,1);assert.equal(conflict[0].sourceCode,'SDCM-0025');
  // Factory ledgers omit the institutional fallback that the registry normally supplies.
  // Keep that existing boundary explicit while exercising the actual optimizer in memory.
  const executable=structuredClone(model);
  for(const row of executable.requirements)if(!row.options.some(option=>option.provider==='University'))row.options.push({id:'qa-university-'+row.id,provider:'University',code:row.code,title:row.title,credits:row.credits,creditSystem:'competency-unit',creditOrigin:'institutional',sourceIds:row.sourceIds,evidence:'published'});
  const plan=Planner.generate(executable,{providers:['Study.com'],allowConditional:false,priority:'transfer'}),actions=plan.rows.filter(row=>row.option?.provider!=='University').map(row=>row.option.provider+':'+row.option.code);
  assert.equal(new Set(actions).size,actions.length,'A lab-inclusive original course cannot be counted in physics and its lab twice');assert(plan.totals.external<=90);assert.equal(plan.validation.academicCountsValid,true);
  const fixed=new Set(model.requirements.filter(row=>row.institutionalOnly).map(row=>row.id));for(const row of plan.rows.filter(row=>fixed.has(row.requirementId)))assert.equal(row.option.provider,'University');
});
test('credential leads retain exact current receiving rules without becoming semester courses or student awards',async()=>{
  const packet=JSON.parse(await readFile('content/research-batches/wgu-software-credential-leads-2026-11-25.json','utf8'));
  assert.equal(packet.scope.programId,254);assert.equal(packet.scope.catalog,'202610');assert.equal(packet.credentialOptionPlacementsCreated,0);assert(packet.leads.length>=10);
  const guideline=JSON.parse(await readFile(packet.source.capture,'utf8'));
  for(const lead of packet.leads){const row=guideline.find(row=>row.id===lead.guidelineRecordId);assert(row);assert(JSON.parse(row.programs).includes(254));assert.equal(row.PAMS_bannerCode,lead.receivingCode);assert.equal(row.recordVersion,lead.guidelineRecordVersion);assert.equal(row.transferRequirements,lead.quotedTransferRequirements);assert.equal(lead.executionReady,false);assert.equal(lead.sourceCreditsKnown,false);assert(!Object.hasOwn(lead,'sourceCredits'));}
  assert(packet.leads.find(row=>row.receivingCode==='D426').quotedTransferRequirements.includes('DP300'));assert(packet.leads.find(row=>row.receivingCode==='D336').quotedTransferRequirements.includes('active ITIL'));
});
