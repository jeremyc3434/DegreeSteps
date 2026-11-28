import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnthropicPromptCache} from './ai-prompt-cache.mjs';

const key='synthetic-provider-key-not-a-real-secret';
const base={model:'claude-sonnet-5-5',workflow:'learning-homework',promptVersion:'homework-test-v1',system:[{type:'text',text:'Public static instructions.'},{type:'text',text:'Original synthetic demonstrations.'}],enabled:true,apiKey:key,thinking:{type:'adaptive'},outputConfig:{effort:'medium',format:{type:'json_schema',schema:{type:'object',properties:{answer:{type:'string'}}}}}};
function counted({full=900,baseline=100}={}){const calls=[];return{calls,fetcher:async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,options,body});return Response.json({input_tokens:body.system?full:baseline});}};}

test('native eligibility counts exactly the public prefix and constant message, then marks only the last static block',async()=>{
  const f=counted(),cache=createAnthropicPromptCache(),input=structuredClone(base),result=await cache.prepare({...input,fetcher:f.fetcher});
  assert.equal(f.calls.length,2);assert.equal(result.telemetry.cacheMode,'explicit-5m');assert.equal(result.telemetry.cacheStatus,'verified');assert.equal(result.telemetry.prefixTokens,736);
  assert.equal(result.system[0].cache_control,undefined);assert.deepEqual(result.system[1].cache_control,{type:'ephemeral',ttl:'5m'});assert.deepEqual(input,base,'Caller blocks are never mutated');
  for(const call of f.calls){assert.equal(call.url,'https://api.anthropic.com/v1/messages/count_tokens');assert.equal(call.options.redirect,'manual');assert.equal(call.options.headers['x-api-key'],key);assert.equal(call.body.model,base.model);assert.deepEqual(call.body.messages,[{role:'user',content:'Ready.'}]);assert.deepEqual(call.body.thinking,base.thinking);assert.deepEqual(call.body.output_config,base.outputConfig);assert.equal(call.body.max_tokens,undefined);assert.equal(call.body.cache_control,undefined);}
  const full=f.calls.find(call=>call.body.system),empty=f.calls.find(call=>!call.body.system);assert.deepEqual(full.body.system,base.system);assert.equal(empty.body.system,undefined);
});

test('512-token threshold uses conservative subtraction rather than an assumed character estimate or padding',async()=>{
  for(const[full,status,mode,tokens]of[[676,'verified','explicit-5m',512],[675,'below-minimum','off',511],[50,'below-minimum','off',0]]){
    const f=counted({full}),result=await createAnthropicPromptCache().prepare({...base,fetcher:f.fetcher});assert.equal(result.telemetry.cacheStatus,status);assert.equal(result.telemetry.cacheMode,mode);assert.equal(result.telemetry.prefixTokens,tokens);assert.deepEqual(result.system.map(({type,text})=>({type,text})),base.system);
  }
});

test('cache disabled and unknown models make no native verification calls and retain identical public text',async()=>{
  const f=counted(),cache=createAnthropicPromptCache();
  const disabled=await cache.prepare({...base,enabled:false,fetcher:f.fetcher});assert.equal(disabled.telemetry.cacheStatus,'disabled');assert.deepEqual(disabled.system,base.system);
  const unknown=await cache.prepare({...base,model:'unverified-future-model',fetcher:f.fetcher});assert.equal(unknown.telemetry.cacheStatus,'unknown-model');assert.deepEqual(unknown.system,base.system);assert.equal(f.calls.length,0);
});

test('verification cache coalesces simultaneous requests and keys exact versioned static prefix plus model settings',async()=>{
  const f=counted(),cache=createAnthropicPromptCache(),options={...base,fetcher:f.fetcher};
  const results=await Promise.all([cache.prepare(options),cache.prepare(options),cache.prepare(options)]);assert.equal(f.calls.length,2);assert(results.every(result=>result.telemetry.cacheStatus==='verified'));
  await cache.prepare({...options,promptVersion:'homework-test-v2'});assert.equal(f.calls.length,4);
  await cache.prepare({...options,system:[{type:'text',text:'Different public instructions.'}]});assert.equal(f.calls.length,6);
  await cache.prepare({...options,outputConfig:{...base.outputConfig,effort:'low'}});assert.equal(f.calls.length,8);
});

test('verification memory is bounded and expiring, independent of the native five-minute cache TTL',async()=>{
  let time=1000;const f=counted(),cache=createAnthropicPromptCache({maxEntries:2,verificationTtlMs:100,now:()=>time});
  for(const version of['a','b','c'])await cache.prepare({...base,promptVersion:version,fetcher:f.fetcher});assert.deepEqual(cache.statistics(),{entries:2,maxEntries:2});assert.equal(f.calls.length,6);
  await cache.prepare({...base,promptVersion:'a',fetcher:f.fetcher});assert.equal(f.calls.length,8,'Evicted prefix is counted again');
  time=1200;await cache.prepare({...base,promptVersion:'a',fetcher:f.fetcher});assert.equal(f.calls.length,10,'Expired count result is reverified');
});

test('failed or malformed native verification falls back without caching failure or leaking provider body',async()=>{
  for(const makeResponse of[()=>new Response('private-provider-error',{status:503}),()=>Response.json({input_tokens:'900'}),()=>Response.json({input_tokens:-1}),()=>Response.json({input_tokens:1000001}),()=>new Response('x'.repeat(8193)),()=>{throw Error('private-provider-detail');}]){
    const cache=createAnthropicPromptCache();let calls=0;const fetcher=async()=>{calls++;return makeResponse();};
    const result=await cache.prepare({...base,fetcher});assert.equal(result.telemetry.cacheStatus,'verification-failed');assert.deepEqual(result.system,base.system);assert(!JSON.stringify(result).includes('private-provider'));assert.equal(cache.statistics().entries,0);
    await cache.prepare({...base,fetcher});assert.equal(calls,4,'A failed count is not permanently cached');
  }
});

test('native count deadlines cover ignored aborts and a response body that never finishes',async()=>{
  for(const mode of['fetch','body']){
    const cache=createAnthropicPromptCache({countTimeoutMs:15});let cancelled=0;
    const fetcher=mode==='fetch'?async()=>new Promise(()=>{}):async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{"input_tokens":'));},cancel(){cancelled++;}}));
    const start=performance.now(),result=await cache.prepare({...base,fetcher});assert.equal(result.telemetry.cacheStatus,'verification-failed');assert(performance.now()-start<1000);if(mode==='body')assert.equal(cancelled,2);
  }
});

test('no dynamic input is accepted into a verification body and incoming cache markers are stripped',async()=>{
  const f=counted(),provided=[{type:'text',text:'Only public static text.',cache_control:{type:'ephemeral',ttl:'1h'},unexpected:'drop'}];
  const result=await createAnthropicPromptCache().prepare({...base,system:provided,enabled:false,messages:[{role:'user',content:'PRIVATE STUDENT QUESTION'}],fetcher:f.fetcher});
  assert.deepEqual(result.system,[{type:'text',text:'Only public static text.'}]);assert.equal(f.calls.length,0);assert(!JSON.stringify(result).includes('PRIVATE STUDENT QUESTION'));
});

test('invalid server credentials fail open to ordinary inference without a count request',async()=>{
  const f=counted(),cache=createAnthropicPromptCache();for(const apiKey of['short','bad\nkey-not-safe-in-http-header',null]){const result=await cache.prepare({...base,apiKey,fetcher:f.fetcher});assert.equal(result.telemetry.cacheStatus,'verification-failed');assert.deepEqual(result.system,base.system);}assert.equal(f.calls.length,0);
});
