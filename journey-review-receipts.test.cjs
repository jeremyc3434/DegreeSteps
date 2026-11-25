const test=require('node:test'),assert=require('node:assert/strict');
const Journey=require('./dist/journey-engine.js'),Sheet=require('./dist/sheet-state.js'),Checklist=require('./dist/student-checklist.js');
const catalog=require('./dist/data/pathways.json'),program=require('./dist/data/tesu.json');
const copy=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const route=catalog.pathways.find(route=>route.modelId===program.id),initial=Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),route),null,catalog);
 const draft=Journey.buildDraft(initial,catalog,[program]),state=copy(draft.state),signature=Journey.draftSignature(state,draft);
 state.journey={...state.journey,planReviewed:true,schoolContacted:true,reviewedSignature:signature,schoolContactedSignature:signature};
 return{state,draft,signature};
}
test('compact receipts retain both legacy review states without duplicating course or source payloads',()=>{
 const f=fixture(),receipt=Journey.compactReviewSignature(f.signature),before=JSON.stringify(f);
 assert(f.signature.length>10000);assert(receipt.length<250);assert(!receipt.includes('Thomas Edison'));
 assert(Journey.reviewSignatureMatches(receipt,f.signature));assert(Journey.reviewSignatureMatches(f.signature,receipt));assert.equal(Journey.compactReviewSignature(receipt),receipt);
 const older=JSON.parse(f.signature);delete older.selectedPathwayId;const olderSignature=JSON.stringify(older);assert(Journey.reviewSignatureMatches(Journey.compactReviewSignature(olderSignature),olderSignature),'Recognizable older signatures may omit the optional selected-pathway field.');
 const legacy=Journey.tasks(f.state,f.draft);f.state.journey.reviewedSignature=receipt;f.state.journey.schoolContactedSignature=receipt;
 const current=Journey.tasks(f.state,f.draft);assert.deepEqual(current,legacy);assert.equal(current.find(task=>task.id==='plan').complete,true);assert.equal(current.find(task=>task.id==='school').complete,true);
 assert.equal(JSON.stringify({...f,state:{...f.state,journey:{...f.state.journey,reviewedSignature:f.signature,schoolContactedSignature:f.signature}}}),before);
});
test('academic or source changes reopen compact reviews while navigation preserves them',()=>{
 const f=fixture(),receipt=Journey.compactReviewSignature(f.signature),changed=copy(f.draft);changed.program.catalog+=' changed';
 assert(!Journey.reviewSignatureMatches(receipt,Journey.draftSignature(f.state,changed)));assert(!Journey.reviewSignatureMatches(receipt,Journey.draftSignature(f.state,changed),{academicOnly:true}));
 const navigated=copy(f.state);navigated.journey.view='questions';navigated.journey.step='routes';assert(Journey.reviewSignatureMatches(receipt,Journey.draftSignature(navigated,f.draft)));
 changed.program.catalog=f.draft.program.catalog;changed.program.sources[0].checked='2026-11-25';assert(!Journey.reviewSignatureMatches(receipt,Journey.draftSignature(f.state,changed),{academicOnly:true}));
});
test('a price-only change stays separate from the academic checklist receipt',()=>{
 const f=fixture(),receipt=Journey.compactReviewSignature(f.signature),changed=copy(f.draft);changed.plan.costs={...changed.plan.costs,total:123456,knownSubtotal:123456};
 const signature=Journey.draftSignature(f.state,changed);assert(!Journey.reviewSignatureMatches(receipt,signature));assert(Journey.reviewSignatureMatches(receipt,signature,{academicOnly:true}));
 for(const invalid of ['broken','{}',JSON.stringify({...JSON.parse(receipt),full:'not-a-digest'}),JSON.stringify({...JSON.parse(receipt),full:[JSON.parse(receipt).full]}),JSON.stringify({...JSON.parse(receipt),academic:[JSON.parse(receipt).academic]}),JSON.stringify({...JSON.parse(receipt),extra:true})]){assert.equal(Journey.reviewSignatureMatches(invalid,f.signature),false);assert.equal(Journey.reviewSignatureMatches(invalid,f.signature,{academicOnly:true}),false);}
});
test('legacy receipt migration keeps original records and notes within the existing save budget',()=>{
 const f=fixture();f.state.sheet={...f.state.sheet,notes:{[program.id]:{private:'Keep my private note'}}};
 const original=copy(f.state),built=Checklist.build(f.state,f.draft),next=Checklist.apply(f.state,f.draft,{type:'add-task',title:'My next step',planContext:built.planContext});
 assert.deepEqual(f.state,original);assert.deepEqual(next.learning,original.learning);assert.deepEqual(next.sheet,original.sheet);
 assert(Buffer.byteLength(JSON.stringify(next))<Checklist.limits.maxBytes);assert.equal(Checklist.limits.maxBytes,480000);
 assert.equal(Checklist.build(next,f.draft).tasks.find(task=>task.id==='review-plan').status,'done');assert.equal(Checklist.build(next,f.draft).tasks.find(task=>task.id==='review-school-feedback').status,'todo');
});
