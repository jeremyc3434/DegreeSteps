/* Run the production Sheet submit/close handlers, with presentation-only VM hooks. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Sheet=require('./dist/sheet-state.js'),Journey=require('./dist/journey-engine.js'),Guide=require('./dist/guide-engine.js'),Planner=require('./dist/planner.js'),Catalog=require('./dist/program-catalog.js'),Audit=require('./dist/audit-curriculum.js'),CostForm=require('./dist/cost-assumptions.js'),Comparison=require('./dist/plan-comparison-engine.js');
const KEY='degreepath-guide-v3',copy=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const option=(provider,code)=>({id:provider+'-'+code,provider,code,title:code,credits:3,creditSystem:'semester',evidence:'published',sourceIds:['catalog']});
 const req=(id,provider,code,extra={})=>({id,title:id,credits:3,category:'general',options:[option(provider,code)],...extra});
 const model={id:'estimate-one',school:'Example University',title:'B.S. First route',level:'bachelor',format:'Online',creditSystem:'semester',totalCredits:12,institutionMinCredits:3,upperMinCredits:0,externalMaxCredits:9,sources:[{id:'catalog',url:'https://example.edu/catalog'}],requirements:[req('writing','StraighterLine','ENG101'),req('math','StraighterLine','MAT101'),req('social','Saylor','SOC100'),req('capstone','University','CAP',{institutionalOnly:true})]};
 const second={...copy(model),id:'estimate-two',title:'B.S. Second route'};
 const routes=[model,second].map(m=>({id:m.id,modelId:m.id,school:m.school,title:m.title,level:'bachelor',modalities:['online'],field:'general',goals:['any-degree','career-growth']})),catalog={pathways:routes};
 let state=Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),routes[0]),null,catalog);state.profile={...state.profile,hasPrior:'none',modality:'online',priority:'transfer'};state.sheet.isExample=false;state.journey.completed=true;
 state.learning=[{id:'original-source',provider:'Old college',code:'HIS100',title:'Original source record',credits:3,creditSystem:'semester',status:'saved',evaluations:[{programId:'other-program',requirementId:'history',status:'confirmed'}]}];state.sheet.notes={private:'Keep original advisor note'};
 state.scenarios[model.id]={providers:['StraighterLine','Saylor'],allowConditional:true,providerWeeks:{StraighterLine:1,Saylor:1},termWeeks:8,termCredits:6};
 return{state,catalog,models:[model,second]};
}
function harness({search='?task=cost-time&from=compare'}={}){
 const data=fixture(),values=new Map([[KEY,JSON.stringify(data.state)]]),writes=[],listeners=new Map(),nodes=new Map(),destinations=[];
 const makeNode=id=>({id,dataset:{},innerHTML:'',textContent:'',hidden:false,isConnected:true,open:false,handlers:new Map(),classList:{add(){},toggle(){}},setAttribute(){},focus(){},querySelector(){return null;},addEventListener(type,fn){const rows=this.handlers.get(type)||[];rows.push(fn);this.handlers.set(type,rows);},showModal(){this.open=true;},close(){this.open=false;}});
 const node=id=>{if(!nodes.has(id))nodes.set(id,makeNode(id));return nodes.get(id);};
 const document={getElementById:node,body:node('body'),activeElement:null,querySelector(){return null;},addEventListener(type,fn){const rows=listeners.get(type)||[];rows.push(fn);listeners.set(type,rows);},dispatchEvent(){},createElement:()=>makeNode('generated')};
 const context={console,URL,URLSearchParams,Intl,document,location:{search,pathname:'/plan.html',origin:'https://degreepath.test',assign:value=>destinations.push(value)},history:{replaceState(){}},navigator:{},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},FormData:class extends Map{constructor(form){super(form.fields||[]);}getAll(name){return this.has(name)?[this.get(name)]:[];}},setTimeout(){return 1;},clearTimeout(){},addEventListener(){},dispatchEvent(){},scrollTo(){},DegreeSheet:Sheet,DegreeJourney:Journey,DegreeGuide:Guide,DegreePlanner:Planner,DegreeProgramCatalog:Catalog,AuditCurriculum:Audit,DegreeCostAssumptions:CostForm,DegreePlanComparison:Comparison,localStorage:{getItem:key=>values.get(key)??null,setItem(key,value){values.set(key,value);writes.push({key,value});}}};
 context.window=context;context.__fixture=copy(data);
 const hooks=`state=__fixture.state;catalog=__fixture.catalog;models=__fixture.models;
   render=function(){generate();save();};
   openDialog=function(html,label){window.__dialog={html,label};$('sheet-dialog').open=true;};
   announce=function(message){window.__notice=message;};
   comparisonData=function(){return Promise.resolve({entries:[]});};
   generate();window.__ui={costTimeDialog,closeDialog,returnHome,getState:()=>state,getDraft:()=>({state,pathway,program,plan,input,match,guidance})};`;
 const source=fs.readFileSync(require.resolve('./dist/sheet.js'),'utf8'),instrumented=source.replace(/  boot\(\);\s*\}\(\)\);\s*$/,hooks+'\n}());');assert.notEqual(instrumented,source,'find actual Sheet boot boundary');
 vm.runInNewContext(instrumented,context,{filename:'sheet.js'});
 return{...data,ui:context.__ui,context,writes,destinations,node,saved:()=>JSON.parse(values.get(KEY)),replaceSaved:value=>values.set(KEY,JSON.stringify(value)),async submit(fields){const form={id:'sheet-cost-form',fields,alert:null,querySelector(){return this.alert;},append(error){this.alert=error;}};for(const listener of listeners.get('submit')||[])await listener({target:form,preventDefault(){}});return form;},async closeButton(){const button={id:'close-sheet-dialog',dataset:{},hasAttribute(){return false;},closest(){return this;}};for(const listener of listeners.get('click')||[])await listener({target:button});},cancel(){const event={preventDefault(){this.prevented=true;}};for(const listener of node('sheet-dialog').handlers.get('cancel')||[])listener(event);return event;}};
}
const decode=value=>String(value).replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
function quotedControls(h){
 h.ui.costTimeDialog();const fields=new Map();
 for(const tag of h.context.__dialog.html.match(/<input\b[^>]*>/g)||[]){const attrs=Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(match=>[match[1],decode(match[2])]));if(!attrs.name||attrs.type==='checkbox'&&!/\schecked(?:\s|>)/.test(tag))continue;fields.set(attrs.name,attrs.value??'on');}
 fields.set('universityRate','100');fields.set('fees','50');fields.set('feesConfirmed','on');
 for(const [provider,amount] of [['StraighterLine',250],['Saylor',10]]){fields.set('providerQuote:'+provider,String(amount));fields.set('quoteReviewed:'+provider,'on');fields.set('quoteTaxes:'+provider,'on');if(provider==='Saylor')fields.set('quoteExamFees:'+provider,'on');}
 return fields;
}
function addConcurrentRecord(state){state.learning.push({id:'newer-source',provider:'Other college',code:'BIO100',title:'Saved in another tab',credits:4,creditSystem:'quarter',status:'saved',evaluations:[]});state.sheet.notes.newer='Latest private note';state.scenarios['another-degree']={universityRate:12,fees:90};return state;}

test('actual cost submit merges the latest source records and notes before saving quote edits',async()=>{
 const h=harness(),fields=quotedControls(h);assert.equal(h.writes.length,0);
 const concurrent=addConcurrentRecord(h.saved());h.replaceSaved(concurrent);const form=await h.submit(fields);assert.equal(form.alert,null);assert.equal(h.writes.length,1);
 const next=h.saved();assert.deepEqual(next.learning,concurrent.learning);assert.deepEqual(next.sheet.notes,concurrent.sheet.notes);assert.deepEqual(next.scenarios['another-degree'],concurrent.scenarios['another-degree']);assert.equal(next.selectedPathwayId,concurrent.selectedPathwayId);
 const settings=next.scenarios['estimate-one'];assert.equal(settings.providerQuotes.StraighterLine.amount,250);assert.equal(settings.feesConfirmed,true);
 const current=Journey.buildDraft(next,h.catalog,h.models),cost=Comparison.remainingCosts(current,next,{});assert.equal(cost.total,610);assert.equal(current.plan.totals.confirmed,0);assert.match(h.context.__dialog.html,/Remaining cost estimate/);assert.match(h.context.__dialog.html,/\$610/);
});
test('actual cost submit rejects the old hidden course scope after another tab completes a source course',async()=>{
 const h=harness(),fields=quotedControls(h),concurrent=h.saved();concurrent.learning.push({id:'completed-writing',provider:'StraighterLine',code:'ENG101',title:'Writing now finished',credits:3,creditSystem:'semester',status:'earned',evaluations:[]});concurrent.sheet.notes.latest='Keep completed record';h.replaceSaved(concurrent);
 assert.equal(Journey.buildDraft(concurrent,h.catalog,h.models).plan.rows.find(row=>row.requirementId==='writing').status,'reported');
 const before=JSON.stringify(h.saved()),form=await h.submit(fields);assert.match(form.alert?.textContent||'',/remaining courses changed/);assert.equal(h.writes.length,0);assert.equal(JSON.stringify(h.saved()),before);
});
test('actual cost submit refuses an exact degree changed elsewhere before writing either plan',async()=>{
 const h=harness(),fields=quotedControls(h),concurrent=addConcurrentRecord(Sheet.selectPathway(h.saved(),h.catalog.pathways[1]));h.replaceSaved(concurrent);
 const before=JSON.stringify(h.saved()),form=await h.submit(fields);assert.match(form.alert?.textContent||'',/degree changed in another tab/);assert.equal(h.writes.length,0);assert.equal(JSON.stringify(h.saved()),before);assert.equal(h.saved().scenarios['estimate-two'],undefined);
});
test('closing the read-only estimate dialog returns to Compare without replacing newer courses',async()=>{
 const h=harness();h.ui.costTimeDialog();const concurrent=addConcurrentRecord(h.saved());h.replaceSaved(concurrent);await h.closeButton();
 assert.deepEqual(h.destinations,['compare-plans.html']);assert.equal(h.writes.length,0);assert.deepEqual(h.saved(),concurrent);
});
test('cancelling the task dialog returns to Compare without persisting stale in-memory state',()=>{
 const h=harness();h.ui.costTimeDialog();const concurrent=addConcurrentRecord(h.saved());h.replaceSaved(concurrent);assert.equal(h.cancel().prevented,true);
 assert.deepEqual(h.destinations,['compare-plans.html']);assert.equal(h.writes.length,0);assert.deepEqual(h.saved(),concurrent);
});
test('other task entry points retain their own return destinations without a storage write',()=>{
 for(const [search,destination] of [['?task=cost-time&from=courses','courses.html'],['?task=cost-time','plan.html']]){const h=harness({search});h.ui.closeDialog();assert.deepEqual(h.destinations,[destination]);assert.equal(h.writes.length,0);}
});
test('invalid fee confirmation leaves the actual saved workspace intact and offers a form error',async()=>{
 const h=harness(),fields=quotedControls(h);fields.set('fees','');const before=JSON.stringify(h.saved()),form=await h.submit(fields);assert.match(form.alert?.textContent||'',/fees total/);assert.equal(h.writes.length,0);assert.equal(JSON.stringify(h.saved()),before);
});
