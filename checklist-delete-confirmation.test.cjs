const test=require('node:test'),assert=require('node:assert/strict');
const View=require('./dist/student-checklist-view.js'),Checklist=require('./dist/student-checklist.js'),Sheet=require('./dist/sheet-state.js'),Journey=require('./dist/journey-engine.js');
const catalog=require('./dist/data/pathways.json'),models=['tesu','liberty'].map(name=>require('./dist/data/'+name+'.json'));
function fixture(){
 let state=Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),catalog.pathways.find(p=>p.id==='tesu-general-management')),null,catalog);
 state.profile.hasPrior='none';state.profile.modality='online';
 const draft=()=>Journey.buildDraft(state,catalog,models),build=()=>Checklist.build(state,draft());
 state=Checklist.apply(state,draft(),{type:'add-task',title:'Call the advisor',notes:'Ask about evening classes',dueOn:'2027-02-28',planContext:build().planContext});
 const id=build().tasks.find(task=>task.custom).id,doc={activeElement:null},events={},calls=[],focus=[],draftForms=[];
 const live={textContent:'',classList:{toggle(){}}};
 const content={innerHTML:'',parentElement:null,contains:node=>node?.parentElement===content,addEventListener:(type,handler)=>events[type]=handler,
  querySelectorAll(selector){
   if(selector==='form[data-dc-form]')return draftForms;
   if(selector==='[data-dc-focus]')return [...this.innerHTML.matchAll(/data-dc-focus="([^"]+)"/g)].map(([,key])=>({dataset:{dcFocus:key},parentElement:content,closest:()=>null,focus(){doc.activeElement=this;focus.push(key);},scrollIntoView(){}}));
   return [];
  }};
 const node={innerHTML:'',ownerDocument:doc,querySelector:selector=>selector==='[data-dc-content]'?content:selector==='.dc-live'?live:null};content.parentElement=node;
 const update=()=>View.update(node,state,draft(),{onAction:action=>{calls.push(action);state=Checklist.apply(state,draft(),action);update();return true;}});
 const click=(attribute,value=id)=>events.click({preventDefault(){},target:{closest(selector){return selector==='['+attribute+']'?{dataset:{[attribute.replace(/^data-/,'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]:value}}:null;}}});
 update();return{id,click,update,calls,focus,html:()=>content.innerHTML,message:()=>live.textContent,state:()=>state,task:()=>build().tasks.find(task=>task.id===id),
  editDraft(values){const inputs=Object.entries(values).map(([name,value])=>({name,value}));const form={dataset:{dcForm:'task:'+id},querySelectorAll:()=>inputs};draftForms.push(form);events.input({target:{closest:()=>form}});},
  changeTask(values){state=Checklist.apply(state,draft(),{type:'edit-task',taskId:id,...values,planContext:build().planContext});update();},
  changeSchool(){state=Sheet.selectPathway(state,catalog.pathways.find(p=>p.id==='liberty-business-residential'));state.profile.modality='campus';update();}};
}
test('deleting a custom checklist task requires an explicit confirmation and Keep preserves notes, due date and unsaved edits',()=>{
 const f=fixture(),before=JSON.stringify(f.state());f.editDraft({title:'Ask my advisor',notes:'Unsaved private note',dueOn:'2027-03-01'});
 f.click('data-dc-delete');assert.equal(f.calls.length,0);assert.equal(JSON.stringify(f.state()),before);assert.match(f.html(),/Confirm task deletion/);assert.match(f.html(),/Unsaved private note/);assert.equal(f.focus.at(-1),'task:'+f.id+':keep');
 f.click('data-dc-cancel-delete');assert.equal(f.calls.length,0);assert.equal(JSON.stringify(f.state()),before);assert(f.task());assert.match(f.html(),/Unsaved private note/);assert.doesNotMatch(f.html(),/data-dc-confirm-delete=/);assert.equal(f.focus.at(-1),'task:'+f.id+':delete');
});
test('confirmed deletion removes only the chosen custom task and leaves academic work and other tasks intact',()=>{
 const f=fixture(),before=f.state(),{checklist,...academic}=before;
 f.click('data-dc-delete');f.click('data-dc-confirm-delete');assert.equal(f.calls.length,1);assert.equal(f.calls[0].type,'delete-task');assert.equal(f.task(),undefined);const{checklist:after,...afterAcademic}=f.state();assert.deepEqual(afterAcademic,academic);assert.equal(f.message(),'Task deleted.');
 f.click('data-dc-confirm-delete');assert.equal(f.calls.length,1,'A detached confirmation cannot delete twice.');
});
test('task changes and degree switches invalidate a previously opened delete confirmation',()=>{
 for(const change of ['changeTask','changeSchool']){const f=fixture();f.click('data-dc-delete');if(change==='changeTask')f.changeTask({notes:'New information'});else f.changeSchool();f.click('data-dc-confirm-delete');assert.equal(f.calls.length,0);assert.doesNotMatch(f.html(),/data-dc-confirm-delete=/);if(change==='changeTask')assert.equal(f.task().notes,'New information');}
});
test('a confirmation cannot delete a generated course task',()=>{
 const f=fixture(),before=JSON.stringify(f.state());f.click('data-dc-delete','review-plan');f.click('data-dc-confirm-delete','review-plan');assert.equal(f.calls.length,0);assert.equal(JSON.stringify(f.state()),before);
});
