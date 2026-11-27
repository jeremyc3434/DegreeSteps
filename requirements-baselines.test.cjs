const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const B=require('./dist/requirements-baselines.js');
const A=require('./dist/audit-curriculum.js');
const data=require('./content/catalog/umass-global-mypath-bba-requirements-2024-2025.json');
const clone=value=>JSON.parse(JSON.stringify(value));
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const digest=value=>createHash('sha256').update(value).digest('hex');
const choice=emphasisId=>({catalogId:'2024-2025',emphasisId});
const sum=rows=>Math.round(rows.reduce((total,row)=>total+row.credits,0)*1000)/1000;
function initial(){return{version:3,profile:{school:'Existing University',degree:'Existing degree',pathwayId:'existing-route',learnerStage:'enrolled',currentSchool:'University of Massachusetts Global',currentProgram:'MyPath business — enrolled in 2024'},selectedPathwayId:'existing-route',learning:[{id:'original-course',provider:'Original College',code:'HIST 101',title:'History',credits:3,creditSystem:'semester',status:'earned'}],sheet:{isExample:false,notes:{private:'Keep my notes'},completed:['existing-row']},scenarios:{'existing-model':{providers:['University'],optionSelections:{existing:'chosen'}}},journey:{version:1,view:'home',completed:true},whatIf:{version:1,snapshots:[{id:'saved-comparison',title:'Keep my comparison'}]},customCurricula:[],sourceCurricula:[],targetIdentity:{version:1,route:{id:'existing-route',school:'Existing University',title:'Existing degree'}}};}

test('the asset payload and retained canonical ledger have their independently checked SHA256 bindings',()=>{
 const payload=clone(data);delete payload.hash;
 assert.equal(digest(JSON.stringify(stable(payload))),B.BASELINE_HASH);assert.equal(data.hash,B.BASELINE_HASH);
 const bytes=readFileSync(data.source.ledgerPath),ledger=JSON.parse(bytes);
 assert.equal(digest(bytes),B.SOURCE_LEDGER_SHA256);assert.equal(data.source.ledgerSha256,B.SOURCE_LEDGER_SHA256);
 assert.equal(ledger.source.sha256,B.SOURCE_PDF_SHA256);assert.equal(data.source.pdfSha256,B.SOURCE_PDF_SHA256);
 assert.equal(data.source.pdfBytes,ledger.source.bytes);assert.equal(data.source.url,ledger.source.url);
 const sourceRows=[ledger.studentSuccess,...ledger.generalEducation.courses,...ledger.businessCore.courses,...ledger.emphases.flatMap(emphasis=>emphasis.courses||[])];
 for(const row of [...data.commonRows,...data.emphases.flatMap(emphasis=>emphasis.rows)].filter(row=>row.code)){
  const original=sourceRows.find(value=>value.code===row.code&&row.sourceUrl===data.source.url+'#page='+value.requirementEvidenceAt.physicalPage);
  assert(original,'An exact retained requirement and page must exist for '+row.code);assert.equal(row.title,original.programTitleAsPrinted);assert.equal(row.credits,original.creditQuantity);
  const proof=data.rowProvenance[row.code];assert.deepEqual(proof.creditPage,original.creditEvidenceAt);assert.equal(proof.creditLabelAsPrinted,original.creditLabelAsPrinted);assert.equal(proof.formalPrerequisiteCodes,null);
 }
 const tampered=clone(payload);tampered.commonRows[0].title+=' changed';assert.notEqual(digest(JSON.stringify(stable(tampered))),B.BASELINE_HASH,'The build binding detects changed content, rather than treating its recorded hash as proof.');
});

test('all six exact emphasis choices preserve 120 credit equivalents, fractions and documented open choices',()=>{
 const validated=B.validateCatalog(data);assert.notEqual(validated,data);assert.deepEqual(validated,data);
 const expectedCounts=[52,58,58,58,60,59],programIds=new Set();
 for(const[index,id]of B.EMPHASIS_IDS.entries()){
  const result=B.prepareDraft(initial(),data,choice(id),A);programIds.add(result.metadata.programId);
  assert.equal(result.rows.length,expectedCounts[index]);assert.equal(sum(result.rows),120);assert.equal(result.metadata.totalCredits,120);
  assert.equal(result.metadata.creditUnitLabel,'catalog-equivalent credits');assert.equal(result.metadata.learningFormat,'competency-based');assert.equal(result.metadata.creditSystem,'semester');
  assert.equal(result.metadata.institutionMinCredits,30);assert.equal(result.metadata.upperMinCredits,'');assert.equal(result.metadata.reviewedByStudent,false);
  assert.deepEqual(result.rows.filter(row=>row.requiredAtUniversity).map(row=>row.code),['LBSC 320','LBSC 321']);assert.equal(result.rows.find(row=>row.code==='LBSC 100').requiredAtUniversity,false);
  assert(!result.rows.some(row=>row.code==='ORIC 100'));assert(!result.rows.some(row=>Object.hasOwn(row,'options')||Object.hasOwn(row,'receivingCode')||Object.hasOwn(row,'prerequisites')));
  assert(result.rows.some(row=>row.credits===0.6));assert(result.rows.some(row=>row.credits===1.5));assert(result.rows.some(row=>row.credits===4.5));
  assert.equal(result.baseline.requiresAllocation,index===0);assert.equal(result.rows.filter(row=>row.allocationRequired).length,index===0?1:0);
 }
 assert.equal(programIds.size,6);
 const gb=B.prepareDraft(initial(),data,choice('general-business'),A).rows.find(row=>row.allocationRequired);
 assert.equal(gb.code,'');assert.equal(gb.credits,19);assert.match(gb.title,/specific courses not selected/);assert.equal(data.emphases[0].namedCompetencyCount,null);
});

test('a requirements draft adds only private draft storage and never invokes plan selection, mapping or optimization',()=>{
 const state=initial(),before=clone(state),calls=[];
 const guarded={...A,validatePrivateWork(value){calls.push('validate');return A.validatePrivateWork(value);},readDraft(...args){calls.push('read');return A.readDraft(...args);},saveDraft(...args){calls.push('save');return A.saveDraft(...args);},commit(){assert.fail('Loading requirements cannot select a plan');},inheritEquivalencies(){assert.fail('No credit-hour mappings may be inherited');},create(){assert.fail('Loading requirements cannot create a course plan');}};
 const result=B.prepareDraft(state,data,choice('marketing'),guarded);
 assert.deepEqual(calls,['validate','read','save']);assert.deepEqual(state,before);assert.notEqual(result.state,state);
 const withoutDraft=clone(result.state);delete withoutDraft.auditDrafts;assert.deepEqual(withoutDraft,before);
 assert.equal(result.state.auditDrafts.drafts.length,1);assert.equal(result.state.auditDrafts.drafts[0].mode,'rows');assert.equal(result.state.auditDrafts.drafts[0].metadata.baselineMode,'requirements-only');
 const link=new URL(result.href,'https://degreesteps.com/');assert.equal(link.pathname,'/degree-audit.html');assert.equal(link.searchParams.get('catalog'),'2024-2025');assert.equal(link.searchParams.get('programId'),result.metadata.programId);
 assert(!JSON.stringify(result.metadata).includes('templateRevision'));assert(!JSON.stringify(result.metadata).includes('sourcesReviewed'));
});

test('replaying a baseline reopens the exact edited draft without replacing its rows or private state',()=>{
 const first=B.prepareDraft(initial(),data,choice('general-business'),A),payload=clone(A.readDraft(first.state,first.context));
 payload.rows[1].title='My note about this requirement';payload.metadata.sourceUrl+='?my-audit-reference';payload.csv='Keep my unfinished spreadsheet';
 const edited=A.saveDraft(first.state,first.context,payload),before=clone(edited);
 const replay=B.prepareDraft(edited,data,choice('general-business'),A);
 assert.equal(replay.reused,true);assert.equal(replay.state,edited);assert.deepEqual(replay.state,before);assert.deepEqual(replay.rows,payload.rows);assert.equal(replay.metadata.sourceUrl,payload.metadata.sourceUrl);assert.equal(replay.state.auditDrafts.drafts.length,1);
 replay.rows[1].title='Mutating the returned preview does not edit storage';assert.equal(edited.auditDrafts.drafts[0].rows[1].title,'My note about this requirement');
 const separate=B.prepareDraft(edited,data,choice('information-systems-management'),A);assert.equal(separate.state.auditDrafts.drafts.length,2);assert.deepEqual(A.readDraft(separate.state,first.context),A.readDraft(edited,first.context));
});

test('catalog and emphasis are mandatory explicit choices, independent of enrollment notes or URL-like input',()=>{
 const state=initial(),before=clone(state);
 for(const selection of [undefined,null,{}, {emphasisId:'general-business'}, {catalogId:'2024-2025'}, {catalogId:'2023-2024',emphasisId:'general-business'}, {catalogId:'2026-2027',emphasisId:'general-business'}, {catalogId:'2024-2025',emphasisId:'general'}, {catalogId:'2024-2025',emphasisId:'../general-business'}])assert.throws(()=>B.prepareDraft(state,data,selection,A),/Choose the exact/);
 assert.deepEqual(state,before);
});

test('bad source anchors, data shapes, rows, credit quantities and receiving claims fail before any draft write',()=>{
 const changes=[d=>{d.hash='0'.repeat(64);},d=>{d.source.pdfSha256='f'.repeat(64);},d=>{d.source.ledgerSha256='f'.repeat(64);},d=>{d.source.url='https://example.edu/catalog.pdf';},d=>{d.revision=2;},d=>{d.catalogId='2026-2027';},d=>{d.commonRows[0].credits=4;},d=>{d.commonRows[1].credits=4;d.commonRows[2].credits=2;},d=>{d.commonRows[1].code=d.commonRows[2].code;},d=>{d.commonRows.find(row=>row.code==='LBSC 320').requiredAtUniversity=false;},d=>{d.commonRows[0].requiredAtUniversity=true;},d=>{d.commonRows[0].options=[{provider:'Sophia',evidence:'published'}];},d=>{d.emphases[0].rows[0].allocationRequired=false;},d=>{d.emphases[0].namedCompetencyCount=19;},d=>{d.emphases[1].rows.pop();},d=>{d.rowProvenance['ACCC 235'].formalPrerequisiteCodes=['ACCC 240'];},d=>{d.rowProvenance['COMC 101'].creditPage.physicalPage=1;},d=>{d.policy.alternativeMaxCredits=30;},d=>{d.receivingAwardPromotionAllowed=true;},d=>{d.commonRows[0].title='';},d=>{d.optionalOrientation.required=true;}];
 for(const change of changes){const invalid=clone(data),state=initial(),before=clone(state);change(invalid);assert.throws(()=>B.prepareDraft(state,invalid,choice('marketing'),{...A,saveDraft(){assert.fail('Invalid evidence must not be saved');}}),/baseline is unavailable or invalid/);assert.deepEqual(state,before);}
});

test('corrupt or oversized saved work and altered baseline identity fail without replacing records',()=>{
 for(const change of [state=>{state.learning={};},state=>{state.auditDrafts={version:1,drafts:[{}]};},state=>{state.customCurricula=[{}];},state=>{state.privateNotes='x'.repeat(481000);}]){
  const state=initial();change(state);const before=clone(state);assert.throws(()=>B.prepareDraft(state,data,choice('general-business'),A));assert.deepEqual(state,before);
 }
 const first=B.prepareDraft(initial(),data,choice('marketing'),A),stored=clone(A.readDraft(first.state,first.context));stored.metadata.baselineHash='0'.repeat(64);
 const changed=A.saveDraft(first.state,first.context,stored),before=clone(changed);assert.throws(()=>B.prepareDraft(changed,data,choice('marketing'),A),/different source details/);assert.deepEqual(changed,before);
});

test('the shared requirement pages, source discrepancies and unknown course levels remain explicit',()=>{
 const catalog=B.validateCatalog(data);
 assert.deepEqual(catalog.rowProvenance['CSCC 395'].requirementPages,[{printedPage:117,physicalPage:118},{printedPage:118,physicalPage:119}]);
 assert.equal(catalog.commonSummary.generalEducationNamedCount,16);assert.match(catalog.conflicts.find(x=>x.id==='ge-header-count-mismatch').detail,/13 competencies.*16 distinct codes/);
 assert(catalog.rowProvenance['ACCC 235'].advisorySequencingQuotes.some(x=>/Managerial Decisions/.test(x)));assert(catalog.rowProvenance['ACCC 240'].advisorySequencingQuotes.some(x=>/Financial Planning/.test(x)));
 assert(catalog.conflicts.some(x=>x.id==='database-description-body-mismatch'));assert(Object.values(catalog.rowProvenance).every(x=>x.formalPrerequisiteCodes===null&&x.upperLevelStatus==='not-inferred-by-this-baseline'));
});

test('the browser entry exports the same pure helper without DOM, storage or network access',()=>{
 const context=vm.createContext({});vm.runInContext(readFileSync('./dist/requirements-baselines.js','utf8'),context);
 vm.runInContext('const input='+JSON.stringify(data)+'; result=DegreeRequirementsBaselines.validateCatalog(input).id;',context);
 assert.equal(context.result,B.BASELINE_ID);assert.equal(typeof context.DegreeRequirementsBaselines.prepareDraft,'function');assert(Object.isFrozen(B));assert(Object.isFrozen(B.EMPHASIS_IDS));
});
