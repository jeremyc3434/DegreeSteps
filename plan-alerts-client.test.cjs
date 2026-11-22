/* Email plan alerts client (dist/plan-alerts.js) with mocked fetch: no UI when the flag is off, signed out or unsaved. */
const test=require('node:test'),assert=require('node:assert/strict');
function load(fetchImpl,{user={id:'u1'},link={planId:'saved-plan-1',revision:1}}={}){
  delete require.cache[require.resolve('./dist/plan-alerts.js')];
  const calls=[];globalThis.fetch=async(path,options)=>{calls.push({path,options});return fetchImpl(path,options);};
  globalThis.DegreeAccount={session:async()=>({user}),linkedPlan:()=>link};
  const api=require('./dist/plan-alerts.js');api._reset();return{api,calls};
}
const node=()=>({hidden:true,innerHTML:'',dataset:{},isConnected:true,querySelector:()=>null,querySelectorAll:()=>[]});
test('flag off: the 404 hides the opt-in and the settings list, and no further requests are made',async()=>{
  const {api,calls}=load(async()=>new Response(JSON.stringify({error:'Not found.'}),{status:404}));
  const box=node();await api.mountOptIn(box,{planId:'liberty-business-residential'});assert.equal(box.hidden,true);assert.equal(box.innerHTML,'');
  const settings=node();await api.mountSettings(settings);assert.equal(settings.hidden,true);
  await api.mountOptIn(box,{planId:'liberty-business-residential'});assert.equal(calls.length,1,'A disabled site is asked once');
});
test('signed out, not saved to the account, outside the plan library or an example: nothing is requested or shown',async()=>{
  for(const [options,mount] of [[{user:null},{planId:'plan-a'}],[{link:null},{planId:'plan-a'}],[{},{planId:'plan-a',inLibrary:false}],[{},{planId:'Not A Plan'}]]){
    const {api,calls}=load(async()=>{throw Error('must not fetch');},options);const box=node();await api.mountOptIn(box,mount);assert.equal(box.hidden,true);assert.equal(calls.length,0);
  }
});
test('the consent copy is plain and names only the account email',()=>{
  const {api}=load(async()=>new Response('{}'));
  assert.equal(api.copy.label,'Email me if this plan changes');
  assert.equal(api.copy.help('student@example.com'),'We’ll email student@example.com only about this plan: when its requirements, costs or school confirmations change, and at most one saved-plan reminder a month. Unsubscribing is one click, from any email or here.');
});
