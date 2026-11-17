const test=require('node:test'),assert=require('node:assert/strict');
const Import=require('./dist/record-import-engine.js');
const template='School/provider,Course code,Course name,Credits,Credit units,Progress,Grade,Exam score,Completion date';

test('the public nine-column template supports source facts without batch defaults',()=>{
 const batch=Import.parseCSV(template+'\nSophia,SOPH-0015,English Composition I,3,semester,Finished,A,,2026-01-20');
 assert.equal(batch.rows[0].selected,true);assert.equal(batch.rows[0].record.provider,'Sophia');assert.equal(batch.rows[0].record.status,'earned');assert.equal(batch.rows[0].record.creditSystem,'semester');assert.equal(batch.rows[0].record.completedOn,'2026-01-20');
});

test('invalid original quantity and date errors survive normalized preview revalidation',()=>{
 const batch=Import.parseCSV(template+'\nSophia,SOPH-0015,English Composition I,3-4,semester,Finished,A,,01/02/2024');
 let row=Import.validateRows(batch.rows)[0];assert.equal(row.record.credits,null);assert.equal(row.record.completedOn,'');assert(row.issues.some(issue=>issue.code==='source-quantity-review'));assert(row.issues.some(issue=>issue.code==='invalid-date'));
 row.record.credits=3;row.record.completedOn='2024-01-02';row.issues=row.issues.filter(issue=>!(issue.origin==='parser'&&['credits','completedOn'].includes(issue.field)));row.selected=true;
 const corrected=Import.validateRows([row])[0];assert.equal(corrected.selected,true);assert(!corrected.issues.some(issue=>issue.severity==='error'));assert.equal(corrected.source.rawValues.credits,'3-4');
});

test('impossible named-month dates are rejected rather than normalized to a different day',()=>{
 for(const value of ['February 30, 2024','31 April 2026','February 29, 2025']){
  const row=Import.fromRecords([{provider:'College',code:'ENG101',title:'Writing',credits:3,creditSystem:'semester',status:'completed',completedOn:value}]).rows[0];
  assert.equal(row.record.completedOn,'');assert.equal(row.selected,false);assert(row.issues.some(issue=>issue.code==='invalid-date'));
 }
 for(const[value,expected]of [['February 29, 2024','2024-02-29'],['20 January 2026','2026-01-20'],['Sept 1, 2025','2025-09-01']]){
  const row=Import.fromRecords([{provider:'College',code:'ENG101',title:'Writing',credits:3,creditSystem:'semester',status:'completed',completedOn:value}]).rows[0];
  assert.equal(row.record.completedOn,expected);assert.equal(row.selected,true);
 }
});

test('receiving transfer awards keep printed evidence separate from unknown originals',()=>{
 const batch=Import.parseTranscript([{page:2,text:'Official Transcript\nSemester credits\nTRANSFER CREDITS AWARDED\nENG101 Composition I 3 TR'}],{provider:'Receiving University',creditSystem:'semester',documentKind:'completed-transcript'}),row=batch.rows[0];
 assert.equal(row.source.isTransfer,true);assert.equal(row.source.awardedCode,'ENG101');assert.equal(row.source.awardedCredits,3);assert.equal(row.record.code,'');assert.equal(row.record.credits,null);assert.equal(row.record.creditSystem,null);assert.notEqual(row.record.status,'earned');assert.equal(row.selected,false);
 row.issues=[];row.record.grade='A';row.record.status='earned';row.selected=true;assert(Import.validateRows([row])[0].issues.some(issue=>issue.code==='receiving-transfer-row'));
});

test('a retained partial course line reports its exact page without inventing a date or amount',()=>{
 const batch=Import.parseTranscript([{page:4,text:'Unofficial Transcript\nFall 2024\nHIST210 Modern History 3.00 3.00 A 12.00'}],{provider:'Original College'});
 assert.equal(batch.rows.length,1);assert.equal(batch.rows[0].source.page,4);assert.equal(batch.rows[0].source.term,'Fall 2024');assert.equal(batch.rows[0].record.credits,null);assert.equal(batch.rows[0].record.completedOn,'');assert.equal(batch.rows[0].selected,false);assert(batch.issues.some(issue=>issue.code==='partial-reading'));
});

test('commit reconstructs additions and never trusts editable prepared record snapshots',()=>{
 const original={id:'keep',provider:'Original College',code:'BIO101',title:'Biology',credits:3,creditSystem:'semester',status:'earned',completedOn:'2020-01-01',evaluations:[{programId:'degree',requirementId:'science',status:'confirmed'}],privateNote:undefined};
 const state={learning:[original],profile:{hasPrior:'degree'},privateWorkspace:{keep:true}},parsed=Import.parseCSV(template+'\nSophia,SOPH-0015,English Composition I,3,semester,Finished,A,,2026-01-20');
 const prepared=Import.prepareImport(state.learning,parsed.rows);prepared.records[0].evaluations=[];prepared.records[0].credits=99;
 const result=Import.commit(state,prepared,{expectedRevision:prepared.baseRevision,reviewed:true});assert.equal(result.ok,true);assert.deepEqual(result.state.learning[0],original);assert.equal(result.state.profile.hasPrior,'degree');assert.deepEqual(state.learning[0],original);
 const changed=Import.prepareImport(state.learning,parsed.rows);changed.rows[0].record.credits=10;assert.equal(Import.commit(state,changed,{expectedRevision:changed.baseRevision,reviewed:true}).ok,false);
});

test('AI review status and unknown units are not promoted by a transcript label',()=>{
 const row=Import.fromRecords([{provider:'College',code:'ENG101',title:'Writing',credits:3,creditSystem:null,status:'review',grade:'A',page:2,sourceText:'ENG101 Writing 3 A',requiresReview:true}],{documentKind:'completed-transcript',extraction:'ai'}).rows[0];
 assert.equal(row.record.status,null);assert.equal(row.record.creditSystem,null);assert.equal(row.source.page,2);assert.equal(row.source.rawLine,'ENG101 Writing 3 A');assert.equal(row.selected,false);
});
