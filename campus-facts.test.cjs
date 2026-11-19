'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Guide=require('./dist/guide-engine.js');
const Catalog=require('./dist/program-catalog.js');
const facts=require('./dist/data/campus-facts.json');
const registry=require('./dist/data/curriculum-registry.json');
const catalog=Catalog.attachRegistry(Catalog.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),registry);

test('published campus identities bind only exact existing campus degree routes and official evidence',()=>{
 assert.equal(facts.version,1);assert(facts.campuses.length>0);
 const seen=new Set();
 for(const campus of facts.campuses){
  assert(!seen.has(campus.id));seen.add(campus.id);
  const url=new URL(campus.identityEvidence.url);assert.equal(url.protocol,'https:');assert(url.hostname.endsWith('.edu'));assert(campus.sourceUrls.includes(url.href));assert(campus.identityEvidence.excerpt.includes(campus.city));
  for(const id of campus.routeIds){const route=catalog.pathways.find(r=>r.id===id);assert(route,id);assert.equal(route.school,campus.school);assert.deepEqual(route.modalities,['campus']);}
  for(const trait of campus.traits){assert(campus.traitEvidence[trait]?.url);assert.equal(new URL(campus.traitEvidence[trait].url).protocol,'https:');}
 }
});

test('actual Liberty campus data supports a state match, while its online degree receives none',()=>{
 const campus=catalog.pathways.find(r=>r.id==='liberty-business-residential');
 const local=Guide.preferenceFit({modality:'campus',campusLocation:'near-home',homeState:'VA'},campus,null,facts);
 assert(local.badges.some(b=>b.label==='In your state'));assert(local.badges.some(b=>b.label==='Lynchburg, VA'));assert(local.badges.every(b=>b.sourceUrl==='https://www.liberty.edu/residential/'));
 const online=catalog.pathways.find(r=>r.id==='liberty-criminal-justice-online');assert(online);
 assert.deepEqual(Guide.preferenceFit({modality:'online',campusLocation:'near-home',homeState:'VA'},online,null,facts),{score:0,reasons:[],badges:[]});
});
