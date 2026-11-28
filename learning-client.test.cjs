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

const feedbackProject='11111111-1111-4111-8111-111111111111',feedbackRequest='22222222-2222-4222-8222-222222222222';
const feedbackUsage=(rating=null,reason=null)=>({workflow:'learning-homework',requestId:feedbackRequest,feedback:{rating,reason}});

test('homework feedback waits for confirmation, supports changes and can be cleared',async()=>{
  const calls=[];let release,hold=true;
  const client=Learning.create({fetch:async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,options,body});const result=Response.json({runUsage:feedbackUsage(body.rating==='clear'?null:body.rating,body.reason)});return hold?new Promise(resolve=>{release=()=>resolve(result);}):result;}});
  const controller=Learning.feedbackController(client,feedbackProject,{...feedbackUsage(),prompt:'Private course assignment that must not be sent as feedback',inputTokens:999999});
  const pending=controller.update('helpful');
  assert.deepEqual(controller.snapshot(),{pending:true,feedback:{rating:null,reason:null}},'A click must not look saved before the server confirms it');
  await controller.update('nothelpful','unclear_steps');assert.equal(calls.length,1,'A pending write cannot produce another rating request');
  release();assert.deepEqual(await pending,{pending:false,feedback:{rating:'helpful',reason:null}});hold=false;
  await controller.update('nothelpful','unclear_steps');assert.deepEqual(controller.snapshot().feedback,{rating:'nothelpful',reason:'unclear_steps'});
  await controller.update('helpful','unclear_steps');assert.deepEqual(controller.snapshot().feedback,{rating:'helpful',reason:null},'Changing to Helpful removes the old negative reason');
  await controller.update('clear');assert.deepEqual(controller.snapshot().feedback,{rating:null,reason:null});
  assert.equal(calls[0].url,'/api/learning/projects/'+feedbackProject+'/history/'+feedbackRequest+'/feedback');
  for(const {options,body}of calls){assert.equal(options.headers['X-Learning-Request'],'1');assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');assert.deepEqual(Object.keys(body).sort(),['rating','reason']);assert(!JSON.stringify(body).includes('Private course'));}
  assert.deepEqual(calls.map(row=>row.body),[{rating:'helpful',reason:null},{rating:'nothelpful',reason:'unclear_steps'},{rating:'helpful',reason:null},{rating:'clear',reason:null}]);
});

test('failed or mismatched feedback responses preserve the previous saved rating',async()=>{
  let mode='offline',calls=0;
  const client=Learning.create({fetch:async()=>{calls++;if(mode==='offline')throw Error('network unavailable');if(mode==='mismatched')return Response.json({runUsage:{...feedbackUsage(),requestId:'33333333-3333-4333-8333-333333333333'}});return Response.json({runUsage:feedbackUsage('nothelpful','wrong_answer')});}});
  const controller=Learning.feedbackController(client,feedbackProject,feedbackUsage('helpful'));
  await assert.rejects(controller.update('nothelpful','wrong_answer'),value=>value.code==='network_error');
  assert.deepEqual(controller.snapshot(),{pending:false,feedback:{rating:'helpful',reason:null}});
  mode='saved';await controller.update('nothelpful','wrong_answer');assert.equal(controller.snapshot().feedback.rating,'nothelpful');
  mode='mismatched';await assert.rejects(controller.update('clear'),/could not be confirmed/);assert.deepEqual(controller.snapshot().feedback,{rating:'nothelpful',reason:'wrong_answer'});
  await assert.rejects(controller.update('nothelpful','My private assignment answer'),/Choose a reason/);assert.equal(calls,3,'Free-text reasons must be rejected before any request');
});

test('feedback eligibility requires the homework receipt and accepts only fixed metadata',()=>{
  assert.deepEqual(Learning.feedbackReceipt({...feedbackUsage(),inputTokens:99999,model:'technical-model-detail',studentNotes:'Private notes'}),{requestId:feedbackRequest,feedback:{rating:null,reason:null}});
  for(const value of [{...feedbackUsage(),workflow:'learning-writing'},{...feedbackUsage(),requestId:'not-a-server-request'},{...feedbackUsage(),feedback:{rating:'passed',reason:null}},{...feedbackUsage(),feedback:{rating:'helpful',reason:'wrong_answer'}}])assert.equal(Learning.feedbackReceipt(value),null);
  assert.throws(()=>Learning.feedbackController({api(){}},'wrong-project',feedbackUsage()),/not available/);
  assert.deepEqual(Learning.feedbackBody('nothelpful','source_issue'),{rating:'nothelpful',reason:'source_issue'});
  assert.equal(Learning.feedbackReasons.unnatural_style,'Writing feels unnatural');
  assert.deepEqual(Learning.feedbackBody('nothelpful','unnatural_style'),{rating:'nothelpful',reason:'unnatural_style'});
  assert.deepEqual(Learning.feedbackReceipt(feedbackUsage('nothelpful','unnatural_style')).feedback,{rating:'nothelpful',reason:'unnatural_style'});
  assert.deepEqual(Learning.feedbackBody('clear','source_issue'),{rating:'clear',reason:null});
  assert.throws(()=>Learning.feedbackBody('a raw assignment response'),/Choose Helpful/);
});

test('Word export review prefills only provided document and account details',()=>{
  const artifact=Object.freeze({content:'An exact quotation: “The wording stays unchanged.” [S1]',assignmentFormat:{profile:'apa7'},documentMetadata:{title:'Actual assignment title',studentName:'Avery Smith',instructor:'Dr. Rivera',date:'November 28, 2026',lastName:'Smith'}}),project=Object.freeze({title:'My saved project',artifact});
  const metadata=Learning.wordMetadata(project,{title:'Business 101'},{displayName:'Another provided account name',alias:'Public pen name'});
  assert.deepEqual(metadata,{title:'Actual assignment title',studentName:'Avery Smith',instructor:'Dr. Rivera',institution:'',course:'Business 101',date:'November 28, 2026',lastName:'Smith'});
  assert.equal(artifact.content,'An exact quotation: “The wording stays unchanged.” [S1]');
  assert.equal(artifact.assignmentFormat.profile,'apa7');
});

test('Word metadata never invents a school, instructor, date or surname',()=>{
  const project={title:'A paper',artifact:{content:'My saved work'}};
  assert.deepEqual(Learning.wordMetadata(project,{title:'Management'},{displayName:'Taylor Jones'}),{title:'A paper',studentName:'Taylor Jones',instructor:'',institution:'',course:'Management',date:'',lastName:''});
  assert.equal(Learning.wordMetadata(project,{}, {alias:'A public alias'}).studentName,'');
  assert.equal(Learning.wordMetadata(project,{}, {displayName:'Student'}).studentName,'');
  assert.equal(Learning.wordMetadata({title:'A'.repeat(250),artifact:{documentMetadata:{date:123}}},{},{}).title.length,200);
  assert.equal(Learning.wordMetadata({artifact:{documentMetadata:{date:123}}},{},{}).date,'');
});

test('review flags expose only bounded actionable checks and never invent generic verification work',()=>{
  const personal={id:'personal-example',kind:'student-input',severity:'input',message:'Your assignment asks for an example from your experience.',nextAction:'Add one example from your work or life',target:'notes'};
  assert.deepEqual(Learning.reviewFlags({review:{status:'needs-review',flags:[personal]}}),[{id:'personal-example',kind:'student-input',severity:'input',target:'notes',message:personal.message,nextAction:personal.nextAction}]);
  assert.deepEqual(Learning.reviewFlags({content:'2 + 2 = 4'}),[],'A math explanation does not get generic source warnings');
  assert.deepEqual(Learning.reviewFlags({review:{flags:[{...personal,target:'javascript:alert(1)'},{...personal,severity:'99% confidence'},{...personal,nextAction:''}]}}),[]);
  assert.equal(Learning.reviewFlags({review:{flags:Array.from({length:20},()=>personal)}}).length,8);
  const artifact={content:'An actual saved paper with exact quotes. [S1]',review:{flags:[personal]}};Learning.reviewFlags(artifact);assert.equal(artifact.content,'An actual saved paper with exact quotes. [S1]');
});

test('research retry preserves the current assignment or study workflow',()=>{
  for(const [kind,current,expected]of [['writing','plan','plan'],['writing','draft','draft'],['writing','review','draft'],['presentation','plan','plan'],['presentation','review','presentation'],['discussion','plan','plan'],['discussion','discussion','discussion'],['study','study','study'],['study','quiz','quiz'],['quiz','flashcards','flashcards'],['flashcards','quiz','quiz'],['quiz','plan','quiz']])assert.equal(Learning.researchRetryAction(kind,current),expected,kind+'/'+current);
  assert.equal(Learning.researchRetryAction('unknown','review'),null);
});
