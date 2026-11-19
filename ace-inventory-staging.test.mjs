import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stageInventory} from './scripts/stage-ace-inventory.mjs';

const load=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const checked=await load('./content/research-batches/ace-inventory-2026-11-18.json');
// A small source-shaped fixture exercises validation without requiring an
// ignored attachment export in CI. The committed batch carries the full data.
const cell=(column,value)=>({column,value});
function fixture(){return {'Program maps':{rows:[{row:5,cells:[cell('A','Example University'),cell('B','Business BS'),cell('C','2026–27'),cell('D','Sophia'),cell('E','Partial degree map'),cell('F',3),cell('G','semester credits'),cell('J',120),cell('L','https://example.edu/degree')]}]},'Course matches':{rows:[{row:5,cells:[cell('A','Example University'),cell('B','Business BS'),cell('C','2026–27'),cell('D','Sophia'),cell('E','Writing'),cell('F',3),cell('G','semester credits'),cell('H','SOPH-0015'),cell('I','SOPH-0015'),cell('J','English Composition I'),cell('K','Counted'),cell('L','https://example.edu/map')]}]},'Meets 50% ACE':{rows:[]},'University credit':{rows:[]}};}

test('full research handoff preserves scope, reconciled totals and strict nonpublication guards',()=>{
 assert.equal(checked.summary.scenarioCount,95);assert.equal(checked.summary.courseMappingCount,1038);assert.equal(checked.summary.qualificationScenarioClaims,13);assert.equal(checked.summary.qualificationDegreeClaims,11);assert.equal(checked.summary.newPriorityDegreeCandidates,10);assert.equal(checked.summary.institutionalCourseMappings,27);
 assert.equal(checked.summary.scopeCounts['future-catalog']+checked.summary.scopeCounts['future-bridge-catalog'],5);
 assert.equal(checked.publicationAllowed,false);assert.equal(checked.status,'research-staging-only');assert.equal(checked.privateStudentRecordsIncluded,false);assert.equal(checked.sourceInstructionsExecuted,false);
 for(const scenario of checked.scenarios){assert.equal(scenario.publicationAllowed,false);assert.equal(scenario.verificationStatus,'staged-unreviewed');const chosen=new Set();let sum=0;for(const row of scenario.courseMappings){assert.equal(row.originalSourceCredit.quantity,null);assert.equal(row.originalSourceCredit.unit,null);if(row.selected)sum+=row.receivingAward.quantity;for(const id of row.chosenIdentifiers){assert(!chosen.has(id));chosen.add(id);}}assert(Math.abs(sum-scenario.mappedReceivingQuantity)<1e-6);}
 assert.equal(checked.candidatePriorities.filter(p=>p.school==='Liberty University').length,1);assert(!checked.candidatePriorities.some(p=>p.school==='Western Governors University'));
});

test('an empty workbook ID is reconciled against existing identities without inventing a new catalog record',()=>{
 const batch=stageInventory(fixture(),{programCatalog:{programs:[{id:'existing-business',school:'Example University',title:'Business B.S.'}]}});
 assert.deepEqual(batch.scenarios[0].reconciliation.candidateExistingIds,['existing-business']);assert.equal(batch.scenarios[0].reconciliation.status,'possible-existing-program-requires-scope-review');assert.equal(batch.scenarios[0].publicationAllowed,false);assert.equal(batch.scenarios[0].mappedReceivingQuantity,3);
});

test('duplicate chosen courses and mismatched receiving totals fail staging rather than inflate coverage',()=>{
 const repeated=fixture();const row=structuredClone(repeated['Course matches'].rows[0]);row.row=6;repeated['Course matches'].rows.push(row);repeated['Program maps'].rows[0].cells.find(c=>c.column==='F').value=6;
 assert.throws(()=>stageInventory(repeated),/Repeated chosen ACE identity/);
 const wrong=fixture();wrong['Program maps'].rows[0].cells.find(c=>c.column==='F').value=6;assert.throws(()=>stageInventory(wrong),/sum does not equal/);
});
