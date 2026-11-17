const test=require('node:test'),assert=require('node:assert/strict');
const A=require('./dist/audit-curriculum.js'),C=require('./dist/program-catalog.js');
const target=(extra={})=>({school:'Example University',degree:'B.S. Biology',programId:'biology',catalog:'2026–2027',creditSystem:'semester',level:'bachelor',modality:'online',sourceUrl:'https://example.edu/biology/',...extra});
const seed=()=>({version:3,profile:{entry:'target',school:'Previous University',schoolChoice:'Previous University',degree:'Previous degree',pathwayId:'custom-target',degreeLevel:'bachelor',modality:'campus',priority:'balanced'},selectedPathwayId:'custom-target',learning:[{id:'original-record',provider:'Former College',code:'BIO101',title:'Previous learning',credits:3,status:'earned',evaluations:[]}],scenarios:{'custom-target':{optionSelections:{a:'course-a'}}},savings:{'custom-target':{saved:25}},sheet:{isExample:false,notes:{private:'Advisor note'},checklist:{checked:true}},checklists:{one:{done:true}},sourceCurricula:[],journey:{completed:true,schoolContacted:true},whatIf:{snapshots:[]}});
const metadata=context=>({school:context.school,title:context.degree,programId:context.programId,level:context.level,modality:context.modality,creditSystem:context.creditSystem,sourceUrl:context.sourceUrl,catalog:context.catalog,totalCredits:''});
const unfinished=context=>({metadata:metadata(context),rows:[{section:'Core',code:'BIO101',title:'',credits:'',requiredAtUniversity:false}],csv:'Course title\tCredit hours\nChoose 2 options\t3-6',mode:'paste'});
const entry=()=>A.create([{section:'Major',code:'BIO101',title:'Biology, methods',credits:3}],{school:'Example University',title:'B.S. Biology',level:'bachelor',modality:'online',creditSystem:'semester',catalog:'2026–2027',totalCredits:3,sourceUrl:'https://example.edu/biology/',reviewedByStudent:true});

test('table imports accept TSV aliases, headings, flags and explicit subtotal warnings',()=>{
 const result=A.parseTable('General education:\nCourse number\tCourse title\tCredit hours\tAt university\tUpper level\nENG101\tWriting, analysis\t3\tno\tno\n\tSubtotal\t3\t\t\nMajor requirements:\nBIO301\tResearch methods\t3\tyes\tyes');
 assert.equal(result.delimiter,'tsv');assert.equal(result.totalCredits,6);assert.equal(result.rows.length,2);assert.equal(result.rows[0].section,'General education');assert.equal(result.rows[0].title,'Writing, analysis');assert.equal(result.rows[1].section,'Major requirements');assert.equal(result.rows[1].requiredAtUniversity,true);assert.equal(result.rows[1].upperLevel,true);assert.equal(result.skipped.filter(row=>row.reason==='subtotal').length,1);assert.match(result.warnings.join(' '),/Skipped summary on row 4/);
});

test('CSV table import preserves quoted commas, quotes and multiline titles',()=>{
 const result=A.parseTable('\uFEFFCategory,Course code,Course name,Units\r\nCore,BUS301,"Quality, \"\"critical\"\"\nand practical",3\r\n');
 assert.equal(result.rows[0].title,'Quality, "critical"\nand practical');assert.equal(result.total,3);
});

test('subtotal detection leaves real coded course titles intact',()=>{
 const result=A.parseTable('code,title,credits\nBUS301,Total Quality Management,3\nMAT210,Working with a Subtotal,3\n,Total credits,6');
 assert.equal(result.totalCredits,6);assert.equal(result.rows.length,2);assert.equal(result.warnings.length,1);
});

test('a repeated table header may reorder columns without shifting requirements',()=>{
 const result=A.parseTable('code,title,credits\nBIO101,Biology,3\ntitle,credits,code\nChemistry,4,CHEM101');
 assert.equal(result.rows[1].code,'CHEM101');assert.equal(result.rows[1].title,'Chemistry');assert.equal(result.totalCredits,7);
});

test('both parsers and direct create reject OR, choose-N and course or credit ranges',()=>{
 for(const row of [{title:'Biology OR Chemistry',code:''},{title:'Choose 2 courses',code:''},{title:'Choose at least 2 courses',code:''},{title:'Two courses from the following list',code:''},{title:'Elective 3 to 6 credits',code:''},{title:'Select any three electives',code:''},{title:'Elective 3–6 credits',code:''},{title:'Choose a science',code:'BIO101-201'},{title:'Choose a science',code:'BIO101/CHEM101'}]){
  const raw='code,title,credits\n'+row.code+','+row.title+',3';
  assert.throws(()=>A.parseTable(raw),/Resolve|Ranges/);assert.throws(()=>A.parseCSV(raw),/Resolve/);assert.throws(()=>A.create([{...row,credits:3}],{school:'School',title:'Degree',level:'bachelor',sourceUrl:'https://example.edu/',totalCredits:3,reviewedByStudent:true}),/Resolve/);
 }
 assert.throws(()=>A.parseTable('Choose 2 courses\nBIO101,Biology,3'),/Resolve/);
 assert.throws(()=>A.parseTable('title,credits\nBiology,3-6'),/exact/);
});

test('exact imported totals never become a default degree total',()=>{
 const result=A.parseTable('title,credits\nBiology,3');assert.equal(result.totalCredits,3);
 const meta={school:'School',title:'Degree',level:'bachelor',sourceUrl:'https://example.edu/',reviewedByStudent:true};
 assert.throws(()=>A.create(result.rows,meta),/total/);assert.throws(()=>A.create(result.rows,{...meta,totalCredits:120}),/total 3/);
});

test('unfinished requirements remain a private draft without models or credit awards',()=>{
 const initial=seed(),before=structuredClone(initial),context=target(),payload=unfinished(context),next=A.saveDraft(initial,context,payload);
 assert.deepEqual(initial,before);assert.deepEqual(next.learning,before.learning);assert.deepEqual(next.sheet,before.sheet);assert.deepEqual(next.checklists,before.checklists);assert.deepEqual(next.sourceCurricula,before.sourceCurricula);assert.equal(next.selectedPathwayId,before.selectedPathwayId);assert.deepEqual(A.models(next),[]);assert.equal(next.customCurricula,undefined);assert.equal(next.auditDrafts.version,1);
 const saved=A.readDraft(next,context);assert.equal(saved.mode,'paste');assert.equal(saved.rows[0].title,'');assert.equal(saved.rows[0].credits,'');assert.equal(saved.metadata.totalCredits,'');assert.equal(saved.metadata.reviewedByStudent,false);assert.equal(saved.csv,payload.csv);
 saved.rows[0].title='changed copy';assert.equal(A.readDraft(next,context).rows[0].title,'');
});

test('draft targets isolate school, degree, program, catalog, units, level and format',()=>{
 const context=target();let next=A.saveDraft(seed(),context,unfinished(context));
 for(const delta of [{school:'Other University'},{degree:'B.S. Chemistry'},{programId:'chemistry'},{catalog:'2027–2028'},{creditSystem:'quarter'},{level:'master'},{modality:'campus'}]){
  const other=target(delta);assert.equal(A.readDraft(next,other),null);next=A.saveDraft(next,other,unfinished(other));
 }
 assert.equal(next.auditDrafts.drafts.length,8);assert.equal(A.readDraft(next,context).context.degree,'B.S. Biology');
 assert(A.readDraft(next,target({school:' EXAMPLE   UNIVERSITY ',degree:'b.s. biology'})));
});

test('unknown credit units and delivery format do not borrow known-context drafts',()=>{
 const context=target({creditSystem:'',modality:'',level:''}),next=A.saveDraft(seed(),context,unfinished(context));
 assert.equal(A.readDraft(next,context).context.creditSystem,'');assert.equal(A.readDraft(next,target()),null);
 assert.equal(A.readDraft(next,{...context,creditSystem:'semester'}),null);
});

test('draft metadata cannot restore a different target under an existing key',()=>{
 const context=target(),payload=unfinished(context);payload.metadata.title='B.S. Chemistry';
 assert.throws(()=>A.saveDraft(seed(),context,payload),/metadata.*target/);
 const saved=A.saveDraft(seed(),context,unfinished(context));saved.auditDrafts.drafts[0].metadata.school='Other School';
 assert.throws(()=>A.readDraft(saved,context),/metadata.*target/);
});

test('corrupt draft storage fails closed even when no target is requested',()=>{
 const context=target(),good=A.saveDraft(seed(),context,unfinished(context));
 for(const corrupt of [s=>s.auditDrafts=null,s=>s.auditDrafts.version=2,s=>s.auditDrafts.drafts={},s=>s.auditDrafts.drafts.push(structuredClone(s.auditDrafts.drafts[0])),s=>s.auditDrafts.drafts[0].key='wrong-target',s=>s.auditDrafts.drafts[0].updatedAt='2026-99-99T00:00:00.000Z',s=>s.auditDrafts.drafts[0].rows=[{title:{nested:'invalid'}}],s=>s.auditDrafts.drafts[0].metadata.reviewedByStudent=true]){
  const state=structuredClone(good);corrupt(state);const before=structuredClone(state);
  assert.throws(()=>A.readDraft(state,{}));assert.throws(()=>A.saveDraft(state,context,unfinished(context)));assert.throws(()=>A.commit(state,entry()));assert.deepEqual(state,before);
 }
});

test('draft storage bounds rows, input strings, draft counts and encoded bytes',()=>{
 const context=target();
 for(const delta of [{rows:Array.from({length:501},()=>({title:''}))},{csv:'x'.repeat(150001)},{rows:[{title:'x'.repeat(201)}]},{metadata:{...metadata(context),sourceUrl:'x'.repeat(1501)}},{rows:[{requiredAtUniversity:'no'}]}])assert.throws(()=>A.saveDraft(seed(),context,{...unfinished(context),...delta}));
 let next=seed();for(let i=0;i<10;i++){const c=target({programId:'program-'+i});next=A.saveDraft(next,c,unfinished(c));}
 const before=structuredClone(next);assert.throws(()=>A.saveDraft(next,target({programId:'extra'}),unfinished(target({programId:'extra'}))),/up to 10/);assert.deepEqual(next,before);
 const big={...unfinished(context),csv:'x'.repeat(140000)},first=A.saveDraft(seed(),context,big),other=target({programId:'other'});
 assert.throws(()=>A.saveDraft(first,other,{...unfinished(other),csv:'x'.repeat(140000)}),/too large/);
 assert.throws(()=>A.saveDraft(seed(),context,{...unfinished(context),csv:'😀'.repeat(70000)}),/too large/);
});

test('launch URLs round-trip the complete target through encoded query parameters',()=>{
 const context=target({school:'Example & Partner University',degree:'B.S. Biology / Health',sourceUrl:'https://example.edu/catalog?a=1&b=2'}),url=A.launchURL(context),params=new URL(url,'https://degreepath.example/').searchParams;
 for(const [field,value] of Object.entries(context))assert.equal(params.get(field),value);
 assert.equal(A.launchURL({}),'degree-audit.html');assert.throws(()=>A.launchURL(target({degree:'x'.repeat(201)})),/degree/);
});

test('commit uses the shared exact-target snapshot contract and preserves global private records',()=>{
 const initial=seed(),context=target();initial.targetIdentity={version:1,route:{id:'custom-target',school:initial.profile.school,title:initial.profile.degree,level:'bachelor',modalities:['campus'],creditSystem:'quarter',catalog:'2022–2023',url:'https://previous.example.edu/catalog/',routeType:'custom'},profile:{entry:'target',school:initial.profile.school,schoolChoice:initial.profile.school,degree:initial.profile.degree,pathwayId:'custom-target',degreeLevel:'bachelor',field:'any'}};
 const withDraft=A.saveDraft(initial,context,unfinished(context)),before=structuredClone(withDraft),e=entry(),next=A.commit(withDraft,e),snapshot=next.whatIf.snapshots[0],expected=C.planSnapshot(before,{pathway:{id:'custom-target'}},{id:C.planHistoryId(before,{pathway:{id:'custom-target'}},'before-audit:')});
 assert.deepEqual(withDraft,before);assert.deepEqual(snapshot.targetIdentity,expected.targetIdentity);assert.equal(snapshot.id,expected.id);assert.equal(snapshot.targetIdentity.route.creditSystem,'quarter');assert.equal(snapshot.targetIdentity.route.catalog,'2022–2023');assert.deepEqual(snapshot.settings,before.scenarios['custom-target']);assert.deepEqual(snapshot.savings,before.savings['custom-target']);
 for(const field of ['learning','sourceCurricula','checklists','scenarios','savings','auditDrafts'])assert.deepEqual(next[field],before[field]);assert.deepEqual(next.sheet.notes,before.sheet.notes);assert.deepEqual(next.sheet.checklist,before.sheet.checklist);assert(!('learning' in snapshot));assert(!('sheet' in snapshot));assert.equal(next.targetIdentity,undefined);assert.equal(next.selectedPathwayId,e.route.id);assert.equal(next.customCurricula[0].route.creditSystem,'semester');assert.equal(next.customCurricula[0].route.catalog,'2026–2027');
});

test('committed audit rows cannot be silently rewritten under the same model identity',()=>{
 const e=entry(),first=A.commit(seed(),e),replacement=structuredClone(e);replacement.model.requirements[0].title='Changed requirement';const before=structuredClone(first);
 assert.throws(()=>A.commit(first,replacement),/new private requirements version/);assert.deepEqual(first,before);
});


test('malformed committed-audit or comparison stores fail before replacing the target',()=>{
 for(const value of [null,{},'not an array']){
  const initial={...seed(),customCurricula:value},before=structuredClone(initial);assert.throws(()=>A.models(initial),/storage/);assert.throws(()=>A.commit(initial,entry()),/storage/);assert.deepEqual(initial,before);
 }
 const initial=seed();initial.whatIf.snapshots='corrupt';const before=structuredClone(initial);assert.throws(()=>A.commit(initial,entry()),/comparisons/);assert.deepEqual(initial,before);
});


test('private workspace validation covers every import and draft plus the UTF-8 account bound',()=>{
 const context=target(),valid=A.commit(A.saveDraft(seed(),context,unfinished(context)),entry()),before=structuredClone(valid);
 assert.equal(A.validatePrivateWork(valid),true);assert.deepEqual(valid,before);
 for(const corrupt of [state=>state.customCurricula=null,state=>state.customCurricula[0].model.totalCredits=120,state=>state.auditDrafts.version=2,state=>state.auditDrafts.drafts[0].metadata.school='Different School',state=>state.profile=[],state=>state.learning={}]){
  const invalid=structuredClone(valid);corrupt(invalid);const original=structuredClone(invalid);assert.throws(()=>A.validatePrivateWork(invalid));assert.deepEqual(invalid,original);
 }
 const oversized=structuredClone(valid);oversized.sheet.notes.private='😀'.repeat(120000);assert.throws(()=>A.validatePrivateWork(oversized),/too large/);
});
