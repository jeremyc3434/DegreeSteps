import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {OWNER_CONTENT_DDL} from '../db/owner-content-schema.mjs';
import {handleOwnerContent,publicOwnerContent,ownerContentOverview,ownerContentSitemap} from './owner-content.mjs';
const require=createRequire(import.meta.url),policy=require('../dist/provider-offers.js');
const base=JSON.parse(readFileSync(new URL('../dist/data/student-offers.json',import.meta.url),'utf8'));
const now=Date.parse('2026-11-25T12:00:00Z');
const source={title:'Published university transfer policy',url:'https://www.liberty.edu/registrar/transfer-students/',checkedOn:'2026-11-25'};
const article=extra=>({title:'Build a transfer plan you can use',slug:'build-a-transfer-plan',description:'Understand how course choices fit your degree before paying for another class.',blocks:[{type:'heading',level:2,text:'Start with your goal'},{type:'paragraph',text:'Compare the current requirements and your existing courses.'}],sources:[source],...extra});
function fixture(t){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');sqlite.exec(readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'));sqlite.exec(OWNER_CONTENT_DDL);sqlite.exec('CREATE TABLE test_content_audit(action TEXT,target_type TEXT,target_id TEXT,details TEXT)');t.after(()=>sqlite.close());
 const DB={prepare(sql){assert.doesNotMatch(sql,/\b(?:CREATE|ALTER|DROP)\b/i,'No runtime DDL');const query=sqlite.prepare(sql);return{bind:(...args)=>({first:async()=>query.get(...args)||null,all:async()=>({results:query.all(...args)}),run:async()=>({meta:{changes:Number(query.run(...args).changes)}})})};},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const query of statements)results.push(await query.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
 const env={OWNER_OFFER_POLICY:policy,OWNER_PUBLIC_DATA:async kind=>kind==='offers'?base:null};
 const context=url=>({db:DB,user:{id:'pinned-owner'},ownerAuthorized:true,env,url:new URL(url),now,publicOrigin:'https://degreesteps.com',json:(value,status=200)=>new Response(JSON.stringify(value),{status}),fail(status,message){throw Object.assign(Error(message),{status});},async readJson(request,max){const raw=await request.text();if(Buffer.byteLength(raw)>max)throw Object.assign(Error('Too large'),{status:413});return JSON.parse(raw);},audit(action,targetType,targetId,details){return DB.prepare('INSERT INTO test_content_audit(action,target_type,target_id,details) SELECT ?,?,?,? WHERE changes()>0').bind(action,targetType,targetId,JSON.stringify(details));}});
 async function call(path,{method='GET',body}={}){const request=new Request('https://degreesteps.com/api/owner/content'+path,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});try{const response=await handleOwnerContent(request,env,context(request.url));return{status:response.status,body:await response.json()};}catch(error){if(error.status)return{status:error.status,body:{error:error.message}};throw error;}}
 async function publicCall(path,{method='GET'}={}){const request=new Request('https://degreesteps.com'+path,{method});return publicOwnerContent(request,env,context(request.url));}
 function user(id){sqlite.prepare('INSERT INTO community_users(id,alias,role,created_at,updated_at) VALUES(?,?,\'member\',1,1)').run(id,id);}
 function post(id,author,{deleted=false}={}){sqlite.prepare('INSERT INTO community_posts(id,user_id,context,kind,title,body,url,created_at,updated_at,deleted_at) VALUES(?,?,\'school:wgu\',\'question\',\'A useful planning question\',\'Example situation: I have existing credits and need a degree.\',\'https://degreesteps.com/programs.html\',1,2,?)').run(id,author,deleted?3:null);}
 async function create(type,value){const result=await call('/'+type,{method:'POST',body:{content:value}});assert.equal(result.status,201,JSON.stringify(result.body));return result.body.item;}
 async function publish(type,item){assert.equal((await call('/'+type+'/'+item.id+'/review',{method:'POST',body:{expectedRevision:item.revision,note:'Checked the cited policy and dates.'}})).status,200);return call('/'+type+'/'+item.id+'/publish',{method:'POST',body:{expectedRevision:item.revision}});}
 return{sqlite,DB,env,context,call,publicCall,user,post,create,publish};
}

test('CMS drafts preview safely, require exact review, publish indexable pages and retain the live revision during edits',async t=>{
 const f=fixture(t),draft=await f.create('articles',article({title:'<script>Student guide</script>',blocks:[{type:'paragraph',text:'<img src=x onerror=alert(1)> is text, never executable markup.'}]}));
 assert.equal(await f.publicCall('/insights/build-a-transfer-plan/'),null);
 assert.equal((await f.call('/articles/'+draft.id+'/publish',{method:'POST',body:{expectedRevision:1}})).status,409);
 const preview=await f.call('/articles/'+draft.id+'/preview',{method:'POST',body:{expectedRevision:1}});
 assert.match(preview.body.html,/noindex,nofollow/);assert.match(preview.body.html,/&lt;script&gt;/);assert.doesNotMatch(preview.body.html,/<img src=x/);assert.equal(preview.body.previewOnly,true);
 assert.equal((await f.publish('articles',draft)).status,200);
 const response=await f.publicCall('/insights/build-a-transfer-plan/'),html=await response.text();
 assert.equal(response.status,200);assert.match(html,/<link rel="canonical" href="https:\/\/degreesteps.com\/insights\/build-a-transfer-plan\/">/);assert.doesNotMatch(html,/noindex/);assert.match(html,/name="description"/);assert.match(html,/<h1>/);assert.match(html,/Owner reviewed 2026-11-25/);assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
 const edit=await f.call('/articles/'+draft.id,{method:'PATCH',body:{expectedRevision:1,content:article({title:'A changed draft title'})}});assert.equal(edit.status,200);assert.equal(edit.body.item.revision,2);assert.equal(edit.body.item.reviewedRevision,null);assert.equal(edit.body.item.hasUnpublishedChanges,true);
 const stillLive=await(await f.publicCall('/insights/build-a-transfer-plan/')).text();assert.match(stillLive,/&lt;script&gt;Student guide/);assert.doesNotMatch(stillLive,/A changed draft title/);assert.match(stillLive,/Owner reviewed 2026-11-25/);
 assert.equal((await f.call('/articles/'+draft.id+'/publish',{method:'POST',body:{expectedRevision:2}})).status,409);
 assert.equal((await f.call('/articles/'+draft.id,{method:'PATCH',body:{expectedRevision:2,content:article({slug:'break-the-old-link'})}})).status,409);
 assert.equal((await f.publish('articles',edit.body.item)).status,200);
 assert.match(await(await f.publicCall('/insights/build-a-transfer-plan/')).text(),/A changed draft title/);
 const index=await(await f.publicCall('/api/content/articles')).json();assert.equal(index.items.length,1);assert.equal(index.items[0].revision,2);assert.equal(index.items[0].content,undefined);
 const sitemap=await ownerContentSitemap(f.context('https://degreesteps.com'));assert.deepEqual(sitemap.items.map(x=>x.url),['https://degreesteps.com/insights/build-a-transfer-plan/']);
 const head=await f.publicCall('/insights/build-a-transfer-plan/',{method:'HEAD'});assert.equal(await head.text(),'');
 assert.equal((await f.call('/articles/'+draft.id+'/archive',{method:'POST',body:{expectedRevision:2}})).status,200);assert.equal(await f.publicCall('/insights/build-a-transfer-plan/'),null);assert.deepEqual((await ownerContentSitemap(f.context('https://degreesteps.com'))).items,[]);
});

test('content revisions reject stale writes, duplicates, unknown fields, private URLs and executable block schemas',async t=>{
 const f=fixture(t),draft=await f.create('articles',article());
 const before=f.sqlite.prepare('SELECT COUNT(*) AS n FROM owner_content_versions').get().n;
 assert.equal((await f.call('/articles/'+draft.id,{method:'PATCH',body:{expectedRevision:99,content:article()}})).status,409);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM owner_content_versions').get().n,before);
 assert.equal((await f.call('/articles',{method:'POST',body:{content:article()}})).status,409);
 for(const value of [article({html:'<h1>No</h1>'}),article({blocks:[{type:'html',text:'<script>bad</script>'}]}),article({sources:[{...source,url:'https://name:secret@liberty.edu/private'}]}),article({sources:[{...source,url:'https://127.0.0.1/private'}]}),article({sources:[{...source,url:'javascript:alert(1)'}]}),article({sources:[{...source,checkedOn:'2026-11-26'}]})])assert.equal((await f.call('/articles',{method:'POST',body:{content:value}})).status,400);
 const details=await f.call('/articles/'+draft.id);assert.equal(details.body.versions[0].action,'create');assert.equal(details.body.versions[0].actorId,'pinned-owner');
 const audits=f.sqlite.prepare('SELECT * FROM test_content_audit').all();assert.equal(audits.length,1);assert.doesNotMatch(audits[0].details,/Compare the|Published university/);
});

test('FAQs use reviewed public snapshots and campaign records cannot trigger delivery or accept arbitrary recipients',async t=>{
 const f=fixture(t),faq=await f.create('faqs',{question:'Does every credit transfer?',slug:'do-credits-transfer',answer:'Receiving schools decide how each course fits their requirements.',category:'Transfers',sources:[]});
 assert.equal((await f.publish('faqs',faq)).status,400);
 const edit=await f.call('/faqs/'+faq.id,{method:'PATCH',body:{expectedRevision:1,content:{...faq.content,sources:[source]}}});assert.equal((await f.publish('faqs',edit.body.item)).status,200);
 const index=await(await f.publicCall('/api/content/faqs')).json();assert.equal(index.items[0].answer,faq.content.answer);
 const campaign=await f.create('campaigns',{name:'New student guide',subject:'Plan your next course',preheader:'One useful next step',body:'Compare the course options in your saved degree plan before paying.',ctaLabel:'Open my plan',ctaUrl:'https://degreesteps.com/plan.html',audience:'opted-in-students',channel:'email'});
 const preview=await f.call('/campaigns/'+campaign.id+'/preview',{method:'POST',body:{expectedRevision:1}});assert.match(preview.body.html,/No messages will be sent/);
 assert.equal((await f.publish('campaigns',campaign)).status,405);
 assert.equal((await f.call('/campaigns/'+campaign.id+'/send',{method:'POST',body:{expectedRevision:1}})).status,405);
 assert.equal((await f.call('/campaigns',{method:'POST',body:{content:{...campaign.content,recipients:['someone@example.com']}}})).status,400);
 assert.equal((await ownerContentOverview(f.context('https://degreesteps.com'))).campaignSendingEnabled,false);
});

test('provider offer overlays reuse the reviewed normalizer, cannot change trusted hosts, and require review before publication',async t=>{
 const f=fixture(t),offer=structuredClone(base.offers[0]);offer.id='reviewed-owner-offer';offer.title='Reviewed public provider offer';
 const draft=await f.create('offers',{offer});assert.equal((await(await f.publicCall('/data/student-offers.json')).json()).offers.some(x=>x.id===offer.id),false);
 assert.equal((await f.call('/offers/'+draft.id+'/publish',{method:'POST',body:{expectedRevision:1}})).status,409);
 assert.equal((await f.publish('offers',draft)).status,200);
 const publicOffers=await(await f.publicCall('/data/student-offers.json')).json();assert.equal(publicOffers.offers.find(x=>x.id===offer.id).code,null);assert.deepEqual(publicOffers.providers,base.providers);assert.equal(policy.normalize(publicOffers).offers.length,2);
 for(const bad of [{...offer,id:'evil',offerUrl:'https://fake-coupons.com/code'},{...offer,id:'evil',sourceUrl:'https://study.com.evil.com/code'},{...offer,id:'evil',provider:'Fake school'},{...offer,id:'evil',code:'<script>'},{...offer,id:'evil',terms:{...offer.terms,complete:true}}])assert.equal((await f.call('/offers',{method:'POST',body:{content:{offer:bad}}})).status,400);
 const expired=await f.create('offers',{offer:{...offer,id:'expired-offer',reviewUntil:'2026-11-25',expiresAt:'2026-11-25T00:00:00Z'}});assert.equal((await f.publish('offers',expired)).status,400);
 const paused=await f.create('offers',{offer:{...offer,id:base.offers[0].id,status:'paused'}});assert.equal((await f.publish('offers',paused)).status,200);
 const registry=await(await f.publicCall('/data/student-offers.json')).json();assert.equal(registry.offers.find(x=>x.id===base.offers[0].id).status,'paused');assert.equal(policy.offersFor('Study.com',{registry,asOf:new Date(now)}).some(x=>x.id===base.offers[0].id),false);
});

test('starter editing preserves reserved guide identity, student content and moderation removals',async t=>{
 const f=fixture(t);for(const id of ['ds-guide-planning','ds-guide-transfers','student-a'])f.user(id);
 f.post('starter-active','ds-guide-planning');f.post('starter-removed','ds-guide-planning',{deleted:true});f.post('real-student','student-a');
 f.sqlite.prepare("INSERT INTO community_comments(id,user_id,context,parent_id,body,created_at,updated_at,deleted_at) VALUES('guide-answer','ds-guide-transfers','post:starter-active',NULL,'A prepared guide answer with a specific next step.',1,2,NULL),('student-answer','student-a','post:starter-active',NULL,'My real experience belongs to me.',1,2,NULL),('guide-removed','ds-guide-transfers','post:starter-active',NULL,'A removed guide answer must stay removed.',1,2,3)").run();
 f.sqlite.prepare("INSERT INTO community_reactions(post_id,user_id,reaction,created_at) VALUES('starter-active','student-a','like',1)").run();
 const before=f.sqlite.prepare("SELECT * FROM community_comments WHERE id='student-answer'").get();
 const list=await f.call('/starters');assert.equal(list.body.items.length,1);assert.equal(list.body.items[0].trustedGuide,true);assert.equal(list.body.items[0].guideAlias,'DegreeSteps Planning Guide');
 const detail=await f.call('/starters/starter-active');assert.equal(detail.body.replies.length,1);
 const edit=await f.call('/starters/starter-active',{method:'PATCH',body:{expectedRevision:2,title:'Can I use these prior courses?',body:'Example situation: I have existing courses and want to avoid repeating them.',url:'https://degreesteps.com/programs.html'}});assert.equal(edit.status,200);assert.equal(edit.body.item.guideId,'ds-guide-planning');
 assert.equal((await f.call('/starters/starter-active',{method:'PATCH',body:{expectedRevision:2,title:'Stale question',body:'Example situation: a stale edit should not succeed.',url:null}})).status,409);
 assert.equal((await f.call('/starters/starter-active/comments/guide-answer',{method:'PATCH',body:{expectedRevision:2,body:'Here is an updated prepared answer with a useful next step.'}})).status,200);
 assert.equal((await f.call('/starters/starter-active/comments/student-answer',{method:'PATCH',body:{expectedRevision:2,body:'The owner cannot rewrite a student.'}})).status,404);
 assert.equal((await f.call('/starters/starter-active/comments/guide-removed',{method:'PATCH',body:{expectedRevision:2,body:'Do not revive removed content.'}})).status,404);
 assert.equal((await f.call('/starters/starter-removed')).status,404);assert.equal((await f.call('/starters/real-student')).status,404);
 assert.deepEqual(f.sqlite.prepare("SELECT * FROM community_comments WHERE id='student-answer'").get(),before);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM community_reactions').get().n,1);
 assert.equal((await f.call('/starters/starter-active/archive',{method:'POST',body:{expectedRevision:edit.body.item.revision}})).status,200);assert.equal((await f.call('/starters/starter-active')).status,404);
 assert.equal(f.sqlite.prepare("SELECT user_id FROM community_posts WHERE id='starter-active'").get().user_id,'ds-guide-planning');assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM community_users').get().n,3);
});

test('content namespace delegates unrelated owner routes and requires the central pinned-owner proof',async t=>{
 const f=fixture(t),other=new Request('https://degreesteps.com/api/owner/search-console');
 assert.equal(await handleOwnerContent(other,f.env,{...f.context(other.url),url:undefined,user:null,ownerAuthorized:false}),null);
 const request=new Request('https://degreesteps.com/api/owner/content/articles');
 await assert.rejects(()=>handleOwnerContent(request,f.env,{...f.context(request.url),ownerAuthorized:false}),error=>error.status===403);
});

test('an empty insights index stays out of search results and points to existing guides',async t=>{
 const f=fixture(t),response=await f.publicCall('/insights/'),html=await response.text();assert.equal(response.status,200);
 assert.match(html,/<meta name="robots" content="noindex, follow">/);assert.match(html,/href="\/guides\/"/);assert.match(html,/New guides will appear here after review/);
});

test('public insights index lists only published snapshots and sitemap selects bounded metadata',async t=>{
 const f=fixture(t),one=await f.create('articles',article({title:'First reviewed guide'}));await f.publish('articles',one);
 await f.create('articles',article({slug:'private-draft-guide',title:'A private draft must stay private'}));
 const second=await f.create('articles',article({slug:'second-published-guide',title:'Second reviewed guide'}));await f.publish('articles',second);
 const response=await f.publicCall('/insights/?limit=1'),html=await response.text();assert.equal(response.status,200);assert.match(html,/href="https:\/\/degreesteps.com\/insights\/"/);assert.match(html,/href="\/blog\/"/);assert.match(html,/href="\/resources\/"/);assert.doesNotMatch(html,/A private draft/);assert.match(html,/More guides/);assert.doesNotMatch(html,/noindex/);
 const next=html.match(/href="(\/insights\/\?cursor=[^"]+)"/)[1];assert.equal((await f.publicCall(next)).status,200);
 const queries=[],db={...f.DB,prepare(sql){queries.push(sql);return f.DB.prepare(sql);}};
 const page=await ownerContentSitemap({...f.context('https://degreesteps.com'),db},{limit:1});assert.equal(page.items.length,1);assert.ok(page.cursor);assert.match(queries[0],/^SELECT id,type,slug,published_at FROM/);assert.doesNotMatch(queries[0],/SELECT \*/);
 const last=await ownerContentSitemap(f.context('https://degreesteps.com'),{limit:1,cursor:page.cursor});assert.equal(last.items.length,1);assert.notEqual(last.items[0].url,page.items[0].url);
});

test('expired published overrides cannot resurrect older active static offers with the same ID',async t=>{
 const f=fixture(t),offer={...structuredClone(base.offers[0]),title:'New terms replace the older public offer',code:'OWNERTERMS',expiresAt:'2026-11-26T00:00:00Z'};
 const draft=await f.create('offers',{offer});assert.equal((await f.publish('offers',draft)).status,200);
 const request=new Request('https://degreesteps.com/data/student-offers.json'),ctx={...f.context(request.url),now:Date.parse('2026-11-27T12:00:00Z')};
 const response=await publicOwnerContent(request,f.env,ctx),registry=await response.json();assert.equal(registry.offers.find(row=>row.id===offer.id).code,'OWNERTERMS');assert.equal(policy.offersFor('Study.com',{registry,asOf:new Date(ctx.now)}).some(row=>row.id===offer.id),false);
});
