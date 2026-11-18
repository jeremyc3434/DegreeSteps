import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './outputs/cloudflare/worker.mjs';

const env={ASSETS:{async fetch(){return new Response('<!doctype html><title>DegreeSteps fixture</title>',{headers:{'Content-Type':'text/html'}});}}};
test('the public domain uses one secure hostname and preserves the destination',async()=>{
  for(const origin of ['http://degreesteps.com','http://www.degreesteps.com','https://www.degreesteps.com']){
    const response=await worker.fetch(new Request(origin+'/auth/complete?code=synthetic-callback'),{},{});
    assert.equal(response.status,308);assert.equal(response.headers.get('Location'),'https://degreesteps.com/auth/complete?code=synthetic-callback');
    assert.equal(response.headers.get('Set-Cookie'),null);
  }
});
test('temporary Worker hosts stay out of search while the custom domain remains indexable',async()=>{
  const preview='https://degreesteps.account-fixture.workers.dev';
  const robots=await worker.fetch(new Request(preview+'/robots.txt'),env,{});
  assert.equal(robots.status,200);assert.equal(await robots.text(),'User-agent: *\nDisallow: /\n');
  const head=await worker.fetch(new Request(preview+'/robots.txt',{method:'HEAD'}),env,{});assert.equal(await head.text(),'');
  for(const path of ['/','/plan.html','/resources/']){
    const response=await worker.fetch(new Request(preview+path),env,{});
    assert.equal(response.status,200,path);assert.equal(response.headers.get('X-Robots-Tag'),'noindex, nofollow',path);
  }
  const live=await worker.fetch(new Request('https://degreesteps.com/'),env,{});
  assert.equal(live.status,200);assert.equal(live.headers.get('X-Robots-Tag'),null);
  const privatePage=await worker.fetch(new Request('https://degreesteps.com/plan.html'),env,{});
  assert.equal(privatePage.headers.get('X-Robots-Tag'),'noindex, nofollow');assert.equal(privatePage.headers.get('Cache-Control'),'no-store');
});
