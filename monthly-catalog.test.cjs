const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Sheet=require('./dist/sheet-state.js');
const read=name=>fs.readFileSync(new URL(name,'file://'+__dirname+'/'),'utf8');
const target=year=>({kind:'course',programId:'curriculum-wgu-catalog-ecceaa488637ac83',requirementId:'math',courseId:'sophia-algebra',catalogYear:year});
function evidence(api=async()=>({items:[]}),extra={}){const root={DegreeCommunity:{api,safeLink:value=>value,getSession:async()=>null,signinLink:()=>''},...extra};vm.runInContext(read('dist/verification.js'),vm.createContext({window:root,URL,Date,console}));return root.DegreeEvidence;}
function community(extra={}){const root={location:{pathname:'/community.html',search:'',hash:''},...extra};vm.runInContext(read('dist/community-client.js'),vm.createContext({window:root,URL,Date,console}));return root.DegreeCommunity;}

test('monthly, annual and academic-year catalog identities validate consistently without merging',()=>{
 const client=evidence();
 for(const year of ['2026','2026-2027','202601','202605','202612']){assert.equal(client.normalizeTarget(target(year)).catalogYear,year);assert.equal(Sheet.catalogYear(year),year);}
 assert.equal(client.catalogYear('2026–2027'),'2026-2027');assert.equal(Sheet.catalogYear('2026—2027'),'2026-2027');
 for(const bad of ['202600','202613','2026051','2026-2028','2026/05','2026-05',null,202605]){assert.throws(()=>client.normalizeTarget(target(bad)));assert.equal(Sheet.catalogYear(bad),'');}
 assert.notEqual(JSON.stringify(client.normalizeTarget(target('202605'))),JSON.stringify(client.normalizeTarget(target('202606'))));
 assert.notEqual(JSON.stringify(client.normalizeTarget(target('202605'))),JSON.stringify(client.normalizeTarget(target('2026-2027'))));
});

test('monthly summary queries and caches exclude adjacent-month and annual reports',async()=>{
 const calls=[],client=evidence(async path=>{calls.push(path);return{items:[{target:target('202605'),summary:{status:'student-reported',reportCount:1}},{target:target('202606'),summary:{status:'community-verified',reportCount:2}},{target:target('2026-2027'),summary:{status:'community-verified',reportCount:3}}]};});
 await client.loadProgram(target('202605').programId,'202605');assert.match(calls[0],/catalogYear=202605$/);assert.equal(client.getSummary(target('202605')).reportCount,1);assert.equal(client.getSummary(target('202606')),null);assert.equal(client.getSummary(target('2026-2027')),null);
});

test('the worksheet defaults to the real monthly program version and repairs stale annual preferences',()=>{
 const src=read('dist/sheet.js'),start=src.indexOf('  function reportYear()'),end=src.indexOf('  function evidenceTarget(',start);assert(start>=0&&end>start);
 for(const program of [{catalogYear:'202605',catalog:'Monthly May 2026'},{catalog:'202605'}])for(const saved of [undefined,'2026-2027']){
  const context=vm.createContext({program,Sheet,settings:()=>({reportCatalogYear:saved}),Date,console});vm.runInContext(src.slice(start,end)+'\nresult=reportYear();',context);assert.equal(context.result,'202605');
 }
 assert.equal(Sheet.programCatalog({catalog:'Current catalog · checked November 2026'}),'','An inspection date is not a catalog version');
});

test('shared plans retain exact monthly catalogs while legacy unknown catalogs stay absent',()=>{
 const program={id:'wgu-monthly',school:'Western Governors University',title:'Business Management',catalogYear:'202605',catalog:'202605',totalCredits:110,requirements:[{id:'math',title:'Math'}]},plan={rows:[{status:'planned',requirementId:'math',credits:3,option:{id:'sophia-algebra',provider:'Sophia',title:'Algebra'}}]},published=Sheet.publicPlan(program,plan,{school:program.school,title:program.title},'balanced'),client=community();
 assert.equal(published.catalogYear,'202605');assert.equal(client.safePlan(published).catalogYear,'202605');
 for(const bad of ['202600','202613','2026-2028',null])assert.equal(client.safePlan({...published,catalogYear:bad}),null);
 const legacy={...published};delete legacy.catalogYear;assert.equal(Object.hasOwn(client.safePlan(legacy),'catalogYear'),false);
 const unknown=Sheet.publicPlan({...program,catalogYear:undefined,catalog:undefined},plan,{school:program.school,title:program.title},'balanced');assert.equal(Object.hasOwn(unknown,'catalogYear'),false);
});

test('community cards show the recorded catalog and never invent an annual label for old posts',()=>{
 const client=community({DegreeEvidence:{badgeHTML:()=>''}}),base={id:'post-monthly',updatedAt:1,title:'My route',body:'Proposed courses',kind:'plan',plan:{schoolName:'Western Governors University',programName:'Business Management',catalogYear:'202605',courses:[]}};
 assert.match(client.postHTML(base),/data-outcome-year="202605"/);
 const legacy={...base,plan:{...base.plan}};delete legacy.plan.catalogYear;const html=client.postHTML(legacy);assert.match(html,/Catalog not recorded/);assert.match(html,/data-outcome-year=""/);assert.doesNotMatch(html,/Catalog 20\d{2}-20\d{2}/);
});

test('legacy catalog selection sends no outcome request until an exact valid version is chosen',async()=>{
 const calls=[],feedback={textContent:''},year={},form={elements:{catalogYear:{value:''}},reportValidity:()=>true,querySelector:()=>feedback},content={innerHTML:'',querySelector:selector=>selector==='.evidence-catalog-form'?form:selector==='[name=evidenceCatalogYear]'?year:null,querySelectorAll:()=>[]},dialog={open:false,querySelector:selector=>selector==='#evidence-content'?content:{},showModal(){this.open=true;},setAttribute(){}},doc={activeElement:null,getElementById:()=>dialog,querySelectorAll:()=>[]},client=evidence(async path=>{calls.push(path);return{items:[],summary:{status:'unreported',reportCount:0}};},{document:doc});
 client.chooseCatalog({kind:'plan',postId:'post-legacy'});assert.equal(calls.length,0);assert.match(content.innerHTML,/does not record a catalog/);
 form.elements.catalogYear.value='202613';form.onsubmit({preventDefault(){}});assert.equal(calls.length,0);assert.match(feedback.textContent,/exact catalog/);
 form.elements.catalogYear.value='202605';form.onsubmit({preventDefault(){}});await new Promise(setImmediate);assert.equal(calls.length,1);assert.match(calls[0],/catalogYear=202605/);
});
