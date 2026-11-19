const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('./dist/audit.html','utf8');
const script = html.match(/<script id="legacy-audit-redirect">([\s\S]*?)<\/script>/)?.[1];
assert(script,'The older audit needs an accessible, bounded handoff to the current portal.');
function open(address) {
  const original = new URL(address), navigations = [], links = [];
  const context = {URL,URLSearchParams,location:{href:original.href,origin:original.origin,search:original.search,hash:original.hash,replace:value=>navigations.push(value)},document:{getElementById:id=>{assert.equal(id,'current-plan-link');return{setAttribute:(name,value)=>{assert.equal(name,'href');links.push(value);}};}}};
  for(const name of ['localStorage','sessionStorage','fetch'])Object.defineProperty(context,name,{get(){throw Error('A legacy handoff cannot read, replace or upload student records.');}});
  vm.runInNewContext(script,context);
  assert.equal(navigations.length,1);assert.deepEqual(links,navigations);
  return new URL(navigations[0],original.origin);
}
test('an older audit URL opens My plan with valid goal context and leaves browser records untouched',()=>{
  const result=open('https://degreesteps.com/audit.html?school=Liberty%20University&program=liberty-business-residential&level=bachelor&format=campus&view=school#service-records');
  assert.equal(result.origin,'https://degreesteps.com');assert.equal(result.pathname,'/portal.html');
  assert.equal(result.searchParams.get('school'),'Liberty University');assert.equal(result.searchParams.get('program'),'liberty-business-residential');assert.equal(result.searchParams.get('level'),'bachelor');assert.equal(result.searchParams.get('format'),'campus');assert.equal(result.searchParams.get('view'),'school');assert.equal(result.hash,'#service-records');
});
test('redirect-like, malformed and unsupported context never changes the destination or gets copied',()=>{
  const result=open('https://degreesteps.com//outside.example/audit.html?returnTo=https%3A%2F%2Foutside.example&url=https%3A%2F%2Foutside.example&usePlan=%2F%2Foutside.example&program=bad%0Aid&school='+encodeURIComponent('x'.repeat(121))+'&view=javascript%3Aalert(1)&level=invalid&format=hybrid&share=0&__proto__=x&constructor=x#//outside.example');
  assert.equal(result.href,'https://degreesteps.com/portal.html');
  const shared=open('https://degreepath-open-2026.ccollins203.chatgpt.site/audit.html?template=seed-example&shared=public-plan-123&usePlan=gcu-bsba-campus');
  assert.equal(shared.origin,'https://degreepath-open-2026.ccollins203.chatgpt.site');assert.equal(shared.pathname,'/portal.html');assert.equal(shared.searchParams.get('usePlan'),'gcu-bsba-campus');assert.equal(shared.searchParams.get('template'),'seed-example');
});
test('the old audit has a usable no-JavaScript continuation and does not execute the superseded builder',()=>{
  assert.match(html,/<a[^>]+id="current-plan-link"[^>]+href="\/portal.html"[^>]*>Open my plan<\/a>/);
  assert.doesNotMatch(html,/<script[^>]+src="(?:main|planner)\.js"/);
  assert.doesNotMatch(html,/Two partial pathways today|2 degree models|outside credits mapped/);
  const wizard=fs.readFileSync('./dist/wizard.js','utf8');
  const fallback=wizard.match(/\$\('error-state'\)\.innerHTML = ([^\n]+);/)?.[1];assert(fallback);
  const markup=vm.runInNewContext(fallback);assert.match(markup,/href="portal.html"/);assert.doesNotMatch(markup,/audit\.html/);
});
