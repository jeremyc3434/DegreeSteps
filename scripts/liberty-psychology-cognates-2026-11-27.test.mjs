import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadKit,clone,parsePlacement} from './pathway-factory/lib.mjs';
import {verifyKit} from './pathway-factory/verify.mjs';
import {compileProgram,compileKit,runGuards,publishedDocuments,serializePublished} from './pathway-factory/compile.mjs';
import {authorPsychologyCognates,reviewId,cohortReviewPath} from './liberty-psychology-cognates-2026-11-27.mjs';

const read=async path=>JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'));
const kit=await loadKit(new URL('../content/pathway-kits/liberty',import.meta.url).pathname),packet=await read(cohortReviewPath);
const authored=await authorPsychologyCognates(kit),programs=authored.programs;
const sum=rows=>rows.reduce((n,row)=>n+row.credits,0);

test('the five exact current family deltas author deterministically and preserve existing compiled programs',async()=>{
 assert.equal(packet.id,reviewId);assert.equal(programs.length,5);
 assert.deepEqual(authored.report,packet);
 for(const p of programs){
  const actual=clone(kit.programs.find(candidate=>candidate.slug===p.slug));delete actual.file;
  const expected=clone(p);delete expected.file;assert.deepEqual(actual,expected);
 }
 for(const p of kit.programs.filter(candidate=>!candidate.modelFields.psychologyCognateReview))assert.deepEqual(compileProgram(authored.kit,p),compileProgram(kit,p));
 const result=await verifyKit(authored.kit,{asOf:'2026-11-27'});assert.deepEqual(result.errors,[]);
 assert.equal(await runGuards(authored.kit,compileKit(authored.kit).doc),10,'Every existing Liberty publication guard must pass for the complete cohort');
});

test('each reviewed baseline retains a complete 120-credit ledger, UNIV and exact cognate denominator',()=>{
 const expectations={
  'psychology-criminal-psychology-online':[15,18,66],
  'psychology-developmental-psychology-online':[15,18,66],
  'psychology-christian-counseling-online':[9,24,60],
  'psychology-crisis-counseling-online':[9,24,60],
  'psychology-military-resilience-online':[9,24,60]
 };
 for(const p of programs){
  const [cognate,electives,major]=expectations[p.slug],f=p.modelFields;
  assert.equal(p.totalCredits,120);assert.equal(p.catalog,'2026–2027');assert.deepEqual(p.modalities,['online']);
  assert.equal(p.review.status,'reviewed');assert.equal(p.requirements.length,39);assert.equal(sum(p.requirements),120);
  assert.equal(p.requirements.find(row=>row.code==='UNIV 104').credits,3);
  assert.equal(sum(p.requirements.filter(row=>row.category==='general')),36);
  assert.equal(sum(p.requirements.filter(row=>row.group==='cognate')),cognate);
  assert.equal(sum(p.requirements.filter(row=>row.freeElective)),electives);
  assert.equal(sum(p.requirements.filter(row=>row.category==='major')),major);
  assert.equal(f.majorResidencyBasisCredits,major);assert.equal(f.policyEvidence.majorResidencyBasisCredits.value,major);
  assert.equal(f.gradePolicy.checked,'2026-11-27');assert.equal(f.institutionMinCredits,30);assert.equal(f.externalMaxCredits,90);assert.equal(f.upperMinCredits,30);
  assert.equal(f.alternativeMaxCredits,undefined);assert.equal(f.appliedTransferWaiver,undefined);
  assert.equal(Object.keys(f.reviewedBaselineChoices.optionSelections).length,p.requirements.length);
  assert.deepEqual(f.curriculumSections.flatMap(section=>section.requirementIds).sort(),p.requirements.map(row=>row.id).sort());
  assert.deepEqual(f.curriculumSections[0].sharedRequirementIds,['biol-102','psyc-101']);
  for(const code of ['RLGN 104','BIBL 104','THEO 104'])assert.equal(p.requirements.find(row=>row.code===code).credits,4);
 }
});

test('every cognate course has captured credit, current online delivery and a complete acyclic prerequisite chain',async()=>{
 for(const p of programs){
  const byId=new Map(p.requirements.map(row=>[row.id,row])),sources=new Map(p.sources.map(source=>[source.id,source]));
  for(const row of p.requirements.filter(row=>row.group==='cognate')){
   assert.equal(row.selectionRequired,false);assert(row.offeringPolicy.offeredFormats.includes('Online'));
   for(const id of row.prerequisiteSourceIds){const source=sources.get(id);assert(source?.capture);const body=await readFile(new URL('../'+source.capture,import.meta.url),'utf8');assert.equal(createHash('sha256').update(body).digest('hex'),source.captureSha256);assert(body.includes(row.code+' '+row.title+' 3 Credit Hour(s)'));}
   for(const id of row.prerequisites)assert(byId.has(id));
  }
  const active=new Set(),done=new Set();
  const visit=id=>{assert(!active.has(id),'Cycle '+p.slug+' '+id);if(done.has(id))return;active.add(id);for(const dependency of byId.get(id)?.prerequisites||[]){assert(byId.has(dependency));visit(dependency);}active.delete(id);done.add(id);};
  for(const id of byId.keys())visit(id);
  const capstone=byId.get('psyc-491');assert.equal(capstone.registrationPolicy.minimumCompletedPsychologyCredits,18);assert.equal(capstone.registrationPolicy.personalEligibilityConfirmed,false);
 }
});

test('Criminal Psychology uses a counted named prerequisite elective instead of inventing a CJUS 340 waiver',()=>{
 const p=programs.find(p=>p.slug==='psychology-criminal-psychology-online'),byId=new Map(p.requirements.map(row=>[row.id,row]));
 assert.deepEqual(byId.get('cjus-340').prerequisites,['cjus-200','free-electives-6']);
 const chosen=byId.get('free-electives-6');assert.equal(chosen.code,'CJUS 230');assert.equal(chosen.credits,3);assert.equal(chosen.freeElective,true);
 assert(chosen.optionRows.some(entry=>entry.inline?.code==='CJUS 230'));
 assert.equal(p.modelFields.reviewedBaselineChoices.optionSelections[chosen.id],'university-cjus-230');
 assert.deepEqual(byId.get('psyc-475').prerequisites,['psyc-341','psyc-101','psyc-255']);
});

test('restricted Developmental and helping cognate choices remain exact online courses, not licensing approvals',()=>{
 const names=key=>programs.find(p=>p.slug==='psychology-'+key+'-online').requirements.filter(row=>row.group==='cognate').map(row=>row.code);
 assert.deepEqual(names('developmental-psychology'),['PSYC 221','PSYC 231','PSYC 235','PSYC 336','PSYC 345']);
 assert(!names('developmental-psychology').includes('PSYC 361'),'Residential-only course cannot be selected for an online baseline');
 assert.deepEqual(names('christian-counseling'),['CCOU 201','CCOU 202','CCOU 301']);
 assert.deepEqual(names('crisis-counseling'),['CRIS 302','CRIS 303','CRIS 304']);
 assert.deepEqual(names('military-resilience'),['MILT 275','MILT 325','MILT 375']);
 for(const p of programs){assert(p.modelFields.rulesNotes.some(note=>/does not itself establish eligibility/.test(note)));assert.equal(p.modelFields.psychologyCognateReview.personalAwardsCreated,0);}
});

test('new placements derive their own model/catalog evidence and preserve unreviewed outside alternatives as conditional',()=>{
 for(const p of programs){
  const model=compileProgram(authored.kit,p),fixed=new Set(p.requirements.filter(row=>row.code).map(row=>row.code));
  for(const row of model.requirements)for(const option of row.options.filter(option=>option.provider!=='University')){
   assert.equal(option.degreePlacementEvidence.modelId,p.modelId);assert.equal(option.degreePlacementEvidence.requirementId,row.id);assert.equal(option.degreePlacementEvidence.catalogYear,'2026-2027');assert.equal(option.degreePlacementEvidence.modality,'online');
   assert.equal(option.sharedAwardProvenance,undefined,'A new degree does not inherit the old shared bundle’s program-specific approval');
   assert.equal(option.placementReview.id,reviewId);assert.equal(option.placementReview.modelId,p.modelId);assert.equal(option.placementReview.catalogYear,'2026-2027');assert.equal(option.placementReview.modality,'online');
   if(row.freeElective)assert(!fixed.has(option.receivingCode)||option.receivingCode===row.code);
   if(row.group==='cognate')assert(!option.conditions?.some(condition=>condition.startsWith('Proposed use in this published elective block.')),'An exact cognate requirement must not carry an old elective-block placement');
  }
  for(const row of p.requirements.filter(row=>row.optionRows.length)){
   const seen=new Set();for(const entry of row.optionRows){const placement=parsePlacement(entry);if(placement.inline)continue;const award=authored.kit.equivalencies.equivalencies.find(award=>award.id===placement.row),identity=award.provider+'|'+award.code;assert(!seen.has(identity));seen.add(identity);}
  }
  const cli=model.requirements.find(row=>row.id==='theo-104').options.find(option=>option.provider==='Christian Leaders Institute');assert(cli);assert.equal(cli.evidence,'conditional');
  assert(!Object.values(model.reviewedBaselineChoices.optionSelections).some(id=>/christian-leaders/.test(id)));
 }
});

test('each new plan publishes independently instead of enlarging the shared Liberty fallback payload',()=>{
 const models=programs.map(program=>compileProgram(authored.kit,program));
 const documents=publishedDocuments(authored.kit,{models,sources:[]}),ids=new Set(programs.map(program=>program.modelId));
 for(const p of programs){
  const matching=documents.filter(document=>document.doc.models.some(model=>model.id===p.modelId));assert.equal(matching.length,1);
  const document=matching[0];assert.equal(document.path,'content/curricula/liberty-'+p.slug+'.json');
  assert.equal(document.doc.models.length,1);assert.deepEqual(document.doc.routes.map(route=>route.id),p.routeIds);
  assert.equal(document.doc.checkedOn,'2026-11-27');assert.equal(document.doc.sources,undefined);
  assert(Buffer.byteLength(serializePublished(document.doc,{compact:true}))<8*1024*1024,'One independently fetched program must stay under the existing shard budget');
 }
 const fallback=documents.find(document=>document.path==='content/curricula/liberty-pathway-kit.json');
 assert(!fallback.doc.models.some(model=>ids.has(model.id)));assert(!fallback.doc.routes?.some(route=>packet.routes.some(item=>item.id===route.id)));
});
