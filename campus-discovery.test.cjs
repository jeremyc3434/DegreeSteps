'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Campus=require('./dist/campuses.js');
const facts=require('./dist/data/campus-facts.json');
const Catalog=require('./dist/program-catalog.js');
const catalog=Catalog.attachRegistry(Catalog.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),require('./dist/data/curriculum-registry.json'));
const available=Catalog.availablePlans(catalog,[]);

test('campus discovery exposes sourced physical destinations without promoting unmapped course plans',()=>{
 const campuses=Campus.normalizeFacts(facts);assert(campuses.length>=6);
 const liberty=campuses.find(c=>c.id==='liberty-lynchburg');assert(liberty);
 assert(Campus.mappedRoutes(liberty,catalog,available).length>0);
 for(const c of campuses){
  const html=Campus.cardHTML(c,catalog,available,facts.checkedOn),routes=Campus.mappedRoutes(c,catalog,available);
  assert(html.includes(c.school));assert(html.includes('Campus source'));
  if(!routes.length){assert(!html.includes('?usePlan='));assert(html.includes('Explore this campus'));assert(html.includes('course plan has not been published'));
  }else{assert(html.includes('?usePlan='));for(const r of routes)assert(html.includes(encodeURIComponent(r.id)));}
 }
});

test('ASU Tempe is a sourced research destination without an invented plan or athletics label',()=>{
 const tempe=Campus.normalizeFacts(facts).find(c=>c.id==='asu-tempe');assert(tempe);
 assert.equal(tempe.school,'Arizona State University');assert.equal(tempe.city,'Tempe');assert.equal(tempe.state,'AZ');assert.deepEqual(tempe.routeIds,[]);
 assert.equal(tempe.identityEvidence.url,'https://campus.asu.edu/tempe');assert(tempe.identityEvidence.excerpt.includes('1151 S. Forest Ave.'));
 assert.deepEqual(Campus.mappedRoutes(tempe,catalog,available),[]);
 const html=Campus.cardHTML(tempe,catalog,available,facts.checkedOn);assert(html.includes('Explore this campus'));assert(html.includes('school=Arizona%20State%20University'));assert(!html.includes('?usePlan='));assert(!html.includes('Division I sports'));
});

test('state and supported-feature filters use the same evidence as campus badges',()=>{
 const campuses=Campus.normalizeFacts(facts);
 const virginia=Campus.filterCampuses(campuses,{state:'VA'},catalog,available);assert(virginia.length>=2);assert(virginia.every(c=>c.state==='VA'));
 const sports=Campus.filterCampuses(campuses,{trait:'sports'},catalog,available);assert(sports.length>=2);
 for(const c of sports){assert(c.traitEvidence.sports.url);assert(Campus.cardHTML(c,catalog,available,facts.checkedOn).includes('Division I sports'));}
 const mapped=Campus.filterCampuses(campuses,{mappedOnly:true},catalog,available);assert(mapped.length>0);assert(mapped.every(c=>Campus.mappedRoutes(c,catalog,available).length>0));
 assert.deepEqual(Campus.filterCampuses(campuses,{trait:'social'},catalog,available),[]);
});

test('a school name, online program or unsupported trait cannot create a campus match',()=>{
 const c=Campus.normalizeFacts(facts).find(c=>c.id==='liberty-lynchburg');
 const onlyOnline={pathways:[{id:c.routeIds[0],school:c.school,modalities:['online']} ]};assert.deepEqual(Campus.mappedRoutes(c,onlyOnline,onlyOnline.pathways),[]);
 const wrongSchool={pathways:[{id:c.routeIds[0],school:'Another University',modalities:['campus']}]};assert.deepEqual(Campus.mappedRoutes(c,wrongSchool,wrongSchool.pathways),[]);
 const mixed={pathways:[{id:c.routeIds[0],school:c.school,modalities:['campus','online']}]};assert.deepEqual(Campus.mappedRoutes(c,mixed,mixed.pathways),[]);
 const unsafe={...c,traits:['sports','social','housing'],traitEvidence:{sports:{url:'javascript:alert(1)'},social:{url:'https://example.edu'},housing:{}}};assert.deepEqual(Campus.supportedTraits(unsafe),[]);
});

test('optional preference reads stay local and distinguish state matching from distance',()=>{
 let keyRead='';const p=Campus.preferences({getItem(key){keyRead=key;return JSON.stringify({profile:{homeState:'CA',campusLocation:'near-home',campusInterests:['sports','social','housing']}});}});
 assert.equal(keyRead,'degreepath-guide-v3');assert.equal(p.homeState,'CA');assert.equal(p.nearHome,true);assert.deepEqual(p.interests,['sports','housing']);
 assert.deepEqual(Campus.preferences({getItem(){throw Error('Blocked');}}),{homeState:'',nearHome:false,interests:[]});
});

test('all displayed traits have official evidence and subjective campus rankings are absent',()=>{
 const campuses=Campus.normalizeFacts(facts);
 for(const c of campuses){for(const t of Campus.supportedTraits(c)){const u=new URL(c.traitEvidence[t].url);assert.equal(u.protocol,'https:');assert(u.hostname.endsWith('.edu'));assert(c.traitEvidence[t].excerpt);}}
 const html=campuses.map(c=>Campus.cardHTML(c,catalog,available,facts.checkedOn)).join('');
 assert(!/best party|top ranked|\d+\/5|five.star|#1|guaranteed housing/i.test(html));
});
