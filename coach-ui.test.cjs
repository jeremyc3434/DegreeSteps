/** Degree coach page script: safe answer rendering, saved-draft summary, and hidden-unless-enabled boot. */
const test=require('node:test');
const assert=require('node:assert/strict');
const Coach=require('./dist/coach.js');

test('safe links: only same-site relative paths and known app pages',()=>{
  for(const ok of ['/programs.html','/degree-plans/wgu-marketing/','/portal.html?usePlan=excelsior-bs-psychology','/transfer/sophia/soph-0048-introduction-to-psychology/','/faq/#x'])assert.equal(Coach.safeHref(ok),ok);
  assert.equal(Coach.safeHref('portal.html?usePlan=wgu-catalog-689e417cff765fc9'),'/portal.html?usePlan=wgu-catalog-689e417cff765fc9');
  for(const page of ['programs.html','credits-worth.html','plan.html'])assert.equal(Coach.safeHref(page),'/'+page);
  for(const bad of ['javascript:alert(1)','JAVASCRIPT:alert(1)','https://evil.example/','http://degreesteps.com/faq/','//evil.example/x','/\\evil.example','data:text/html,<b>x</b>','vbscript:x','account.html','/faq/ x','/a"onmouseover="x','/<script>',' javascript:alert(1)','mailto:a@b.co','',null,42])assert.equal(Coach.safeHref(bad),null,String(bad));
});

test('answers parse into paragraphs, bullets and links without interpreting HTML',()=>{
  const blocks=Coach.parseAnswer('Liberty Psychology (B.S.) is a Reviewed plan.\n- Plan: /degree-plans/liberty-psychology-bs-online/.\n- Bad: [click](javascript:alert(1)) and https://evil.example/x\n<img src=x onerror=alert(1)>\nNext step: Open portal.html?usePlan=liberty-catalog-fa62c08cdfa0c990-online');
  assert.deepEqual(blocks.map(block=>block.type),['paragraph','list','paragraph','next']);
  assert.deepEqual(blocks[1].items[0],[{text:'Plan: '},{text:'/degree-plans/liberty-psychology-bs-online/',href:'/degree-plans/liberty-psychology-bs-online/'},{text:'.'}]);
  assert(blocks[1].items[1].every(part=>!part.href),'unsafe targets stay text');
  assert.match(blocks[1].items[1].map(part=>part.text).join(''),/^Bad: click\)? and https:\/\/evil\.example\/x$/);
  assert.deepEqual(blocks[2].parts,[{text:'<img src=x onerror=alert(1)>'}]);
  assert.equal(blocks[3].parts[1].href,'/portal.html?usePlan=liberty-catalog-fa62c08cdfa0c990-online');
  const md=Coach.parseAnswer('See [the finder](/programs.html).');assert.deepEqual(md[0].parts,[{text:'See '},{text:'the finder',href:'/programs.html'},{text:'.'}]);
});

function fakeDocument(){
  const created=[];
  class Node{constructor(tag){this.tagName=tag;this.children=[];this.attributes={};this.className='';Object.defineProperty(this,'innerHTML',{set(){throw Error('innerHTML must not be used');},get(){return '';}});}appendChild(child){this.children.push(child);return child;}setAttribute(k,v){this.attributes[k]=v;}get text(){return this.children.map(child=>child.children?.length?child.text:child.textContent??child.data).join('');}}
  return{created,createElement(tag){const node=new Node(tag);created.push(node);return node;},createTextNode(data){return{data,text:data};},createDocumentFragment(){return new Node('#fragment');}};
}
test('rendering uses text nodes and anchors only',()=>{
  const doc=fakeDocument(),fragment=Coach.renderAnswer(doc,'<b>Hi</b> see /faq/\n- [x](javascript:alert(1))\nNext step: /programs.html');
  assert.deepEqual(doc.created.map(node=>node.tagName),['p','a','ul','li','p','a']);
  const anchors=doc.created.filter(node=>node.tagName==='a');assert.deepEqual(anchors.map(a=>a.href),['/faq/','/programs.html']);
  assert.equal(fragment.children[0].text,'<b>Hi</b> see /faq/');assert.equal(fragment.children[2].className,'coach-next');
});

test('saved summary: reads the v3 draft, sends finished course title/provider/credits and plan id only, never writes',()=>{
  const writes=[];const draft={version:3,profile:{email:'x@y.z',homeState:'NJ'},selectedPathwayId:'excelsior-bs-psychology',learning:[{id:'r1',status:'earned',provider:'Sophia',title:'Introduction to Psychology',credits:3,notes:'private',grade:'A'},{id:'r2',status:'planned',provider:'Sophia',title:'English Composition I',credits:3}]};
  const storage={getItem:key=>{assert.equal(key,'degreepath-guide-v3');return JSON.stringify(draft);},setItem:(...args)=>writes.push(args),removeItem:(...args)=>writes.push(args)};
  assert.deepEqual(Coach.savedSummary(storage),{courses:[{title:'Introduction to Psychology',provider:'Sophia',credits:3}],planId:'excelsior-bs-psychology'});
  assert.deepEqual(writes,[]);assert.equal(Coach.DRAFT_KEY,'degreepath-guide-v3');
  assert.equal(Coach.savedSummary({getItem:()=>'not json'}),null);assert.equal(Coach.savedSummary({getItem:()=>null}),null);assert.equal(Coach.savedSummary(null),null);
});

test('boot renders nothing when the status endpoint is off, missing or not JSON',async()=>{
  for(const response of [{ok:false,status:404,json:async()=>({enabled:false})},{ok:true,status:200,json:async()=>({enabled:false})},{ok:true,status:200,json:async()=>{throw Error('HTML');}},null]){
    let appended=0,requested='';
    const doc={readyState:'complete',addEventListener(){},querySelector:()=>null,head:{appendChild(){appended++;}},body:{appendChild(){appended++;}},createElement(){appended++;return{};}};
    const win={document:doc,localStorage:{getItem(){throw Error('storage must not be read when disabled');}},fetch:async url=>{requested=url;if(!response)throw Error('offline');return response;}};
    Coach.boot(win);await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(requested,'/api/coach/status');assert.equal(appended,0);
  }
});

test('panel copy: three starters and the privacy notice',()=>{
  assert.equal(Coach.STARTERS.length,3);
  assert.equal(Coach.NOTICE,'Questions are saved without your name to improve DegreeSteps. Don’t include personal details.');
});
