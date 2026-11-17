const test=require('node:test'),assert=require('node:assert/strict');
const E=require('./dist/plan-comparison-engine.js'),J=require('./dist/journey-engine.js'),G=require('./dist/guide-engine.js');
const option=(id,code,credits=3,extra={})=>({id,provider:'Sophia',code,title:code,credits,evidence:'published',sourceIds:['facts'],...extra});
const req=(id,credits=3,outside=[],extra={})=>({id,title:id,code:id.toUpperCase(),credits,category:'general',options:[option('university-'+id,id.toUpperCase(),credits,{provider:'University'}),...outside],...extra});
const model=(id,requirements,extra={})=>({id,school:'Example '+id,title:id,level:'bachelor',format:'Online',totalCredits:requirements.reduce((sum,row)=>sum+row.credits,0),creditSystem:'semester',institutionMinCredits:0,majorMinInstitutionCredits:0,upperMinCredits:0,sources:[{id:'facts',url:'https://example.edu/catalog'}],requirements,pricing:{model:'per-credit',amount:100,currency:'USD',sourceUrl:'https://example.edu/tuition'},...extra});
const record=(id,code,status='earned',extra={})=>({id,provider:'Sophia',code,title:code,credits:3,creditSystem:'semester',status,evaluations:[],...extra});
function fixture(models,records){const catalog={pathways:models.map(p=>({id:p.id,modelId:p.id,title:p.title,school:p.school,level:'bachelor',field:'general',goals:['any-degree'],modalities:['online'],sources:p.sources}))};const state=J.initialize(null,null,catalog);state.profile={...state.profile,degreeLevel:'bachelor',field:'any',modality:'online',goal:'any-degree'};state.learning=structuredClone(records);return{catalog,state};}
function build(models,records,extra={}){const f=fixture(models,records),before=JSON.stringify(f.state);const result=E.build(f.state,f.catalog,models,{entries:[]},{fromCourses:true,deferMatrix:true,...extra});assert.equal(JSON.stringify(f.state),before);return{...f,result};}

test('joint course fit separates finished, active and saved work without advancing completion',()=>{
 const p=model('mixed',['a','b','c'].map(id=>req(id,3,[option('s-'+id,'S-'+id)])));
 const records=[record('a','S-a'),record('b','S-b','in-progress'),record('c','S-c','saved'),record('unknown','HIST999','earned',{provider:'Old college',credits:null,creditSystem:null,title:'Old history'})];
 const {result,catalog}=build([p],records),s=result.scenarios[0].summary;
 assert.deepEqual(s.fitBreakdown,{completedCredits:3,confirmedCredits:0,inProgressCredits:3,savedCredits:3,plannedCredits:0,potentialCredits:6,needsReviewCount:1});
 assert.equal(s.collectionFitCredits,9);assert.equal(s.remainingCredits,6);assert.equal(s.degreeCredits,9);assert.equal(s.reportedCredits,3);
 assert.equal(s.reviewCourses[0].id,'unknown');assert.match(s.reviewCourses[0].reason,/credits and credit units/);
 assert.equal(result.matrixDeferred,true);assert.deepEqual(result.matrix,[]);
 const matrix=E.courseMatrix(result,catalog,[p]);assert.equal(matrix.length,4);assert.equal(matrix.find(row=>row.course.recordIds.includes('b')).cells[result.scenarios[0].id].status,'potential');
 assert.equal(result.matrix.length,0,'opening the matrix is an explicit caller action');
});

test('original course aliases count once, including provider-name variants',()=>{
 const p=model('aliases',[req('a',3,[option('s-a','S-A',3,{codeAliases:['OLD-A']})])]);
 const {result}=build([p],[record('done','S-A'),record('duplicate','OLD-A','saved',{provider:'Sophia Learning'})]);
 const s=result.scenarios[0].summary;assert.equal(result.courses.length,1);assert.equal(s.fitBreakdown.completedCredits,3);assert.equal(s.fitBreakdown.potentialCredits,0);assert.equal(s.fitBreakdown.needsReviewCount,0);
});

test('degree ranking compares a share of the degree across different credit units',()=>{
 const semester=model('semester',[req('a',3,[option('s-a','SHARED')]),req('b')]);
 const quarter=model('quarter',[req('a',4.5,[option('q-a','SHARED',4.5,{creditSystem:'quarter',sourceCredits:3,sourceCreditSystem:'semester'})]),req('b',7.5)],{creditSystem:'quarter'});
 const {result}=build([quarter,semester],[record('original','SHARED')]);
 assert.equal(result.scenarios[0].programId,'semester');
 const [a,b]=result.scenarios.map(s=>s.summary);assert.equal(a.collectionFitFraction,.5);assert.equal(b.collectionFitFraction,.375);assert.equal(a.applicableCompletedCredits,3);assert.equal(b.applicableCompletedCredits,4.5);
});

test('reported earned courses respect source and residency limits while every original record stays saved',()=>{
 const p=model('capped',Array.from({length:12},(_,i)=>req('r'+i,3,[option('s-'+i,'S-'+i)])),{institutionMinCredits:30,externalMaxCredits:6,alternativeMaxCredits:6});
 const records=p.requirements.map((row,i)=>record('record-'+i,'S-'+i)),{catalog,state}=fixture([p],records),before=JSON.stringify(state);
 state.selectedPathwayId=p.id;state.profile.pathwayId=p.id;
 const draft=J.buildDraft(state,catalog,[p]);assert.equal(draft.plan.validation.academicCountsValid,true);assert.equal(draft.plan.totals.reported,6);assert.equal(draft.plan.totals.institutional,30);assert.equal(draft.match.unmatched.length,10);assert.deepEqual(state.learning,JSON.parse(before).learning);
});

test('infeasible policy does not erase a researched earned-course match or claim optimization success',()=>{
 const p=model('waiver',[req('a',3,[option('s-a','S-A')]),req('b')],{appliedTransferWaiver:{minimumQualifyingTransferCredits:6}});
 const match=G.matchInventory(p,[record('done','S-A')],{acceptAssignment:()=>false});assert.equal(match.completed.length,1);assert.equal(match.completed[0].learningId,'done');assert.equal(match.assignment.feasible,false);assert.equal(match.assignment.optimal,false);
});
