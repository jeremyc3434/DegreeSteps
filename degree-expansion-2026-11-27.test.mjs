/** Publication and student-state contract for the independently scoped cohort.
 * Runs the adoption fixture without launching a browser or calling services. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const root=new URL('./',import.meta.url),require=createRequire(import.meta.url);
const Catalog=require('./dist/program-catalog.js'),Sheet=require('./dist/sheet-state.js'),Journey=require('./dist/journey-engine.js');
test('all fourteen reviewed editions open complete published plans without awarding or converting saved courses',async()=>{
 const cohort=JSON.parse(await readFile(new URL('test-support/fixtures/degree-expansion/nov27-complete-degree-cohort.json',root),'utf8'));
 assert.equal(cohort.expectedCount,14);assert.equal(cohort.cases.length,14);
 assert.equal(cohort.cases.filter(row=>row.total===120).length,7);
 assert.equal(cohort.cases.filter(row=>row.total===60).length,3);
 assert.equal(cohort.cases.filter(row=>row.outside===0).length,4);
 // Load the same strict fixture contract as the browser CLI. Requiring it
 // does not launch a browser; restore the test runner's arguments immediately.
 const previousArgs=process.argv;
 let harness;
 try{process.argv=[...previousArgs,'--cohort','test-support/fixtures/degree-expansion/nov27-complete-degree-cohort.json'];harness=require('./undergrad-expansion-browser.test.cjs');}
 finally{process.argv=previousArgs;}
 assert.equal(harness.fixtures.length,14);
 const registry=require('./dist/data/curriculum-registry.json'),publication=require('./dist/data/publication-index.json');
 const catalog=Catalog.attachPublicationIndex(Catalog.attachRegistry(Catalog.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),registry),publication,registry);
 for(const fixture of harness.fixtures){
  const original=harness.seed(),next=Journey.selectRoute(original,fixture.route,catalog),scenario=Sheet.scenario(next,fixture.modelId);
  next.scenarios={...next.scenarios,[fixture.modelId]:{...scenario,providers:[...new Set([...scenario.providers,...fixture.baseline.rows.map(row=>row.provider).filter(provider=>provider!=='University')])],optionSelections:Object.fromEntries(fixture.baseline.rows.map(row=>[row.requirementId,row.optionId]))}};
  harness.assertAdopted(next,fixture,original);
 }
});
