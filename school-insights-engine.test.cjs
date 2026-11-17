const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Engine=require('./dist/school-insights-engine.js'),data=require('./dist/data/school-insights.json'),copy=value=>JSON.parse(JSON.stringify(value));
test('the preloaded summaries preserve evidence dates, institutional facts and empty real-review counts',()=>{
 assert.equal(Engine.validate(data),true);assert.equal(data.schools.length,10);assert.deepEqual(data,JSON.parse(fs.readFileSync('content/school-insights.json')));
 for(const profile of data.schools){assert(profile.pros.length>=2&&profile.tradeoffs.length>=2);assert.equal(profile.reviews.count,0);assert.equal(profile.reviews.ratings,null);assert.equal(profile.recognition.status,'verified-institutional');assert(profile.sources.some(source=>source.checkedOn==='2026-11-16'));for(const metric of ['cost','speed','ease'])assert.equal(profile.metrics[metric],null);}
 assert(data.schools.some(profile=>profile.sources.some(source=>source.checkedOn==='2026-11-02')),'The compilation date must not pretend older transfer/price facts were freshly reviewed');
});
test('profile lookup returns detached exact identities and preserves named school distinctions',()=>{
 const before=JSON.stringify(data),profile=Engine.profile(data,'University of Massachusetts Global');assert.equal(profile.id,'umass-global');assert.equal(Engine.profile(data,'South University'),null);assert.equal(Engine.profile(data,'south-college').name,'South College');profile.pros[0].text='Changed locally';assert.equal(JSON.stringify(data),before);
});
test('only like-for-like transfer rules receive a shared comparison rank',()=>{
 const ranked=Engine.rank(data,{level:'bachelor',modality:'online'}),group=ranked.groups.find(row=>row.id==='bachelor-semester-overall-policy-ceiling');
 assert.deepEqual(group.items.map(row=>row.schoolId),['liberty','snhu']);assert(group.items.every(row=>row.value===75&&row.rank===1));
 const providers=ranked.groups.find(row=>row.id==='bachelor-online-semester-course-provider-policy-ceiling');assert.deepEqual(providers.items.map(row=>row.schoolId),['charter-oak','tesu']);assert(providers.items.every(row=>row.value===75));
 const wgu=ranked.groups.find(row=>row.items.some(item=>item.schoolId==='wgu'));assert.equal(wgu.items.length,1);assert.equal(wgu.items[0].rank,null);assert.match(wgu.id,/competency-unit/);assert(!providers.items.some(item=>item.value===95));
 const umpi=ranked.groups.find(row=>row.items.some(item=>item.schoolId==='umpi'));assert.match(umpi.id,/arithmetic/);assert.equal(umpi.items[0].rank,null);
});
test('unknown prices, speed and ease are unranked rather than free, fastest or easiest',()=>{
 for(const metric of ['cost','speed','ease']){const result=Engine.rank(data,{metric});assert.equal(result.groups.length,0);assert(result.unranked.length>=8);assert(result.unranked.every(item=>/No reviewed, comparable/.test(item.reason)));}
 const graduate=Engine.rank(data,{level:'master',modality:'online'});assert.equal(graduate.groups.length,0);assert(graduate.unranked.some(row=>row.schoolId==='south-college'));
 const campus=Engine.rank(data,{level:'bachelor',modality:'campus'});assert.equal(campus.groups.length,1);assert.equal(campus.groups[0].items.length,1);assert.equal(campus.groups[0].items[0].schoolId,'liberty');assert.equal(campus.groups[0].items[0].rank,null);
});
test('external discussions stay separate from official rules and community-verified outcomes',()=>{
 for(const id of ['umpi','wgu']){const profile=Engine.profile(data,id);assert.equal(profile.communityPerspectives.length,1);const discussion=profile.communityPerspectives[0];assert.equal(discussion.communityVerified,false);assert.match(discussion.scope,/not a representative/);for(const sid of discussion.sourceIds)assert.equal(profile.sources.find(source=>source.id===sid).kind,'community');assert.equal(profile.reviews.count,0);}
 const forged=copy(data);forged.schools[0].pros[0].sourceIds=['missing'];assert.throws(()=>Engine.validate(forged),/source evidence/);
 const disguised=copy(data);disguised.schools[0].sources.find(source=>source.id===disguised.schools[0].pros[0].sourceIds[0]).kind='community';assert.throws(()=>Engine.validate(disguised),/official/);
});
test('quantities, billing scope and ratings cannot be invented in the research seed',()=>{
 for(const mutate of [doc=>doc.schools[0].reviews.count=9,doc=>doc.schools[0].reviews.ratings={ease:5},doc=>doc.schools[0].metrics.transferAllowance.value=101,doc=>delete doc.schools[0].pricing[0].unit,doc=>doc.schools[0].sources[0].checkedOn='2026-02-30',doc=>doc.schools[0].metrics.cost={value:0}]){const changed=copy(data);mutate(changed);assert.throws(()=>Engine.validate(changed));}
 assert.throws(()=>Engine.rank(data,{metric:'recognition'}),/supported/);
});
