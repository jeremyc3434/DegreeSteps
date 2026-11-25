/* Suggested work order changes; saved courses, allocations and calendar dates do not. */
const test=require('node:test'),assert=require('node:assert/strict'),Planner=require('./dist/planner.js');
function requirement(id,provider='Sophia',patch={}){
 const option={id:provider+'-'+id,provider,title:id,code:provider+'-'+id,credits:3,upper:false,evidence:'published',sourceIds:['catalog']};
 return {id,title:id,code:id.toUpperCase(),category:'gen-ed',credits:3,upper:false,options:[option],...patch};
}
function fixture(rows){return {id:'membership-order',school:'Test college',title:'Test degree',format:'Online',catalog:'2026',totalCredits:rows.length*3,institutionMinCredits:0,majorMinInstitutionCredits:0,upperMinCredits:0,requirements:rows,sources:[{id:'catalog'}],unresolved:[]};}
const input={providers:['Sophia','Study.com','StraighterLine'],allowConditional:false,priority:'transfer',completed:[]};
const order=plan=>plan.sequence.map(step=>step.requirementIds[0]);
test('ready Sophia courses stay together instead of alternating paid memberships',()=>{
 const rows=[requirement('sophia-one'),requirement('study-one','Study.com'),requirement('sophia-two'),requirement('study-two','Study.com')],program=fixture(rows),before=JSON.stringify(program),plan=Planner.generate(program,input);
 assert.deepEqual(order(plan),['sophia-one','sophia-two','study-one','study-two']);
 assert.deepEqual(plan.rows.map(r=>r.requirementId),rows.map(r=>r.id),'The degree worksheet retains its original academic sections and row order');
 assert.equal(JSON.stringify(program),before);assert(plan.sequence.every(step=>step.timingVerified===false));assert.equal(plan.totals.external,12);
});
test('an in-progress course is continued first, then other ready courses in that membership',()=>{
 const program=fixture([requirement('sophia-one'),requirement('study-one','Study.com'),requirement('study-two','Study.com'),requirement('sophia-two')]);
 const settings={...input,plannedLearning:[{requirementId:'study-two',optionId:'Study.com-study-two',learningId:'course-123',status:'in-progress',dueOn:'2027-03-01'}],checklist:{customTasks:[{id:'task-1',dueOn:'2027-02-10',notes:'Keep my date'}]}},before=JSON.stringify(settings),plan=Planner.generate(program,settings);
 assert.deepEqual(order(plan),['study-two','study-one','sophia-one','sophia-two']);assert.match(plan.nextActions.find(item=>/Continue your in-progress/.test(item)),/study-two/);
 assert.equal(JSON.stringify(settings),before,'Saved progress, user-entered task dates and notes are never reordered or rewritten');
});
test('provider grouping cannot skip a university prerequisite or its completed-credit minimum',()=>{
 const foundation=requirement('foundation','University',{institutionalOnly:true}),advanced=requirement('advanced','University',{institutionalOnly:true,prerequisites:['foundation'],minimumCompletedCredits:6});
 const program=fixture([advanced,requirement('sophia-one'),requirement('study-one','Study.com'),requirement('sophia-two'),foundation]),plan=Planner.generate(program,input),ids=order(plan);
 assert(ids.indexOf('foundation')<ids.indexOf('advanced'));assert.deepEqual(ids.slice(0,3),['sophia-one','sophia-two','study-one']);assert(!plan.sequence.find(s=>s.requirementIds.includes('advanced')).executionBlocked);
});
test('published provider prerequisites are respected without inheriting receiving-school enrollment rules',()=>{
 const advanced=requirement('advanced');advanced.options[0].prerequisites=['Sophia-foundation'];
 const independent=requirement('independent','Study.com',{prerequisites:['not-required-at-provider']});
 const plan=Planner.generate(fixture([advanced,independent,requirement('foundation')]),input),ids=order(plan);
 assert(ids.indexOf('foundation')<ids.indexOf('advanced'));assert(!plan.sequence.find(s=>s.requirementIds.includes('independent')).executionBlocked,'The receiving-school prerequisite is not silently imposed on Study.com');
});
test('missing prerequisites stay explicitly blocked and finished courses are not suggested again',()=>{
 const program=fixture([requirement('finished'),requirement('blocked','University',{institutionalOnly:true,prerequisites:['not-in-the-ledger']})]),plan=Planner.generate(program,{...input,completed:[{requirementId:'finished',optionId:'Sophia-finished',status:'reported'}]});
 assert.deepEqual(order(plan),['blocked']);assert.equal(plan.sequence[0].executionBlocked,true);assert.equal(plan.sequence[0].timingVerified,false);
});

test('an unresolved provider prerequisite cannot become a start action or satisfy a later prerequisite',()=>{
 const first=requirement('blocked');first.options[0].prerequisites=['unavailable-provider-course'];
 const dependent=requirement('dependent');dependent.options[0].prerequisites=['Sophia-blocked'];
 const plan=Planner.generate(fixture([first,dependent]),input);
 assert(plan.sequence.every(step=>step.executionBlocked));
 assert(!plan.nextActions.some(action=>/^Start:/.test(action)),'Blocked coursework is visible without inviting the student to buy or start it');
});
