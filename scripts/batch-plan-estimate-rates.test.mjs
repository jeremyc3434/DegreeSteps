import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import Estimate from '../dist/plan-estimate-engine.js';
import Planner from '../dist/planner.js';
const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const rates=read('content/estimates/plan-estimate-rates.json');
const models=read('dist/data/curricula/wgu.json').models;
const expected=[['marketing','curriculum-wgu-catalog-689e417cff765fc9',112,'202607'],['finance','curriculum-wgu-catalog-d6925a8fbb6e8d9a',121,'202608'],['user-experience-design','curriculum-wgu-catalog-c023977432f945c3',115,'202510'],['communications','curriculum-wgu-catalog-f5987d0b65c06f56',115,'202510']];
const clone=value=>JSON.parse(JSON.stringify(value));
function programSection(capture,url){
 const headings=[...capture.matchAll(/^([^\n]+) \((https:\/\/www\.wgu\.edu\/online-business-degrees\/[^\n)]+)\)$/gm)];
 const index=headings.findIndex(heading=>heading[2]===url);assert(index>=0,'The exact program page is retained');
 return capture.slice(headings[index].index,headings[index+1]?.index??capture.length);
}

test('each new batch program uses its own retained tuition and resources breakdown, not another business degree price',()=>{
 assert.equal(Estimate.assertRates(rates),rates);
 for(const [slug,id,units,catalog]of expected){
  const model=models.find(m=>m.id===id),entry=rates.entries.find(entry=>entry.id==='wgu-'+slug+'-reviewed'),source=rates.sources.find(source=>source.id==='wgu-'+slug+'-tuition');
  assert.deepEqual(entry.modelIds,[id]);assert.equal(entry.degreeUnits,units);assert.deepEqual(entry.catalogs,[catalog]);assert.equal(entry.creditSystem,'competency-unit');
  assert.equal(model.totalCredits,units);assert.equal(model.catalog,catalog);assert.equal(model.pricing.sourceUrl,source.url);assert.equal(model.pricing.amount,entry.tuition.termRate);assert.equal(source.checkedOn,model.pricing.checkedOn,'Reuse retains the actual source review date');
  const bytes=readFileSync(new URL('../'+source.reviewBasis.document,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),source.reviewBasis.sha256);
  const section=programSection(bytes.toString('utf8'),source.url);
  assert.match(section,/Tuition per six-month term is[\s\S]{0,70}\$3,?850/);assert.match(section,/(?:Resources Fee|Resource Fee)[\s\S]{0,70}\+ \$200/);
  assert.equal(entry.feesPerTerm,200);assert.equal(entry.oneTimeFees,65);assert.deepEqual(entry.sourceIds,[source.id,'wgu-november-catalog']);
  assert(!entry.sourceIds.includes('wgu-business-tuition'));assert(!entry.sourceIds.includes('wgu-hr-tuition'));
 }
 const universityReview=read('content/curricula/snapshots/wgu/bsmgt-202611-reviewed-university-policy.json');
 assert.equal(universityReview.pricing.applicationFeeOneTime,65);assert(universityReview.sources.some(source=>source.id==='wgu-current-catalog'&&source.printedPages.pricing===27));
});

test('four current exact batch ledgers receive term ranges while changed editions, units and unrelated programs fail closed',()=>{
 for(const [slug,id,units,catalog]of expected){
  const program=clone(models.find(m=>m.id===id)),plan=Planner.generate(program,{providers:['Sophia','Study.com'],priority:'transfer',allowConditional:true,completed:[]}),before=JSON.stringify({program,plan,rates}),result=Estimate.calculate({program,plan,rates});
  assert.equal(result.available,true,id+': '+result.reason);assert.equal(result.rateEntryId,'wgu-'+slug+'-reviewed');assert.equal(result.counts.totalUnits,units);assert.equal(result.counts.creditSystem,'competency-unit');assert.equal(result.timing.universityTermMonths,6);
  assert.equal(result.costs.universityTuition.min,3850*result.timing.universityTerms.min);assert.equal(result.costs.universityTuition.max,3850*result.timing.universityTerms.max);
  assert.equal(result.costs.universityFees.min,200*result.timing.universityTerms.min+65);assert.equal(result.costs.universityFees.max,200*result.timing.universityTerms.max+65);assert.equal(result.costs.complete,false);assert(result.costs.missing.some(note=>/course-specific charges/.test(note)));assert(result.sources.some(source=>source.id==='wgu-'+slug+'-tuition'));
  assert.equal(JSON.stringify({program,plan,rates}),before,'Pricing never changes courses, awards or pace records');
  for(const change of [p=>p.catalog=catalog==='202607'?'202608':'202607',p=>p.totalCredits=units+1,p=>p.creditSystem='semester',p=>p.format='Residential',p=>p.school='Other University']){const altered=clone(program);change(altered);assert.equal(Estimate.calculate({program:altered,plan,rates}).reasonCode,'degree-rate-mismatch');}
  const unrelated=clone(program);unrelated.id='unreviewed-'+id;assert.equal(Estimate.calculate({program:unrelated,plan,rates}).reasonCode,'degree-not-priced');
 }
});
