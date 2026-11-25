import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readAcademicInputs} from './build-academic-registry.mjs';

test('a partial source review advances the coverage assessment date without refreshing curriculum evidence',async()=>{
 const root=await mkdtemp(join(tmpdir(),'degree-review-dates-'));
 try{
  await mkdir(join(root,'dist/data'),{recursive:true});
  const registry={checkedOn:'2026-11-20',models:[{id:'reviewed-model',path:'data/model.json'}]},model={id:'reviewed-model',evidenceCheckedOn:'2026-11-10',catalogIdentity:{checkedOn:'2026-11-10'},sources:[{id:'catalog',checkedOn:'2026-11-10'},{id:'provider-status',checkedOn:'2026-11-23'},{id:'not-a-review',fetchedAt:'2026-11-25T00:00:00Z'},{id:'malformed',checkedOn:'2026-02-30'}]};
  await writeFile(join(root,'dist/data/curriculum-registry.json'),JSON.stringify(registry));await writeFile(join(root,'dist/data/model.json'),JSON.stringify(model));
  const result=await readAcademicInputs(root,{reviewCutoff:'2026-11-25'});
  assert.equal(result.asOf,'2026-11-23');assert.deepEqual(result.models,[model]);
  assert.equal(result.models[0].catalogIdentity.checkedOn,'2026-11-10');assert.equal(result.models[0].sources[0].checkedOn,'2026-11-10');
  assert.deepEqual(JSON.parse(await readFile(join(root,'dist/data/curriculum-registry.json'),'utf8')),registry);
  model.sources=[{id:'old',checkedOn:'2026-11-10'}];await writeFile(join(root,'dist/data/model.json'),JSON.stringify(model));
  assert.equal((await readAcademicInputs(root,{reviewCutoff:'2026-11-25'})).asOf,'2026-11-20','A fetch or older source cannot erase the package review date.');
  model.sources.push({id:'incorrect-future-review',checkedOn:'2030-01-01'});await writeFile(join(root,'dist/data/model.json'),JSON.stringify(model));
  await assert.rejects(readAcademicInputs(root,{reviewCutoff:'2026-11-25'}),/cannot have a future review date/);
 }finally{await rm(root,{recursive:true,force:true});}
});
