'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Guide=require('./dist/guide-engine.js');

const route=(id,extra={})=>({id,school:id+' University',title:'Business BS',level:'bachelor',field:'business',modalities:['campus'],...extra});
const campus=(r,state,extra={})=>({id:r.id+'-main',school:r.school,campus:'Main campus',city:'College City',state,routeIds:[r.id],sourceUrls:['https://example.edu/campus'],traits:['sports','housing'],traitEvidence:{sports:{url:'https://example.edu/athletics'},housing:{url:'https://example.edu/housing'}},...extra});

test('normalization retains bounded student choices without treating defaults as answers',()=>{
 const p=Guide.normalizeProfile({campusLocation:'near-home',homeState:'va',campusInterests:['sports','housing','sports','invented'],campusTime:'two-years',learningPace:'self-paced',budget:'2500',weeklyHours:'8',proctoringPreference:'avoid'});
 assert.equal(p.homeState,'VA');assert.equal(p.campusLocation,'near-home');assert.deepEqual(p.campusInterests,['sports','housing']);assert.equal(p.campusTime,'two-years');assert.equal(p.learningPace,'self-paced');assert.equal(p.budget,2500);assert.equal(p.weeklyHours,8);assert.equal(p.proctoringPreference,'avoid');
 const empty=Guide.normalizeProfile({homeState:'ZZ',campusInterests:'sports',campusTime:'graduate in 12 months',learningPace:'instant'});
 assert.equal(empty.homeState,'');assert.deepEqual(empty.campusInterests,[]);assert.equal(empty.campusTime,'any');assert.equal(empty.learningPace,'any');assert.equal(empty.budget,null);
});

test('exact-campus home-state and supported interests change discovery order without excluding alternatives',()=>{
 const far=route('far'),local=route('local'),facts={campuses:[campus(far,'AZ'),campus(local,'VA')]};
 const results=Guide.recommend({modality:'campus',campusLocation:'near-home',homeState:'VA',campusInterests:['housing']},{pathways:[far,local],campusFacts:facts},[],[]);
 assert.deepEqual(results.map(r=>r.pathway.id),['local','far']);
 assert(results[0].preferenceFit.badges.some(b=>b.label==='In your state'));
 assert(!results[1].preferenceFit.badges.some(b=>b.label==='In your state'));
 assert(results[0].preferenceFit.reasons.some(r=>r.includes('Distance from home')));
});

test('campus traits require source evidence and the exact route; online programs get no campus labels',()=>{
 const r=route('target'),p={modality:'campus',campusLocation:'near-home',homeState:'VA',campusInterests:['sports','housing']};
 assert.equal(Guide.preferenceFit(p,r,null,{campuses:[campus(r,'VA',{routeIds:['other-program']})]}).score,0);
 const unsupported=Guide.preferenceFit(p,r,null,{campuses:[campus(r,'VA',{traitEvidence:{sports:{url:'javascript:alert(1)'}}})]});
 assert(!unsupported.badges.some(b=>/sports|housing/i.test(b.label)));
 const online=route('target',{modalities:['online']});
 assert.deepEqual(Guide.preferenceFit({...p,modality:'online'},online,null,{campuses:[campus(online,'VA')]}),{score:0,reasons:[],badges:[]});
 assert.equal(Guide.preferenceFit(p,r,null,{campuses:[campus(r,'VA'),campus(r,'VA',{id:'another-campus'})]}).score,0);
});

test('missing reputation, social-life and campus-time evidence never becomes an invented match or guarantee',()=>{
 const r=route('target'),fit=Guide.preferenceFit({campusInterests:['recognition','social'],campusTime:'one-year'},r,null,{campuses:[campus(r,'VA')]});
 assert.equal(fit.score,0);assert(!fit.badges.some(b=>/recogn|social|party|year|fast|top/i.test(b.label)));
 assert.equal(Guide.recommend({campusLocation:'near-home',homeState:'CA',campusInterests:['social']},{pathways:[r]},[],[]).length,1);
});

test('study pace changes fit while career, level and study-format requirements stay enforced',()=>{
 const regular=route('regular',{modalities:['online'],paceModel:'term-based'}),self=route('self',{modalities:['online'],paceModel:'competency-subscription'});
 const p={modality:'online',learningPace:'self-paced'};
 const results=Guide.recommend(p,{pathways:[regular,self]},[],[]);
 assert.equal(results[0].pathway.id,'self');assert.equal(results[0].preferenceFit.badges[0].label,'Self-paced option');
 assert.deepEqual(Guide.recommend({...p,goal:'teacher'},{pathways:[regular,self]},[],[]),[]);
 assert.deepEqual(Guide.recommend({...p,degreeLevel:'master'},{pathways:[regular,self]},[],[]),[]);
 assert.deepEqual(Guide.recommend({...p,modality:'campus'},{pathways:[regular,self]},[],[]),[]);
});

test('soft preferences cannot invalidate an existing exact target or mutate its original course data',()=>{
 const r=route('target'),records=[{id:'original',provider:'College',code:'HIST101',credits:3,status:'earned'}],before=JSON.stringify(records);
 const p={pathwayId:r.id,school:r.school,degree:r.title,degreeLevel:'bachelor',field:'business',modality:'campus',goal:'any-degree',homeState:'CA',campusLocation:'near-home',campusTime:'one-year',campusInterests:['social','recognition'],learningPace:'self-paced'};
 assert.equal(Guide.assessTarget(p,r,[]).conflicts.length,0);
 assert.equal(Guide.recommend(p,{pathways:[r]},[],records).length,1);assert.equal(JSON.stringify(records),before);
});
