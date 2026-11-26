import test from 'node:test';import assert from 'node:assert/strict';
import {compileProgram} from './scripts/pathway-factory/compile.mjs';
function fixture(){
 const primary={id:'university',kind:'university',url:'https://college.example.edu/catalog'},identity={id:'original-course',kind:'provider',url:'https://provider.example.edu/course',sourceIds:['original-parent']},parent={id:'original-parent',kind:'ace',url:'https://www.acenet.edu/National-Guide/example'},unrelated={id:'unrelated',kind:'provider',url:'https://provider.example.edu/other'};
 const program={slug:'program',modelId:'source-closure-model',title:'A reviewed degree',level:'bachelor',catalog:'2026-2027',totalCredits:3,modelSourceIds:['university'],requirements:[{id:'requirement',code:'ENG101',title:'Composition',credits:3,sourceIds:['university'],optionRows:['award']}]};
 const kit={school:{id:'college',name:'Example College',creditSystem:'semester',checkedOn:'2026-11-26',sources:[primary]},providers:new Map([['Provider',{provider:'Provider',sources:[identity,parent,unrelated],courses:[{code:'ORIG-1',title:'Composition',sourceCredits:3,sourceCreditSystem:'semester',identitySourceIds:['original-course']}]}]]),equivalencies:{equivalencies:[{id:'award',provider:'Provider',code:'ORIG-1',status:'published',credits:3,creditSystem:'semester',sourceIds:['university'],evidence:'conditional',scope:{programs:['program']}}]}};
 return {kit,program};
}
test('a pinned model includes newly cited shared identity evidence and its true dependencies without unrelated records or approval changes',()=>{
 const {kit,program}=fixture(),model=compileProgram(kit,program);
 assert.deepEqual(model.sources.map(source=>source.id),['university','original-course','original-parent']);
 assert.equal(model.requirements[0].options[0].evidence,'conditional');assert.deepEqual(program.modelSourceIds,['university']);
 assert.deepEqual(model,compileProgram(kit,program),'Repeated compilation is stable');
});
test('missing evidence is rejected rather than concealed behind a new shared identity',()=>{
 const {kit,program}=fixture();kit.providers.get('Provider').sources[0].sourceIds=['missing-parent'];assert.throws(()=>compileProgram(kit,program),/Unknown cited model source missing-parent/);
});
test('models whose pinned sources already cover their claims keep their source order and contents',()=>{
 const {kit,program}=fixture();program.modelSourceIds=['original-parent','university','original-course'];const model=compileProgram(kit,program);assert.deepEqual(model.sources.map(source=>source.id),program.modelSourceIds);
});
test('already-pinned sources retain their transitive evidence dependencies and reject missing parents',()=>{
 const {kit,program}=fixture();program.modelSourceIds=['university','original-course'];
 assert.deepEqual(compileProgram(kit,program).sources.map(source=>source.id),['university','original-course','original-parent']);
 kit.providers.get('Provider').sources[0].sourceIds=['missing-pinned-parent'];
 assert.throws(()=>compileProgram(kit,program),/Unknown cited model source missing-pinned-parent/);
});
test('immutable upstream provenance labels remain metadata while real source references remain required',()=>{
 const {kit,program}=fixture();program.modelFields={review:{originalSourceIds:['archived-label'],originalSourceId:'another-archived-label',upstreamOriginalSourceIds:['upstream-label']}};
 kit.providers.get('Provider').sources[0].originalSourceId='immutable-original-label';const model=compileProgram(kit,program);
 assert.deepEqual(model.sources.map(source=>source.id),['university','original-course','original-parent']);assert.equal(model.review.originalSourceId,'another-archived-label');
});
