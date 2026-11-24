import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {buildProgramFit} from './scripts/program-fit-metadata.mjs';
import {buildIndex} from './scripts/build-plan-library-index.mjs';

const require=createRequire(import.meta.url);
const Catalog=require('./dist/program-catalog.js'),Planner=require('./dist/planner.js'),Estimate=require('./dist/plan-estimate-engine.js');
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const registry=read('dist/data/curriculum-registry.json'),publication=read('dist/data/publication-index.json'),quality=read('dist/data/pathway-quality-report.json');
const rates=read('dist/data/plan-estimate-rates.json'),reviews=read('content/discovery/program-fit-reviews.json'),baselines=read('dist/data/baseline-index.json');
const catalog=Catalog.attachRegistry(Catalog.merge(read('dist/data/pathways.json'),read('dist/data/program-catalog.json')),registry);
const edition=value=>String(value||'').replace(/[–—]/g,'-').trim();
const packs=new Map(),fixtures=new Map();
for(const published of publication.plans){
  const entry=registry.models.find(row=>row.id===published.modelId);
  assert(entry,published.modelId);
  if(!packs.has(entry.path))packs.set(entry.path,read('dist/'+entry.path));
  const document=packs.get(entry.path),model=(document.models||[document]).find(row=>row.id===entry.id);
  const baseline=Object.values(baselines.baselines).find(row=>row.modelId===model.id&&published.routeIds.includes(row.pathwayId));
  assert(baseline,model.id+' has its actual published starting route');
  const route=catalog.pathways.find(row=>row.id===baseline.pathwayId);
  const providers=[...new Set(model.requirements.flatMap(row=>row.options.map(option=>option.provider)).filter(provider=>provider!=='University'))];
  const plan=Planner.generate(model,{providers,priority:'transfer',allowConditional:false,completed:[],optionSelections:Object.fromEntries(baseline.rows.map(row=>[row.requirementId,row.optionId])),optimizationNodeBudget:12000});
  const estimate=Estimate.calculate({program:model,plan,rates});
  fixtures.set(model.id,{model,route,plan,estimate,rates,reviews});
}
const fitFor=fixture=>buildProgramFit(fixture);
const clone=value=>structuredClone(value);
const legacyIds=['liberty-criminal-justice-online','liberty-criminal-justice-residential'];

test('all 22 published degree editions receive independent, source-bound fit facts',()=>{
  assert.equal(fixtures.size,22);
  const fits=[...fixtures.values()].map(fixture=>{
    const {model,route,plan,estimate}=fixture,fit=fitFor(fixture);
    assert.equal(estimate.available,true,model.id+' has its actual, validated billing estimate');
    assert.equal(fit.modelId,model.id);
    assert.equal(fit.catalogYear,edition(model.catalogYear||model.catalog));
    assert.equal(fit.modality,/^online$/i.test(model.format)?'online':'campus');
    assert.equal(fit.creditSystem,model.creditSystem);
    assert.match(fit.sources.billing.url,/^https:\/\//,model.id+' carries the exact pricing source');
    assert.match(fit.sources.billing.checkedOn,/^20\d\d-\d\d-\d\d$/);
    assert(fit.sources.billing.sourceIds.length>0);
    assert.doesNotMatch(fit.tuitionLabel,/needs confirmation|\$0\b/i,model.id);
    assert.equal(plan.totals.confirmed,0);
    assert.equal(plan.totals.reported,0);
    assert(plan.rows.every(row=>row.status==='planned'));
    if(model.paceModel==='competency-subscription'){
      assert.equal(fit.competencyBased,true);assert.equal(fit.selfPaced,true);assert.equal(fit.billing,'subscription');
      assert.match(fit.paceLabel,/Self-paced/);
      assert.equal(fit.sources.learning.url,new URL(model.paceSourceUrl||route.paceSourceUrl||model.learningSourceUrl||route.learningSourceUrl||route.url||model.url).href);
      assert.equal(fit.learningReviewId,undefined,'WGU does not inherit a Liberty scheduled-course review');
    }else{
      assert.equal(model.school,'Liberty University');assert.equal(fit.selfPaced,false);
      assert.equal(fit.competencyBased,null,'A professor deadline is not evidence for or against CBE assessment');
      assert.match(fit.paceLabel,/term schedule/);
      const review=reviews.reviews.find(row=>row.id===fit.learningReviewId);
      assert(review&&review.modelIds.includes(model.id));
      assert.equal(edition(review.catalogYear),fit.catalogYear);assert.equal(review.modality,fit.modality);
      assert.equal(fit.sources.learning.url,review.source.url);assert.equal(fit.sources.learning.checkedOn,review.source.checkedOn);
      assert.deepEqual(fit.sources.learning.sourceIds,[review.source.id]);
      const binding=review.programBindings.find(row=>row.modelId===model.id);
      assert(model.sources.some(source=>source.url===binding.degreeUrl),'The review binds to this actual degree, not its parent directory');
      assert(review.source.quote.trim()&&review.source.reviewMethod.trim(),'The scheduled classification retains its primary quotation and review method');
    }
    return fit;
  });
  assert.equal(fits.filter(fit=>fit.competencyBased===true&&fit.selfPaced===true&&fit.billing==='subscription').length,14);
  assert.equal(fits.filter(fit=>fit.selfPaced===false&&fit.competencyBased===null).length,8);
  assert.equal(fits.filter(fit=>fit.billing==='per-credit').length,6);
  assert.equal(fits.filter(fit=>fit.billing==='flat-term').length,2);
  assert.equal(fits.filter(fit=>fit.billing==='subscription').length,14);
});

test('legacy Criminal Justice pricing is acquired only from a valid exact-edition estimate profile',()=>{
  for(const id of legacyIds){
    const fixture=fixtures.get(id),{model,estimate}=fixture;
    assert.equal(model.pricing,undefined,id+' remains the actual legacy model rather than a synthetic priced copy');
    assert.equal(fixture.route.pricing,undefined);
    const fit=fitFor(fixture),entry=rates.entries.find(row=>row.id===estimate.rateEntryId);
    assert(entry.modelIds.includes(id));assert.equal(entry.degreeUnits,120);assert.equal(entry.creditSystem,model.creditSystem);
    assert.deepEqual(fit.sources.billing.sourceIds,entry.sourceIds);
    const source=rates.sources.find(row=>entry.sourceIds.includes(row.id));
    assert.equal(fit.sources.billing.url,source.url);assert.equal(fit.sources.billing.checkedOn,source.checkedOn);
    if(id.endsWith('online')){
      assert.equal(fit.billing,'per-credit');assert.equal(fit.termLabel,'semester');
      assert.equal(fit.tuitionLabel,'$410–$475 per credit ($410 at 12+ credits per semester)');
    }else{
      assert.equal(fit.billing,'flat-term');assert.equal(fit.termLabel,'semester');
      assert.equal(fit.tuitionLabel,'$12,695 per semester (12–18 credits); $870 per credit below 12');
      assert.doesNotMatch(fit.tuitionLabel,/unlimited|overload|subscription/i);
    }
    const unavailable=fitFor({...fixture,estimate:{...estimate,available:false}});
    assert.equal(unavailable.billing,null);assert.equal(unavailable.sources.billing.url,'');
    assert.equal(unavailable.selfPaced,false,'A price failure does not erase a separately reviewed course schedule');
  }
});

test('a future catalog or different format cannot inherit the reviewed schedule or derived prices',()=>{
  const fixture=fixtures.get('liberty-criminal-justice-online');
  for(const patch of [{catalogYear:'2027-2028',catalog:'2027-2028'},{format:'Residential',modalities:['campus']}]){
    const fit=fitFor({...fixture,model:{...fixture.model,...patch}});
    assert.equal(fit.selfPaced,null);assert.equal(fit.learningReviewId,undefined);
    assert.equal(fit.billing,null);assert.equal(fit.sources.billing.url,'');
  }
  const wrongIdentity=fitFor({...fixture,model:{...fixture.model,id:'unreviewed-model'}});
  assert.equal(wrongIdentity.selfPaced,null);assert.equal(wrongIdentity.billing,null);
});

test('different credit units, degree size, rate identity or source bindings cannot acquire derived prices',()=>{
  const fixture=fixtures.get('liberty-criminal-justice-online');
  for(const patch of [{creditSystem:'quarter'},{creditSystem:'competency-unit'},{totalCredits:121}]){
    const fit=fitFor({...fixture,model:{...fixture.model,...patch}});
    assert.equal(fit.billing,null);assert.equal(fit.sources.billing.url,'');
  }
  assert.equal(fitFor({...fixture,estimate:{...fixture.estimate,rateEntryId:'unreviewed-rate'}}).billing,null);
  for(const invalidate of [
    (copy,entry)=>entry.modelIds=entry.modelIds.filter(id=>id!==fixture.model.id),
    (copy,entry)=>entry.sourceIds=['unreviewed-source'],
    (copy,entry)=>entry.sourceIds.forEach(id=>{copy.sources.find(source=>source.id===id).url='http://college.example/unreviewed';}),
    (copy,entry)=>entry.catalogs=['2027-2028'],
    (copy,entry)=>entry.creditSystem='quarter',
    (copy,entry)=>entry.modality='campus'
  ]){
    const copy=clone(rates),entry=copy.entries.find(row=>row.id===fixture.estimate.rateEntryId);invalidate(copy,entry);
    const fit=fitFor({...fixture,rates:copy});
    assert.equal(fit.billing,null);assert.equal(fit.sources.billing.url,'');
    assert.equal(fit.selfPaced,false,'Billing evidence does not override independent learning evidence');
  }
});

test('learning facts require the exact program binding and primary HTTPS review source',()=>{
  const fixture=fixtures.get('liberty-criminal-justice-online');
  for(const invalidate of [
    review=>review.programBindings=review.programBindings.filter(binding=>binding.modelId!==fixture.model.id),
    review=>review.programBindings.find(binding=>binding.modelId===fixture.model.id).degreeUrl='https://catalog.liberty.edu/unrelated-degree/',
    review=>review.source.url='http://www.liberty.edu/unreviewed',
    review=>review.source.url='https://user:password@www.liberty.edu/unreviewed'
  ]){
    const copy=clone(reviews),review=copy.reviews.find(row=>row.modelIds.includes(fixture.model.id));invalidate(review);
    const fit=fitFor({...fixture,reviews:copy});
    assert.equal(fit.selfPaced,null);assert.equal(fit.learningReviewId,undefined);
    assert.equal(fit.billing,'per-credit','A missing learning review does not erase independently valid prices');
  }
});

test('discovery metadata preserves academic objects, current publication decisions and private-record boundaries',()=>{
  const fixture=fixtures.get('liberty-criminal-justice-online'),before=JSON.stringify(fixture);
  const fit=fitFor(fixture);
  assert.equal(JSON.stringify(fixture),before,'The actual ledger, plan, rates, sources and review input remain unchanged');
  for(const key of ['learning','evaluations','profile','privateNote','notes','totals','rows'])assert.equal(Object.hasOwn(fit,key),false,'Discovery metadata does not copy '+key);
  assert.deepEqual(fit.requirements,[],'A program without sourced attendance facts does not acquire an attendance claim');
  const fits=Object.fromEntries(registry.models.flatMap(model=>model.routeIds.map(id=>[id,{...fit,modelId:model.id,competencyBased:true,selfPaced:true}])));
  const index=buildIndex({registry,quality,fits}),publishedIds=new Set(publication.plans.map(row=>row.modelId));
  assert.deepEqual([...new Set(Object.values(index.plans).filter(row=>row.published).map(row=>row.modelId))].sort(),[...publishedIds].sort());
  assert.equal(publishedIds.size,22);
  assert(Object.values(index.plans).some(row=>row.fit.competencyBased===true&&row.published===false),'A positive filter label cannot promote an unreviewed course plan');
});

test('known live-seminar requirements are compact sourced notices, never a copied curriculum or an absence claim',()=>{
  const fixture=fixtures.get('curriculum-liberty-human-services-bs-online'),before=JSON.stringify(fixture);
  const fit=fitFor(fixture);
  assert.equal(fit.requirements.length,1);
  const notice=fit.requirements[0];
  assert.equal(notice.type,'live-seminars');assert.equal(notice.label,'Live capstone seminars');assert.equal(notice.courseCode,'HSER 497');
  assert.deepEqual(Object.keys(notice).sort(),['courseCode','label','sourceIds','type','url']);
  assert(notice.sourceIds.every(id=>fixture.model.sources.some(source=>source.id===id&&source.url===notice.url)));
  const missing=clone(fixture);missing.model.requirements.find(row=>row.id==='hser-497').registrationPolicy.sourceIds=['unreviewed-source'];
  assert.deepEqual(fitFor(missing).requirements,[],'Missing evidence cannot become a confirmed attendance claim');
  assert.equal(JSON.stringify(fixture),before);
});
