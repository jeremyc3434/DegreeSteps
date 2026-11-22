/* Every outside course a finder plan proposes can be picked in "What are my credits worth?" and matches that plan.
 * The picker turns a course-catalog listing into a record (course-library-engine), so the listing must carry the same
 * provider course identity the plan's curriculum publishes (scripts/catalog-plan-identities.mjs). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const Worth=require('./dist/credits-worth-engine.js'),Library=require('./dist/course-library-engine.js');
const courseIndex=require('./dist/data/plan-course-index.json'),catalog=require('./dist/data/course-catalog.json'),rates=require('./dist/data/plan-estimate-rates.json');
const docs=new Map(),model=(file,id)=>{if(!docs.has(file))docs.set(file,JSON.parse(fs.readFileSync(path.join(__dirname,'dist',file),'utf8')));const doc=docs.get(file);return (doc.models||[doc]).find(item=>item.id===id);};
const key=value=>String(value||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
const picked=course=>{let state=Library.saveCourse(Library.initialize(null),course);state=Library.setStatus(state,state.learning[0].id,'earned');return state.learning[0];};
const records=new Map(catalog.courses.map(course=>[course.id,picked(course)]));
const plans=Object.entries(courseIndex.plans).map(([routeId,plan])=>({routeId,plan,model:model(plan.path,plan.modelId)}));
// Outside options with a real source-course code (an option whose "code" is only its title has no code to carry).
const options=plans.flatMap(({routeId,plan,model})=>model.requirements.flatMap(requirement=>(requirement.options||[]).filter(option=>option.provider&&option.provider!=='University'&&key(option.code)&&key(option.code)!==key(option.title)).map(option=>({routeId,plan,model,requirement,option}))));
function listingFor(option){
 const keys=new Set(Worth.planKeys({requirements:[{options:[option]}]}));
 return catalog.courses.find(course=>course.provider===option.provider&&Worth.recordKeys(records.get(course.id)).some(item=>keys.has(item)));
}

test('the picker lists every provider and course code the finder plans propose',()=>{
 assert(plans.length>=37,'all finder plans are checked');assert(options.length>1000);
 const missing=[...new Set(options.filter(item=>!listingFor(item.option)).map(item=>item.option.provider+' '+item.option.code+' '+item.option.title))];
 assert.deepEqual(missing,[],'every plan course has a pickable catalog listing with its identity');
});
test('a picked listing touches every plan that proposes its course',()=>{
 for(const {routeId,plan,option} of options){
  const listing=listingFor(option),keys=new Set(plan.keys.map(index=>courseIndex.keys[index]));
  assert(Worth.recordTouchesPlan(records.get(listing.id),{modelId:plan.modelId,route:plan.route},keys),option.provider+' '+option.code+' should reach '+routeId);
 }
});
test('each picked course is placed, or explained as listed, in a plan that proposes it',()=>{
 const seen=new Set(),failures=[];
 for(const {routeId,plan,model,option} of options){
  const listing=listingFor(option);if(seen.has(listing.id))continue;seen.add(listing.id);
  const result=Worth.evaluatePlan({route:plan.route,model,baseline:plan.baseline,indexEntry:{},learning:[records.get(listing.id)],rates});
  const record=result.records?.[records.get(listing.id).id];
  if(result.status!=='ok'||!['placed','review'].includes(record?.status))failures.push(listing.provider+' '+listing.title+' ('+listing.credits+' '+listing.creditSystem+') in '+routeId+': '+(record?.status||result.status));
 }
 assert(seen.size>150);assert.deepEqual(failures,[]);
});
test('the audit examples now match WGU Business Management and many other plans',()=>{
 const wgu=plans.find(item=>item.routeId==='wgu-catalog-ecceaa488637ac83');assert(wgu);
 for(const [title,code] of [['Public Speaking','SOPH-0024'],['Principles of Management','SOPH-0054'],['Introduction to Statistics','SOPH-0005']]){
  const course=catalog.courses.find(item=>item.provider==='Sophia'&&item.title===title);assert(course,title);
  assert.equal(Library.courseCode(course),code,title+' shows its Sophia code in the picker');
  const record=records.get(course.id),touched=plans.filter(item=>Worth.recordTouchesPlan(record,{modelId:item.plan.modelId,route:item.plan.route},new Set(item.plan.keys.map(index=>courseIndex.keys[index]))));
  assert(touched.length>=8,title+' reaches '+touched.length+' plans');
  const result=Worth.evaluatePlan({route:wgu.plan.route,model:wgu.model,baseline:wgu.plan.baseline,indexEntry:{},learning:[record],rates});
  assert.equal(result.records[record.id].status,'placed',title+' is placed in WGU Business Management');
 }
});
test('added listings come only from plan data and claim no credit recommendation',()=>{
 for(const course of catalog.courses.filter(item=>item.sourceId==='plan-course-identities')){
  assert.equal(course.recommendationStatus,'requires-review');assert.equal(course.creditBasis,'plan-course-identity');assert(course.planIdentitySourceIds.length>0,course.id);
  const used=options.filter(item=>item.option.provider===course.provider&&key(item.option.code)===key(course.code));assert(used.length>0,course.id+' is used by a plan');
  if(course.credits!==null)assert(used.every(item=>item.option.sourceCredits===course.credits&&item.option.sourceCreditSystem===course.creditSystem),course.id+' credits are the plans’ recorded source credits');
 }
});
