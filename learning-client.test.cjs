const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const Learning=require('./dist/learning-client.js');

test('private learning transport uses HttpOnly cookie identity and same-origin write guard',async()=>{
  const calls=[],client=Learning.create({fetch:async(url,options)=>{calls.push({url,options});return Response.json({item:{id:'project'}});}});
  await client.api('/projects',{method:'POST',body:{title:'Private assignment',studentNotes:'My own private thinking'}});
  assert.equal(calls[0].url,'/api/learning/projects');
  assert.equal(calls[0].options.credentials,'same-origin');assert.equal(calls[0].options.cache,'no-store');assert.equal(calls[0].options.redirect,'error');
  assert.equal(calls[0].options.headers['X-Learning-Request'],'1');assert.equal(calls[0].options.headers['Content-Type'],'application/json');
  assert.deepEqual(JSON.parse(calls[0].options.body),{title:'Private assignment',studentNotes:'My own private thinking'});
  assert(!Object.keys(calls[0].options.headers).some(name=>/authorization|user.?id|paid|entitlement/i.test(name)));
});

test('learning reads never manufacture allowance or purchase information',async()=>{
  let sent;const response={enabled:true,authenticated:true,usage:{projectsRemaining:0},products:[{id:'writing',priceCents:1700}]};
  const client=Learning.create({fetch:async(url,options)=>{sent=options;return Response.json(response);}});
  assert.deepEqual(await client.api('/status'),response);assert.equal(sent.method,'GET');assert.equal(sent.body,undefined);assert.equal(sent.headers['X-Learning-Request'],undefined);
});

test('allowance and revision errors retain machine-readable recovery codes',async()=>{
  for(const [status,code]of [[402,'allowance_exhausted'],[409,'revision_conflict'],[401,'sign_in_required']]){
    const client=Learning.create({fetch:async()=>Response.json({error:'A useful student-facing message',code},{status})});
    await assert.rejects(client.api('/projects/one/run',{method:'POST',body:{requestId:'retained-request-id'}}),value=>value.status===status&&value.code===code&&value.message==='A useful student-facing message');
  }
});

test('network and invalid API results cannot be presented as generated success',async()=>{
  const missing=Learning.create({fetch:async()=>{throw Error('internal provider credential detail');}});
  await assert.rejects(missing.api('/projects'),value=>value.code==='network_error'&&!value.message.includes('credential'));
  for(const result of [new Response('<h1>Proxy failure</h1>',{status:502}),Response.json([]),Response.json(null)]){
    const client=Learning.create({fetch:async()=>result});await assert.rejects(client.api('/status'),value=>value.code==='invalid_response');
  }
});

test('source input requires an explicit HTTPS URL and source title',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,hello','https://user:secret@example.com/','/relative','http://example.com/'])assert.equal(Learning.safeURL(url),null,url);
  assert.equal(Learning.safeURL('https://example.com/source'),'https://example.com/source');
  assert.throws(()=>Learning.sourceValues([{title:'Only a title'}]),/https/);
  assert.throws(()=>Learning.sourceValues([{url:'https://example.com/'}]),/title/);
  assert.throws(()=>Learning.sourceValues(Array.from({length:9},()=>({url:'https://example.com/',title:'Source'}))),/eight/);
  assert.deepEqual(Learning.sourceValues([{url:'',title:'',excerpt:''},{url:'https://example.com/source',title:' A real title ',excerpt:' A relevant passage '}]),[{url:'https://example.com/source',title:'A real title',excerpt:'A relevant passage'}]);
});

test('checkout redirects accept only the expected secure hosted-checkout origin',()=>{
  assert.equal(Learning.checkoutURL('https://checkout.stripe.com/c/pay/cs_test_fixture'),'https://checkout.stripe.com/c/pay/cs_test_fixture');
  for(const value of ['http://checkout.stripe.com/c/pay/one','https://checkout.stripe.com.evil.example/pay','https://evil.example/?next=checkout.stripe.com','https://user:secret@checkout.stripe.com/c/pay/one','javascript:alert(1)','/billing/success','https://checkout.stripe.com:444/c/pay/one'])assert.equal(Learning.checkoutURL(value),null,value);
});

test('untrusted student and model content is escaped rather than executed as markup',()=>{
  const attack='</textarea><img src=x onerror="alert(1)"><script>alert(2)</script>';
  const escaped=Learning.escape(attack);assert(!escaped.includes('<'));assert(!escaped.includes('"'));assert.match(escaped,/&lt;\/textarea&gt;/);
});

test('editable exports preserve actual saved text and validated citations without inventing work',()=>{
  const project={title:'Evidence & argument',artifact:{summary:'My actual argument',content:'A saved draft\n\nWith paragraphs.',sources:[{title:'Real source',url:'https://example.com/read'},{title:'Unsafe URL',url:'javascript:alert(1)'}],nextStep:'Strengthen the evidence'}};
  const output=Learning.markdown(project,{title:'Management',provider:'My college'});
  assert.match(output,/A saved draft\n\nWith paragraphs/);assert.match(output,/https:\/\/example.com\/read/);assert(!output.includes('javascript:'));assert.match(output,/Strengthen the evidence/);
  assert.equal(Learning.markdown({title:'Empty project'},{}),'# Empty project\n');
  for(const value of ['../../private','<script>','💙',''])assert.match(Learning.filename(value,'txt'),/^[A-Za-z0-9-]+\.txt$/);
});

test('new workspace never persists raw course materials or fabricates payment access in the browser',()=>{
  const ui=readFileSync(new URL('./dist/learn.js','file://'+__filename),'utf8'),transport=readFileSync(new URL('./dist/learning-client.js','file://'+__filename),'utf8');
  for(const source of [ui,transport])assert(!/\b(?:localStorage|sessionStorage|indexedDB)\s*[.(]/.test(source));
  assert(!/paid\s*[:=]\s*true|payment_status\s*[:=]/.test(ui));assert.match(ui,/requestId:request\.requestId/);
  const html=readFileSync(new URL('./dist/learn.html','file://'+__filename),'utf8');assert.match(html,/noindex,nofollow,noarchive/);assert.match(html,/type="url"/);assert.match(html,/Source checks cover supplied passages/);
});
