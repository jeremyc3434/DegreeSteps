/* The lightweight plan check (plan-course-index.json) must give exactly the full computation's results for all
 * indexed plans, while downloading curricula only for plans a finished course could touch. Synthetic records only. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Worth=require('./dist/credits-worth-engine.js'),Catalog=require('./dist/program-catalog.js'),Library=require('./dist/course-library-engine.js');
const library=require('./dist/data/plan-library-index.json'),baselines=require('./dist/data/baseline-index.json'),rates=require('./dist/data/plan-estimate-rates.json'),registry=require('./dist/data/curriculum-registry.json');
const courseIndex=require('./dist/data/plan-course-index.json'),catalogCourses=require('./dist/data/course-catalog.json').courses;
const fetcher=async file=>{const target=path.join(__dirname,'dist',file);return{ok:fs.existsSync(target),json:async()=>JSON.parse(fs.readFileSync(target,'utf8'))};};
let shared;
async function load(){
 if(shared)return shared;
 const catalog=await Catalog.load(require('./dist/data/pathways.json'),{fetcher});
 const models=await Catalog.loadModels(Catalog.planLibraryRoutes(catalog,[],library).map(route=>route.modelId),{fetcher,includeLegacy:false});
 return shared={catalog,models};
}
const plain=value=>JSON.parse(JSON.stringify(value));
function catalogRecord(id){const course=catalogCourses.find(item=>item.id===id);assert(course,id);let state=Library.saveCourse(Library.initialize(null),course);state=Library.setStatus(state,state.learning[0].id,'earned');return state.learning[0];}
const manual=(id,o)=>({id,status:'earned',completedOn:'',credits:3,creditSystem:'semester',evaluations:[],codeBasis:o.code?'student-record':'not-yet-known',creditBasis:'student-record',...o});
// Deterministic random catalog picks so the comparison covers many identities, not hand-chosen ones.
function picks(seed,count){let x=seed;const next=()=>(x=(x*1103515245+12345)%2147483648)/2147483648;const pool=catalogCourses.slice(),out=[];while(out.length<count&&pool.length)out.push(catalogRecord(pool.splice(Math.floor(next()*pool.length),1)[0].id));return out;}
const lists={
 'no courses':[],
 'one Sophia course':[catalogRecord('sophia-a3da6b3d489d7580d2')],
 'five mixed courses':[catalogRecord('sophia-a3da6b3d489d7580d2'),catalogRecord('clep-c5e1b4829165978126'),catalogRecord('straighterline-aa4562f7b3ea0d6f4e'),manual('m-title',{provider:'Sophia',code:'',title:'SOPH-0015 English Composition I'}),manual('m-none',{provider:'Example Community College',code:'HIS 999',title:'Local History Seminar'})],
 'ambiguous and aliases':[manual('m-two',{provider:'Sophia',code:'SOPH-0015 SOPH-0048',title:'Two on one line'}),manual('m-sl',{provider:'StraighterLine',code:'OOSL-0005',title:'English Composition I'}),manual('m-clep',{provider:'College-Level Examination Program',code:'CLEP-0013',title:'College Algebra'})],
 'university, quarter units and evaluations':[manual('m-lu',{provider:'University',institution:'Liberty University',code:'ENGL 101',title:'Composition and Rhetoric'}),manual('m-q',{provider:'Sophia',code:'SOPH-0048',title:'Introduction to Psychology',credits:4.5,creditSystem:'quarter'}),manual('m-ev',{provider:'Example College',code:'BUS 100',title:'Intro to Business',evaluations:[{programId:'liberty-criminal-justice-online',requirementId:'x',status:'reported'}]})],
 'nothing that matches':[manual('m-a',{provider:'Example Academy',code:'EXA-9001',title:'Underwater Basket Weaving'})],
 'random catalog A':picks(7,6),'random catalog B':picks(1234,8),'random catalog C':picks(99,4)
};
async function both(learning){
 const {catalog,models}=await load();
 const full=await Worth.evaluateAll({index:library,catalog,baselines,registry,rates,learning},{loadModels:async ids=>models.filter(model=>ids.includes(model.id))});
 const loaded=[];
 const light=await Worth.evaluateWithIndex(plain(courseIndex),{learning},{loadModels:async ids=>{loaded.push(...ids);return models.filter(model=>ids.includes(model.id));},loadRates:async()=>rates});
 return {full:new Map(full.map(r=>[r.routeId,plain(r)])),light:new Map(light.map(r=>[r.routeId,plain(r)])),loaded};
}

test('the public index covers only canonical publication-ready plans while the research inventory remains intact',async()=>{
 const {catalog,models}=await load(),offered=Catalog.planLibraryRoutes(catalog,[],library);
 assert.equal(courseIndex.selectionPolicy,'publication-ready-models-v1');assert.deepEqual(Object.keys(courseIndex.plans).sort(),offered.map(route=>route.id).sort());assert.equal(new Set(Object.values(courseIndex.plans).map(plan=>plan.modelId)).size,offered.length);assert(Object.keys(library.plans).length>offered.length,'The full research inventory is retained');assert(Object.values(library.plans).some(plan=>plan.tier==='confirmation'));
 assert.equal(courseIndex.registryRevision,library.registryRevision);
 for(const [routeId,plan] of Object.entries(courseIndex.plans))assert.deepEqual(plan.keys.map(i=>courseIndex.keys[i]),Worth.planKeys(models.find(m=>m.id===plan.modelId)),routeId);
});

for(const [name,learning] of Object.entries(lists)){
 test('lightweight and full results are identical for all plans: '+name,async()=>{
  const {full,light,loaded}=await both(learning);
  const {catalog}=await load(),finderPlans=Catalog.planLibraryRoutes(catalog,[],library).length;
  assert.equal(full.size,finderPlans);assert.equal(light.size,finderPlans);
  for(const [routeId,result] of full)assert.deepStrictEqual(light.get(routeId),result,name+': '+routeId);
  // Every plan a record actually affected was computed with its curriculum.
  const affected=[...full.values()].filter(r=>r.filled>0||Object.values(r.records).some(o=>o.status!=='none')).map(r=>r.modelId);
  for(const id of affected)assert(loaded.includes(id),name+': '+id+' must load');
  if(name==='no courses'||name==='nothing that matches')assert.equal(loaded.length,0,'no curriculum is downloaded');
 });
}

test('a single Sophia course loads only the plans that list it',async()=>{
 const {loaded}=await both(lists['one Sophia course']),{models}=await load(),record=lists['one Sophia course'][0],key=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 // Independently inspect the actual course identities, not an arbitrary cap
 // that breaks as more accurately mapped degree programs become available.
 const expected=models.filter(model=>model.requirements.some(requirement=>(requirement.options||[]).some(option=>['sophia','sophialearning'].includes(key(option.provider))&&([option.code,...option.codeAliases||[]].some(code=>key(code)===key(record.code))||(option.listingIdentityIds||[]).includes(record.catalogCourseId))))).map(model=>model.id).sort();
 assert(expected.length>0&&expected.length<models.length,'Only programs that list this specific course need a curriculum download');assert.equal(new Set(loaded).size,loaded.length);assert.deepEqual([...loaded].sort(),expected);
});

test('a stale or malformed index is rejected rather than trusted',async()=>{
 assert.equal(Worth.validCourseIndex({...courseIndex,version:2}),false);
 const old={...courseIndex};delete old.selectionPolicy;assert.equal(Worth.validCourseIndex(old),false,'An older cached research-inclusive index cannot offer unapproved plans');
 const [id,plan]=Object.entries(courseIndex.plans)[0],duplicate={...courseIndex,plans:{...courseIndex.plans,'duplicate-model-alias':{...plan,route:{...plan.route,id:'duplicate-model-alias'}}}};assert.equal(Worth.validCourseIndex(duplicate),false,'One model cannot be offered as multiple public results');
 assert.equal(Worth.validCourseIndex({...courseIndex,plans:{[id]:{...plan,start:{...plan.start,tier:'confirmation'}}}}),false,'An unfinished plan cannot re-enter the lightweight path');
 await assert.rejects(Worth.evaluateWithIndex({kind:'x'},{learning:[]},{}));
});
