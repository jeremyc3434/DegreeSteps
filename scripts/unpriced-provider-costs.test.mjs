import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Estimate from '../dist/plan-estimate-engine.js';
import Planner from '../dist/planner.js';
import View from '../dist/plan-estimate-view.js';
const actualRates=JSON.parse(readFileSync(new URL('../content/estimates/plan-estimate-rates.json',import.meta.url),'utf8'));
const copy=value=>JSON.parse(JSON.stringify(value));
function fixture(provider,withStudy=false){
 const rates=copy(actualRates),id='synthetic-unpriced-provider-fees',sources=[{id:'synthetic-catalog',url:'https://synthetic.invalid/catalog',checked:'2026-11-20'}];
 const option=(provider,code)=>({id:provider+'-'+code,provider,code,title:code,credits:3,creditSystem:'semester',sourceIds:['synthetic-catalog'],evidence:'published'});
 const requirements=[{id:'outside',title:'Synthetic outside requirement',code:'OUT101',credits:3,category:'general',options:[option(provider,'SOURCE101')]},{id:'capstone',title:'Synthetic university requirement',code:'UNI101',credits:3,category:'major',institutionalOnly:true,options:[option('University','UNI101')]}];
 if(withStudy)requirements.push({id:'second-outside',title:'Synthetic second outside requirement',code:'OUT102',credits:3,category:'general',options:[option('Study.com','SOURCE102')]});
 const program={id,school:'Synthetic Fee University',title:'Synthetic fee arithmetic only',level:'bachelor',format:'Online',catalogYear:'2026-2027',creditSystem:'semester',totalCredits:requirements.length*3,institutionMinCredits:3,externalMaxCredits:requirements.length*3-3,upperMinCredits:0,sources,requirements};
 const entry=copy(rates.entries.find(entry=>entry.id==='liberty-online-2026-27'));Object.assign(entry,{id:'synthetic-unpriced-fees',school:program.school,modelIds:[id],degreeUnits:program.totalCredits});rates.entries.push(entry);
 const plan=Planner.generate(program,{providers:[provider,'Study.com'],allowConditional:true,priority:'transfer',completed:[]});assert.equal(plan.validation.academicCountsValid,true);return {rates,program,plan};
}

test('Saylor and StraighterLine publish source-bound omissions without making an unsupported numeric price claim',()=>{
 assert.equal(Estimate.assertRates(actualRates),actualRates);
 for(const provider of ['Saylor','StraighterLine']){
  assert(!actualRates.providers.some(price=>price.provider===provider),'The provider has no universal reviewed numeric price');
  const record=actualRates.unpricedProviders.find(record=>record.provider===provider);assert(record);assert(record.missing.length);assert(record.sourceIds.every(id=>actualRates.sources.some(source=>source.id===id&&source.checkedOn==='2026-11-20')));
 }
 const saylor=actualRates.unpricedProviders.find(record=>record.provider==='Saylor');assert(saylor.missing.some(note=>/\$5 SmarterProctoring/.test(note)&&/free built-in/.test(note)&&/not included/.test(note)));
 const straighter=actualRates.unpricedProviders.find(record=>record.provider==='StraighterLine');assert(straighter.missing.some(note=>/membership and individual course charges/.test(note)&&/lab kits/.test(note)));
});

test('unknown provider charges stay null and partial instead of becoming zero or a false complete course total',()=>{
 for(const provider of ['Saylor','StraighterLine']){
  const f=fixture(provider),before=JSON.stringify(f),result=Estimate.calculate(f);assert.equal(result.available,true,result.reason);assert.equal(result.status,'partial-range');assert.equal(result.costs.complete,false);assert.equal(result.costs.outsideCourses,null);
  const line=result.costs.providerBreakdown.find(line=>line.provider===provider);assert.equal(line.cost,null);assert.equal(line.courses,1);assert(result.costs.missing.some(note=>note.startsWith(provider)));
  assert.deepEqual(result.costs.knownRange,{min:1874,max:1874},'Only synthetic university tuition and listed fees contribute known charges');
  assert(result.sources.some(source=>source.id===(provider==='Saylor'?'saylor-direct-credit-fees':'straighterline-membership-course-pricing')));
  const html=View.render(result);assert.match(html,/Known charges so far/);assert.match(html,/Not included/);assert.doesNotMatch(html,/\$0(?:<|–|\s)/);assert.equal(JSON.stringify(f),before);
 }
 const mixed=Estimate.calculate(fixture('Saylor',true));assert.equal(mixed.status,'partial-range');assert.equal(mixed.costs.outsideCourses,null);assert.deepEqual(mixed.costs.knownRange,{min:2109,max:2109});assert.equal(mixed.costs.providerBreakdown.find(line=>line.provider==='Study.com').cost.min,235,'Known provider charges are retained in the known subtotal');
});

test('unpriced review records reject numeric overrides, duplicate providers and unbound or empty explanations',()=>{
 for(const change of [r=>r.unpricedProviders[0].amount=0,r=>r.unpricedProviders[0].cost=5,r=>r.unpricedProviders[0].provider='Sophia',r=>r.unpricedProviders[0].sourceIds=['missing'],r=>r.unpricedProviders[0].missing=[],r=>r.unpricedProviders[0].missing=[null],r=>r.unpricedProviders.push(copy(r.unpricedProviders[0]))]){
  const rates=copy(actualRates);change(rates);assert.throws(()=>Estimate.assertRates(rates));const f=fixture('Saylor');f.rates=rates;assert.equal(Estimate.calculate(f).available,false);
 }
 const legacy=copy(actualRates);delete legacy.unpricedProviders;assert.equal(Estimate.assertRates(legacy),legacy,'Previously published rate files remain supported');
});
