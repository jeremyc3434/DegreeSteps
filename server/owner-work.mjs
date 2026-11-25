/** Business-work routes called only after the central pinned-owner / CSRF guards.
 * No private plans are read and no email, payment or external service is called. */
const PRIORITIES=['low','normal','high'],CATEGORIES=['account','plan','course','bug','other'];
const STATES={tasks:['todo','doing','waiting','done'],support:['open','in-progress','waiting','resolved'],partners:['prospect','contacted','discussing','active','paused'],leads:['new','reviewing','qualified','shared','closed'],finance:['pending','confirmed','void']};
const tables={tasks:'owner_tasks',support:'support_tickets',partners:'owner_partners',leads:'owner_lead_workflows',finance:'owner_financial_records'};
const kinds={partners:['college','provider','other'],finance:['revenue','expense','invoice'],leads:['school-inquiry','plan-review','college-interest']};
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k),object=v=>v&&typeof v==='object'&&!Array.isArray(v),text=v=>typeof v==='string'?v.trim():'',idOK=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/.test(v),changes=r=>Number(r?.meta?.changes)||0;
function problem(c,status,message,code='invalid_request'){c.fail(status,message,code);throw Error(message);}
function field(c,v,label,max=200,{required=false,multiline=false}={}){if(typeof v!=='string')problem(c,400,label+' must be text.');const s=v.trim();if((required&&!s)||s.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s)||!multiline&&/[\r\n]/.test(s))problem(c,400,'Enter a valid '+label.toLowerCase()+'.');return s;}
function enumValue(c,v,allowed,label){if(!allowed.includes(v))problem(c,400,'Choose a supported '+label+'.');return v;}
function day(c,v,label,{optional=true}={}){if(v===''&&optional)return '';if(typeof v!=='string'||!/^20\d\d-\d\d-\d\d$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)problem(c,400,'Enter a real '+label+' date.');return v;}
function email(c,v){const s=field(c,v,'contact email',254);if(s&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s))problem(c,400,'Enter a valid contact email.');return s;}
function website(c,v){const s=field(c,v,'website',1500);if(s){try{const u=new URL(s);if(u.protocol!=='https:'||u.username||u.password)throw Error();}catch{problem(c,400,'Use a public HTTPS website without credentials.');}}return s;}
function only(c,body,keys){if(!object(body)||Object.keys(body).some(k=>!keys.includes(k)))problem(c,400,'This form contains an unsupported field.');}
function revision(c,value){if(!Number.isSafeInteger(value)||value<1)problem(c,400,'Reload the current record before saving.','revision_required');return value;}
function clock(c){return Number.isSafeInteger(c.now)&&c.now>0?c.now:Date.now();}
function actor(c){if(!idOK(c.user?.id))problem(c,401,'Sign in to continue.','sign_in_required');return c.user.id;}
function raw(c,sql,values=[]){return c.db.prepare(sql).bind(...values);}
async function all(c,sql,values=[]){return (await raw(c,sql,values).all())?.results||[];}
async function first(c,sql,values=[]){return raw(c,sql,values).first();}
function record(row){if(!row)return null;const out={};for(const [key,value] of Object.entries(row)){if(['search_key','last_event_id'].includes(key))continue;out[key.replace(/_([a-z])/g,(_,c)=>c.toUpperCase())]=value;}if(own(out,'diagnosticsJson')){out.diagnostics=JSON.parse(out.diagnosticsJson);delete out.diagnosticsJson;out.diagnosticsConsent=out.diagnosticsConsent===1;}return out;}
function cursor(row){return btoa(JSON.stringify({updatedAt:row.updated_at,id:row.id})).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function listQuery(c,url,resource,{student=false}={}){
 const allowed=['limit','cursor','status','q'];for(const key of url.searchParams.keys())if(!allowed.includes(key))problem(c,400,'Choose a supported list filter.');
 const n=url.searchParams.get('limit'),limit=n===null?25:Number(n);if(!Number.isInteger(limit)||limit<1||limit>50)problem(c,400,'Choose a page size from 1 to 50.');
 const filters=[],values=[];if(student){filters.push('user_id=?');values.push(actor(c));}
 const status=url.searchParams.get('status');if(status){enumValue(c,status,STATES[resource],'status');filters.push((resource==='partners'?'stage':'status')+'=?');values.push(status);}
 const q=url.searchParams.get('q');if(q!==null&&q!==''){const search=field(c,q,'search',100,{required:true}).toLowerCase();if(search.length<2)problem(c,400,'Enter at least two search characters.');filters.push('search_key>=? AND search_key<?');values.push(search,search+'\uffff');}
 const token=url.searchParams.get('cursor');if(token){let v;try{if(token.length>1000||!/^[A-Za-z0-9_-]+$/.test(token))throw Error();v=JSON.parse(atob(token.replace(/-/g,'+').replace(/_/g,'/')));}catch{problem(c,400,'Reload this list to get a valid page.');}if(!Number.isSafeInteger(v?.updatedAt)||v.updatedAt<0||!idOK(v?.id))problem(c,400,'Reload this list to get a valid page.');filters.push('(updated_at<? OR (updated_at=? AND id<?))');values.push(v.updatedAt,v.updatedAt,v.id);}
 return {limit,where:filters.length?' WHERE '+filters.join(' AND '):'',values};
}
const options=resource=>({statuses:STATES[resource],...(resource==='tasks'||resource==='support'?{priorities:PRIORITIES}:{}),...(resource==='support'?{categories:CATEGORIES}:{}),...(kinds[resource]?{kinds:kinds[resource]}:{})});
async function summary(c,resource,{student=false}={}){
 const scope=student?' WHERE user_id=?':'',values=student?[actor(c)]:[],status=resource==='partners'?'stage':'status';
 const counts=await all(c,`SELECT ${status} AS status,count(*) AS count FROM ${tables[resource]}${scope} GROUP BY ${status}`,values),out={total:counts.reduce((n,r)=>n+Number(r.count),0),byStatus:Object.fromEntries(counts.map(r=>[r.status,Number(r.count)]))};
 if(resource==='finance'){
  const sums=await all(c,"SELECT currency,kind,status,sum(amount_minor) AS amount,count(*) AS count FROM owner_financial_records WHERE source='manual' GROUP BY currency,kind,status");
  out.source='manual';out.currencies={};for(const row of sums){const bucket=out.currencies[row.currency]||={confirmedRevenueMinor:0,confirmedExpenseMinor:0,pendingInvoiceMinor:0,confirmedInvoiceMinor:0};if(row.kind==='revenue'&&row.status==='confirmed')bucket.confirmedRevenueMinor+=Number(row.amount);if(row.kind==='expense'&&row.status==='confirmed')bucket.confirmedExpenseMinor+=Number(row.amount);if(row.kind==='invoice'&&row.status==='pending')bucket.pendingInvoiceMinor+=Number(row.amount);if(row.kind==='invoice'&&row.status==='confirmed')bucket.confirmedInvoiceMinor+=Number(row.amount);}
  out.disclosure='Manual records only. Pending invoices and opportunities are not revenue. Confirmed invoices are tracked separately from manually recorded revenue; no recurring-revenue metric or payment-provider reconciliation is inferred.';
 }
 return out;
}
function auditStatements(c,resource,id,version,eventId,action,fields,{guarded=false}={}){
 const now=clock(c),params=[eventId,resource,id,version,actor(c),action,JSON.stringify(fields),now];
 const sql=guarded?`INSERT INTO owner_work_events(id,resource,record_id,revision,actor_id,action,changed_fields_json,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM ${tables[resource]} WHERE id=? AND last_event_id=?)`:'INSERT INTO owner_work_events(id,resource,record_id,revision,actor_id,action,changed_fields_json,created_at) VALUES(?,?,?,?,?,?,?,?)';
 const statements=[raw(c,sql,guarded?[...params,id,eventId]:params)];
 if(typeof c.audit==='function')statements.push(c.audit(resource+'.'+action,resource,id,{revision:version,fields}));return statements;
}
function defaults(resource,c){if(resource==='tasks')return {title:'',description:'',status:'todo',priority:'normal',dueOn:''};if(resource==='partners')return {name:'',kind:'other',website:'',contactName:'',contactEmail:'',stage:'prospect',notes:''};if(resource==='finance')return {kind:'revenue',status:'pending',amountMinor:0,currency:'USD',occurredOn:new Date(clock(c)).toISOString().slice(0,10),periodStart:'',periodEnd:'',counterparty:'',description:''};return {};}
function fields(c,resource,body,{patch=false,current=null}={}){
 const definitions={tasks:{title:v=>field(c,v,'title',200,{required:true}),description:v=>field(c,v,'description',4000,{multiline:true}),status:v=>enumValue(c,v,STATES.tasks,'status'),priority:v=>enumValue(c,v,PRIORITIES,'priority'),dueOn:v=>day(c,v,'due')},partners:{name:v=>field(c,v,'partner name',200,{required:true}),kind:v=>enumValue(c,v,kinds.partners,'partner kind'),website:v=>website(c,v),contactName:v=>field(c,v,'contact name',100),contactEmail:v=>email(c,v),stage:v=>enumValue(c,v,STATES.partners,'partner stage'),notes:v=>field(c,v,'notes',4000,{multiline:true})},finance:{kind:v=>enumValue(c,v,kinds.finance,'record kind'),status:v=>enumValue(c,v,STATES.finance,'status'),amountMinor:v=>{if(!Number.isSafeInteger(v)||v<0||v>100000000000)problem(c,400,'Enter an amount in whole minor currency units.');return v;},currency:v=>{if(typeof v!=='string'||!/^[A-Z]{3}$/.test(v))problem(c,400,'Use a three-letter uppercase currency code.');return v;},occurredOn:v=>day(c,v,'record',{optional:false}),periodStart:v=>day(c,v,'period start'),periodEnd:v=>day(c,v,'period end'),counterparty:v=>field(c,v,'counterparty',200),description:v=>field(c,v,'description',4000,{multiline:true})},support:{status:v=>enumValue(c,v,STATES.support,'ticket status'),priority:v=>enumValue(c,v,PRIORITIES,'priority')},leads:{status:v=>enumValue(c,v,STATES.leads,'lead status'),notes:v=>field(c,v,'notes',4000,{multiline:true})}};
 const definition=definitions[resource];only(c,body,[...Object.keys(definition),...(patch?['revision']:[])]);const values=patch?{}:defaults(resource,c);for(const [key,value] of Object.entries(body))if(key!=='revision')values[key]=definition[key](value);for(const [key,value] of Object.entries(values))values[key]=definition[key](value);
 if(resource==='finance'){const candidate={...current,...values};if(Boolean(candidate.periodStart)!==Boolean(candidate.periodEnd)||candidate.periodStart&&candidate.periodEnd<candidate.periodStart)problem(c,400,'Enter both period dates in chronological order.');}
 if(!Object.keys(values).length)problem(c,400,'Choose a change to save.');return values;
}
const column=k=>k.replace(/[A-Z]/g,c=>'_'+c.toLowerCase());
async function create(c,resource,values,{extraStatements=[],searchLabel=''}={}){
 const now=clock(c),id=crypto.randomUUID(),eventId=crypto.randomUUID(),data={id,...values,revision:1,createdBy:actor(c),updatedBy:actor(c),lastEventId:eventId,createdAt:now,updatedAt:now,searchKey:String(searchLabel||values.title||values.name||values.subject||values.counterparty||values.sourceId||'').toLowerCase()},keys=Object.keys(data);
 const statements=[raw(c,`INSERT INTO ${tables[resource]}(${keys.map(column).join(',')}) VALUES(${keys.map(()=>'?').join(',')})`,Object.values(data)),...extraStatements.map(factory=>factory(id)),...auditStatements(c,resource,id,1,eventId,'create',Object.keys(values))];
 await c.db.batch(statements);return first(c,`SELECT * FROM ${tables[resource]} WHERE id=?`,[id]);
}
async function get(c,resource,id,{student=false}={}){if(!idOK(id))problem(c,404,'This record was not found.','not_found');const row=await first(c,`SELECT * FROM ${tables[resource]} WHERE id=?${student?' AND user_id=?':''}`,[id,...(student?[actor(c)]:[])]);if(!row)problem(c,404,'This record was not found.','not_found');return row;}
async function update(c,resource,id,version,values,{extraStatements=[],auditFields=null,auditAction='update'}={}){
 const eventId=crypto.randomUUID(),data={...values,updatedBy:actor(c),updatedAt:clock(c),lastEventId:eventId};if(own(values,'title')||own(values,'name')||own(values,'subject')||own(values,'counterparty'))data.searchKey=String(values.title||values.name||values.subject||values.counterparty||'').toLowerCase();
 const results=await c.db.batch([raw(c,`UPDATE ${tables[resource]} SET ${Object.keys(data).map(k=>column(k)+'=?').join(',')},revision=revision+1 WHERE id=? AND revision=?`,[...Object.values(data),id,version]),...extraStatements.map(factory=>factory(eventId)),...auditStatements(c,resource,id,version+1,eventId,auditAction,auditFields||Object.keys(values),{guarded:true})]);
 if(!changes(results[0]))problem(c,409,'This record changed in another tab. Reload it before saving.','revision_conflict');return first(c,`SELECT * FROM ${tables[resource]} WHERE id=?`,[id]);
}
async function leadSource(c,kind,id){
 if(!kinds.leads.includes(kind)||!idOK(id))problem(c,400,'Choose an existing consented request.');
 const cutoff=clock(c)-365*86400000;let row;
 if(kind==='school-inquiry')row=await first(c,'SELECT id,created_at,school,plan_title,first_name AS name,email,phone,consent_version,consent_text FROM school_inquiries WHERE id=? AND created_at>=?',[id,cutoff]);
 if(kind==='plan-review')row=await first(c,'SELECT id,created_at,plan_title,name,email,consent_version,consent_text FROM plan_review_requests WHERE id=? AND created_at>=?',[id,cutoff]);
 if(kind==='college-interest')row=await first(c,"SELECT r.id,r.created_at,o.name AS school,r.program_interest AS plan_title,r.contact_name AS name,r.contact_email AS email,r.consent_version,r.consent_text FROM college_interest_requests r JOIN college_organizations o ON o.id=r.organization_id WHERE r.id=? AND r.withdrawn_at IS NULL AND o.status='verified'",[id]);
 return row&&text(row.consent_version)&&text(row.consent_text)?{id:row.id,kind,school:row.school||'',planTitle:row.plan_title||'',name:row.name,email:row.email,phone:row.phone||'',consentVersion:row.consent_version,consentText:row.consent_text,createdAt:row.created_at}:null;
}
async function leadCandidates(c){
 const cutoff=clock(c)-365*86400000,queries=[
  ['school-inquiry',"SELECT id,created_at,school,plan_title FROM school_inquiries WHERE created_at>=? AND consent_version!='' AND consent_text!='' AND id NOT IN(SELECT source_id FROM owner_lead_workflows WHERE source_kind='school-inquiry') ORDER BY created_at DESC,id DESC LIMIT 10",[cutoff]],
  ['plan-review',"SELECT id,created_at,plan_title FROM plan_review_requests WHERE created_at>=? AND consent_version!='' AND consent_text!='' AND id NOT IN(SELECT source_id FROM owner_lead_workflows WHERE source_kind='plan-review') ORDER BY created_at DESC,id DESC LIMIT 10",[cutoff]],
  ['college-interest',"SELECT r.id,r.created_at,o.name AS school,r.program_interest AS plan_title FROM college_interest_requests r JOIN college_organizations o ON o.id=r.organization_id WHERE r.withdrawn_at IS NULL AND o.status='verified' AND r.consent_version!='' AND r.consent_text!='' AND r.id NOT IN(SELECT source_id FROM owner_lead_workflows WHERE source_kind='college-interest') ORDER BY r.created_at DESC,r.id DESC LIMIT 10",[]]
 ];
 const candidates=[];for(const [kind,sql,values] of queries)for(const row of await all(c,sql,values))candidates.push({sourceKind:kind,sourceId:row.id,label:[row.school||'Plan review',row.plan_title||'Request',new Date(row.created_at).toISOString().slice(0,10)].join(' · '),createdAt:row.created_at});return candidates.sort((a,b)=>b.createdAt-a.createdAt||a.sourceId.localeCompare(b.sourceId));
}
async function present(c,resource,row,{student=false}={}){const item=record(row);if(resource==='leads'){item.request=await leadSource(c,row.source_kind,row.source_id);item.sourceAvailable=Boolean(item.request);item.disclosure='Workflow metadata only. This action does not send a message or share student information.';}if(student){delete item.createdBy;delete item.updatedBy;delete item.contactEmail;delete item.userId;}return item;}
async function list(c,resource,url,opts={}){const query=listQuery(c,url,resource,opts),rows=await all(c,`SELECT * FROM ${tables[resource]}${query.where} ORDER BY updated_at DESC,id DESC LIMIT ?`,[...query.values,query.limit+1]),hasMore=rows.length>query.limit,page=rows.slice(0,query.limit);return {items:await Promise.all(page.map(row=>present(c,resource,row,opts))),nextCursor:hasMore?cursor(page.at(-1)):null,summary:await summary(c,resource,opts),options:{...options(resource),...(resource==='leads'?{sources:await leadCandidates(c)}:{})}};}
async function messages(c,id,{student=false,cursor:token=null}={}){
 let where='ticket_id=?'+(student?" AND visibility='student'":''),values=[id];if(token){let page;try{if(token.length>1000||!/^[A-Za-z0-9_-]+$/.test(token))throw Error();page=JSON.parse(atob(token.replace(/-/g,'+').replace(/_/g,'/')));}catch{problem(c,400,'Reload the ticket history.');}if(!Number.isSafeInteger(page?.updatedAt)||!idOK(page?.id))problem(c,400,'Reload the ticket history.');where+=' AND (ticket_revision<? OR (ticket_revision=? AND id<?))';values.push(page.updatedAt,page.updatedAt,page.id);}
 const rows=await all(c,'SELECT * FROM support_messages WHERE '+where+' ORDER BY ticket_revision DESC,id DESC LIMIT 51',values),page=rows.slice(0,50);return {messages:page.reverse().map(row=>{const item=record(row);if(student)delete item.authorId;return item;}),messagesNextCursor:rows.length>50?cursor({...rows[49],updated_at:rows[49].ticket_revision}):null};
}
async function reserve(c,kind){const now=clock(c),day=new Date(now).toISOString().slice(0,10),cap=kind==='ticket'?5:30;const result=await raw(c,'INSERT INTO support_rate_limits(user_id,day,kind,count) VALUES(?,?,?,1) ON CONFLICT(user_id,day,kind) DO UPDATE SET count=count+1 WHERE count<?',[c.rateKey||actor(c),day,kind,cap]).run();if(!changes(result))problem(c,429,'You have sent several support requests today. Please try again tomorrow.','support_daily_limit');await raw(c,'DELETE FROM support_rate_limits WHERE rowid IN (SELECT rowid FROM support_rate_limits WHERE day<? LIMIT 500)',[new Date(now-7*86400000).toISOString().slice(0,10)]).run();}
function diagnostics(c,body){if(own(body,'diagnosticsConsent')&&typeof body.diagnosticsConsent!=='boolean')problem(c,400,'Choose whether to include troubleshooting details.');const value=body.diagnostics??{};if(!object(value)||Object.keys(value).length&&body.diagnosticsConsent!==true)problem(c,400,'Choose whether to include the listed troubleshooting details.','diagnostics_consent_required');only(c,value,['page','issueCode','browserFamily','viewport']);const out={};if(own(value,'page'))out.page=enumValue(c,value.page,['/','/plan.html','/courses.html','/account.html','/login.html','/portal.html','/programs.html','/request-plan.html','/help.html'],'page');if(own(value,'issueCode'))out.issueCode=enumValue(c,value.issueCode,['sign-in','save-plan','import-courses','degree-plan','course-progress','page-error','other'],'issue');if(own(value,'browserFamily'))out.browserFamily=enumValue(c,value.browserFamily,['Chrome','Safari','Firefox','Edge','Other'],'browser');if(own(value,'viewport'))out.viewport=enumValue(c,value.viewport,['mobile','tablet','desktop'],'screen size');return out;}
async function createTicket(c,body,{student=false,anonymous=false}={}){
 only(c,body,['subject','category','body','diagnostics','diagnosticsConsent',...(anonymous?['email','contactConsent','website']:[])]);const subject=field(c,body.subject,'subject',200,{required:true}),category=enumValue(c,body.category,CATEGORIES,'category'),message=field(c,body.body,'message',6000,{required:true,multiline:true}),info=diagnostics(c,body);if(student||anonymous)await reserve(c,'ticket');
 const row=await create(c,'support',{userId:student?actor(c):null,contactEmail:anonymous?email(c,body.email):student?text(c.user?.email):'',subject,category,status:'open',priority:'normal',diagnosticsConsent:body.diagnosticsConsent===true?1:0,diagnosticsJson:JSON.stringify(info)},{extraStatements:[id=>raw(c,'INSERT INTO support_messages(id,ticket_id,ticket_revision,author_id,author_role,visibility,body,created_at) VALUES(?,?,?,?,?,?,?,?)',[crypto.randomUUID(),id,1,actor(c),student||anonymous?'student':'owner',student||anonymous?'student':'internal',message,clock(c)])]});
 return {item:await present(c,'support',row,{student}),...await messages(c,row.id,{student})};
}
async function addMessage(c,id,body,{student=false}={}){
 only(c,body,student?['revision','body']:['revision','body','visibility']);const row=await get(c,'support',id,{student}),version=revision(c,body.revision),message=field(c,body.body,'message',6000,{required:true,multiline:true}),visibility=student?'student':enumValue(c,body.visibility??'student',['student','internal'],'message visibility');
 if(student)await reserve(c,'message');const nextStatus=student?'open':visibility==='student'?'waiting':row.status;
 const updated=await update(c,'support',id,version,{status:nextStatus},{auditFields:['status','message'],auditAction:'message',extraStatements:[eventId=>raw(c,'INSERT INTO support_messages(id,ticket_id,ticket_revision,author_id,author_role,visibility,body,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM support_tickets WHERE id=? AND last_event_id=?)',[crypto.randomUUID(),id,version+1,actor(c),student?'student':'owner',visibility,message,clock(c),id,eventId])]});
 return {item:await present(c,'support',updated,{student}),...await messages(c,id,{student}),delivery:'stored-in-portal',emailSent:false};
}
export async function handleOwnerWork(request,env,ctx){
 const c={...ctx,env},url=c.url||new URL(request.url),match=url.pathname.match(/^\/api\/owner\/(tasks|support|partners|leads|finance)(?:\/([^/]+))?(?:\/(messages))?\/?$/);if(!match)return null;
 actor(c);if(c.ownerAuthorized!==true)problem(c,403,'Only the configured business owner can use this workspace.','owner_required');const resource=match[1],id=match[2],messagePath=match[3];
 if(request.method==='GET'){
  if(!id)return c.json(await list(c,resource,url));if(id==='summary')return c.json(await summary(c,resource));const row=await get(c,resource,id);return c.json({item:await present(c,resource,row),...(resource==='support'?await messages(c,id,{cursor:url.searchParams.get('cursor')}):{})});
 }
 if(request.method==='POST'&&messagePath&&resource==='support')return c.json(await addMessage(c,id,await c.readJson(request,16384)),201);
 if(request.method==='POST'&&!id){const body=await c.readJson(request,16384);if(resource==='support')return c.json(await createTicket(c,body),201);
  if(resource==='leads'){only(c,body,['sourceKind','sourceId']);enumValue(c,body.sourceKind,kinds.leads,'request source');const source=await leadSource(c,body.sourceKind,body.sourceId);if(!source)problem(c,409,'This request no longer has active, available consent.','consent_unavailable');const duplicate=await first(c,'SELECT id FROM owner_lead_workflows WHERE source_kind=? AND source_id=?',[body.sourceKind,body.sourceId]);if(duplicate)problem(c,409,'This request is already in your pipeline.','already_imported');const row=await create(c,resource,{sourceKind:body.sourceKind,sourceId:body.sourceId,status:'new',notes:''},{searchLabel:source.school||source.planTitle||'Plan review'});return c.json({item:await present(c,resource,row)},201);}
  const row=await create(c,resource,{...fields(c,resource,body),...(resource==='finance'?{source:'manual'}:{})});return c.json({item:await present(c,resource,row)},201);
 }
 if(request.method==='PATCH'&&id&&!messagePath){const current=await get(c,resource,id),body=await c.readJson(request,16384),version=revision(c,body.revision),values=fields(c,resource,body,{patch:true,current:record(current)});const row=await update(c,resource,id,version,values);return c.json({item:await present(c,resource,row)});}
 problem(c,405,'Use a supported action for this record.','method_not_allowed');
}
/** Anonymous login help is deliberately write-only and cannot recover ticket history. */
async function anonymousLoginHelp(request,env,c){
 if(request.method!=='POST')problem(c,405,'Use the sign-in help form.','method_not_allowed');
 const origin=new URL(request.url).origin,site=request.headers.get('Sec-Fetch-Site');
 if(request.headers.get('Origin')!==origin||request.headers.get('X-Support-Request')!=='1'||site&&!['same-origin','none'].includes(site))problem(c,403,'Use the sign-in help form on DegreeSteps.','same_origin_required');
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))problem(c,415,'Send the help form as JSON.','json_required');
 const secret=[env.LEADS_HASH_SALT,env.AI_CONNECTIONS_MASTER_KEY].find(value=>typeof value==='string'&&value.length>=16&&value.length<=1024),ip=request.headers.get('CF-Connecting-IP');
 if(!secret||!ip||ip.length>64||!/^[0-9a-f:.]+$/i.test(ip))problem(c,503,'Sign-in help is temporarily unavailable. Please try again later.','support_unavailable');
 const body=await c.readJson(request,4096);only(c,body,['subject','category','body','email','contactConsent','website','diagnostics','diagnosticsConsent']);
 if(typeof body.website==='string'&&body.website.trim())return c.json({ok:true,receiptId:crypto.randomUUID()},201);
 if(body.contactConsent!==true||!text(body.email))problem(c,400,'Agree to use this email for your sign-in support request.','contact_consent_required');
 if(body.category!==undefined&&body.category!=='account')problem(c,400,'Use this form for sign-in or account access.');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const day=new Date(clock(c)).toISOString().slice(0,10),digest=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('degreesteps:support-anon:'+day+':'+ip)),hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 const anonymous={...c,audit:undefined,rateKey:'anon-'+hash,user:{id:'anonymous-'+crypto.randomUUID(),email:''}},result=await createTicket(anonymous,{...body,subject:body.subject||'Sign-in help',category:'account'},{anonymous:true});
 return c.json({ok:true,receiptId:result.item.id},201);
}
/** Parent authenticates the account and applies same-origin protection before writes. */
export async function handleStudentSupport(request,env,ctx){
 const c={...ctx,env},url=c.url||new URL(request.url);if(url.pathname==='/api/support/login-help')return anonymousLoginHelp(request,env,c);const match=url.pathname.match(/^\/api\/support\/tickets(?:\/([^/]+))?(?:\/(messages))?\/?$/);if(!match)return null;actor(c);const id=match[1],messagePath=match[2];
 if(request.method==='GET'){if(!id)return c.json(await list(c,'support',url,{student:true}));const row=await get(c,'support',id,{student:true});return c.json({item:await present(c,'support',row,{student:true}),...await messages(c,id,{student:true,cursor:url.searchParams.get('cursor')})});}
 if(request.method==='POST'&&!id)return c.json(await createTicket(c,await c.readJson(request,16384),{student:true}),201);
 if(request.method==='POST'&&id&&messagePath)return c.json(await addMessage(c,id,await c.readJson(request,16384),{student:true}),201);
 problem(c,405,'Use a supported support action.','method_not_allowed');
}
export async function ownerWorkSummary(ctx){const c=ctx;if(c.ownerAuthorized!==true)problem(c,403,'Owner access is required.','owner_required');return Object.fromEntries(await Promise.all(Object.keys(tables).map(async resource=>[resource,await summary(c,resource)])));}
