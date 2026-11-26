/** Open course slots (owner-approved 2026-11-23): factory verify/compile, explicit category placement rules, planner
 *  accounting, finder eligibility, the quality gate and saved-state compatibility. Repository kits; no network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {loadKit,loadProviders,kitsRoot,slotPieces,slotUpperOnly,slotRowsFor,clone} from './scripts/pathway-factory/lib.mjs';
import {verifyKit} from './scripts/pathway-factory/verify.mjs';
import {compileProgram,compileSlot} from './scripts/pathway-factory/compile.mjs';
const require=createRequire(import.meta.url);
const Planner=require('./dist/planner.js'),Catalog=require('./dist/program-catalog.js'),Sheet=require('./dist/sheet-state.js');
const providers=await loadProviders(join(kitsRoot,'providers'));
const apus=await loadKit(join(kitsRoot,'apus'),{providers}),strayer=await loadKit(join(kitsRoot,'strayer'),{providers});
const program=(kit,slug)=>kit.programs.find(p=>p.slug===slug);
const errorsOf=async kit=>(await verifyKit(kit,{asOf:'2026-11-26'})).errors;

test('slots split into course-sized choices in the school\'s own units; a remainder is the last choice',()=>{
  assert.deepEqual(slotPieces(6,'semester'),[3,3]);assert.deepEqual(slotPieces(3,'semester'),[3]);assert.deepEqual(slotPieces(37,'semester'),[3,3,3,3,3,3,3,3,3,3,3,3,1]);
  assert.deepEqual(slotPieces(27,'quarter'),[4.5,4.5,4.5,4.5,4.5,4.5]);assert.deepEqual(slotPieces(2,'semester'),[2]);assert.deepEqual(slotPieces(15,'competency-unit'),[15]);
  assert.equal(slotUpperOnly('300+ level business elective'),true);assert.equal(slotUpperOnly('Upper-level business administration coursework (300 or above)'),true);
  assert.equal(slotUpperOnly('Elective Requirements (lower-level 100-200 courses)'),false);assert.equal(slotUpperOnly('General Electives'),false);
});

test('the published kits verify with slots and slot placement rules',async()=>{
  assert.deepEqual(await errorsOf(apus),[]);assert.deepEqual(await errorsOf(strayer),[]);
  assert(apus.equivalencies.slotPlacements.length>0);
  for(const rule of apus.equivalencies.slotPlacements){assert.equal(rule.lowerDivision,true);assert(rule.quotes.length&&rule.condition);}
});

test('verify rejects malformed slots and rules',async()=>{
  const kit=clone({...apus,providers:undefined});kit.providers=apus.providers;
  const target=kit.programs.find(p=>p.requirements.some(r=>r.slot)),slot=target.requirements.find(r=>r.slot);
  slot.code='ARTS 101';slot.slot.kind='anything';
  kit.equivalencies.slotPlacements[0]={...kit.equivalencies.slotPlacements[0],condition:'',slotKinds:['free-elective','mystery']};
  const codes=(await errorsOf(kit)).map(e=>e.code);
  for(const code of ['slot-code','slot-kind','slot-rule-condition','slot-rule-kinds'])assert(codes.includes(code),code+' in '+codes.join(','));
});

test('a category award fills only a slot of the matching kind, by exact text, never an upper-level-only slot',()=>{
  const gened=program(apus,'associate-of-arts-in-business-administration').requirements.find(r=>r.slot?.label.startsWith('Arts & Humanities'));
  const rows=slotRowsFor(apus,program(apus,'associate-of-arts-in-business-administration'),gened,{credits:3});
  assert(rows.length>0,'Arts & Humanities awards fill the Arts & Humanities slot');
  assert(rows.every(({row,rule})=>['Arts & Humanities / Humanities','SPAN100: Gen Ed Arts & Humanities'].includes(row.receivingTitle)&&rule.slotKinds.includes('gen-ed')));
  // The same awards never fill a different gen-ed category, a free elective, or an upper-level-only slot.
  const p=program(apus,'associate-of-arts-in-business-administration');
  assert.deepEqual(slotRowsFor(apus,p,{...gened,slot:{kind:'gen-ed',label:'History (select 1 course)'}},{credits:3}),[]);
  assert(slotRowsFor(apus,p,{...gened,slot:{kind:'free-elective',label:'Elective Requirements'}},{credits:3}).every(({row})=>!/Arts & Humanities \/ Humanities/.test(row.receivingTitle)));
  assert.deepEqual(slotRowsFor(apus,p,{...gened,slot:{kind:'free-elective',label:'Upper-level electives (300 or above)'}},{credits:3}),[]);
  // Credits must match the choice exactly: one-credit "Elective Only" awards do not fill a three-credit choice.
  assert(slotRowsFor(apus,p,{...gened,slot:{kind:'free-elective',label:'Elective Requirements'}},{credits:3}).every(({row})=>row.credits===3));
  assert.deepEqual(slotRowsFor(apus,p,{...gened,slot:undefined},{credits:3}),[]);
});

test('compiled slot choices carry the label, an allocation slot flag and each eligible course exactly once per block',()=>{
  const p=program(strayer,'bachelor-of-business-administration'),block=p.requirements.find(r=>r.slot?.kind==='free-elective');
  const choices=compileSlot(strayer,p,block,['online']);
  assert.equal(choices.length,slotPieces(block.credits,'quarter').length);
  for(const [i,choice] of choices.entries()){assert.equal(choice.allocationSlot,true);assert.equal(choice.freeElective,true);assert.equal(choice.slot.label,block.slot.label);assert.equal(choice.slot.choice,i+1);assert.equal(choice.slot.blockCredits,block.credits);assert.equal(choice.code,undefined);}
  const offered=choices.flatMap(choice=>choice.options.map(option=>option.code));assert.equal(new Set(offered).size,offered.length,'each course is offered in one choice only');
  assert.deepEqual(new Set(offered),new Set(slotRowsFor(strayer,p,block,{credits:4.5}).map(({row})=>row.code)),'every eligible course stays available in the block');
  for(const option of choices.flatMap(choice=>choice.options)){assert.equal(option.allocationType,'free-elective-category');assert(option.receivingCategory);assert.equal(option.evidence,'conditional');assert(option.conditions.some(c=>/not as a named course/.test(c)));}
  const model=compileProgram(strayer,p);assert.equal(model.requirements.reduce((s,r)=>s+r.credits,0),p.totalCredits);
});

const registry=require('./dist/data/curriculum-registry.json');
const modelOf=id=>{const entry=registry.models.find(m=>m.id===id);return (require('./dist/'+entry.path).models).find(m=>m.id===id);};

test('planner: an unfilled slot is a course at the school, a filled one is outside credit; the plan stays at confirmation',()=>{
  const model=modelOf('curriculum-strayer-bachelor-of-business-administration'),slots=model.requirements.filter(r=>Planner.isOpenSlot(r));
  assert(slots.length>0);
  const plan=Planner.generate(model,{providers:['Sophia'],allowConditional:true,priority:'transfer',completed:[]});
  assert.equal(plan.validation.academicCountsValid,true);
  for(const row of plan.rows.filter(row=>slots.some(s=>s.id===row.requirementId))){
    const req=slots.find(s=>s.id===row.requirementId);
    if(row.option.provider==='University'){assert.equal(Planner.openSlotPlaceholder(req,row.option),true);assert.equal(row.institutional,true);}
    else assert.notEqual(row.option.code,undefined);
  }
  const placeholders=plan.rows.filter(row=>Planner.openSlotPlaceholder(slots.find(s=>s.id===row.requirementId),row.option));
  assert(placeholders.length>0);
  assert(plan.validation.errors.some(e=>e.code==='selection_required'&&placeholders.some(row=>row.requirementId===e.requirementId)),'open choices stay a confirmation item');
  // Outside credit respects the transfer ceiling.
  assert(plan.totals.external<=model.externalMaxCredits);
  // A slot placeholder is never a named course and is not accepted outside a slot.
  assert.equal(Planner.openSlotPlaceholder({...slots[0],slot:undefined},slots[0].options.find(o=>o.provider==='University')),false);
  assert.equal(Planner.isOpenSlot({...slots[0],institutionalOnly:true}),false);
});

test('finder eligibility: open slots are resolved choices, and the new plans are in the finder at the confirmation tier',()=>{
  const model=modelOf('curriculum-apus-associate-of-arts-in-business-administration');
  const ready=Catalog.modelReadiness?Catalog.modelReadiness(model):null;if(ready)assert.equal(ready.available,true,ready.reason);
  const entry=registry.models.find(m=>m.id===model.id);assert.equal(entry.unresolvedRequiredChoices,0);assert(entry.openCourseChoices>0);
  const index=require('./dist/data/plan-library-index.json').plans,plan=index['apus-associate-of-arts-in-business-administration'];
  assert(plan);assert.equal(plan.tier,'confirmation');assert(plan.questions.some(q=>/open course choice/.test(q)));
  const quality=require('./dist/data/pathway-quality-report.json').programs.find(p=>p.modelId===model.id);
  assert.notEqual(quality.status,'unavailable');assert.equal(quality.research.completeNamedBaseline,true);
  assert(quality.findings.some(f=>f.code==='open-course-choice'&&f.category==='conditional-policy'&&f.blocking));
});

test('saved state: old plans load unchanged, slot choices are additive and private to their degree',()=>{
  const old={version:3,profile:{},learning:[],sheet:{filter:'all',search:'',notes:{p1:{r1:'keep me'}}}};
  assert.equal(Sheet.slotChoice(old,'p1','r1'),null);
  const next=Sheet.setSlotChoice(old,'p1','r9',{code:'HUM 101',title:'Humanities',credits:'3'});
  assert.deepEqual(old.sheet,{filter:'all',search:'',notes:{p1:{r1:'keep me'}}},'the old state object is not mutated');
  assert.deepEqual(next.sheet.notes,old.sheet.notes);assert.equal(next.version,3);
  assert.deepEqual({...Sheet.slotChoice(next,'p1','r9'),updatedAt:''},{code:'HUM 101',title:'Humanities',credits:3,updatedAt:''});
  assert.equal(Sheet.slotChoice(next,'p2','r9'),null);
  assert.throws(()=>Sheet.setSlotChoice(next,'p1','r9',{title:'X',credits:'-1'}),/credits/);
  const cleared=Sheet.setSlotChoice(next,'p1','r9',{code:'',title:''});assert.equal(cleared.sheet.slotChoices.p1,undefined);
  assert.equal(JSON.stringify(Sheet.setSlotChoice(old,'p1','r9',{})).includes('slotChoices":{}'),true);
});

test('the school email asks about the student\'s slot picks only while the three-question limit leaves room',()=>{
  const id='apus-associate-of-arts-in-business-administration',index={plans:{[id]:{tier:'confirmation',questions:['Pick a course for 3 open course choices in this plan, then ask the school to confirm they count.']}}};
  const email=Sheet.schoolEmail(index,id,{title:'AA Business',school:'APUS',slotChoices:['HUM 101 · Humanities for Arts & Humanities (select 2 courses)']});
  assert(email.questions.some(q=>/HUM 101 · Humanities for Arts & Humanities/.test(q)));
  const full={plans:{[id]:{tier:'confirmation',questions:['Ask the school: what is the most ACE- or NCCRS-recommended credit you accept toward this degree?','Ask the school: how many credits must I earn at the school itself for this degree?','Ask the school: is there a time limit on how old transfer credit can be? Its published sources disagree.','Pick a course for 3 open course choices in this plan, then ask the school to confirm they count.']}}};
  const capped=Sheet.schoolEmail(full,id,{slotChoices:['HUM 101 for Arts']});assert.equal(capped.questions.length,3);assert(capped.questions.every(q=>!/HUM 101/.test(q)));
  assert(!Sheet.schoolEmail(index,id,{}).questions.some(q=>/courses I picked/.test(q)),'no picks, no slot question');
});
