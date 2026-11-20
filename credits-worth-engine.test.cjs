/* "What are my credits worth?" ranking engine: real reviewed plans, synthetic course records. No browser or network. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Worth=require('./dist/credits-worth-engine.js'),Catalog=require('./dist/program-catalog.js');
const index=require('./dist/data/plan-library-index.json'),baselines=require('./dist/data/baseline-index.json'),rates=require('./dist/data/plan-estimate-rates.json'),registry=require('./dist/data/curriculum-registry.json');
const fetcher=async file=>{const target=path.join(__dirname,'dist',file);return{ok:fs.existsSync(target),json:async()=>JSON.parse(fs.readFileSync(target,'utf8'))};};
const PLANS=['liberty-criminal-justice-online','wgu-catalog-689e417cff765fc9','excelsior-bs-psychology'];
let fixture;
async function load(){
 if(fixture)return fixture;
 const catalog=await Catalog.load(require('./dist/data/pathways.json'),{fetcher});
 const models=await Catalog.loadModels(PLANS.map(id=>index.plans[id].modelId),{fetcher,includeLegacy:false});
 const plans=Object.fromEntries(PLANS.map(id=>{const entry=index.plans[id];return[id,{route:catalog.pathways.find(route=>route.id===id),model:models.find(model=>model.id===entry.modelId),baseline:Object.values(baselines.baselines).find(item=>item.pathwayId===id&&item.modelId===entry.modelId),indexEntry:entry}];}));
 return fixture={catalog,models,plans};
}
const earned=(id,o)=>({id,status:'earned',completedOn:'2025-06-01',creditSystem:'semester',credits:3,evaluations:[],...o});
const english=earned('rec-eng',{provider:'Sophia',code:'SOPH-0015',title:'English Composition I',codeBasis:'student-record',creditBasis:'student-record'});
const unrelated=earned('rec-none',{provider:'Example Academy',code:'EXA-9001',title:'Underwater Basket Weaving'});
const evaluate=(id,learning)=>Worth.evaluatePlan({...fixture.plans[id],learning,rates});

test('every indexed plan has a starting route the engine can reproduce from its baseline',async()=>{
 await load();
 for(const id of PLANS){const {model,baseline}=fixture.plans[id],start=Worth.startingRoute(model,baseline);assert(start,id);assert(start.providers.length>0,id);assert(Object.keys(start.selections).length>0,id);}
 assert.equal(Worth.startingRoute(fixture.plans[PLANS[0]].model,{...fixture.plans[PLANS[0]].baseline,rows:[{requirementId:'missing',optionId:'x',provider:'Sophia',credits:3}]}),null,'a changed baseline is never guessed');
});

test('a matched finished course fills degree credits and reduces the outside credits left, for each real plan',async()=>{
 await load();
 for(const id of PLANS){
  const without=evaluate(id,[]),withCourse=evaluate(id,[english]);
  assert.equal(without.status,'ok',id+': '+without.reason);assert.equal(withCourse.status,'ok',id+': '+withCourse.reason);
  assert.equal(without.filled,0);assert.equal(without.remainingOutside,fixture.plans[id].baseline.summary.transferCredits,id+' with no courses equals its published starting route');
  assert.equal(withCourse.filled,3,id);
  assert.equal(withCourse.remainingOutside,without.remainingOutside-3,id+': the matched course replaces three outside credits');
  assert.equal(withCourse.remainingUniversity,without.remainingUniversity,id+': university credits are unchanged');
  assert.equal(withCourse.filled+withCourse.remainingOutside+withCourse.remainingUniversity+withCourse.unresolved,withCourse.totalCredits,id+': every degree credit is accounted for once');
  assert.equal(withCourse.records['rec-eng'].status,'placed');assert.equal(withCourse.matches.length,1);
  assert.equal(withCourse.tier,index.plans[id].tier);assert.deepEqual(withCourse.questions,index.plans[id].questions);
 }
});

test('the remaining estimate comes only from the shared estimate engine and unknown prices are never zero',async()=>{
 await load();
 const priced=evaluate('liberty-criminal-justice-online',[english]),published=index.plans['liberty-criminal-justice-online'].estimate;
 assert.equal(priced.estimate.status,'range');
 assert(priced.estimate.min<=published.min&&priced.estimate.max<=published.max,'a finished course never raises the remaining estimate');
 assert(priced.estimate.min>0);
 const start=evaluate('liberty-criminal-justice-online',[]);assert.deepEqual([start.estimate.min,start.estimate.max],[published.min,published.max],'with no courses the range equals the plan library’s published range');
 const partial=evaluate('excelsior-bs-psychology',[english]);
 assert.equal(partial.estimate.status,'needs-confirmation','a partial range (StraighterLine unpriced) is not shown as a total');
 assert.match(partial.estimate.reason,/StraighterLine/);
 assert.equal(partial.estimate.min,undefined);
});

test('a course that matches nothing leaves every plan unchanged and is reported as needing an evaluation',async()=>{
 await load();
 const results=PLANS.map(id=>evaluate(id,[unrelated]));
 for(const result of results){assert.equal(result.filled,0);assert.equal(result.records['rec-none'].status,'none');assert.equal(result.remainingOutside,fixture.plans[result.routeId].baseline.summary.transferCredits);}
 const [line]=Worth.recordSummary(results,[unrelated]);
 assert.deepEqual([line.status,line.plans,line.checked],['none',0,3]);
 const ranked=Worth.rank(results,{matchedOnly:true});assert.equal(ranked.results.length,0);assert.equal(ranked.withMatches,0);
});

test('a hand-typed code that names several proposed courses is flagged for review, never guessed',async()=>{
 await load();
 const {model}=fixture.plans['liberty-criminal-justice-online'];
 const codes=[...new Set(model.requirements.flatMap(req=>req.options).filter(option=>option.provider==='Sophia'&&/^SOPH-\d{4}$/.test(option.code||'')).map(option=>option.code))].slice(0,2);
 assert.equal(codes.length,2);
 const ambiguous=earned('rec-two',{provider:'Sophia',code:codes.join(' / '),title:'Two Sophia courses on one line'});
 const result=evaluate('liberty-criminal-justice-online',[ambiguous]);
 assert.equal(result.records['rec-two'].status,'ambiguous');assert.equal(result.filled,0);
 assert.equal(Worth.recordSummary([result],[ambiguous])[0].status,'ambiguous');
});

test('only finished records count, and inputs are never changed',async()=>{
 await load();
 const taking={...english,id:'rec-taking',status:'in-progress'},learning=[taking],before=JSON.stringify({learning,plan:fixture.plans['wgu-catalog-689e417cff765fc9'].model.id});
 const result=evaluate('wgu-catalog-689e417cff765fc9',learning);
 assert.equal(result.filled,0);assert.deepEqual(result.records,{});assert.equal(JSON.stringify({learning,plan:fixture.plans['wgu-catalog-689e417cff765fc9'].model.id}),before);
 assert.deepEqual(Worth.completedRecords({learning:[taking,english]}).map(r=>r.id),['rec-eng']);
});

test('ranking: most covered by default, fewest left, lowest known estimate with unknown costs last, and filters',()=>{
 const plan=(routeId,o)=>({routeId,school:'S',title:routeId,status:'ok',subjects:['business'],modalities:['online'],totalCredits:120,filled:0,remainingOutside:60,remainingUniversity:60,unresolved:0,estimate:{status:'needs-confirmation'},...o});
 const rows=[
  plan('a',{filled:6,estimate:{status:'range',min:20000,max:25000}}),
  plan('b',{filled:12,totalCredits:60,subjects:['health'],modalities:['campus']}),
  plan('c',{filled:12,estimate:{status:'range',min:9000,max:15000}}),
  plan('d',{status:'unavailable',filled:0}),
  plan('e',{filled:0,estimate:{status:'range',min:5000,max:6000}})
 ];
 assert.deepEqual(Worth.rank(rows).results.map(r=>r.routeId),['b','c','a','e','d'],'share of the degree, unavailable last');
 assert.deepEqual(Worth.rank(rows,{sort:'left'}).results.map(r=>r.routeId),['b','c','a','e','d']);
 assert.deepEqual(Worth.rank(rows,{sort:'cost'}).results.map(r=>r.routeId),['e','c','a','b','d'],'unknown cost sorts after every known range');
 assert.deepEqual(Worth.rank(rows,{subject:'health'}).results.map(r=>r.routeId),['b']);
 assert.deepEqual(Worth.rank(rows,{format:'online',matchedOnly:true}).results.map(r=>r.routeId),['c','a']);
 assert.equal(Worth.rank(rows,{sort:'drop table'}).sort,'covered');
});

test('evaluateAll loads each curriculum file once per group and reports progress for every indexed plan',async()=>{
 await load();
 const subset={...index,plans:Object.fromEntries(PLANS.map(id=>[id,index.plans[id]]))},calls=[],progress=[];
 const results=await Worth.evaluateAll({index:subset,catalog:fixture.catalog,baselines,registry,rates,learning:[english]},{loadModels:async ids=>{calls.push(ids);return fixture.models.filter(model=>ids.includes(model.id));},onResult:(result,done,total)=>progress.push([done,total])});
 assert.equal(results.length,3);assert.deepEqual(progress.map(p=>p[1]),[3,3,3]);assert.deepEqual(progress.map(p=>p[0]).sort(),[1,2,3]);
 assert.equal(calls.flat().length,3);
 assert(results.every(result=>result.filled===3));
 const failing=await Worth.evaluateAll({index:subset,catalog:fixture.catalog,baselines,registry,rates,learning:[english]},{loadModels:async()=>{throw Error('offline');}});
 assert(failing.every(result=>result.status==='unavailable'),'a file that cannot load marks its plans unavailable rather than zero');
});
