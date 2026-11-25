import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshPlan,refreshFactory,parseArguments} from './refresh-plan-factory.mjs';

test('refresh compiles reviewed kits before rebuilding all dependent indexes in order',async()=>{
  const calls=[],events=[];let clock=0;
  const report=await refreshFactory({execute:async step=>{calls.push(step);return {status:0};},now:()=>clock+=5,emit:event=>events.push(event)});
  assert.deepEqual(calls.map(step=>step.script),[
    'scripts/pathway-factory/compile.mjs','scripts/build-curriculum-registry.mjs','scripts/build-research-references.mjs','scripts/build-academic-registry.mjs',
    'scripts/build-pathway-quality-report.mjs','scripts/build-plan-expansion-queue.mjs','scripts/build-plan-library-index.mjs','scripts/build-plan-course-index.mjs',
    'scripts/catalog-plan-identities.mjs','scripts/provider-directory-discovery.mjs','scripts/build-provider-coverage-report.mjs','scripts/build-research-priorities.mjs',
    'scripts/build-school-research-batch.mjs','scripts/build-coach-index.mjs'
  ]);
  assert.deepEqual(calls[0].args,['--publish']);assert(calls.slice(1).every(step=>step.args.length===0));
  assert.equal(report.status,'passed');assert.equal(report.steps.length,14);assert(report.steps.every(step=>step.durationMs===5));assert.equal(events.at(-1),report);
});

test('check mode validates every stage without running a write-mode generator',async()=>{
  const calls=[];const report=await refreshFactory({check:true,execute:async step=>{calls.push(step);return {status:0};},emit:()=>{}});
  assert.equal(report.mode,'check');assert(calls.every(step=>step.args.includes('--check')));assert.deepEqual(calls[0].args,['--publish','--check']);
  const first=refreshPlan();first[0].args.push('mutated');assert.deepEqual(refreshPlan()[0].args,['--publish'],'plans do not share mutable arguments');
});

test('plan-only mode never starts a generator, in either write or check mode',async()=>{
  for(const check of [false,true]){
    const report=await refreshFactory({check,planOnly:true,execute:()=>{throw Error('A dry plan must not execute');},emit:()=>{}});
    assert.equal(report.executedSteps,0);assert.equal(report.commands.length,14);assert.equal(report.planOnly,true);
    assert.equal(report.commands.every(command=>command.args.includes('--check')),check);
  }
});

test('failure stops before any downstream index and preserves the failing timing receipt',async()=>{
  for(const failure of [{status:7},{status:null,signal:'SIGTERM'},Error('spawn unavailable')]){
    const calls=[];
    await assert.rejects(refreshFactory({execute:async step=>{calls.push(step.script);if(calls.length===4){if(failure instanceof Error)throw failure;return failure;}return {status:0};},emit:()=>{}}),error=>{
      assert.equal(error.report.status,'failed');assert.equal(error.report.steps.length,4);assert.equal(error.report.steps.at(-1).script,'scripts/build-academic-registry.mjs');
      assert.equal(error.report.steps.at(-1).status,'failed');assert(error.report.steps.at(-1).durationMs>=0);return true;
    });
    assert.equal(calls.length,4);assert(!calls.includes('scripts/build-pathway-quality-report.mjs'));
  }
});

test('unsupported flags fail explicitly rather than silently starting a write',()=>{
  assert.throws(()=>parseArguments(['--dry-run']),/Unknown option/);assert.deepEqual(parseArguments(['--check','--plan']),{check:true,planOnly:true});
});
