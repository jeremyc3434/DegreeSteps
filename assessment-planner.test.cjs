/* Exercise real planner and identity-matching code with controlled assessment evidence. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const plain=value=>JSON.parse(JSON.stringify(value));
function engines(){
 const facts=option=>option?.provider==='University'?'monitored':option?.provider==='CLEP'||option?.code==='MONITORED'?'monitored':option?.code==='RESTRICTED'?'restricted':option?.provider==='Sophia'||['OPEN','OPEN-B'].includes(option?.code)?'unmonitored':'unknown';
 const context={console,Intl,URL,URLSearchParams,DegreeCourseAssessment:{describe(_program,option){return {status:facts(option),label:facts(option),detail:'Synthetic policy fixture',sources:[]};},allowsOption(_program,option,input){return input?.proctoringPreference!=='avoid'||option?.provider==='University'||!['monitored','restricted'].includes(facts(option));}}};
 vm.createContext(context);
 for(const name of ['planner','guide-engine','sheet-state','journey-engine'])vm.runInContext(fs.readFileSync('dist/'+name+'.js','utf8'),context,{filename:name+'.js'});
 return {Planner:context.DegreePlanner,Sheet:context.DegreeSheet,Journey:context.DegreeJourney};
}
const {Planner,Sheet,Journey}=engines();
const option=(id,code,overrides={})=>({id,provider:'Transfer Source',code,title:code,credits:3,upper:false,evidence:'published',sourceIds:['mapping'],creditOrigin:'ace',...overrides});
const requirement=(id,options)=>({id,code:id.toUpperCase(),title:id,credits:3,category:'general',options:[option('u-'+id,'U-'+id,{provider:'University',sourceIds:['catalog'],creditOrigin:'institutional'}),...options]});
const program=requirements=>({id:'assessment-test',school:'Example University',title:'Assessment test degree',level:'bachelor',format:'Online',catalogYear:'2026-2027',creditSystem:'semester',totalCredits:requirements.length*3,institutionMinCredits:0,majorMinInstitutionCredits:0,upperMinCredits:0,externalMaxCredits:requirements.length*3,alternativeMaxCredits:requirements.length*3,sources:[{id:'catalog'},{id:'mapping'}],requirements,unresolved:[]});
const input={providers:['Transfer Source'],priority:'transfer',universityRate:300,providerMonths:{},optionSelections:{}};

test('assessment preference distinguishes courses from the same source and retains unknowns as unknown',()=>{
 const p=program([requirement('a',[option('open','OPEN'),option('watched','MONITORED'),option('restricted','RESTRICTED'),option('unknown','UNKNOWN')])]);
 const before=JSON.stringify(p),available=Planner.availableOptions(p,'a',{...input,proctoringPreference:'avoid'});
 assert.deepEqual(plain(available.map(item=>item.id)),['u-a','open','unknown']);
 assert.equal(Planner.assessmentFor(p,available.find(item=>item.id==='unknown')).status,'unknown');
 assert.equal(JSON.stringify(p),before,'Classifying assessments cannot edit academic source options');
 assert.equal(Planner.availableOptions(p,'a',input).length,5,'An open preference retains the original source menu');
});

test('assessment facts cannot bypass academic evidence, source choices or university-only rules',()=>{
 const p=program([requirement('a',[option('open','OPEN',{sourceIds:['missing']}),option('watched','MONITORED')])]);
 const retained={requirementId:'a',optionId:'watched',learningId:'already-taking',status:'in-progress'};
 assert.deepEqual(plain(Planner.availableOptions(p,'a',{...input,providers:[],proctoringPreference:'avoid',plannedLearning:[retained]}).map(item=>item.id)),['u-a']);
 p.requirements[0].options[1].sourceIds=['mapping'];p.requirements[0].institutionalOnly=true;
 assert.deepEqual(plain(Planner.availableOptions(p,'a',{...input,proctoringPreference:'avoid',plannedLearning:[retained]}).map(item=>item.id)),['u-a']);
 assert.equal(Planner.assessmentAllowsOption(p,p.requirements[0].options[0],{proctoringPreference:'avoid'},'a'),true,'Required university work remains visible even when its assessment is monitored');
});

test('current enrollment exception requires the exact academically listed row and option',()=>{
 const p=program([requirement('a',[option('watched','MONITORED')]),requirement('b',[option('other','MONITORED')])]),watched=p.requirements[0].options[1];
 const current={requirementId:'a',optionId:'watched',learningId:'original-enrollment',status:'in-progress'};
 assert.equal(Planner.assessmentAllowsOption(p,watched,{proctoringPreference:'avoid',plannedLearning:[current]},'a'),true);
 for(const change of [{status:'saved'},{requirementId:'b'},{optionId:'other'},{learningId:''}])assert.equal(Planner.assessmentAllowsOption(p,watched,{proctoringPreference:'avoid',plannedLearning:[{...current,...change}]},'a'),false);
 assert.equal(Planner.assessmentAllowsOption(p,{...watched,credits:6},{proctoringPreference:'avoid',plannedLearning:[current]},'a'),false);
});

test('completed monitored credit keeps its placement and is never bought again',()=>{
 const p=program([requirement('a',[option('watched','MONITORED')])]),completed={requirementId:'a',optionId:'watched',status:'confirmed',learningId:'finished-source'};
 const result=Planner.generate(p,{...input,proctoringPreference:'avoid',completed:[completed],optionSelections:{a:'watched'}});
 assert.equal(result.validation.academicCountsValid,true);assert.equal(result.setupIssues.length,0);
 assert.equal(result.rows[0].status,'confirmed');assert.equal(result.rows[0].option.id,'watched');assert.equal(result.costs.knownSubtotal,0);
 assert(!result.nextActions.some(action=>/^Start:|^After approval:/.test(action)));
 const withOldReplacement=program([requirement('a',[option('finished','OPEN'),option('watched','MONITORED')])]);
 const retained=Planner.generate(withOldReplacement,{...input,proctoringPreference:'avoid',completed:[{...completed,optionId:'finished'}],optionSelections:{a:'watched'}});
 assert.equal(retained.setupIssues.length,0,'An ignored old replacement pin cannot block completed credit after a preference change');assert.equal(retained.rows[0].option.id,'finished');
});

test('open preferences keep the existing ledger and objective unchanged; avoid breaks a genuine tie',()=>{
 const p=program([requirement('a',[option('unknown','UNKNOWN'),option('open','OPEN')])]);
 const baseline=Planner.generate(p,input),open=Planner.generate(p,{...input,proctoringPreference:'open'}),avoid=Planner.generate(p,{...input,proctoringPreference:'avoid'});
 assert.deepEqual(plain(open),plain(baseline));assert.equal(open.rows[0].option.id,'unknown');
 assert.equal(avoid.rows[0].option.id,'open');assert.equal(avoid.validation.academicCountsValid,true);
 assert.deepEqual(plain(avoid.optimization.objectiveScore.slice(0,-1)),plain(baseline.optimization.objectiveScore));
});

test('unknown formats remain available when they are needed to maximize transfer within source caps',()=>{
 const p=program([requirement('a',[option('open-a','OPEN'),option('unknown-a','UNKNOWN',{creditOrigin:'institutional'})]),requirement('b',[option('open-b','OPEN',{code:'OPEN-B'})])]);
 p.alternativeMaxCredits=3;
 const result=Planner.generate(p,{...input,proctoringPreference:'avoid'});
 assert.equal(result.validation.academicCountsValid,true);assert.equal(result.totals.external,6);assert.equal(result.rows[0].option.id,'unknown-a');
 assert.equal(Planner.assessmentFor(p,result.rows[0].option).status,'unknown');
});

test('the actual Liberty journey preserves a matched monitored enrollment without preserving a saved interest',()=>{
 const catalog=require('./dist/data/pathways.json'),model=require('./dist/data/liberty.json'),route=catalog.pathways.find(item=>item.modelId===model.id);
 const state=Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),route),null,catalog);
 state.profile.proctoringPreference='avoid';state.profile.modality='campus';
 state.learning=[{id:'taking-composition',provider:'CLEP',code:'CLEP-0041',title:'College Composition Modular',credits:3,creditSystem:'semester',status:'in-progress',evaluations:[],privateNote:'Keep my original enrollment'}];
 const before=JSON.stringify(state),draft=Journey.buildDraft(state,catalog,[model]);
 assert.equal(draft.plan.validation.academicCountsValid,true);
 assert(draft.collectionMatch.placements.some(item=>item.requirementId==='engl-101'&&item.optionId==='clep-clep-0041'&&item.status==='in-progress'));
 const row=draft.plan.rows.find(item=>item.requirementId==='engl-101');assert.equal(row.option.provider,'CLEP');assert.equal(row.plannedLearningStatus,'in-progress');assert.equal(JSON.stringify(state),before);
 const saved=plain(state);saved.learning[0].status='saved';const future=Journey.buildDraft(saved,catalog,[model]);
 assert.notEqual(future.plan.rows.find(item=>item.requirementId==='engl-101').option.provider,'CLEP');assert.equal(future.state.learning[0].status,'saved');
 const sourceOff=plain(state);sourceOff.scenarios[model.id]={providers:['Sophia']};const narrowed=Journey.buildDraft(sourceOff,catalog,[model]);
 assert.notEqual(narrowed.plan.rows.find(item=>item.requirementId==='engl-101').option.provider,'CLEP');assert.deepEqual(plain(narrowed.state.learning),state.learning);
 const unidentified=plain(state);unidentified.learning[0].code='CLEP-UNLISTED';const unmatched=Journey.buildDraft(unidentified,catalog,[model]);
 assert.equal(unmatched.collectionMatch.placements.filter(item=>item.learningId==='taking-composition').length,0,'An in-progress label and matching title cannot authorize an unsupported source identity');
 assert.deepEqual(plain(unmatched.state.learning),unidentified.learning);
});

test('explicit assessment preference application clears only blocked future pins in the active degree',()=>{
 const catalog=require('./dist/data/pathways.json'),model=require('./dist/data/liberty.json'),route=catalog.pathways.find(item=>item.modelId===model.id);
 const state=Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),route),null,catalog);
 state.profile.proctoringPreference='avoid';state.profile.modality='campus';
 state.learning=[{id:'taking-composition',provider:'CLEP',code:'CLEP-0041',title:'College Composition Modular',credits:3,creditSystem:'semester',status:'in-progress',evaluations:[]},{id:'finished-literature',provider:'CLEP',code:'CLEP-0011',title:'Analyzing and Interpreting Literature',credits:3,creditSystem:'semester',status:'earned',evaluations:[],privateNote:'Keep my original completion record'}];
 state.sheet.notes={private:'Keep this planning note'};
 state.scenarios[model.id]={providers:['Sophia','CLEP'],optionSelections:{'engl-101':'clep-clep-0041','engl-102':'clep-clep-0011','math-115':'clep-clep-0004'},fees:23,providerMonths:{Sophia:2}};
 state.scenarios['another-degree']={providers:['CLEP'],optionSelections:{writing:'my-other-plan-exam'}};
 const before=JSON.stringify(state);Journey.buildDraft(state,catalog,[model]);assert.equal(JSON.stringify(state),before,'Merely opening a draft cannot clear a pin');
 const applied=Journey.applyAssessmentPreference(state,catalog,[model]);assert.deepEqual(plain(applied.replaced),[{requirementId:'math-115',optionId:'clep-clep-0004',provider:'CLEP'}]);
 const after=applied.state;assert.deepEqual(plain(after.scenarios[model.id]),{...state.scenarios[model.id],optionSelections:{'engl-101':'clep-clep-0041','engl-102':'clep-clep-0011'}});
 assert.deepEqual(plain(after.scenarios['another-degree']),state.scenarios['another-degree']);assert.deepEqual(plain(after.learning),state.learning);assert.deepEqual(plain(after.sheet.notes),state.sheet.notes);assert.equal(JSON.stringify(state),before);
 const draft=Journey.buildDraft(after,catalog,[model]);assert(!draft.plan.setupIssues.some(issue=>issue.code==='invalid_selection'));assert.equal(draft.plan.validation.academicCountsValid,true);
 assert.throws(()=>Journey.applyAssessmentPreference(state,catalog,[]),/couldn’t load your degree’s course choices/);assert.equal(JSON.stringify(state),before);
});
