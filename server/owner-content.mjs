/** Owner CMS. Authentication/CSRF are enforced by the single-owner router.
 * Public responses use only explicitly reviewed, published immutable snapshots. */
import {faviconLinks} from './site-icons.mjs';
const TYPES=new Set(['articles','faqs','campaigns','offers']);
const GUIDES=new Map([['ds-guide-planning','DegreeSteps Planning Guide'],['ds-guide-transfers','DegreeSteps Transfer Guide'],['ds-guide-courses','DegreeSteps Course Guide'],['ds-guide-campus','DegreeSteps Campus Guide'],['ds-guide-military','DegreeSteps Military Guide'],['ds-guide-careers','DegreeSteps Career Guide'],['ds-guide-money','DegreeSteps Cost Guide'],['ds-guide-momentum','DegreeSteps Study Guide']]);
const GUIDE_SQL=[...GUIDES.keys()].map(id=>"'"+id+"'").join(',');
const ID=/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stmt=(db,sql,...values)=>db.prepare(sql).bind(...values);
const first=(db,sql,...values)=>stmt(db,sql,...values).first();
const all=async(db,sql,...values)=>(await stmt(db,sql,...values).all()).results||[];
const changed=result=>(result?.meta?.changes??result?.changes??0)>0;
const timestamp=ctx=>Number.isSafeInteger(ctx.now)?ctx.now:Date.now();
const fail=(ctx,status,message)=>ctx.fail(status,message);
function only(ctx,value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))fail(ctx,400,'Use the supported content fields.');return value;}
function text(ctx,value,name,min,max){if(typeof value!=='string')fail(ctx,400,name+' must be text.');const result=value.trim();if(result.length<min||result.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result))fail(ctx,400,name+' must be '+min+'–'+max+' characters.');return result;}
function day(ctx,value,name='Review date'){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value||value>new Date(timestamp(ctx)).toISOString().slice(0,10))fail(ctx,400,name+' must be a real date, no later than today.');return value;}
function slug(ctx,value){const result=text(ctx,value,'Slug',3,120);if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result)||['index','admin','api'].includes(result))fail(ctx,400,'Use a unique lowercase slug with words separated by hyphens.');return result;}
function safeURL(ctx,value,{optional=false}={}){
 if(optional&&(value===null||value===undefined||value===''))return null;
 const raw=text(ctx,value,'URL',8,2048);let url;try{url=new URL(raw);}catch{fail(ctx,400,'Use a complete public HTTPS URL.');}
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(url.hostname)||/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname))fail(ctx,400,'Use a public HTTPS URL without credentials, ports or fragments.');return url.href;
}
function origin(ctx,env={}){const value=ctx.publicOrigin||env.PUBLIC_SITE_URL||'https://degreesteps.com';try{const url=new URL(value);if(url.protocol==='https:'&&!url.username&&!url.password&&!url.port)return url.origin;}catch{}return'https://degreesteps.com';}
function sources(ctx,value){if(!Array.isArray(value)||value.length>20)fail(ctx,400,'Use up to 20 source references.');return value.map(source=>{only(ctx,source,['title','url','checkedOn']);return{title:text(ctx,source.title,'Source title',3,200),url:safeURL(ctx,source.url),checkedOn:day(ctx,source.checkedOn)};});}
function blocks(ctx,value){if(!Array.isArray(value)||value.length<1||value.length>100)fail(ctx,400,'Use 1–100 structured text blocks.');return value.map(block=>{
 if(block?.type==='paragraph'){only(ctx,block,['type','text']);return{type:'paragraph',text:text(ctx,block.text,'Paragraph',1,5000)};}
 if(block?.type==='heading'){only(ctx,block,['type','level','text']);if(![2,3].includes(block.level))fail(ctx,400,'Article headings must be level two or three.');return{type:'heading',level:block.level,text:text(ctx,block.text,'Heading',1,200)};}
 if(block?.type==='list'){only(ctx,block,['type','items']);if(!Array.isArray(block.items)||!block.items.length||block.items.length>30)fail(ctx,400,'Lists need 1–30 text items.');return{type:'list',items:block.items.map(value=>text(ctx,value,'List item',1,1000))};}
 fail(ctx,400,'Use paragraphs, headings or lists; raw HTML blocks are not supported.');
 });}
async function offerBase(ctx,env){
 const policy=ctx.offerPolicy||env.OWNER_OFFER_POLICY;
 const raw=ctx.offerRegistry||(ctx.getOfferRegistry?await ctx.getOfferRegistry():typeof env.OWNER_PUBLIC_DATA==='function'?await env.OWNER_PUBLIC_DATA('offers'):null);
 if(!policy||typeof policy.normalize!=='function'||!raw)fail(ctx,503,'The reviewed provider offer policy is unavailable.');
 try{return{policy,base:policy.normalize(raw)};}catch{fail(ctx,503,'The reviewed provider offer registry is unavailable.');}
}
async function content(ctx,env,type,value){
 let result;
 if(type==='articles'){only(ctx,value,['title','slug','description','blocks','sources']);result={title:text(ctx,value.title,'Title',3,160),slug:slug(ctx,value.slug),description:text(ctx,value.description,'Description',20,300),blocks:blocks(ctx,value.blocks),sources:sources(ctx,value.sources||[])};}
 else if(type==='faqs'){only(ctx,value,['question','slug','answer','category','sources']);result={question:text(ctx,value.question,'Question',3,200),slug:slug(ctx,value.slug),answer:text(ctx,value.answer,'Answer',10,6000),category:text(ctx,value.category||'General','Category',2,80),sources:sources(ctx,value.sources||[])};}
 else if(type==='campaigns'){only(ctx,value,['name','subject','preheader','body','ctaLabel','ctaUrl','audience','channel']);if(value.audience!=='opted-in-students'||value.channel!=='email')fail(ctx,400,'Campaigns are email drafts for opted-in students only.');result={name:text(ctx,value.name,'Campaign name',3,120),subject:text(ctx,value.subject,'Subject',3,160),preheader:text(ctx,value.preheader||'','Preheader',0,200),body:text(ctx,value.body,'Body',10,10000),ctaLabel:text(ctx,value.ctaLabel,'Link label',2,100),ctaUrl:safeURL(ctx,value.ctaUrl),audience:'opted-in-students',channel:'email'};}
 else if(type==='offers'){
  only(ctx,value,['offer']);const {base,policy}=await offerBase(ctx,env);
  if(!value.offer||!Object.hasOwn(base.providers,value.offer.provider))fail(ctx,400,'Choose a provider from the reviewed registry; provider hosts cannot be changed here.');
  try{result={offer:policy.normalize({version:1,checkedOn:new Date(timestamp(ctx)).toISOString().slice(0,10),providers:base.providers,offers:[value.offer]}).offers[0]};}catch(error){fail(ctx,400,error.message||'Use the reviewed offer format.');}
  day(ctx,result.offer.checkedOn);
 }else fail(ctx,404,'Content type not found.');
 if(new TextEncoder().encode(JSON.stringify(result)).length>60000)fail(ctx,413,'This content is too large.');return result;
}
const recordSlug=(type,value,id)=>type==='offers'?value.offer.id:type==='campaigns'?id:value.slug;
function publicUrl(row,ctx,env){return row.type==='articles'?origin(ctx,env)+'/insights/'+row.slug+'/':null;}
function item(row,ctx,env){if(!row)return null;return{id:row.id,type:row.type,status:row.status,revision:row.revision,reviewedRevision:row.reviewed_revision,publishedRevision:row.published_revision,hasUnpublishedChanges:row.published_revision!==null&&row.revision!==row.published_revision,content:JSON.parse(row.content_json),publicUrl:publicUrl(row,ctx,env),createdAt:row.created_at,updatedAt:row.updated_at,publishedAt:row.published_at,reviewedAt:row.reviewed_at};}
function revision(ctx,value){if(!Number.isSafeInteger(value)||value<1)fail(ctx,400,'Include the revision you reviewed.');return value;}
const versionStatement=(ctx,row,action,note=null)=>stmt(ctx.db,'INSERT INTO owner_content_versions(id,record_id,type,revision,action,content_json,review_note,actor_id,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE changes()=1',crypto.randomUUID(),row.id,row.type,row.revision,action,row.content_json,note,ctx.user.id,timestamp(ctx));
function auditStatement(ctx,action,id,details={}){return typeof ctx.audit==='function'?ctx.audit('content.'+action,'owner-content',id,details):null;}
async function mutation(ctx,statement,row,action,note=null){const batch=[statement,versionStatement(ctx,row,action,note)],audit=auditStatement(ctx,action,row.id,{type:row.type,revision:row.revision});if(audit)batch.push(audit);let result;try{result=await ctx.db.batch(batch);}catch(error){if(/UNIQUE constraint failed/i.test(error.message))fail(ctx,409,'That slug or offer ID is already in use.');throw error;}if(!changed(result[0]))fail(ctx,409,'This record changed. Reload it before saving.');}
function pageArgs(ctx,url){const raw=url.searchParams.get('limit'),limit=raw===null?30:Number(raw);if(!Number.isSafeInteger(limit)||limit<1||limit>100)fail(ctx,400,'Use a page size from 1 to 100.');let cursor=null;const encoded=url.searchParams.get('cursor');if(encoded){try{cursor=JSON.parse(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')));}catch{fail(ctx,400,'Invalid content page cursor.');}if(!Array.isArray(cursor)||cursor.length!==2||!Number.isSafeInteger(cursor[0])||cursor[0]<0||!ID.test(cursor[1]))fail(ctx,400,'Invalid content page cursor.');}return{limit,cursor};}
const encodeCursor=row=>btoa(JSON.stringify([row.updated_at,row.id])).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function getRecord(ctx,type,id){if(!ID.test(id))fail(ctx,400,'Invalid content ID.');const row=await first(ctx.db,'SELECT * FROM owner_content_records WHERE id=? AND type=?',id,type);if(!row)fail(ctx,404,'Content not found.');return row;}
function htmlResponse(html,{preview=false,etag}={}){return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':preview?'no-store':'public, max-age=60','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",...(preview?{'X-Robots-Tag':'noindex, nofollow'}:{}),...(etag?{ETag:etag}:{})}});}
const blockHTML=block=>block.type==='heading'?'<h'+block.level+'>'+esc(block.text)+'</h'+block.level+'>':block.type==='list'?'<ul>'+block.items.map(value=>'<li>'+esc(value)+'</li>').join('')+'</ul>':'<p>'+esc(block.text).replace(/\n/g,'<br>')+'</p>';
function articleHTML(value,row,ctx,env,{preview=false}={}){
 const canonical=origin(ctx,env)+'/insights/'+value.slug+'/',reviewed=new Date((preview?row.reviewed_at:row.published_reviewed_at)||timestamp(ctx)).toISOString().slice(0,10),reviewLabel=preview&&row.reviewed_revision!==row.revision?'Not yet reviewed':'Owner reviewed '+reviewed,jsonLd=JSON.stringify({'@context':'https://schema.org','@type':'Article',headline:value.title,description:value.description,mainEntityOfPage:canonical,author:{'@type':'Organization',name:'DegreeSteps'},dateModified:new Date(row.published_at||timestamp(ctx)).toISOString()}).replace(/</g,'\\u003c');
 return '<!doctype html><html lang="en"><head>'+faviconLinks+'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(value.title)+' | DegreeSteps</title><meta name="description" content="'+esc(value.description)+'"><link rel="canonical" href="'+esc(canonical)+'">'+(preview?'<meta name="robots" content="noindex,nofollow">':'')+'<style>body{margin:0;background:#f7f9fc;color:#192c43;font:18px/1.7 system-ui,sans-serif}header,main,footer{max-width:760px;margin:auto;padding:24px}header a{font-weight:700}a{color:#3046c7;overflow-wrap:anywhere}h1{font-size:clamp(2rem,5vw,3rem);line-height:1.15;letter-spacing:-.03em}h2{margin-top:2em;line-height:1.3}main{background:white;border-radius:12px}p,li{overflow-wrap:anywhere}.meta{font-size:15px;color:#526174}.preview{padding:12px 16px;background:#edf1ff;border:1px solid #c6cffb}.sources{font-size:16px}a:focus-visible{outline:3px solid #4054f4;outline-offset:4px}@media(max-width:600px){header,main,footer{padding:20px}main{border-radius:0}}</style><script type="application/ld+json">'+jsonLd+'</script></head><body><header><a href="/">DegreeSteps</a> <span aria-hidden="true"> / </span> Student resources</header><main>'+(preview?'<p class="preview">Private preview · This draft has not been published.</p>':'')+'<article><h1>'+esc(value.title)+'</h1><p>'+esc(value.description)+'</p><p class="meta">Prepared by DegreeSteps · '+esc(reviewLabel)+(preview?' · Draft revision '+row.revision:' · Revision '+row.published_revision)+'</p>'+value.blocks.map(blockHTML).join('')+(value.sources.length?'<section class="sources" aria-label="Sources"><h2>Sources</h2><ul>'+value.sources.map(source=>'<li><a href="'+esc(source.url)+'" rel="noopener noreferrer">'+esc(source.title)+'</a> · Reviewed '+esc(source.checkedOn)+'</li>').join('')+'</ul></section>':'')+'</article></main><footer><a href="/programs.html">Find a degree</a> · <a href="/community.html?tab=feed">Ask the community</a></footer></body></html>';
}
function previewHTML(row,ctx,env){const value=JSON.parse(row.content_json);if(row.type==='articles')return articleHTML(value,row,ctx,env,{preview:true});if(row.type==='faqs')return '<article><h1>'+esc(value.question)+'</h1><p>'+esc(value.answer).replace(/\n/g,'<br>')+'</p></article>';if(row.type==='campaigns')return'<article><p>Preview only. No messages will be sent.</p><h1>'+esc(value.subject)+'</h1><p>'+esc(value.preheader)+'</p><p>'+esc(value.body).replace(/\n/g,'<br>')+'</p><a href="'+esc(value.ctaUrl)+'" rel="noopener noreferrer">'+esc(value.ctaLabel)+'</a></article>';const offer=value.offer;return'<article><h1>'+esc(offer.title)+'</h1><p>'+esc(offer.summary)+'</p><p>'+esc(offer.code?'Code: '+offer.code:'No promo code supplied')+'</p><p>'+esc(offer.notes||'Provider eligibility and renewal terms apply.')+'</p><a href="'+esc(offer.offerUrl)+'" rel="noopener noreferrer">View provider offer</a></article>';}

export async function ownerContentOverview(ctx){const rows=await all(ctx.db,'SELECT type,status,COUNT(*) AS count FROM owner_content_records GROUP BY type,status');const counts=Object.fromEntries([...TYPES].map(type=>[type,{draft:0,published:0,archived:0}]));for(const row of rows)if(counts[row.type])counts[row.type][row.status]=row.count;const starters=await first(ctx.db,`SELECT COUNT(*) AS count FROM community_posts WHERE user_id IN (${GUIDE_SQL}) AND deleted_at IS NULL AND kind='question' AND plan_json IS NULL`);return{counts,starterQuestions:starters?.count||0,campaignSendingEnabled:false};}

async function starters(request,ctx,path){
 const url=ctx.url||new URL(request.url),method=request.method;
 if(!path.length&&method==='GET'){
  const {limit,cursor}=pageArgs(ctx,url),where=cursor?' AND (updated_at<? OR (updated_at=? AND id<?))':'',values=cursor?[cursor[0],cursor[0],cursor[1]]:[];
  const rows=await all(ctx.db,`SELECT id,user_id,context,title,body,url,created_at,updated_at FROM community_posts WHERE user_id IN (${GUIDE_SQL}) AND deleted_at IS NULL AND kind='question' AND plan_json IS NULL${where} ORDER BY updated_at DESC,id DESC LIMIT ?`,...values,limit+1);
  return ctx.json({items:rows.slice(0,limit).map(row=>({id:row.id,type:'starter',revision:row.updated_at,guideId:row.user_id,guideAlias:GUIDES.get(row.user_id),trustedGuide:true,context:row.context,content:{title:row.title,body:row.body,url:row.url},createdAt:row.created_at,updatedAt:row.updated_at})),cursor:rows.length>limit?encodeCursor(rows[limit-1]):null});
 }
 if(!ID.test(path[0]||''))fail(ctx,404,'Starter not found.');
 const post=await first(ctx.db,`SELECT * FROM community_posts WHERE id=? AND user_id IN (${GUIDE_SQL}) AND deleted_at IS NULL AND kind='question' AND plan_json IS NULL`,path[0]);if(!post)fail(ctx,404,'Active DegreeSteps starter not found. Removed or student content cannot be edited here.');
 const replies=async()=>all(ctx.db,`SELECT id,user_id,body,updated_at FROM community_comments WHERE context=? AND user_id IN (${GUIDE_SQL}) AND parent_id IS NULL AND deleted_at IS NULL ORDER BY created_at,id`,'post:'+post.id);
 if(path.length===1&&method==='GET')return ctx.json({item:{id:post.id,type:'starter',revision:post.updated_at,guideId:post.user_id,guideAlias:GUIDES.get(post.user_id),trustedGuide:true,context:post.context,content:{title:post.title,body:post.body,url:post.url}},replies:(await replies()).map(row=>({id:row.id,revision:row.updated_at,guideId:row.user_id,guideAlias:GUIDES.get(row.user_id),trustedGuide:true,body:row.body}))});
 const body=await ctx.readJson(request,60000),expected=revision(ctx,body.expectedRevision);let target=post,kind='starter-post',value,query,action='starter-edit';
 if(path.length===3&&path[1]==='comments'&&ID.test(path[2])&&method==='PATCH'){
  only(ctx,body,['expectedRevision','body']);target=await first(ctx.db,`SELECT * FROM community_comments WHERE id=? AND context=? AND user_id IN (${GUIDE_SQL}) AND parent_id IS NULL AND deleted_at IS NULL`,path[2],'post:'+post.id);if(!target)fail(ctx,404,'Active prepared guide answer not found.');kind='starter-comment';value={body:text(ctx,body.body,'Guide answer',10,3000)};
  query=stmt(ctx.db,`UPDATE community_comments SET body=?,updated_at=? WHERE id=? AND updated_at=? AND deleted_at IS NULL AND user_id IN (${GUIDE_SQL}) AND context=? AND parent_id IS NULL AND EXISTS(SELECT 1 FROM community_posts WHERE id=? AND deleted_at IS NULL AND user_id IN (${GUIDE_SQL}))`,value.body,Math.max(timestamp(ctx),target.updated_at+1),target.id,expected,'post:'+post.id,post.id);
 }else if(path.length===1&&method==='PATCH'){
  only(ctx,body,['expectedRevision','title','body','url']);value={title:text(ctx,body.title,'Starter title',3,160),body:text(ctx,body.body,'Starter example',10,6000),url:safeURL(ctx,body.url,{optional:true})};if(!/^Example (?:student )?situation:/i.test(value.body))fail(ctx,400,'Starter questions must begin “Example situation:” so they cannot be mistaken for student posts.');
  query=stmt(ctx.db,`UPDATE community_posts SET title=?,body=?,url=?,updated_at=? WHERE id=? AND updated_at=? AND deleted_at IS NULL AND user_id IN (${GUIDE_SQL}) AND kind='question' AND plan_json IS NULL`,value.title,value.body,value.url,Math.max(timestamp(ctx),post.updated_at+1),post.id,expected);
 }else if(path.length===2&&path[1]==='archive'&&method==='POST'){
  only(ctx,body,['expectedRevision']);value={title:post.title,body:post.body,url:post.url};action='starter-archive';query=stmt(ctx.db,`UPDATE community_posts SET deleted_at=?,updated_at=? WHERE id=? AND updated_at=? AND deleted_at IS NULL AND user_id IN (${GUIDE_SQL})`,timestamp(ctx),Math.max(timestamp(ctx),post.updated_at+1),post.id,expected);
 }else fail(ctx,405,'Use the supported starter edit or archive action.');
 const nextRevision=Math.max(timestamp(ctx),target.updated_at+1),row={id:target.id,type:kind,revision:nextRevision,content_json:JSON.stringify({...value,guideId:target.user_id,context:target.context})};await mutation(ctx,query,row,action);return ctx.json({item:{id:target.id,type:kind,revision:nextRevision,trustedGuide:true,guideId:target.user_id,guideAlias:GUIDES.get(target.user_id),content:value,archived:action==='starter-archive'}});
}

export async function handleOwnerContent(request,env,ctx){
 const url=ctx.url||new URL(request.url);
 if(url.pathname!=='/api/owner/content'&&!url.pathname.startsWith('/api/owner/content/'))return null;
 if(ctx.ownerAuthorized!==true||!ctx.user?.id)fail(ctx,403,'Sign in as the verified owner.');
 const path=url.pathname.replace(/^\/api\/owner\/content\/?/,'').split('/').filter(Boolean),method=request.method;
 if(!path.length&&method==='GET')return ctx.json(await ownerContentOverview(ctx));
 if(path[0]==='starters')return starters(request,ctx,path.slice(1));
 const type=path[0];if(!TYPES.has(type))fail(ctx,404,'Content section not found.');
 if(path.length===1&&method==='GET'){
  const {limit,cursor}=pageArgs(ctx,url),status=url.searchParams.get('status');if(status&&!['draft','published','archived'].includes(status))fail(ctx,400,'Choose draft, published or archived.');
  const clauses=['type=?'],values=[type];if(status){clauses.push('status=?');values.push(status);}if(cursor){clauses.push('(updated_at<? OR (updated_at=? AND id<?))');values.push(cursor[0],cursor[0],cursor[1]);}
  const rows=await all(ctx.db,'SELECT * FROM owner_content_records WHERE '+clauses.join(' AND ')+' ORDER BY updated_at DESC,id DESC LIMIT ?',...values,limit+1);
  return ctx.json({items:rows.slice(0,limit).map(row=>item(row,ctx,env)),cursor:rows.length>limit?encodeCursor(rows[limit-1]):null});
 }
 if(path.length===1&&method==='POST'){
  const body=await ctx.readJson(request,65000);only(ctx,body,['content']);const value=await content(ctx,env,type,body.content),id=crypto.randomUUID(),stamp=timestamp(ctx),row={id,type,slug:recordSlug(type,value,id),status:'draft',revision:1,content_json:JSON.stringify(value),published_revision:null,created_at:stamp,updated_at:stamp};
  const query=stmt(ctx.db,'INSERT INTO owner_content_records(id,type,slug,status,revision,content_json,created_by,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',id,type,row.slug,'draft',1,row.content_json,ctx.user.id,ctx.user.id,stamp,stamp);await mutation(ctx,query,row,'create');return ctx.json({item:item(await getRecord(ctx,type,id),ctx,env)},201);
 }
 const row=await getRecord(ctx,type,path[1]||'');
 if(path.length===2&&method==='GET')return ctx.json({item:item(row,ctx,env),versions:(await all(ctx.db,'SELECT revision,action,actor_id,created_at,review_note FROM owner_content_versions WHERE record_id=? ORDER BY created_at DESC,id DESC LIMIT 30',row.id)).map(value=>({revision:value.revision,action:value.action,actorId:value.actor_id,createdAt:value.created_at,reviewNote:value.review_note}))});
 const body=await ctx.readJson(request,65000),expected=revision(ctx,body.expectedRevision);if(expected!==row.revision)fail(ctx,409,'This record changed. Reload it before saving.');
 if(path.length===2&&method==='PATCH'){
  only(ctx,body,['expectedRevision','content']);const value=await content(ctx,env,type,body.content),next={...row,revision:row.revision+1,content_json:JSON.stringify(value),slug:recordSlug(type,value,row.id)};
  // A live article keeps its URL until archived, preventing silent broken links.
  if(row.published_revision!==null&&row.slug!==next.slug)fail(ctx,409,'The published URL is fixed. Create a new article for a different URL.');
  await mutation(ctx,stmt(ctx.db,"UPDATE owner_content_records SET content_json=?,slug=?,revision=?,reviewed_revision=NULL,reviewed_at=NULL,status=CASE WHEN status='archived' THEN 'draft' ELSE status END,archived_at=NULL,updated_by=?,updated_at=? WHERE id=? AND revision=?",next.content_json,next.slug,next.revision,ctx.user.id,timestamp(ctx),row.id,expected),next,'edit');
 }else if(path.length===3&&path[2]==='preview'&&method==='POST'){
  only(ctx,body,['expectedRevision']);return ctx.json({html:previewHTML(row,ctx,env),title:JSON.parse(row.content_json).title||JSON.parse(row.content_json).question||JSON.parse(row.content_json).subject||JSON.parse(row.content_json).offer?.title,revision:row.revision,publicUrl:publicUrl(row,ctx,env),previewOnly:true});
 }else if(path.length===3&&path[2]==='review'&&method==='POST'){
  only(ctx,body,['expectedRevision','note']);const note=text(ctx,body.note,'Review note',3,2000);if(row.status==='archived')fail(ctx,409,'Save a new draft before reviewing archived content.');await content(ctx,env,type,JSON.parse(row.content_json));
  await mutation(ctx,stmt(ctx.db,'UPDATE owner_content_records SET reviewed_revision=revision,reviewed_at=?,updated_by=?,updated_at=? WHERE id=? AND revision=?',timestamp(ctx),ctx.user.id,timestamp(ctx),row.id,expected),row,'review',note);
 }else if(path.length===3&&path[2]==='publish'&&method==='POST'){
  only(ctx,body,['expectedRevision']);if(type==='campaigns')fail(ctx,405,'Campaigns are drafts only. No delivery or bulk outreach is enabled.');if(row.status==='archived'||row.reviewed_revision!==row.revision)fail(ctx,409,'Review this exact revision before publishing.');const value=await content(ctx,env,type,JSON.parse(row.content_json));if(['articles','faqs'].includes(type)&&!value.sources.length)fail(ctx,400,'Add at least one reviewed source before publishing.');
  if(type==='offers'){const {policy}=await offerBase(ctx,env);if(value.offer.status!=='paused'&&(typeof policy.offerState!=='function'||!['active','advertised'].includes(policy.offerState(value.offer,{asOf:new Date(timestamp(ctx))}))))fail(ctx,400,'Only a currently reviewed, non-expired provider offer can be published.');}
  await mutation(ctx,stmt(ctx.db,"UPDATE owner_content_records SET status='published',published_json=content_json,published_revision=revision,published_reviewed_at=reviewed_at,published_at=?,updated_by=?,updated_at=? WHERE id=? AND revision=? AND reviewed_revision=revision",timestamp(ctx),ctx.user.id,timestamp(ctx),row.id,expected),row,'publish');
 }else if(path.length===3&&path[2]==='archive'&&method==='POST'){
  only(ctx,body,['expectedRevision']);const next={...row,revision:row.revision+1};await mutation(ctx,stmt(ctx.db,"UPDATE owner_content_records SET status='archived',revision=revision+1,reviewed_revision=NULL,reviewed_at=NULL,archived_at=?,updated_by=?,updated_at=? WHERE id=? AND revision=?",timestamp(ctx),ctx.user.id,timestamp(ctx),row.id,expected),next,'archive');
 }else fail(ctx,405,'Use save, preview, review, publish or archive.');
 return ctx.json({item:item(await getRecord(ctx,type,row.id),ctx,env)});
}

async function publicRows(ctx,type,{limit=100,cursor=null}={}){const clause=cursor?' AND (published_at<? OR (published_at=? AND id<?))':'',values=cursor?[cursor[0],cursor[0],cursor[1]]:[];return all(ctx.db,"SELECT * FROM owner_content_records WHERE type=? AND status='published' AND published_json IS NOT NULL"+clause+' ORDER BY published_at DESC,id DESC LIMIT ?',type,...values,limit+1);}
const publicJSON=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=60','X-Content-Type-Options':'nosniff'}});
export async function ownerContentSitemap(ctx,{limit=1000,cursor=null}={}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>1000)fail(ctx,400,'Sitemap page size must be 1–1000.');
 const clause=cursor?' AND (published_at<? OR (published_at=? AND id<?))':'',values=cursor?[cursor[0],cursor[0],cursor[1]]:[];
 const rows=await all(ctx.db,"SELECT id,type,slug,published_at FROM owner_content_records WHERE type='articles' AND status='published' AND published_json IS NOT NULL"+clause+' ORDER BY published_at DESC,id DESC LIMIT ?',...values,limit+1);
 return{items:rows.slice(0,limit).map(row=>({url:publicUrl(row,ctx,ctx.env||{}),lastmod:new Date(row.published_at).toISOString()})),cursor:rows.length>limit?[rows[limit-1].published_at,rows[limit-1].id]:null};
}
function indexHTML(rows,next,ctx,env){
 const site=origin(ctx,env),cards=rows.map(row=>'<article><p class="meta">'+esc(new Date(row.published_at).toISOString().slice(0,10))+'</p><h2><a href="/insights/'+esc(row.slug)+'/">'+esc(row.title)+'</a></h2><p>'+esc(row.description)+'</p><a class="read" href="/insights/'+esc(row.slug)+'/">Read the guide →</a></article>').join('');
 return '<!doctype html><html lang="en"><head>'+faviconLinks+'<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Student insights and practical degree guides | DegreeSteps</title><meta name="description" content="Practical, reviewed guides to choosing courses, saving on college and building a degree around your goals."><link rel="canonical" href="'+esc(site)+'/insights/"><style>body{margin:0;background:#f7f9fc;color:#192c43;font:18px/1.65 system-ui,sans-serif}header,main,footer{max-width:980px;margin:auto;padding:24px}a{color:#3046c7;overflow-wrap:anywhere}header{display:flex;gap:24px;justify-content:space-between;flex-wrap:wrap}nav{display:flex;gap:20px;flex-wrap:wrap}header a,nav a,.read{display:inline-flex;align-items:center;min-height:44px}h1{font-size:clamp(2rem,5vw,3.2rem);line-height:1.12;letter-spacing:-.03em;max-width:22ch}h2{font-size:1.45rem;line-height:1.3;margin:8px 0 12px}p{overflow-wrap:anywhere}.intro{max-width:62ch}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;margin-top:32px}article{background:white;border:1px solid #d9e1ea;border-radius:10px;padding:24px}.meta{font-size:14px;color:#526174;margin:0}.more{display:inline-flex;align-items:center;min-height:44px;margin-top:28px}a:focus-visible{outline:3px solid #4054f4;outline-offset:4px}@media(max-width:650px){header,main,footer{padding:20px}.grid{grid-template-columns:1fr;gap:16px}article{padding:20px}}</style></head><body><header><a href="/">DegreeSteps</a><nav aria-label="Student resources"><a href="/blog/">Blog</a><a href="/resources/">Resources</a><a href="/programs.html">Find a degree</a></nav></header><main><h1>A clearer next step for your degree.</h1><p class="intro">Practical guides to choosing courses, spending less, and making your existing credits count.</p>'+(rows.length?'<section class="grid" aria-label="Published student guides">'+cards+'</section>':'<p>New guides will appear here after review. Explore our <a href="/blog/">blog</a> and <a href="/resources/">student resources</a> in the meantime.</p>')+(next?'<a class="more" href="/insights/?cursor='+esc(next)+'">More guides →</a>':'')+'</main><footer><a href="/community.html?tab=feed">Ask the community</a> · <a href="/">Build your degree plan</a></footer></body></html>';
}
export async function publicOwnerContent(request,env,ctx){
 const url=ctx.url||new URL(request.url);if(!['GET','HEAD'].includes(request.method))return null;
 if(url.pathname==='/insights/'){
  const {limit,cursor}=pageArgs(ctx,url),clause=cursor?' AND (published_at<? OR (published_at=? AND id<?))':'',values=cursor?[cursor[0],cursor[0],cursor[1]]:[];
  const rows=await all(ctx.db,"SELECT id,slug,published_at,json_extract(published_json,'$.title') AS title,json_extract(published_json,'$.description') AS description FROM owner_content_records WHERE type='articles' AND status='published' AND published_json IS NOT NULL"+clause+' ORDER BY published_at DESC,id DESC LIMIT ?',...values,limit+1),next=rows.length>limit?encodeCursor({...rows[limit-1],updated_at:rows[limit-1].published_at}):null;
  const response=htmlResponse(indexHTML(rows.slice(0,limit),next,ctx,env));return request.method==='HEAD'?new Response(null,response):response;
 }
 const article=/^\/insights\/([a-z0-9]+(?:-[a-z0-9]+)*)\/$/.exec(url.pathname);
 if(article){const row=await first(ctx.db,"SELECT * FROM owner_content_records WHERE type='articles' AND slug=? AND status='published' AND published_json IS NOT NULL",article[1]);if(!row)return null;const response=htmlResponse(articleHTML(JSON.parse(row.published_json),row,ctx,env),{etag:'"cms-'+row.id+'-'+row.published_revision+'"'});return request.method==='HEAD'?new Response(null,response):response;}
 if(['/api/content/articles','/api/content/faqs'].includes(url.pathname)){
  const type=url.pathname.endsWith('articles')?'articles':'faqs',{limit,cursor}=pageArgs(ctx,url),rows=await publicRows(ctx,type,{limit,cursor});
  return publicJSON({items:rows.slice(0,limit).map(row=>{const value=JSON.parse(row.published_json);return type==='articles'?{id:row.id,title:value.title,description:value.description,slug:value.slug,url:publicUrl(row,ctx,env),revision:row.published_revision,publishedAt:row.published_at}:{id:row.id,...value,revision:row.published_revision};}),cursor:rows.length>limit?encodeCursor({...rows[limit-1],updated_at:rows[limit-1].published_at}):null});
 }
 if(url.pathname==='/data/student-offers.json'){
  const {base,policy}=await offerBase(ctx,env),overrides=await all(ctx.db,"SELECT slug,published_json FROM owner_content_records WHERE type='offers' AND status='published' AND published_json IS NOT NULL ORDER BY id"),offers=new Map(base.offers.map(offer=>[offer.id,offer]));
  for(const row of overrides){try{const value=JSON.parse(row.published_json),candidate=policy.normalize({version:1,checkedOn:new Date(timestamp(ctx)).toISOString().slice(0,10),providers:base.providers,offers:[value.offer]}).offers[0];offers.set(candidate.id,candidate);}catch{/* A rejected replacement must not resurrect older static offer terms. */offers.delete(row.slug);}}
  return publicJSON(policy.normalize({version:1,checkedOn:[base.checkedOn,...[...offers.values()].map(offer=>offer.checkedOn)].sort().at(-1),providers:base.providers,offers:[...offers.values()]}));
 }
 return null;
}
