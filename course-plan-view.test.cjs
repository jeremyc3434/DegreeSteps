const assert=require('node:assert/strict'),test=require('node:test');
const View=require('./dist/course-plan-view.js'),Sheet=require('./dist/sheet-state.js'),Journey=require('./dist/journey-engine.js');
const catalog=require('./dist/data/pathways.json'),courses=require('./dist/data/course-catalog.json'),models=['tesu','liberty'].map(name=>require('./dist/data/'+name+'.json'));
function state(id){return Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),catalog.pathways.find(route=>route.modelId===id)),null,catalog);}
function draft(id,change){let s=state(id);if(change)s=change(s);return Journey.buildDraft(s,catalog,models);}
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;};
test('an explicitly reviewed receiving-school mapping retains its conditional label without claiming approval',()=>{const d=draft('liberty-business-residential',s=>Sheet.setCourse(s,'liberty-business-residential','engl-101','straighterline-oosl-0005')),row=d.plan.rows.find(item=>item.requirementId==='engl-101');row.option={...row.option,evidence:'conditional',evidenceType:'official-receiving-school-equivalency'};const entry=View.build(d,courses).groups.transfer.find(item=>item.requirementId==='engl-101');assert.equal(entry.evidenceLabel,'School-listed · conditions apply');assert.notEqual(entry.evidenceLabel,'School confirmed');});
test('Liberty keeps its 34 research-gap credits distinct from its 3 explicitly required university credits',()=>{const d=draft('liberty-business-residential'),v=View.build(d,courses);assert.deepEqual(v.totals,{transfer:83,universityRequired:3,universityReserved:34,unmapped:0,completed:0,accounted:120});assert(v.groups.universityReserved.every(entry=>entry.provider==='University'&&entry.evidenceLabel==='University course selected'));assert.equal(d.plan.coverage.researchGapCredits,34);});
test('TESU tracks named university selections while preserving separate transfer-research quantities',()=>{const v=View.build(draft('tesu-general-management'),courses);assert.deepEqual(v.totals,{transfer:90,universityRequired:6,universityReserved:24,unmapped:0,completed:0,accounted:120});});
test('reviewed CLEP composition bundle produces one enrollment with six degree credits',()=>{const d=draft('tesu-general-management',s=>Sheet.setCourse(Sheet.setCourse(s,'tesu-general-management','enc1010','clep-composition-enc1010'),'tesu-general-management','enc1020','clep-composition-enc1020')),v=View.build(d,courses),entries=v.groups.transfer.filter(e=>e.bundle==='clep-college-composition');assert.equal(entries.length,1);assert.equal(entries[0].credits,6);assert.equal(entries[0].sourceCredits,6);assert.deepEqual(entries[0].requirementIds,['enc1010','enc1020']);assert.match(entries[0].courseUrl,/clep-exams\/college-composition/);assert.equal(v.totals.accounted,120);});
test('exact provider identifiers resolve enrollment and retain the receiving guide evidence',()=>{const v=View.build(draft('liberty-business-residential'),courses),entry=v.groups.transfer.find(e=>e.requirementId==='engl-101');assert.equal(entry.courseUrl,'https://www.sophia.org/online-courses/english-and-communication/english-composition-i/');assert.match(entry.evidenceUrl,/liberty\.edu.*Sophia-Learning-Transfer-Equivalencies\.pdf/);assert.equal(entry.evidenceLabel,'School-listed match');assert.notEqual(entry.evidenceLabel,'School confirmed');});
test('the official cross-listed statistics placement retains its guide and one receiving award',()=>{
 const Planner=require('./dist/planner.js'),program=require('./dist/data/curricula/liberty-online-expansion.json').models[0],plan=Planner.generate(program,{providers:program.defaultProviders,allowConditional:true,priority:'transfer'}),d={program,plan,state:{learning:[]}},before=JSON.stringify(d),row=plan.rows.find(row=>row.requirementId==='busi-230'),v=View.build(d,courses),entry=v.groups.transfer.find(entry=>entry.requirementId==='busi-230');
 assert.equal(row.option.code,'SOPH-0005');assert.equal(row.option.receivingCode,'MATH 201');assert.equal(row.option.fulfillsCode,'BUSI 230');assert.equal(entry.evidenceLabel,'School-listed match');assert.match(entry.evidenceUrl,/liberty\.edu.*Sophia-Learning-Transfer-Equivalencies\.pdf/);assert.deepEqual(entry.sourceIds,row.option.sourceIds);assert.equal(entry.credits,3);assert.equal(entry.sourceCredits,3);assert.equal(v.totals.accounted,120);assert.equal(v.progress.completedCredits,0);assert.equal(v.progress.confirmedCredits,0);assert.equal(v.progress.pendingReviewCredits,0);assert.equal(JSON.stringify(d),before);
});
test('alternate placements need the exact fulfilled code, actual receiving award and bound official guide',()=>{
 const Planner=require('./dist/planner.js'),original=require('./dist/data/curricula/liberty-online-expansion.json').models[0];
 for(const change of [
  (row)=>{row.option.fulfillsCode='BUSI 240';},
  (row)=>{row.option.crossListedReceivingCodes=['MATH 201','BUSI 240'];row.option.codeAliases.push('BUSI 230');},
  (row)=>{row.option.crossListedReceivingCodes=['BUSI 230'];},
  (row)=>{delete row.option.receivingCode;},
  (row)=>{row.option.sourceIds=[];},
  (row,program)=>{program.sources=program.sources.filter(source=>!row.option.sourceIds.includes(source.id));},
  (row,program)=>{program.sources.find(source=>row.option.sourceIds.includes(source.id)).evidenceType='provider-course-catalog';},
  (row)=>{delete row.option.mappingReviewId;},
  (row)=>{delete row.option.mappingChecked;}
 ]){
  const program=JSON.parse(JSON.stringify(original)),plan=Planner.generate(program,{providers:program.defaultProviders,allowConditional:true,priority:'transfer'}),row=plan.rows.find(row=>row.requirementId==='busi-230');change(row,program);const entry=View.build({program,plan,state:{learning:[]}},courses).groups.transfer.find(entry=>entry.requirementId==='busi-230');assert.equal(entry.evidenceLabel,'Mapping needs review');assert.deepEqual(entry.sourceIds,[]);assert.equal(entry.credits,3);assert.equal(entry.sourceCredits,3);
 }
});
test('school-submitted maps keep provider conditions while genuine community maps retain their source label',()=>{const t=View.build(draft('tesu-general-management'),courses).groups.transfer.find(e=>e.requirementId==='enc1010');assert.equal(t.evidenceLabel,'School-submitted · conditional');assert.match(t.evidenceUrl,/acenet\.edu/);const community=View.build(draft('tesu-general-management'),courses).groups.transfer.find(e=>e.requirementId==='com2090');assert.equal(community.evidenceLabel,'Community-reported match');assert.match(community.evidenceUrl,/degreeforum/);const l=View.build(draft('liberty-business-residential',s=>Sheet.setCourse(s,'liberty-business-residential','engl-101','straighterline-oosl-0005')),courses).groups.transfer.find(e=>e.requirementId==='engl-101');assert.equal(l.evidenceLabel,'School-listed match');assert.match(l.courseUrl,/straighterline\.com\/online-college-courses\/english-composition-i/);assert.match(l.evidenceUrl,/liberty\.edu.*Straighterline/);});
test('wiki references and provider directories never become course enrollment links',()=>{const v=View.build(draft('tesu-general-management'),courses);const study=v.groups.transfer.find(e=>e.provider==='Study.com');assert(study);assert.equal(study.courseUrl,null);assert.equal(study.providerUrl,'https://study.com/college/online-college-courses.html');assert.match(study.providerLinkLabel,/Find course at Study\.com/);assert(v.groups.transfer.every(e=>!e.courseUrl||!/(?:degreeforum|\.pdf)/.test(e.courseUrl)));});
test('optional CLI courses link to the exact class and keep unknown original units and transcript-route conditions',()=>{
 const d=draft('liberty-business-residential',state=>{state.scenarios['liberty-business-residential']={providers:['Sophia','Study.com','CLEP','StraighterLine','Christian Leaders Institute'],allowConditional:true};return Sheet.setCourse(state,'liberty-business-residential','busi-320','liberty-cli-bus-320-to-busi-320');});
 const item=View.build(d,courses).groups.transfer.find(row=>row.requirementId==='busi-320');
 assert.equal(item.provider,'Christian Leaders Institute');assert.match(item.courseUrl,/^https:\/\/christianleaders\.org\/course\/view\.php\?id=\d+$/);assert.equal(item.credits,3);assert.equal(item.sourceCredits,null);assert.equal(item.evidenceLabel,'School-listed · conditions apply');assert(item.conditions.some(condition=>/academic-transcript/.test(condition)));assert(item.conditions.some(condition=>/candidate/.test(condition)));
});
test('completed source facts and reviewed bundle allocations stay one original action',()=>{const s=state('tesu-general-management'),m=models[0],req=m.requirements.find(r=>r.id==='enc1010'),o=req.options.find(o=>o.id==='clep-composition-enc1010');const next=Sheet.recordProgress(s,m,req,o,'completed');const v=View.build(Journey.buildDraft(next,catalog,models),courses),entry=v.groups.completed.find(e=>e.bundle==='clep-college-composition');assert(entry);assert.equal(entry.credits,6);assert.equal(entry.sourceCredits,6);assert.equal(v.groups.completed.length,1);assert.equal(v.groups.transfer.some(e=>e.bundle==='clep-college-composition'),false);assert.equal(v.totals.accounted,120);});
test('projection is detached and does not mutate private records, choices, sources or catalog',()=>{const d=draft('liberty-business-residential'),before=JSON.stringify([d,courses]);freeze(d);freeze(courses);const v=View.build(d,courses);v.groups.transfer[0].conditions.push('Local presentation edit');v.groups.transfer[0].requirements[0].title='Changed locally';assert.equal(JSON.stringify([d,courses]),before);});
test('unknown target yields empty honest groups without inventing a course map',()=>{const v=View.build({state:{learning:[]},plan:null,program:null},courses);assert.equal(v.totals.accounted,0);assert(Object.values(v.groups).every(items=>items.length===0));});

test('all four degree maps start at zero coursework completion despite proposed transfer courses',()=>{const all=require('./dist/program-catalog.js').modelFiles.map(file=>require('./dist/'+file));for(const model of all){const s=state(model.id),d=Journey.buildDraft(s,catalog,all),v=View.build(d,courses);assert.equal(v.progress.valid,true,model.id);assert.equal(v.progress.totalCredits,120);assert.equal(v.progress.completedCredits,0);assert.equal(v.progress.inProgressCredits,0);assert.equal(v.progress.remainingCredits,120);assert.equal(v.progress.completedPercent,0);assert(v.groups.transfer.every(entry=>entry.progressState==='not-started'));assert(v.groups.unmapped.every(entry=>entry.progressState==='needs-course'));}});

test('saved interests do not turn yellow while a matching started course adds only its degree credits',()=>{const m=models[1],req=m.requirements.find(r=>r.id==='engl-101'),option=req.options.find(o=>o.provider==='Sophia');for(const status of ['saved','planned']){const s=Sheet.updateLearning(state(m.id),{id:'interest',provider:option.provider,code:option.code,title:option.title,credits:3,creditSystem:'semester',status});const v=View.build(Journey.buildDraft(s,catalog,models),courses);assert.equal(v.progress.inProgressCredits,0);assert.equal(v.groups.transfer.find(e=>e.requirementId===req.id).progressState,'not-started');}const s=Sheet.recordProgress(state(m.id),m,req,option,'in-progress'),v=View.build(Journey.buildDraft(s,catalog,models),courses);assert.equal(v.progress.completedCredits,0);assert.equal(v.progress.inProgressCredits,3);assert.equal(v.progress.remainingCredits,117);assert.equal(v.progress.inProgressPercent,2.5);assert.equal(v.groups.transfer.find(e=>e.requirementId===req.id).progressState,'in-progress');});

test('unknown original credit units or amounts cannot count as matched in-progress credits',()=>{const m=models[1],req=m.requirements.find(r=>r.id==='engl-101'),option=req.options.find(o=>o.provider==='Sophia');for(const change of [{creditSystem:null},{creditSystem:'quarter'},{credits:null}]){const s=Sheet.recordProgress(state(m.id),m,req,option,'in-progress');Object.assign(s.learning[0],change);const v=View.build(Journey.buildDraft(s,catalog,models),courses);assert.equal(v.progress.inProgressCredits,0);assert.equal(v.progress.completedCredits,0);assert.equal(v.groups.transfer.find(e=>e.requirementId===req.id).progressState,'not-started');}});

test('one six-credit exam contributes six credits once when taking it and after finishing it',()=>{const m=models[0],req=m.requirements.find(r=>r.id==='enc1010'),option=req.options.find(o=>o.id==='clep-composition-enc1010');let s=Sheet.setCourse(Sheet.setCourse(state(m.id),m.id,'enc1010',option.id),m.id,'enc1020','clep-composition-enc1020');s=Sheet.recordProgress(s,m,req,option,'in-progress');let v=View.build(Journey.buildDraft(s,catalog,models),courses);assert.equal(v.progress.inProgressCredits,6);assert.equal(v.progress.completedCredits,0);assert.equal(v.groups.transfer.find(e=>e.bundle==='clep-college-composition').progressState,'in-progress');s=Sheet.recordProgress(s,m,req,option,'completed');v=View.build(Journey.buildDraft(s,catalog,models),courses);assert.equal(v.progress.completedCredits,6);assert.equal(v.progress.pendingReviewCredits,6);assert.equal(v.progress.confirmedCredits,0);assert.equal(v.progress.inProgressCredits,0);assert.equal(v.progress.completedPercent,5);assert.equal(v.groups.completed.filter(e=>e.bundle==='clep-college-composition').length,1);});

test('finished coursework keeps school-confirmed credits separate from pending review',()=>{const m=models[1];let s=state(m.id);const requirements=['engl-101','engl-102'].map(id=>m.requirements.find(r=>r.id===id));for(const req of requirements)s=Sheet.recordProgress(s,m,req,req.options.find(o=>o.provider==='Sophia'),'completed');s.learning[0].evaluations.forEach(e=>e.status='confirmed');const v=View.build(Journey.buildDraft(s,catalog,models),courses);assert.equal(v.progress.completedCredits,6);assert.equal(v.progress.confirmedCredits,3);assert.equal(v.progress.pendingReviewCredits,3);assert.equal(v.progress.completedPercent,5);assert.equal(v.progress.completedCredits+v.progress.inProgressCredits+v.progress.remainingCredits,120);assert(v.groups.completed.every(e=>e.progressState==='completed'));});

test('a university course with the same code at another school cannot color the selected degree as started',()=>{const d=draft('liberty-business-residential'),row=d.plan.rows.find(r=>r.option?.provider==='University'&&r.placementReason==='required-university');assert(row);d.state.learning.push({id:'other-school',provider:'University',code:row.option.code,title:'A different school course',credits:row.credits,creditSystem:'semester',status:'in-progress',institution:'Another university',sourceProgramId:d.program.id});const v=View.build(d,courses),entry=v.groups.universityRequired.find(e=>e.requirementId===row.requirementId);assert.equal(v.progress.inProgressCredits,0);assert.equal(entry.progressState,'not-started');assert.notEqual(entry.title,'A different school course');});

test('duplicate requirement rows cannot inflate progress and invalid academic ledgers identify their limit',()=>{const d=draft('liberty-business-residential'),row=d.plan.rows[0];row.status='confirmed';d.plan.rows.push({...row});let progress=View.progress(d);assert.equal(progress.completedCredits,row.credits);assert.equal(progress.remainingCredits,120-row.credits);assert.equal(progress.valid,false);row.unknownProvenance=true;d.plan.rows[d.plan.rows.length-1].unknownProvenance=true;progress=View.progress(d);assert.equal(progress.completedCredits,0);d.plan.validation.academicCountsValid=false;assert.equal(View.progress(d).valid,false);assert.equal(View.progress({plan:null,program:null}).valid,false);});

test('each degree uses its own curriculum categories and all section credits add to 120',()=>{
  const all=require('./dist/program-catalog.js').modelFiles.map(file=>require('./dist/'+file));
  for(const model of all){
    const d=Journey.buildDraft(state(model.id),catalog,all),v=View.build(d,courses);
    assert.deepEqual(v.sections.map(section=>section.id),['general','major','elective']);
    assert.deepEqual(v.sections.map(section=>section.title),['General education','Major requirements','Free electives']);
    assert.equal(v.sections.reduce((sum,section)=>sum+section.credits,0),120);
    const assigned=[];
    for(const section of v.sections){
      assert.equal(section.credits,model.requirements.filter(req=>req.category===section.id).reduce((sum,req)=>sum+req.credits,0),model.id+' '+section.id);
      assert.equal(section.entries.reduce((sum,entry)=>sum+entry.credits,0),section.credits);
      assert.equal(section.progress.valid,true);
      assert.equal(section.progress.totalCredits,section.credits);
      for(const entry of section.entries){
        assert.equal(entry.category,section.id);assert(['transfer','completed','unmapped','universityRequired','universityReserved'].includes(entry.kind));
        assert(entry.requirements.every(req=>req.category===section.id));assigned.push(...entry.requirementIds);
        if(entry.kind==='unmapped'){assert.equal(entry.provider,'');assert.equal(entry.courseUrl,null);}
      }
    }
    assert.equal(new Set(assigned).size,model.requirements.length);assert.equal(assigned.length,model.requirements.length);
  }
});

test('section progress stays credit weighted and finished work remains in its original curriculum section',()=>{
  const m=models[1];let s=state(m.id),d=Journey.buildDraft(s,catalog,models);
  const english=m.requirements.find(req=>req.id==='engl-101');s=Sheet.recordProgress(s,m,english,english.options.find(option=>option.provider==='Sophia'),'completed');
  d=Journey.buildDraft(s,catalog,models);const major=d.plan.rows.find(row=>row.category==='major'&&row.option.provider==='Sophia');assert(major);
  s=Sheet.recordProgress(s,m,m.requirements.find(req=>req.id===major.requirementId),major.option,'in-progress');
  const v=View.build(Journey.buildDraft(s,catalog,models),courses),general=v.sections.find(section=>section.id==='general'),majorSection=v.sections.find(section=>section.id==='major');
  assert.equal(general.progress.completedCredits,3);assert.equal(general.entries.find(entry=>entry.requirementId==='engl-101').kind,'completed');
  assert.equal(majorSection.progress.inProgressCredits,3);
  for(const field of ['completedCredits','confirmedCredits','pendingReviewCredits','inProgressCredits','remainingCredits'])assert.equal(v.sections.reduce((sum,section)=>sum+section.progress[field],0),v.progress[field],field);
});

test('a bundled exam inside one section remains one six-credit course action',()=>{
  const d=draft('tesu-general-management',s=>Sheet.setCourse(Sheet.setCourse(s,'tesu-general-management','enc1010','clep-composition-enc1010'),'tesu-general-management','enc1020','clep-composition-enc1020')),v=View.build(d,courses),section=v.sections.find(section=>section.id==='general'),entries=section.entries.filter(entry=>entry.bundle==='clep-college-composition');
  assert.equal(entries.length,1);assert.equal(entries[0].credits,6);assert.equal(entries[0].sourceCredits,6);assert.deepEqual(entries[0].requirementIds,['enc1010','enc1020']);assert.equal(entries[0].crossSectionBundle,undefined);
});

test('one source split across curriculum sections allocates degree credits once and exposes the shared enrollment',()=>{
  const option={provider:'CLEP',code:'TEST-EXAM',title:'One six-credit exam',credits:3,sourceCredits:6,bundleCredits:6,bundleId:'shared-test-exam'},requirements=[{id:'writing',category:'general',credits:3},{id:'major-writing',category:'major',credits:3}],record={id:'one-exam',provider:'CLEP',code:'TEST-EXAM',title:'One six-credit exam',credits:6,creditSystem:'semester',status:'earned'};
  const d={program:{id:'synthetic',totalCredits:6,creditSystem:'semester',requirements},state:{learning:[record]},plan:{validation:{academicCountsValid:true},rows:requirements.map(req=>({requirementId:req.id,credits:3,category:req.category,status:'reported',option:{...option},sourceIds:[]}))},match:{completed:requirements.map(req=>({requirementId:req.id,learningId:record.id}))}};
  const before=JSON.stringify(d),v=View.build(d),entries=v.sections.flatMap(section=>section.entries);
  assert.equal(v.groups.completed.length,1);assert.equal(v.groups.completed[0].credits,6);
  assert.equal(entries.length,2);assert.equal(entries.reduce((sum,entry)=>sum+entry.credits,0),6);assert.equal(v.sections.reduce((sum,section)=>sum+section.progress.completedCredits,0),6);
  assert.equal(new Set(entries.map(entry=>entry.sharedSource.id)).size,1);
  for(const entry of entries){assert.equal(entry.crossSectionBundle,true);assert.equal(entry.credits,3);assert.equal(entry.sourceCredits,6);assert.equal(entry.sharedSource.totalAppliedCredits,6);assert.deepEqual(entry.sharedSource.sectionIds,['general','major']);assert.deepEqual(entry.sharedSource.requirementIds,['writing','major-writing']);assert.equal(entry.sharedSource.primaryRequirementId,'writing');}
  assert.equal(JSON.stringify(d),before);assert.equal(d.state.learning.length,1);
});

test('additional actual categories remain separate and section presentation cannot mutate the ledger or old groups',()=>{
  const d=draft('liberty-business-residential');d.program.requirements[0].category='program-specific';d.plan.rows[0].category='program-specific';const before=JSON.stringify(d);freeze(d);const v=View.build(d,courses),extra=v.sections.find(section=>section.id==='program-specific');assert(extra);assert.equal(extra.title,'Program specific');assert.equal(extra.credits,3);
  extra.entries[0].requirements[0].title='Presentation edit';extra.entries[0].conditions.push('Local note');assert.notEqual(v.groups.transfer.find(entry=>entry.requirementId==='engl-101').requirements[0].title,'Presentation edit');assert.equal(JSON.stringify(d),before);
  assert.deepEqual(View.build({state:{learning:[]},plan:null,program:null}).sections,[]);
});

function hierarchyFixture(curriculumSections, completedIds=[]) {
  const requirements=[{id:'writing',category:'general',credits:3},{id:'math',category:'general',credits:3},{id:'business',category:'major',credits:3},{id:'elective',category:'elective',credits:3}];
  const completed=new Set(completedIds), records=requirements.filter(req=>completed.has(req.id)).map(req=>({id:'record-'+req.id,provider:'Sophia',code:req.id,title:req.id,credits:3,creditSystem:'semester',status:'earned'}));
  return {program:{id:'hierarchy-fixture',totalCredits:12,creditSystem:'semester',requirements,curriculumSections},state:{learning:records},plan:{validation:{academicCountsValid:true},rows:requirements.map(req=>({requirementId:req.id,category:req.category,title:req.id,credits:req.credits,status:completed.has(req.id)?'reported':'planned',option:{id:req.id,provider:'Sophia',code:req.id,title:req.id,credits:3,sourceCredits:3}}))},match:{completed:requirements.filter(req=>completed.has(req.id)).map(req=>({requirementId:req.id,learningId:'record-'+req.id}))}};
}
const curriculumLeaves=node=>node.children?.length?node.children.flatMap(curriculumLeaves):[node];

test('program metadata creates nested school-specific curriculum without changing unique degree budgets',()=>{
  const d=hierarchyFixture([{id:'communication',title:'Communication & Information Literacy',parentId:'general',requirementIds:['writing'],sourceId:'gened'},{id:'quantitative',title:'Quantitative Reasoning',parentId:'general',requirementIds:['math'],sourceId:'gened'},{id:'area',title:'Area of Study',parentId:'major',requirementIds:['business'],sourceId:'degree'},{id:'management',title:'Management',parentId:'area',requirementIds:['business'],sourceId:'degree'}],['business']);
  const v=View.build(d),general=v.sections.find(section=>section.id==='general'),major=v.sections.find(section=>section.id==='major');
  assert.deepEqual(general.children.map(node=>node.id),['communication','quantitative']);assert.equal(general.credits,6);assert.equal(general.children[0].sourceId,'gened');
  assert.equal(major.children[0].title,'Area of Study');assert.equal(major.children[0].children[0].title,'Management');assert.equal(major.children[0].credits,3);assert.equal(major.children[0].children[0].progress.completedCredits,3);
  const leaves=v.sections.flatMap(curriculumLeaves),ids=leaves.flatMap(node=>node.entries.flatMap(entry=>entry.requirementIds));assert.equal(ids.length,4);assert.equal(new Set(ids).size,4);assert.equal(leaves.reduce((sum,node)=>sum+node.credits,0),12);assert.equal(v.progress.completedCredits,3);assert.deepEqual(v.curriculumIssues,[]);
});

test('partial or conflicting metadata never drops or duplicates receiving requirement credits',()=>{
  for(const definitions of [
    [{id:'communication',title:'Communication',parentId:'general',requirementIds:['writing']}],
    [{id:'a',title:'First claim',parentId:'general',requirementIds:['writing']},{id:'b',title:'Second claim',parentId:'general',requirementIds:['writing']}],
    [{id:'duplicate',title:'First copy',parentId:'general',requirementIds:['writing']},{id:'duplicate',title:'Second copy',parentId:'general',requirementIds:['math']}],
    [{id:'cycle-a',title:'A',parentId:'cycle-b',requirementIds:['writing']},{id:'cycle-b',title:'B',parentId:'cycle-a',requirementIds:['math']}],
    [{id:'wrong',title:'Wrong parent category',parentId:'general',requirementIds:['business']}]
  ]){
    const v=View.build(hierarchyFixture(definitions)),leaves=v.sections.flatMap(curriculumLeaves),ids=leaves.flatMap(node=>node.entries.flatMap(entry=>entry.requirementIds));assert.equal(ids.length,4);assert.equal(new Set(ids).size,4);assert.equal(leaves.reduce((sum,node)=>sum+node.credits,0),12);assert.equal(v.progress.totalCredits,12);
  }
  const partial=View.build(hierarchyFixture([{id:'communication',title:'Communication',parentId:'general',requirementIds:['writing']}])).sections.find(section=>section.id==='general');assert.equal(partial.children[1].id,'general--other');assert.deepEqual(partial.children[1].requirementIds,['math']);
  const ambiguous=View.build(hierarchyFixture([{id:'a',parentId:'general',requirementIds:['writing']},{id:'b',parentId:'general',requirementIds:['writing']}]));assert(ambiguous.curriculumIssues.some(issue=>issue.code==='ambiguous-requirement'));
});

test('shared curriculum references show fulfillment without awarding or duplicating degree credits',()=>{
  const d=hierarchyFixture([{id:'communication',title:'Communication',parentId:'general',requirementIds:['writing'],sharedRequirementIds:['business']},{id:'quantitative',title:'Quantitative Reasoning',parentId:'general',requirementIds:['math']},{id:'civic',title:'Civic & Global Engagement',parentId:'general',sharedRequirementIds:['business']}],['business']),v=View.build(d),general=v.sections.find(section=>section.id==='general'),communication=general.children.find(node=>node.id==='communication'),civic=general.children.find(node=>node.id==='civic');
  assert.equal(communication.credits,3);assert.equal(communication.sharedCredits,3);assert.equal(communication.requirementCredits,6);assert.equal(communication.progress.totalCredits,6);assert.equal(communication.progress.completedCredits,3);
  assert.equal(civic.credits,0);assert.equal(civic.sharedCredits,3);assert.equal(civic.requirementCredits,3);assert.equal(civic.progress.valid,true);assert.equal(civic.progress.completedCredits,3);assert.equal(civic.entries.length,0);assert.equal(civic.sharedEntries[0].credits,0);assert.equal(civic.sharedEntries[0].sharedCredits,3);assert.equal(civic.sharedEntries[0].canonicalRequirementId,'business');assert.equal(civic.sharedEntries[0].progressState,'completed');assert.equal(civic.sharedEntries[0].isSharedReference,true);
  assert.equal(v.progress.totalCredits,12);assert.equal(v.progress.completedCredits,3);assert.equal(general.credits,6);assert.equal(general.progress.totalCredits,6);assert.equal(general.progress.completedCredits,0);assert.equal(v.sections.flatMap(curriculumLeaves).reduce((sum,node)=>sum+node.credits,0),12);
});

test('a shared zero-credit competency retains status without inventing a credit percentage',()=>{
  const d=hierarchyFixture([{id:'technology',title:'Technology competency',parentId:'general',sharedRequirementIds:['business'],sharedCreditOverrides:{business:0}},{id:'general-coursework',title:'Other general coursework',parentId:'general',requirementIds:['writing','math']}],['business']),v=View.build(d),node=v.sections.find(section=>section.id==='general').children.find(node=>node.id==='technology');
  assert(node);assert.equal(node.credits,0);assert.equal(node.sharedCredits,0);assert.equal(node.requirementCredits,0);assert.equal(node.progress.completedCredits,0);assert.equal(node.progress.valid,false);assert.equal(node.sharedEntries.length,1);assert.equal(node.sharedEntries[0].progressState,'completed');assert.equal(node.sharedEntries[0].sharedCredits,0);assert.equal(v.progress.completedCredits,3);assert.equal(v.progress.totalCredits,12);
});

test('a reviewed exam split across subsections remains one original source with unique allocated credits',()=>{
  const option={provider:'CLEP',code:'NESTED-EXAM',title:'One six-credit exam',credits:3,sourceCredits:6,bundleCredits:6,bundleId:'nested-exam'},requirements=[{id:'writing1',category:'general',credits:3},{id:'writing2',category:'general',credits:3}],record={id:'one-exam',provider:'CLEP',code:'NESTED-EXAM',title:'One six-credit exam',credits:6,creditSystem:'semester',status:'earned'};
  const d={program:{id:'nested-bundle-fixture',totalCredits:6,creditSystem:'semester',requirements,curriculumSections:[{id:'first',title:'First requirement',parentId:'general',requirementIds:['writing1']},{id:'second',title:'Second requirement',parentId:'general',requirementIds:['writing2']}]},state:{learning:[record]},plan:{validation:{academicCountsValid:true},rows:requirements.map(req=>({requirementId:req.id,credits:3,category:req.category,status:'reported',option:{...option}}))},match:{completed:requirements.map(req=>({requirementId:req.id,learningId:record.id}))}};
  const v=View.build(d),children=v.sections[0].children,entries=children.flatMap(node=>node.entries);assert.equal(v.groups.completed.length,1);assert.equal(v.groups.completed[0].credits,6);assert.equal(entries.length,2);assert.equal(entries.reduce((sum,entry)=>sum+entry.credits,0),6);assert.equal(new Set(entries.map(entry=>entry.sharedSource.id)).size,1);assert.equal(children.reduce((sum,node)=>sum+node.progress.completedCredits,0),6);
  for(const entry of entries){assert.equal(entry.crossSectionBundle,true);assert.equal(entry.crossSubsectionBundle,true);assert.equal(entry.sharedSource.sourceCredits,6);assert.equal(entry.sharedSource.totalAppliedCredits,6);assert.deepEqual(entry.sharedSource.sectionIds,['first','second']);}assert.equal(d.state.learning.length,1);
});

test('hierarchy presentation is detached from original metadata and existing coarse section entries',()=>{
  const d=hierarchyFixture([{id:'communication',title:'Communication',parentId:'general',requirementIds:['writing'],sharedRequirementIds:['business']}]),before=JSON.stringify(d);freeze(d);const v=View.build(d),node=v.sections[0].children[0];node.entries[0].conditions.push('Local display edit');node.sharedEntries[0].title='A local label';assert.notEqual(v.sections[0].entries[0].conditions.at(-1),'Local display edit');assert.equal(JSON.stringify(d),before);
});

test('shared fulfillment augments a category denominator once while unique degree progress stays unchanged',()=>{
  const d=hierarchyFixture([{id:'communication',title:'Communication',parentId:'general',requirementIds:['writing'],sharedRequirementIds:['business']},{id:'quantitative',title:'Quantitative Reasoning',parentId:'general',requirementIds:['math']},{id:'civic',title:'Civic & Global Engagement',parentId:'general',sharedRequirementIds:['business']}],['business']),v=View.build(d),general=v.sections.find(section=>section.id==='general');
  assert.equal(general.credits,6);assert.equal(general.progress.totalCredits,6);assert.equal(general.progress.completedCredits,0);assert.equal(general.sharedCredits,3);assert.equal(general.requirementCredits,9);assert.equal(general.fulfillmentProgress.totalCredits,9);assert.equal(general.fulfillmentProgress.completedCredits,3);assert.equal(general.sharedEntries.length,0);assert.equal(v.progress.totalCredits,12);assert.equal(v.progress.completedCredits,3);
});

test('all four preloaded programs expose sourced school-specific subcategories without losing receiving rows',()=>{
  const all=require('./dist/program-catalog.js').modelFiles.map(file=>require('./dist/'+file));
  for(const model of all){
    assert(model.curriculumSections?.length>3,model.id+' detailed curriculum metadata');
    const sources=new Set(model.sources.map(source=>source.id));assert(model.curriculumSections.every(node=>sources.has(node.sourceId)),model.id+' heading sources');
    const d=Journey.buildDraft(state(model.id),catalog,all),v=View.build(d,courses),leaves=v.sections.flatMap(curriculumLeaves),ids=leaves.flatMap(node=>node.entries.flatMap(entry=>entry.requirementIds));
    assert.deepEqual(v.curriculumIssues,[],model.id);assert.equal(leaves.reduce((sum,node)=>sum+node.credits,0),120,model.id);assert.equal(ids.length,model.requirements.length);assert.equal(new Set(ids).size,model.requirements.length);assert(v.sections.find(node=>node.id==='general').children.length>=4);assert(v.sections.find(node=>node.id==='major').children.length>=2);assert.equal(v.progress.totalCredits,120);assert.equal(v.sections.reduce((sum,node)=>sum+node.progress.totalCredits,0),120);
  }
});

test('online Liberty cultural studies uses its existing government course without duplicating three credits',()=>{
  const all=require('./dist/program-catalog.js').modelFiles.map(file=>require('./dist/'+file)),model=all.find(model=>model.id==='liberty-criminal-justice-online');let s=state(model.id),d=Journey.buildDraft(s,catalog,all);const row=d.plan.rows.find(row=>row.requirementId==='govt-220');s=Sheet.recordProgress(s,model,model.requirements.find(req=>req.id==='govt-220'),row.option,'completed');
  const v=View.build(Journey.buildDraft(s,catalog,all),courses),general=v.sections.find(node=>node.id==='general'),civic=general.children.find(node=>node.title==='Civic & Global Engagement');
  assert.equal(general.credits,39);assert.equal(general.progress.completedCredits,0);assert.equal(general.requirementCredits,42);assert.equal(general.fulfillmentProgress.totalCredits,42);assert.equal(general.fulfillmentProgress.completedCredits,3);assert.equal(civic.credits,0);assert.equal(civic.requirementCredits,3);assert.equal(civic.progress.completedCredits,3);assert.equal(civic.sharedEntries.length,1);assert.equal(civic.sharedEntries[0].canonicalRequirementId,'govt-220');assert.equal(v.progress.completedCredits,3);assert.equal(v.sections.flatMap(curriculumLeaves).reduce((sum,node)=>sum+node.credits,0),120);
});
