/** Shared community API. Sites dispatch supplies authenticated identity headers. */
const PREFIX = '/api/community';
const KINDS = new Set(['question', 'plan', 'template']);
const CONTEXT = /^(school|program|course|template|post):[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;
// Editorial attribution is a property of these non-login database authors only.
// A display alias, incoming payload, email address or profile role never grants it.
const STARTER_GUIDES = new Map([
  ['ds-guide-planning','DegreeSteps Planning Guide'],['ds-guide-transfers','DegreeSteps Transfer Guide'],
  ['ds-guide-courses','DegreeSteps Course Guide'],['ds-guide-campus','DegreeSteps Campus Guide'],
  ['ds-guide-military','DegreeSteps Military Guide'],['ds-guide-careers','DegreeSteps Career Guide'],
  ['ds-guide-money','DegreeSteps Cost Guide'],['ds-guide-momentum','DegreeSteps Study Guide']
]);
const STARTER_AUTHOR_SQL = [...STARTER_GUIDES.keys()].map(value=>"'"+value+"'").join(',');
const guideAliasKey = value => value.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
const STARTER_GUIDE_ALIASES = new Set([...STARTER_GUIDES.values()].map(guideAliasKey));
function publicAuthor(authorId,alias,user) {
  const guide=STARTER_GUIDES.get(authorId);
  return {alias:guide||alias,isYou:authorId===user?.id,...(guide?{kind:'degreesteps-guide'}:{})};
}
const starterOrigin = authorId => STARTER_GUIDES.has(authorId)?{origin:'degreesteps-starter'}:{};
const LIMITS = { publish: 12, comment: 40, reaction: 120, report: 15, profile: 12, moderation: 120 };
const WINDOW = 60 * 60 * 1000;
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new ApiError(status, message); };
const stmt = (db, sql, ...values) => db.prepare(sql).bind(...values);
const first = (db, sql, ...values) => stmt(db, sql, ...values).first();
const all = async (db, sql, ...values) => (await stmt(db, sql, ...values).all()).results || [];
const run = (db, sql, ...values) => stmt(db, sql, ...values).run();
const changes = result => result?.meta?.changes ?? result?.changes ?? 0;
const isMod = user => user && ['moderator', 'owner'].includes(user.role);
const now = () => Date.now();
const uuid = () => crypto.randomUUID();
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Vary': 'Cookie, oai-authenticated-user-id'
  } });
}
function object(value, name = 'payload') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, `${name} must be an object.`);
  return value;
}
function only(value, keys, name = 'payload') {
  object(value, name);
  if (Object.keys(value).some(key => !keys.includes(key))) fail(400, `${name} contains unsupported fields.`);
}
function text(value, name, min, max) {
  if (typeof value !== 'string') fail(400, `${name} must be text.`);
  const clean = value.trim();
  if (clean.length < min || clean.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(clean)) fail(400, `${name} must be ${min}–${max} characters.`);
  return clean;
}
function context(value) { if (typeof value !== 'string' || !CONTEXT.test(value)) fail(400, 'Choose a valid school, program, course, template, or post context.'); return value; }
function id(value) { if (typeof value !== 'string' || !ID.test(value)) fail(400, 'Invalid record ID.'); return value; }
function safeUrl(value) {
  if (value === undefined || value === null || value === '') return null;
  const raw = text(value, 'URL', 1, 2048);
  let url; try { url = new URL(raw); } catch { fail(400, 'Use a complete http or https URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) fail(400, 'Use a public http or https URL without credentials.');
  return url.href;
}
function number(value, name, max = 1000) { if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) fail(400, `${name} must be between 0 and ${max}.`); return value; }
function publicPlan(value) {
  only(value, ['schoolId','schoolName','programId','programName','strategy','totalCredits','courses','catalogYear'], 'Public plan');
  const plan = {
    schoolId: text(value.schoolId, 'School ID', 1, 100),
    schoolName: text(value.schoolName, 'School name', 1, 120),
    programId: text(value.programId, 'Program ID', 1, 100),
    programName: text(value.programName, 'Program name', 1, 160),
    strategy: text(value.strategy || 'balanced', 'Strategy', 1, 60),
    totalCredits: number(value.totalCredits, 'Total credits', 500)
  };
  if(value.catalogYear!==undefined)plan.catalogYear=catalogYear(value.catalogYear);
  if (!Array.isArray(value.courses) || value.courses.length < 1 || value.courses.length > 100) fail(400, 'Public plan must contain 1–100 course choices.');
  plan.courses = value.courses.map(course => {
    only(course, ['requirementId','requirement','courseId','title','provider','credits','url'], 'Public course');
    return {
      requirementId: text(course.requirementId, 'Requirement ID', 1, 120),
      requirement: text(course.requirement, 'Requirement', 1, 160),
      courseId: text(course.courseId, 'Course ID', 1, 120),
      title: text(course.title, 'Course title', 1, 200),
      provider: text(course.provider, 'Provider', 1, 100),
      credits: number(course.credits, 'Credits', 30),
      url: safeUrl(course.url)
    };
  });
  return plan;
}
function postPayload(value) {
  only(value, ['kind','context','title','body','url','plan','publishPublicPlan']);
  if (!KINDS.has(value.kind)) fail(400, 'Choose question, plan, or template.');
  let plan = null;
  if (value.plan !== undefined && value.plan !== null) {
    if (value.publishPublicPlan !== true) fail(400, 'Publishing a course plan requires explicit public-plan consent.');
    if (value.kind === 'question') fail(400, 'Questions cannot contain a published plan.');
    plan = publicPlan(value.plan);
  }
  if (value.kind === 'plan' && !plan) fail(400, 'A shared plan must include its public course choices.');
  return { kind:value.kind, context:context(value.context), title:text(value.title,'Title',3,160), body:text(value.body,'Body',1,6000), url:safeUrl(value.url), plan };
}
async function payload(request) {
  if ((request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') fail(415, 'Send application/json.');
  const length = request.headers.get('content-length');
  if (length && Number(length) > 60000) fail(413, 'Request is too large.');
  const reader=request.body?.getReader();
  if (!reader) fail(400,'Invalid JSON.');
  const decoder=new TextDecoder(); let body=''; let bytes=0;
  while (true) {
    const chunk=await reader.read(); if (chunk.done) break;
    bytes+=chunk.value.byteLength;
    if (bytes>60000) { await reader.cancel(); fail(413,'Request is too large.'); }
    body+=decoder.decode(chunk.value,{stream:true});
  }
  body+=decoder.decode();
  try { return object(JSON.parse(body)); } catch (error) { if (error instanceof ApiError) throw error; fail(400, 'Invalid JSON.'); }
}
function protectWrite(request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin || request.headers.get('X-Community-Request') !== '1') fail(403, 'Use the same-origin DegreeSteps community form.');
  const site = request.headers.get('sec-fetch-site');
  if (site && !['same-origin','none'].includes(site)) fail(403, 'Cross-origin writes are not allowed.');
}
async function identity(request, env) {
  const raw = request.headers.get('oai-authenticated-user-id');
  if (!raw) return null;
  if (raw.length > 256 || /[\u0000-\u001f]/.test(raw)) fail(401, 'Invalid sign-in identity.');
  if (STARTER_GUIDES.has(raw)) fail(401, 'Editorial guide authors cannot sign in or contribute as students.');
  // Email is compared only during owner bootstrap, never persisted or returned.
  const configured = typeof env.COMMUNITY_ADMIN_EMAIL === 'string' ? env.COMMUNITY_ADMIN_EMAIL.trim().toLowerCase() : '';
  const authenticatedEmail = (request.headers.get('oai-authenticated-user-email') || '').trim().toLowerCase();
  const owner = configured && authenticatedEmail && configured === authenticatedEmail;
  let user = await first(env.DB, 'SELECT id, alias, role FROM community_users WHERE id = ?', raw);
  if (!user) {
    const stamp=now();
    await run(env.DB, 'INSERT INTO community_users (id, alias, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING', raw, 'Community member', owner ? 'owner' : 'member', stamp, stamp);
    user = await first(env.DB, 'SELECT id, alias, role FROM community_users WHERE id = ?', raw);
  }
  if (owner && user?.role !== 'owner') {
    await run(env.DB, "UPDATE community_users SET role = 'owner', updated_at = ? WHERE id = ? AND role != 'owner'", now(), raw);
    user = await first(env.DB, 'SELECT id, alias, role FROM community_users WHERE id = ?', raw);
  }
  return user;
}
function requireUser(user) { if (!user) fail(401, 'Sign in to contribute.'); return user; }
async function rate(db, user, action) {
  const stamp = now();
  const bucket = Math.floor(stamp / WINDOW) * WINDOW;
  const result = await run(db, `INSERT INTO community_rate_limits (user_id, action, window_start, count) VALUES (?, ?, ?, 1)
    ON CONFLICT(user_id, action) DO UPDATE SET
    count = CASE WHEN window_start = excluded.window_start THEN count + 1 ELSE 1 END,
    window_start = excluded.window_start
    WHERE community_rate_limits.window_start != excluded.window_start OR community_rate_limits.count < ?`, user.id, action, bucket, LIMITS[action]);
  if (!changes(result)) fail(429, 'Too many contributions. Try again after the hourly limit resets.');
}
function page(url) {
  const raw = url.searchParams.get('limit') || '20';
  if (!/^\d{1,2}$/.test(raw) || Number(raw) < 1 || Number(raw) > 50) fail(400, 'Limit must be between 1 and 50.');
  const cursor = url.searchParams.get('cursor'); let before = null;
  if (cursor) {
    if (cursor.length > 400) fail(400, 'Invalid cursor.');
    try { before = JSON.parse(atob(cursor.replace(/-/g,'+').replace(/_/g,'/'))); } catch { fail(400,'Invalid cursor.'); }
    if (!Array.isArray(before) || before.length !== 2 || !Number.isSafeInteger(before[0]) || before[0] < 0 || typeof before[1] !== 'string' || !ID.test(before[1])) fail(400,'Invalid cursor.');
  }
  return { limit:Number(raw), before };
}
function paged(rows, limit, mapper) {
  const more = rows.length > limit; const records = rows.slice(0, limit); const last = records.at(-1);
  return { items:records.map(mapper), cursor:more && last ? btoa(JSON.stringify([last.created_at,last.id])).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'') : null };
}
function feedPage(url) {
  if(url.searchParams.getAll('source').length>1)fail(400,'Choose one discussion source.');
  const source=url.searchParams.get('source')??'all';
  if(!['all','students','starters'].includes(source))fail(400,'Choose all, students, or starters.');
  const withoutCursor=new URL(url.href);withoutCursor.searchParams.delete('cursor');
  const {limit}=page(withoutCursor),raw=url.searchParams.get('cursor');
  if(!raw)return {limit,source,before:null,legacy:false};
  if(raw.length>400)fail(400,'Invalid cursor.');
  let value;try{value=JSON.parse(atob(raw.replace(/-/g,'+').replace(/_/g,'/')));}catch{fail(400,'Invalid cursor.');}
  const validBefore=(stamp,recordId)=>Number.isSafeInteger(stamp)&&stamp>=0&&typeof recordId==='string'&&ID.test(recordId);
  // Previously issued chronological cursors retain their old continuation.
  // Comment, evidence and moderation pagination continue using page() unchanged.
  if(Array.isArray(value)&&value.length===2&&validBefore(...value))return{limit,source,before:value,legacy:true};
  if(!Array.isArray(value)||value.length!==5||value[0]!=='feed-v1'||value[1]!==source||![0,1].includes(value[2])||!validBefore(value[3],value[4])||source==='students'&&value[2]!==0||source==='starters'&&value[2]!==1)fail(400,'Invalid cursor.');
  return{limit,source,before:{rank:value[2],stamp:value[3],id:value[4]},legacy:false};
}
async function feedRows(db,user,where,args,details) {
  const {limit,source,before,legacy}=details;
  const sourceClause=rank=>'p.user_id '+(rank?'IN':'NOT IN')+' ('+STARTER_AUTHOR_SQL+')';
  const appendBefore=(conditions,values,stamp,recordId)=>{conditions.push('(p.created_at < ? OR (p.created_at = ? AND p.id < ?))');values.push(stamp,stamp,recordId);};
  if(legacy){
    const conditions=[...where],values=[...args];
    if(source!=='all')conditions.push(sourceClause(source==='starters'?1:0));
    appendBefore(conditions,values,before[0],before[1]);
    return postRows(db,user,conditions.join(' AND '),values,limit+1);
  }
  const rows=[];
  // Each phase uses the existing context/feed chronological index and a bounded
  // page. Avoid sorting all students and editorial posts together with CASE.
  for(const rank of source==='all'?[0,1]:[source==='starters'?1:0]){
    if(before&&rank<before.rank)continue;
    const remaining=limit+1-rows.length;if(remaining<=0)break;
    const conditions=[...where,sourceClause(rank)],values=[...args];
    if(before&&before.rank===rank)appendBefore(conditions,values,before.stamp,before.id);
    rows.push(...await postRows(db,user,conditions.join(' AND '),values,remaining));
  }
  return rows;
}
function pagedFeed(rows,user,details) {
  if(details.legacy)return paged(rows,details.limit,row=>postView(row,user));
  const more=rows.length>details.limit,records=rows.slice(0,details.limit),last=records.at(-1);
  const value=last?['feed-v1',details.source,STARTER_GUIDES.has(last.user_id)?1:0,last.created_at,last.id]:null;
  return{items:records.map(row=>postView(row,user)),cursor:more&&value?btoa(JSON.stringify(value)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''):null};
}
async function postRows(db, user, where, args, limit) {
  // Select the bounded page before looking at its activity. Reactions are read
  // once per selected post, rather than separately for every count and flag.
  // Keeping the page and aggregates in one statement also gives them one
  // database snapshot; old posts need no counter backfill or write-on-read.
  return all(db, `WITH post_page AS MATERIALIZED (
      SELECT p.* FROM community_posts p WHERE ${where}
      ORDER BY p.created_at DESC,p.id DESC LIMIT ?
    ), reaction_totals AS MATERIALIZED (
      SELECT r.post_id,
        SUM(CASE WHEN r.reaction='like' THEN 1 ELSE 0 END) AS likes,
        SUM(CASE WHEN r.reaction='upvote' THEN 1 ELSE 0 END) AS upvotes,
        MAX(CASE WHEN r.user_id=? AND r.reaction='like' THEN 1 ELSE 0 END) AS liked,
        MAX(CASE WHEN r.user_id=? AND r.reaction='upvote' THEN 1 ELSE 0 END) AS upvoted
      FROM community_reactions r WHERE r.post_id IN (SELECT id FROM post_page)
      GROUP BY r.post_id
    ), comment_totals AS MATERIALIZED (
      SELECT c.context,COUNT(*) AS comments,
        SUM(CASE WHEN c.user_id IN (${STARTER_AUTHOR_SQL}) THEN 1 ELSE 0 END) AS guide_answers,
        SUM(CASE WHEN c.user_id NOT IN (${STARTER_AUTHOR_SQL}) THEN 1 ELSE 0 END) AS student_comments FROM community_comments c
      WHERE c.deleted_at IS NULL AND c.context IN (SELECT 'post:' || id FROM post_page)
      GROUP BY c.context
    )
    SELECT p.*,u.alias,COALESCE(r.likes,0) AS likes,COALESCE(r.upvotes,0) AS upvotes,
      COALESCE(c.comments,0) AS comments,COALESCE(c.guide_answers,0) AS guide_answers,
      COALESCE(c.student_comments,0) AS student_comments,COALESCE(r.liked,0) AS liked,COALESCE(r.upvoted,0) AS upvoted
    FROM post_page p JOIN community_users u ON u.id=p.user_id
    LEFT JOIN reaction_totals r ON r.post_id=p.id
    LEFT JOIN comment_totals c ON c.context='post:' || p.id
    ORDER BY p.created_at DESC,p.id DESC`, ...args,limit,user?.id || '',user?.id || '');
}
function postView(row, user) {
  return { id:row.id, kind:row.kind, context:row.context, title:row.title, body:row.body, url:row.url,
    plan:row.plan_json ? JSON.parse(row.plan_json) : null, author:publicAuthor(row.user_id,row.alias,user),...starterOrigin(row.user_id),
    createdAt:row.created_at, updatedAt:row.updated_at, likes:Number(row.likes), upvotes:Number(row.upvotes), comments:Number(row.comments),
    guideAnswers:Number(row.guide_answers||0),studentComments:Number(row.student_comments||0),
    liked:!!row.liked, upvoted:!!row.upvoted, canEdit:row.user_id === user?.id, canDelete:row.user_id === user?.id || !!isMod(user) };
}
async function getPost(db, recordId, user) {
  const [row] = await postRows(db,user,'p.id = ? AND p.deleted_at IS NULL',[recordId],1);
  if (!row) fail(404,'Post not found.'); return postView(row,user);
}
async function activeTarget(db, type, recordId) {
  const table = type === 'post' ? 'community_posts' : 'community_comments';
  const row = await first(db, `SELECT * FROM ${table} WHERE id = ? AND deleted_at IS NULL`, id(recordId));
  if (!row) fail(404,`${type === 'post' ? 'Post' : 'Comment'} not found.`); return row;
}
async function validContext(db, value) {
  context(value);
  if (value.startsWith('post:')) await activeTarget(db,'post',value.slice(5));
}
async function contextSummary(db,value,user) {
  await validContext(db,value);
  if (value.startsWith('post:')) {
    const post=await getPost(db,value.slice(5),user);
    return {context:value,likes:post.likes,upvotes:post.upvotes,liked:post.liked,upvoted:post.upvoted,comments:post.comments,...(post.origin||post.guideAnswers?{guideAnswers:post.guideAnswers,studentComments:post.studentComments}:{})};
  }
  const row=await first(db,`SELECT
    SUM(CASE WHEN reaction='like' THEN 1 ELSE 0 END) AS likes,
    SUM(CASE WHEN reaction='upvote' THEN 1 ELSE 0 END) AS upvotes,
    MAX(CASE WHEN user_id=? AND reaction='like' THEN 1 ELSE 0 END) AS liked,
    MAX(CASE WHEN user_id=? AND reaction='upvote' THEN 1 ELSE 0 END) AS upvoted,
    (SELECT COUNT(*) FROM community_comments WHERE context=? AND deleted_at IS NULL) AS comments,
    (SELECT COUNT(*) FROM community_comments WHERE context=? AND deleted_at IS NULL AND user_id IN (${STARTER_AUTHOR_SQL})) AS guide_answers,
    (SELECT COUNT(*) FROM community_posts WHERE context=? AND deleted_at IS NULL AND user_id IN (${STARTER_AUTHOR_SQL})) AS starter_discussions
    FROM community_context_reactions WHERE context=?`,user?.id || '',user?.id || '',value,value,value,value);
  return {context:value,likes:Number(row.likes),upvotes:Number(row.upvotes),liked:!!row.liked,upvoted:!!row.upvoted,comments:Number(row.comments),...(row.guide_answers?{guideAnswers:Number(row.guide_answers),studentComments:Number(row.comments)-Number(row.guide_answers)}:{}),...(row.starter_discussions?{starterDiscussions:Number(row.starter_discussions)}:{})};
}
function commentView(row,user) {
  return { id:row.id, context:row.context, parentId:row.parent_id, body:row.body, author:publicAuthor(row.user_id,row.alias,user),...starterOrigin(row.user_id),
    createdAt:row.created_at, updatedAt:row.updated_at, canDelete:row.user_id === user?.id || !!isMod(user) };
}
const EVIDENCE_DISCLAIMER = 'Community evidence only. A reviewed report is not university approval, a transfer guarantee, or an automatic credit award. Confirm your own catalog and evaluation with the school.';
let bundledEvidenceCatalogs = new Map();
async function evidenceProgram(env,programId) {
  if(/^source-curriculum-[a-f0-9]{32}$/.test(programId)&&env.DB?.prepare){
    const revision=await env.DB.prepare('SELECT payload_json, expires_at FROM curriculum_source_cache WHERE cache_key = ?').bind('revision:'+programId).first();
    let payload;try{payload=revision&&Date.parse(revision.expires_at)>Date.now()?JSON.parse(revision.payload_json):null;}catch{}
    if(payload?.status==='ready'&&payload.model?.id===programId&&/^[a-f0-9]{64}$/.test(payload.source?.requirementsHash||'')&&programId==='source-curriculum-'+payload.source.requirementsHash.slice(0,32))return payload.model;
    fail(400,'This source curriculum revision is unavailable. Reopen its official requirements before adding community evidence.');
  }
  if (Array.isArray(env.COMMUNITY_CATALOGS)) {const supplied=env.COMMUNITY_CATALOGS.find(model=>model.id===programId);if(!supplied)fail(400,'Choose a supported program ID.');return supplied;}
  if(typeof assets==='undefined')fail(503,'Course catalog validation is not configured.');
  if(bundledEvidenceCatalogs.has(programId))return bundledEvidenceCatalogs.get(programId);
  const legacy={'tesu-general-management':'/data/tesu.json','liberty-business-residential':'/data/liberty.json','liberty-criminal-justice-residential':'/data/liberty-criminal-justice-residential.json','liberty-criminal-justice-online':'/data/liberty-criminal-justice-online.json'};
  let path=legacy[programId];
  if(!path){const asset=assets['/data/curriculum-registry.json'];if(asset){const index=JSON.parse(await decodeStaticAsset(asset)),entry=(index.models||[]).find(entry=>entry.status==='reviewed'&&entry.id===programId);if(entry)path='/'+entry.path;}}
  if(!path||!assets[path])fail(400,'Choose a supported program ID.');
  const payload=JSON.parse(await decodeStaticAsset(assets[path])),program=(Array.isArray(payload.models)?payload.models:[payload]).find(model=>model.id===programId);
  if(!program)fail(503,'A registered curriculum could not be loaded for community review.');
  if(bundledEvidenceCatalogs.size>=4)bundledEvidenceCatalogs.delete(bundledEvidenceCatalogs.keys().next().value);
  bundledEvidenceCatalogs.set(programId,program);return program;
}
function catalogYear(value) {
  if(typeof value!=='string')fail(400,'Choose an exact catalog year or version, such as 2026-2027 or 202605.');
  value=value.trim().replace(/[–—]/g,'-');
  if(/^(?:19|20|21)\d{2}(?:0[1-9]|1[0-2])$/.test(value))return value;
  if (!/^(19|20|21)\d{2}(?:-(19|20|21)\d{2})?$/.test(value)) fail(400,'Choose an exact catalog year or version, such as 2026-2027 or 202605.');
  if (value.length === 9 && Number(value.slice(5)) !== Number(value.slice(0,4)) + 1) fail(400,'Catalog years must be consecutive.');
  return value;
}
function validEvidenceCourse(program,requirementId,courseId) {
  return [...(program.requirements || []),...(program.transferWaiverVariant?.requirements || [])]
    .some(requirement => requirement.id === requirementId && !requirement.institutionalOnly && requirement.options?.some(course => course.id === courseId && course.provider !== 'University'));
}
function evidenceTargetView(row) {
  return row.target_kind === 'course'
    ? {kind:'course',programId:row.program_id,requirementId:row.requirement_id,courseId:row.course_id,catalogYear:row.catalog_year}
    : {kind:'plan',postId:row.post_id,catalogYear:row.catalog_year};
}
async function evidenceTarget(value,db,env) {
  object(value,'Evidence target');
  if (value.kind === 'course') {
    only(value,['kind','programId','requirementId','courseId','catalogYear'],'Evidence target');
    const target = {kind:'course',programId:id(value.programId),requirementId:id(value.requirementId),courseId:id(value.courseId),catalogYear:catalogYear(value.catalogYear)};
    if (!validEvidenceCourse(await evidenceProgram(env,target.programId),target.requirementId,target.courseId)) fail(400,'This exact course and requirement do not belong to the selected program.');
    return {target,key:JSON.stringify(['course',target.programId,target.requirementId,target.courseId]),fingerprint:'',planJson:null};
  }
  if (value.kind === 'plan') {
    only(value,['kind','postId','catalogYear'],'Evidence target');
    const target = {kind:'plan',postId:id(value.postId),catalogYear:catalogYear(value.catalogYear)};
    const post = await activeTarget(db,'post',target.postId);
    if (!post.plan_json) fail(400,'Only a live public curriculum plan can receive a plan outcome.');
    const plan = publicPlan(JSON.parse(post.plan_json));
    if(plan.catalogYear&&plan.catalogYear!==target.catalogYear)fail(400,'This published plan uses catalog '+plan.catalogYear+'. Report outcomes for that exact catalog.');
    const courses = plan.courses.map(course => [course.requirementId,course.courseId,course.provider,course.credits])
      .sort((left,right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    // Preserve historical fingerprints for legacy posts with no recorded catalog.
    const curriculum = JSON.stringify([plan.schoolId,plan.programId,plan.totalCredits,courses,...(plan.catalogYear?[plan.catalogYear]:[])]);
    const hash = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(curriculum));
    const fingerprint = [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
    return {target,key:JSON.stringify(['plan',target.postId]),fingerprint,planJson:post.plan_json};
  }
  fail(400,'Choose a course or plan evidence target.');
}
function evidenceDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(400,'Evaluation date must use YYYY-MM-DD.');
  const date = new Date(value+'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value || value < '1900-01-01' || value > new Date(now()).toISOString().slice(0,10)) fail(400,'Use a real evaluation date that is not in the future.');
  return value;
}
function evidencePlain(value,name,min,max) {
  const content = text(value,name,min,max);
  if (/<\/?[A-Za-z][^>]*>/.test(content)) fail(400,`${name} must be plain text.`);
  return content;
}
function evidencePublicUrl(value) {
  const clean = safeUrl(value); if (!clean) return null;
  const host = new URL(clean).hostname.toLowerCase().replace(/\.$/,'');
  const ipv4 = host.split('.').map(Number);
  if (!host.includes('.') || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host) || host.startsWith('[')
    || (ipv4.length === 4 && ipv4.every(n=>Number.isInteger(n)&&n>=0&&n<=255) &&
      (ipv4[0]===0 || ipv4[0]===10 || ipv4[0]===127 || ipv4[0]>=224 || (ipv4[0]===169&&ipv4[1]===254) || (ipv4[0]===172&&ipv4[1]>=16&&ipv4[1]<=31) || (ipv4[0]===192&&ipv4[1]===168) || (ipv4[0]===100&&ipv4[1]>=64&&ipv4[1]<=127)))) fail(400,'Evidence must be a public http or https URL.');
  return clean;
}
function evidenceCutoff() {
  const today = new Date(now()); const year = today.getUTCFullYear()-1; const month = today.getUTCMonth();
  const day = Math.min(today.getUTCDate(),new Date(Date.UTC(year,month+1,0)).getUTCDate());
  return new Date(Date.UTC(year,month,day)).toISOString().slice(0,10);
}
const evidenceAggregateColumns = `COUNT(*) AS report_count,
  COUNT(DISTINCT CASE WHEN e.evaluated_on>=? AND e.outcome='success' THEN e.user_id END) AS recent_successes,
  COUNT(DISTINCT CASE WHEN e.evaluated_on>=? AND e.outcome='success' AND e.review_status='reviewed' AND e.evidence_url IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM community_evidence_flags f WHERE f.evidence_id=e.id AND f.resolved_at IS NULL) THEN e.user_id END) AS reviewed_successes,
  COUNT(DISTINCT CASE WHEN e.evaluated_on>=? AND e.outcome!='success' THEN e.user_id END) AS recent_conflicts,
  COALESCE(SUM(CASE WHEN e.evaluated_on<? THEN 1 ELSE 0 END),0) AS old_reports,
  MAX(e.evaluated_on) AS latest_evaluated_on`;
function evidenceAggregateDates() { const cutoff=evidenceCutoff(); return [cutoff,cutoff,cutoff,cutoff]; }
function evidenceSummary(row) {
  const reportCount=Number(row.report_count),recentSuccesses=Number(row.recent_successes),reviewedSuccesses=Number(row.reviewed_successes),recentConflicts=Number(row.recent_conflicts);
  const status=recentConflicts ? 'mixed' : reviewedSuccesses>=2 ? 'community-verified' : recentSuccesses ? 'student-reported' : reportCount ? 'outdated' : 'unreported';
  return {status,reportCount,recentSuccesses,reviewedSuccesses,recentConflicts,oldReports:Number(row.old_reports),latestEvaluatedOn:row.latest_evaluated_on || null};
}
const evidenceSelect = `SELECT e.*,u.alias,
  (SELECT COUNT(*) FROM community_evidence_flags f WHERE f.evidence_id=e.id AND f.resolved_at IS NULL) AS open_flags,
  EXISTS(SELECT 1 FROM community_evidence_flags f WHERE f.evidence_id=e.id AND f.user_id=? AND f.resolved_at IS NULL) AS flagged_by_you
  FROM community_evidence e JOIN community_users u ON u.id=e.user_id`;
function evidenceView(row,user) {
  const own = row.user_id === user?.id;
  const result = {id:row.id,target:evidenceTargetView(row),curriculumFingerprint:row.curriculum_fingerprint || null,
    outcome:row.outcome,evaluatedOn:row.evaluated_on,details:row.details,evidenceUrl:row.evidence_url,reviewStatus:row.review_status,
    author:{alias:row.alias,isYou:own},createdAt:row.created_at,updatedAt:row.updated_at,reviewedAt:row.reviewed_at,
    canDelete:own || !!isMod(user),canFlag:!!user && !own && !row.flagged_by_you,flaggedByYou:!!row.flagged_by_you};
  if (own || isMod(user)) result.reviewNote = row.review_note;
  if (isMod(user)) { result.canReview = !own; result.flagCount = Number(row.open_flags); }
  return result;
}
async function getEvidence(db,recordId,user) {
  const row = await first(db,`${evidenceSelect} WHERE e.id=? AND e.deleted_at IS NULL`,user?.id || '',id(recordId));
  if (!row) fail(404,'Outcome report not found.');
  return row;
}
async function evidenceResponse(db,scope,user,url) {
  const {limit,before} = page(url);
  const where='e.target_key=? AND e.catalog_year=? AND e.curriculum_fingerprint=? AND e.deleted_at IS NULL';
  const scopeArgs=[scope.key,scope.target.catalogYear,scope.fingerprint];
  const pageArgs=[user?.id || '',...scopeArgs]; let pageWhere=where+" AND e.review_status!='dismissed'";
  if (before) { pageWhere+=' AND (e.created_at < ? OR (e.created_at = ? AND e.id < ?))'; pageArgs.push(before[0],before[0],before[1]); }
  pageArgs.push(limit+1);
  const [aggregate,visible,own]=await Promise.all([
    first(db,`SELECT ${evidenceAggregateColumns} FROM community_evidence e WHERE ${where} AND e.review_status!='dismissed'`,...evidenceAggregateDates(),...scopeArgs),
    all(db,`${evidenceSelect} WHERE ${pageWhere} ORDER BY e.created_at DESC,e.id DESC LIMIT ?`,...pageArgs),
    user ? first(db,`${evidenceSelect} WHERE ${where} AND e.user_id=?`,user.id,...scopeArgs,user.id) : Promise.resolve(null)
  ]);
  return {target:scope.target,curriculumFingerprint:scope.fingerprint || null,summary:evidenceSummary(aggregate),
    ...paged(visible,limit,row=>evidenceView(row,user)),own:own ? evidenceView(own,user) : null,disclaimer:EVIDENCE_DISCLAIMER};
}
function evidenceQuery(url,keys) {
  for (const key of url.searchParams.keys()) if (!keys.includes(key) || url.searchParams.getAll(key).length !== 1) fail(400,'Unsupported or repeated evidence query field.');
}
async function api(request,env) {
  const url = new URL(request.url); const path = url.pathname.replace(/\/$/,''); const method = request.method;
  if (!env.DB) fail(503,'Community storage is not configured.');
  if (!['GET','POST','PATCH','DELETE'].includes(method)) fail(405,'Method not allowed.');
  if (method !== 'GET') protectWrite(request);
  const user = await identity(request,env); const db = env.DB;
  if (path === `${PREFIX}/session` && method === 'GET') return json({ user });
  if (path === `${PREFIX}/profile` && method === 'POST') {
    requireUser(user); const body = await payload(request); only(body,['alias']); const alias = text(body.alias,'Display alias',2,40);
    if (/[<>]/.test(alias) || alias.includes('@')) fail(400,'Use a display alias without markup or an email address.');
    if (STARTER_GUIDE_ALIASES.has(guideAliasKey(alias))) fail(400,'That name is reserved for DegreeSteps guides. Choose your own public alias.');
    await rate(db,user,'profile'); await run(db,'UPDATE community_users SET alias = ?, updated_at = ? WHERE id = ?',alias,now(),user.id);
    return json({ user:{...user,alias} });
  }
  if (path === `${PREFIX}/evidence/summary` && method === 'GET') {
    evidenceQuery(url,['programId','catalogYear']);
    const programId=id(url.searchParams.get('programId')); const year=catalogYear(url.searchParams.get('catalogYear'));
    const program=await evidenceProgram(env,programId);
    const allowedKeys=new Set();
    for (const requirement of [...(program.requirements || []),...(program.transferWaiverVariant?.requirements || [])]) {
      for (const course of requirement.options || []) allowedKeys.add(JSON.stringify(['course',programId,requirement.id,course.id]));
    }
    // One JSON parameter avoids D1's parameter limit while bounding groups to actual current course targets.
    const rows=await all(db,`SELECT e.target_kind,e.program_id,e.requirement_id,e.course_id,e.catalog_year,${evidenceAggregateColumns}
      FROM community_evidence e WHERE e.target_kind='course' AND e.program_id=? AND e.catalog_year=?
      AND e.deleted_at IS NULL AND e.review_status!='dismissed'
      AND e.target_key IN (SELECT value FROM json_each(?)) GROUP BY e.target_key LIMIT ?`,
      ...evidenceAggregateDates(),programId,year,JSON.stringify([...allowedKeys]),allowedKeys.size);
    return json({items:rows.map(row=>({target:evidenceTargetView(row),summary:evidenceSummary(row)})),disclaimer:EVIDENCE_DISCLAIMER});
  }
  if (path === `${PREFIX}/evidence`) {
    if (method === 'GET') {
      evidenceQuery(url,['kind','programId','requirementId','courseId','postId','catalogYear','limit','cursor']);
      const value=Object.fromEntries([...url.searchParams].filter(([key])=>!['limit','cursor'].includes(key)));
      const scope=await evidenceTarget(value,db,env);
      return json(await evidenceResponse(db,scope,user,url));
    }
    if (method === 'POST') {
      requireUser(user); const body=await payload(request);
      only(body,['target','outcome','evaluatedOn','details','evidenceUrl','consent']);
      if (body.consent !== true) fail(400,'Confirm a real school evaluation or conferral and consent to publishing only redacted public details.');
      const scope=await evidenceTarget(body.target,db,env);
      if (!['success','changed','rejected'].includes(body.outcome)) fail(400,'Choose success, changed, or rejected.');
      const evaluatedOn=evidenceDate(body.evaluatedOn),details=evidencePlain(body.details,'Outcome details',1,1000),evidenceUrl=evidencePublicUrl(body.evidenceUrl);
      await rate(db,user,'publish'); const stamp=now(); const target=scope.target;
      const result=await run(db,`INSERT INTO community_evidence
        (id,user_id,target_kind,target_key,program_id,requirement_id,course_id,post_id,catalog_year,curriculum_fingerprint,outcome,evaluated_on,details,evidence_url,consent_at,created_at,updated_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
        WHERE (? IS NULL OR EXISTS(SELECT 1 FROM community_posts WHERE id=? AND plan_json=? AND deleted_at IS NULL))
        ON CONFLICT(user_id,target_key,catalog_year,curriculum_fingerprint) DO UPDATE SET
          outcome=excluded.outcome,evaluated_on=excluded.evaluated_on,details=excluded.details,evidence_url=excluded.evidence_url,
          consent_at=excluded.consent_at,review_status='pending',review_note=NULL,reviewed_at=NULL,reviewed_by=NULL,
          updated_at=MAX(community_evidence.updated_at+1,excluded.updated_at),deleted_at=NULL`,
        uuid(),user.id,target.kind,scope.key,target.programId || null,target.requirementId || null,target.courseId || null,target.postId || null,
        target.catalogYear,scope.fingerprint,body.outcome,evaluatedOn,details,evidenceUrl,stamp,stamp,stamp,
        scope.planJson,target.postId || null,scope.planJson);
      if (!changes(result)) fail(409,'The public plan changed. Reload it before reporting an outcome.');
      const row=await first(db,`${evidenceSelect} WHERE e.user_id=? AND e.target_key=? AND e.catalog_year=? AND e.curriculum_fingerprint=?`,user.id,user.id,scope.key,target.catalogYear,scope.fingerprint);
      return json({item:evidenceView(row,user)},201);
    }
  }
  if (path === `${PREFIX}/moderation/evidence` && method === 'GET') {
    requireUser(user); if (!isMod(user)) fail(403,'Moderator access required.');
    evidenceQuery(url,['status','limit','cursor']);
    const status=url.searchParams.get('status');
    if (status && !['pending','flagged','reviewed','dismissed'].includes(status)) fail(400,'Invalid outcome review status.');
    const flagExists='EXISTS(SELECT 1 FROM community_evidence_flags f WHERE f.evidence_id=e.id AND f.resolved_at IS NULL)';
    const {limit,before}=page(url); const args=[user.id];
    let where='e.deleted_at IS NULL';
    if (!status) where+=` AND (e.review_status='pending' OR ${flagExists})`;
    else if (status === 'flagged') where+=` AND ${flagExists}`;
    else { where+=' AND e.review_status=?'; args.push(status); }
    if (before) { where+=' AND (e.created_at < ? OR (e.created_at = ? AND e.id < ?))'; args.push(before[0],before[0],before[1]); }
    args.push(limit+1);
    const rows=await all(db,`${evidenceSelect} WHERE ${where} ORDER BY e.created_at DESC,e.id DESC LIMIT ?`,...args);
    const response=paged(rows,limit,row=>evidenceView(row,user));
    for (const item of response.items) item.flags=await all(db,'SELECT reason,created_at AS createdAt FROM community_evidence_flags WHERE evidence_id=? AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 50',item.id);
    return json(response);
  }
  let evidenceMatch=path.match(/^\/api\/community\/evidence\/([A-Za-z0-9_-]+)(?:\/(review|flags))?$/);
  if (evidenceMatch) {
    const recordId=id(evidenceMatch[1]),action=evidenceMatch[2];
    if (!action && method === 'DELETE') {
      requireUser(user); const row=await getEvidence(db,recordId,user);
      if (row.user_id !== user.id && !isMod(user)) fail(403,'Only the author or a moderator can remove this outcome report.');
      await rate(db,user,isMod(user)?'moderation':'publish');
      await run(db,'UPDATE community_evidence SET deleted_at=?,updated_at=MAX(updated_at+1,?) WHERE id=? AND deleted_at IS NULL',now(),now(),recordId);
      return json({deleted:true});
    }
    if (action === 'review' && method === 'PATCH') {
      requireUser(user); if (!isMod(user)) fail(403,'Moderator access required.');
      const body=await payload(request); only(body,['status','note']);
      if (!['reviewed','dismissed'].includes(body.status)) fail(400,'Choose reviewed or dismissed.');
      const note=body.note === undefined || body.note === '' ? null : evidencePlain(body.note,'Review note',1,1000);
      const row=await getEvidence(db,recordId,user);
      if (row.user_id === user.id) fail(403,'You cannot review your own outcome report.');
      await rate(db,user,'moderation'); const stamp=now();
      const results=await db.batch([
        stmt(db,`UPDATE community_evidence SET review_status=?,review_note=?,reviewed_at=?,reviewed_by=?
          WHERE id=? AND updated_at=? AND deleted_at IS NULL
          AND (SELECT COUNT(*) FROM community_evidence_flags WHERE evidence_id=? AND resolved_at IS NULL)=?`,
          body.status,note,stamp,user.id,recordId,row.updated_at,recordId,Number(row.open_flags)),
        // D1 batches are transactions; changes() refers to the immediately preceding guarded review update.
        stmt(db,'UPDATE community_evidence_flags SET resolved_at=? WHERE evidence_id=? AND resolved_at IS NULL AND changes()=1',stamp,recordId)
      ]);
      if (!changes(results[0])) fail(409,'This outcome report changed. Reload it before reviewing.');
      return json({item:evidenceView(await getEvidence(db,recordId,user),user)});
    }
    if (action === 'flags' && method === 'POST') {
      requireUser(user); const body=await payload(request); only(body,['reason']);
      const reason=evidencePlain(body.reason,'Flag reason',3,1000),row=await getEvidence(db,recordId,user);
      if (row.review_status === 'dismissed') fail(404,'Outcome report not found.');
      if (row.user_id === user.id) fail(403,'Remove or edit your own outcome report.');
      await rate(db,user,'report');
      await run(db,`INSERT INTO community_evidence_flags (evidence_id,user_id,reason,created_at) VALUES (?,?,?,?)
        ON CONFLICT(evidence_id,user_id) DO UPDATE SET reason=excluded.reason,created_at=excluded.created_at,resolved_at=NULL
        WHERE community_evidence_flags.resolved_at IS NOT NULL`,recordId,user.id,reason,now());
      return json({flagged:true},201);
    }
  }
  if (path === `${PREFIX}/context` && method === 'GET') return json(await contextSummary(db,context(url.searchParams.get('context')),user));
  if (path === `${PREFIX}/context/reactions` && method === 'POST') {
    requireUser(user); const body=await payload(request); only(body,['context','reaction','active']);
    const value=context(body.context); await validContext(db,value);
    if (!['like','upvote'].includes(body.reaction) || typeof body.active !== 'boolean') fail(400,'Choose a reaction and whether it is active.');
    await rate(db,user,'reaction');
    if (value.startsWith('post:')) {
      const recordId=value.slice(5);
      if (body.active) await run(db,'INSERT INTO community_reactions (post_id,user_id,reaction,created_at) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM community_posts WHERE id=? AND deleted_at IS NULL) ON CONFLICT(post_id,user_id,reaction) DO NOTHING',recordId,user.id,body.reaction,now(),recordId);
      else await run(db,'DELETE FROM community_reactions WHERE post_id=? AND user_id=? AND reaction=?',recordId,user.id,body.reaction);
    } else if (body.active) await run(db,'INSERT INTO community_context_reactions (context,user_id,reaction,created_at) VALUES (?,?,?,?) ON CONFLICT(context,user_id,reaction) DO NOTHING',value,user.id,body.reaction,now());
    else await run(db,'DELETE FROM community_context_reactions WHERE context=? AND user_id=? AND reaction=?',value,user.id,body.reaction);
    return json(await contextSummary(db,value,user));
  }
  if (path === `${PREFIX}/feed` && method === 'GET') {
    const details=feedPage(url); const where = ['p.deleted_at IS NULL']; const args = [];
    if (url.searchParams.has('context')) { where.push('p.context = ?'); args.push(context(url.searchParams.get('context'))); }
    if (url.searchParams.has('kind')) { const kind = url.searchParams.get('kind'); if (!KINDS.has(kind)) fail(400,'Invalid post kind.'); where.push('p.kind = ?'); args.push(kind); }
    if (url.searchParams.has('mine')) { if (url.searchParams.get('mine') !== '1') fail(400,'Invalid author filter.'); requireUser(user); where.push('p.user_id = ?'); args.push(user.id); }
    return json(pagedFeed(await feedRows(db,user,where,args,details),user,details));
  }
  if (path === `${PREFIX}/posts` && method === 'POST') {
    requireUser(user); const post = postPayload(await payload(request)); await validContext(db,post.context); await rate(db,user,'publish');
    const recordId = uuid(); const stamp = now();
    await run(db,'INSERT INTO community_posts (id,user_id,context,kind,title,body,url,plan_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',recordId,user.id,post.context,post.kind,post.title,post.body,post.url,post.plan ? JSON.stringify(post.plan) : null,stamp,stamp);
    return json({item:await getPost(db,recordId,user)},201);
  }
  let match = path.match(/^\/api\/community\/posts\/([A-Za-z0-9_-]+)$/);
  if (match) {
    const recordId = id(match[1]);
    if (method === 'GET') return json({item:await getPost(db,recordId,user)});
    if (method === 'PATCH' || method === 'DELETE') {
      requireUser(user); const original = await activeTarget(db,'post',recordId);
      if (original.user_id !== user.id && !(method === 'DELETE' && isMod(user))) fail(403,'Only the author can edit this post.');
      if (method === 'DELETE') {
        await rate(db,user,isMod(user) ? 'moderation' : 'publish');
        await run(db,'UPDATE community_posts SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',now(),now(),recordId); return json({deleted:true});
      }
      const post = postPayload(await payload(request)); await validContext(db,post.context); await rate(db,user,'publish');
      await run(db,'UPDATE community_posts SET context=?,kind=?,title=?,body=?,url=?,plan_json=?,updated_at=? WHERE id=? AND user_id=? AND deleted_at IS NULL',post.context,post.kind,post.title,post.body,post.url,post.plan ? JSON.stringify(post.plan) : null,now(),recordId,user.id);
      return json({item:await getPost(db,recordId,user)});
    }
  }
  match = path.match(/^\/api\/community\/posts\/([A-Za-z0-9_-]+)\/reactions$/);
  if (match && method === 'POST') {
    requireUser(user); const recordId=id(match[1]); await activeTarget(db,'post',recordId);
    const body = await payload(request); only(body,['reaction','active']);
    if (!['like','upvote'].includes(body.reaction) || typeof body.active !== 'boolean') fail(400,'Choose a reaction and whether it is active.');
    await rate(db,user,'reaction');
    if (body.active) await run(db,'INSERT INTO community_reactions (post_id,user_id,reaction,created_at) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM community_posts WHERE id=? AND deleted_at IS NULL) ON CONFLICT(post_id,user_id,reaction) DO NOTHING',recordId,user.id,body.reaction,now(),recordId);
    else await run(db,'DELETE FROM community_reactions WHERE post_id=? AND user_id=? AND reaction=?',recordId,user.id,body.reaction);
    return json({item:await getPost(db,recordId,user)});
  }
  if (path === `${PREFIX}/comments`) {
    if (method === 'GET') {
      const value = context(url.searchParams.get('context')); await validContext(db,value); const {limit,before}=page(url);
      const args=[value]; let where='c.context = ? AND c.deleted_at IS NULL';
      if (before) { where += ' AND (c.created_at < ? OR (c.created_at = ? AND c.id < ?))'; args.push(before[0],before[0],before[1]); }
      args.push(limit+1);
      const rows=await all(db,`SELECT c.*,u.alias FROM community_comments c JOIN community_users u ON u.id=c.user_id WHERE ${where} ORDER BY c.created_at DESC,c.id DESC LIMIT ?`,...args);
      return json(paged(rows,limit,row=>commentView(row,user)));
    }
    if (method === 'POST') {
      requireUser(user); const body=await payload(request); only(body,['context','body','parentId']); const value=context(body.context); await validContext(db,value);
      const content=text(body.body,'Comment',1,3000); const parentId=body.parentId ? id(body.parentId) : null;
      if (parentId) { const parent=await activeTarget(db,'comment',parentId); if (parent.context !== value) fail(400,'Replies must use the parent comment context.'); if (parent.parent_id) fail(400,'Reply to the top-level comment.'); }
      await rate(db,user,'comment'); const recordId=uuid(); const stamp=now();
      await run(db,'INSERT INTO community_comments (id,user_id,context,parent_id,body,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',recordId,user.id,value,parentId,content,stamp,stamp);
      return json({item:{id:recordId,context:value,parentId,body:content,author:{alias:user.alias,isYou:true},createdAt:stamp,updatedAt:stamp,canDelete:true}},201);
    }
  }
  match=path.match(/^\/api\/community\/comments\/([A-Za-z0-9_-]+)$/);
  if (match && method === 'DELETE') {
    requireUser(user); const recordId=id(match[1]); const original=await activeTarget(db,'comment',recordId);
    if (original.user_id !== user.id && !isMod(user)) fail(403,'Only the author or a moderator can remove this comment.');
    await rate(db,user,isMod(user)?'moderation':'comment');
    await run(db,'UPDATE community_comments SET deleted_at=?,updated_at=? WHERE id=? AND deleted_at IS NULL',now(),now(),recordId); return json({deleted:true});
  }
  if (path === `${PREFIX}/reports` && method === 'POST') {
    requireUser(user); const body=await payload(request); only(body,['targetType','targetId','reason']);
    if (!['post','comment'].includes(body.targetType)) fail(400,'Invalid report target.');
    const targetId=id(body.targetId); await activeTarget(db,body.targetType,targetId); const reason=text(body.reason,'Report reason',3,1000); await rate(db,user,'report');
    await run(db,'INSERT INTO community_reports (id,user_id,target_type,target_id,reason,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,target_type,target_id) DO NOTHING',uuid(),user.id,body.targetType,targetId,reason,now());
    return json({reported:true},201);
  }
  if (path === `${PREFIX}/moderation/reports` && method === 'GET') {
    requireUser(user); if (!isMod(user)) fail(403,'Moderator access required.');
    const status=url.searchParams.get('status') || 'open'; if (!['open','reviewed','dismissed'].includes(status)) fail(400,'Invalid report status.');
    const {limit,before}=page(url); const args=[status]; let where='r.status=?';
    if (before) { where+=' AND (r.created_at < ? OR (r.created_at = ? AND r.id < ?))'; args.push(before[0],before[0],before[1]); } args.push(limit+1);
    const rows=await all(db,`SELECT r.*,u.alias, COALESCE(p.id,c.id) AS content_id,
      CASE WHEN r.target_type='post' THEN p.body ELSE c.body END AS content_body,
      CASE WHEN r.target_type='post' THEN p.deleted_at ELSE c.deleted_at END AS content_deleted_at
      FROM community_reports r JOIN community_users u ON u.id=r.user_id
      LEFT JOIN community_posts p ON r.target_type='post' AND p.id=r.target_id
      LEFT JOIN community_comments c ON r.target_type='comment' AND c.id=r.target_id
      WHERE ${where} ORDER BY r.created_at DESC,r.id DESC LIMIT ?`,...args);
    return json(paged(rows,limit,row=>({id:row.id,targetType:row.target_type,targetId:row.target_id,reason:row.reason,status:row.status,reporterAlias:row.alias,createdAt:row.created_at,reviewedAt:row.reviewed_at,target:row.content_id?{id:row.content_id,body:row.content_body,deleted:row.content_deleted_at!==null}:null})));
  }
  match=path.match(/^\/api\/community\/moderation\/reports\/([A-Za-z0-9_-]+)$/);
  if (match && method === 'PATCH') {
    requireUser(user); if (!isMod(user)) fail(403,'Moderator access required.');
    const body=await payload(request); only(body,['status','removeTarget']);
    if (!['reviewed','dismissed'].includes(body.status) || (body.removeTarget !== undefined && typeof body.removeTarget !== 'boolean')) fail(400,'Choose reviewed or dismissed.');
    if (body.status==='dismissed' && body.removeTarget) fail(400,'A dismissed report cannot remove content.');
    const report=await first(db,'SELECT * FROM community_reports WHERE id=?',id(match[1])); if (!report) fail(404,'Report not found.');
    await rate(db,user,'moderation'); const stamp=now();
    const statements=[stmt(db,'UPDATE community_reports SET status=?,reviewed_at=?,reviewed_by=? WHERE id=?',body.status,stamp,user.id,report.id)];
    if (body.removeTarget) { const table=report.target_type==='post'?'community_posts':'community_comments'; statements.push(stmt(db,`UPDATE ${table} SET deleted_at=?,updated_at=? WHERE id=? AND deleted_at IS NULL`,stamp,stamp,report.target_id)); }
    await db.batch(statements); return json({reviewed:true});
  }
  fail(404,'Community endpoint not found.');
}
export async function handleCommunity(request,env,ctx) {
  try { return await api(request,env); }
  catch (error) {
    if (error instanceof ApiError) return json({error:error.message},error.status);
    console.error('Community API error:',error?.message || 'Unknown database failure');
    return json({error:'Community is temporarily unavailable. Please try again.'},503);
  }
}
