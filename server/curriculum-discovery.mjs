/* Public CourseLeaf requirement discovery. Private student data never enters this module. */
const VERSION=1,REVISION='courseleaf-v1',GOOD_TTL=30*86400,OTHER_TTL=86400,MAX_BYTES=1024*1024,MAX_REQUESTS=3,TIMEOUT_MS=8000;
const HOSTS=new Set(['catalog.liberty.edu','catalog.odu.edu']);
const VOID=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
const GRADUATE=new Set(['master','doctorate','specialist']);
const LEVELS=new Set(['associate','bachelor',...GRADUATE]);
const ALTERNATIVE_PROVIDERS=new Set(['sophia','studycom','clep','dsst','saylor','straighterline','modernstates','davar','coopersmith']);
const isGraduate=value=>/^(?:master|doctor|specialist|graduate)/i.test(String(value||''));
const pending=new Map();
const clean=s=>String(s??'').normalize('NFKC').replace(/[\u00a0\u200b\u200c\u200d\u00ad]/g,' ').replace(/\s+/g,' ').trim();
const norm=s=>clean(s).toLowerCase().replace(/[^a-z0-9]/g,'');
const array=v=>Array.isArray(v)?v:[];
const clone=v=>JSON.parse(JSON.stringify(v));
const issue=(code,message)=>({code,message});
const slug=s=>norm(s).slice(0,70)||'requirement';
function stableHash(s){let a=2166136261,b=2246822519;for(const c of String(s)){a=Math.imul(a^c.charCodeAt(0),16777619);b=Math.imul(b^c.charCodeAt(0),3266489917);}return(a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');}
function decode(s){const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—',rsquo:'’',lsquo:'‘',hellip:'…'};return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(m,k)=>k[0]==='#'?String.fromCodePoint(Math.min(0x10ffff,Math.max(0,parseInt(k.slice(k[1]?.toLowerCase()==='x'?2:1),k[1]?.toLowerCase()==='x'?16:10)||32))):entities[k.toLowerCase()]??m);}
function htmlTree(html){
 const root={tag:'root',attrs:{},children:[],parent:null},stack=[root];
 const input=String(html).replace(/<!--[\s\S]*?-->/g,'').replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
 for(const m of input.matchAll(/<\/?[^>]+>|[^<]+/g)){
  const token=m[0];if(token[0]!=='<'){stack.at(-1).children.push({tag:'#text',text:decode(token),parent:stack.at(-1)});continue;}
  if(/^<!|^<\?/.test(token))continue;
  const close=token.match(/^<\/\s*([\w:-]+)/);if(close){const tag=close[1].toLowerCase();for(let i=stack.length-1;i>0;i--)if(stack[i].tag===tag){stack.length=i;break;}continue;}
  const start=token.match(/^<\s*([\w:-]+)/);if(!start)continue;
  const tag=start[1].toLowerCase(),attrs=Object.create(null),rest=token.slice(start[0].length,-1);
  for(const a of rest.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s'"=<>`]+)))?/g))attrs[a[1].toLowerCase()]=decode(a[2]??a[3]??a[4]??'');
  const n={tag,attrs,children:[],parent:stack.at(-1)};stack.at(-1).children.push(n);if(!VOID.has(tag)&&!token.endsWith('/>'))stack.push(n);
 }
 return root;
}
function descendants(n,pred){const out=[];function walk(x){if(pred(x))out.push(x);for(const c of x.children||[])walk(c);}walk(n);return out;}
function text(n){if(!n)return'';if(n.tag==='#text')return n.text;return clean((n.children||[]).map(text).join(' '));}
function cellText(n){if(!n||n.tag==='sup')return'';if(n.tag==='#text')return n.text;return clean((n.children||[]).map(cellText).join(' '));}
function classes(n){return new Set(String(n.attrs?.class||'').split(/\s+/));}
function bodyRoot(tree){return descendants(tree,n=>n.attrs?.id==='textcontainer')[0]||descendants(tree,n=>n.attrs?.id==='content')[0]||descendants(tree,n=>n.tag==='main')[0]||tree;}
function credits(s){const m=clean(s).replace(/[\u2013\u2014]/g,'-').match(/^(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?$/);return m?{min:Number(m[1]),max:Number(m[2]??m[1])}:null;}
function courseCode(s){return clean(s).match(/^(?:or\s+)?([A-Z]{2,7})\s*[- ]?\s*(\d{3,4}[A-Z]?)$/)?.slice(1).join(' ')||null;}
function category(s){return/general education|foundational skills/i.test(s)?'general':/free electives/i.test(s)?'electives':'major';}
function levelOfCode(code){return Number(String(code).match(/\d+/)?.[0]||0);}
function secureURL(value,base){try{const u=new URL(value,base);if(u.protocol!=='https:'||!HOSTS.has(u.hostname)||u.username||u.password||u.port&&u.port!=='443'||u.href.length>1500)return null;if(!/^\/(undergraduate|graduate|programs)(\/|$)/.test(u.pathname))return null;u.hash='';return u.href;}catch{return null;}}
function titleKey(s){return norm(clean(s).replace(/\bmajor\b/gi,'').replace(/\b(?:online|resident|residential)\b/gi,'').replace(/&/g,'and'));}
function modalities(title,body,program){const out=[];if(/\bonline\b/i.test(title))out.push('online');if(/\bresident(?:ial)?\b/i.test(title))out.push('campus');if(!out.length){const m=body.match(/Delivery Format\s*:?\s*((?:Residential|Resident|Online)(?:\s+(?:and|&)\s+(?:Residential|Resident|Online))?(?:\s+Only)?)/i);if(m){if(/Online/i.test(m[1]))out.push('online');if(/Resident/i.test(m[1]))out.push('campus');}}return out.length?out:array(program.modalities).filter(x=>['online','campus'].includes(x));}
function headingContexts(root){const map=new Map();let section='Degree requirements';function walk(n){if(/^h[1-6]$/.test(n.tag))section=text(n);if(n.tag==='table')map.set(n,section);for(const c of n.children||[])walk(c);}walk(root);return map;}
function publishedTotal(root,tables,program){
 const headings=descendants(root,n=>/^h[1-6]$/.test(n.tag)&&/graduation requirements/i.test(text(n)));
 for(const h of headings){const siblings=h.parent?.children||[],at=siblings.indexOf(h);let value='';for(let i=at+1;i<siblings.length;i++){if(/^h[1-6]$/.test(siblings[i].tag))break;value+=' '+text(siblings[i]);}const m=value.match(/\b(\d+(?:\.\d+)?)\s+total\s+(?:credit\s+)?(?:hours|credits)\b/i)||value.match(/\btotal\s+(?:credit\s+)?(?:hours|credits)\s*:?\s*(\d+(?:\.\d+)?)/i);if(m)return{value:Number(m[1]),basis:'Published graduation requirements'};}
 const exact=descendants(root,n=>n.tag==='p'||n.tag==='li').map(text).map(s=>s.match(/^\s*(?:A )?(?:minimum of )?(\d+(?:\.\d+)?)\s+(?:total |program )?(?:credit hours|credits)\s+(?:are required|is required|for (?:the|this) degree)/i)||s.match(/^Total (?:Program )?(?:Credit Hours|Credits)\s*:\s*(\d+(?:\.\d+)?)\s*$/i)).filter(Boolean);
 if(exact.length&&new Set(exact.map(m=>Number(m[1]))).size===1)return{value:Number(exact[0][1]),basis:'Explicit published program total'};
 if(Number.isFinite(program.degreeCredits)&&program.degreeCredits>0)return{value:program.degreeCredits,basis:'Previously sourced exact program credit total'};
 if(tables.length===1){const contexts=headingContexts(root),t=tables[0],heading=contexts.get(t)||'',rows=descendants(t,n=>n.tag==='tr'),last=rows.at(-1),cells=(last?.children||[]).filter(n=>['td','th'].includes(n.tag)),label=clean(cells.slice(0,-1).map(text).join(' ')),c=credits(text(cells.at(-1)));
  const whole=/^(?:degree requirements|program requirements|curriculum|required courses)$/i.test(heading),partial=/\b(?:major|concentration|cognate|minor|foundation|general education) requirements\b/i.test(text(root));
  if(whole&&!partial&&c&&c.min===c.max&&/^total (?:credit hours|credits|hours)$/i.test(label))return{value:c.min,basis:'Complete degree/program requirement table with explicit whole-program heading and total'};
 }
 return null;
}
function degreePolicies(body,total,level){
 const policy={institutionMinCredits:null,upperMinCredits:null,externalMaxCredits:null},unresolved=[];
 let m=body.match(/\b(\d+)\s+(?:credit )?hours? must be completed through (?:Liberty University|Old Dominion University)/i);
 if(m)policy.institutionMinCredits=Number(m[1]);
 m=body.match(/\b(\d+)\s+(?:credit )?hours? must be upper[- ]level/i);if(m)policy.upperMinCredits=Number(m[1]);
 m=body.match(/(?:a )?maximum of (\d+)% (?:of (?:the )?(?:program )?(?:credit )?hours? )?(?:may be transferred|may be transfer credits|can be transferred)/i);
 if(m){policy.externalMaxCredits=Math.floor(total*Number(m[1])/100);policy.institutionMinCredits=Math.max(policy.institutionMinCredits||0,total-policy.externalMaxCredits);}
 m=body.match(/(?:a )?minimum of (\d+)% of (?:the )?(?:program )?(?:credit )?hours? must be completed through (?:Liberty University|Old Dominion University)/i);
 if(m)policy.institutionMinCredits=Math.max(policy.institutionMinCredits||0,Math.ceil(total*Number(m[1])/100));
 if(policy.institutionMinCredits===null)unresolved.push('Confirm academic residency and the exact program transfer limit. Neither is assumed to be zero.');
 if(policy.externalMaxCredits===null)unresolved.push('Confirm eligible transfer sources and program-specific transfer limits; no external credit allowance is inferred.');
 if(!GRADUATE.has(level)&&policy.upperMinCredits===null)unresolved.push('Confirm the degree’s upper-level and major-residency requirements.');
 return{policy,unresolved};
}

/** Strict facts-only parser. Ambiguous buckets, credit ranges or overlapping tables never become a ready plan. */
export function parseCourseLeafHTML(html,{program,url,checkedOn=new Date().toISOString().slice(0,10)}={}){
 if(!program?.id||!LEVELS.has(program.level))return{status:'needs-audit',reasons:[issue('degree_level_unknown','The exact award level must be established before building this program.')]};
 const tree=htmlTree(html),root=bodyRoot(tree),body=text(root),contexts=headingContexts(root),allTables=descendants(root,n=>n.tag==='table'&&classes(n).has('sc_courselist'));
 const tables=allTables.filter(t=>{for(let n=t;n;n=n.parent)if(/course.?sequence|plan.?of.?study|sc_plangrid|coursesequencecontainer/i.test((n.attrs?.id||'')+' '+(n.attrs?.class||'')))return false;return true;});
 const h1s=descendants(tree,n=>n.tag==='h1'),expectedTitle=titleKey(program.title);
 const titleNode=h1s.find(n=>n.attrs?.id==='pagetitle'||classes(n).has('page-title'))||h1s.find(n=>titleKey(text(n))===expectedTitle)||h1s.find(n=>titleKey(text(n)).startsWith(expectedTitle)&&expectedTitle.length>5);
 const title=text(titleNode)||text(descendants(root,n=>n.tag==='h1'&&!/^(?:course |undergraduate |graduate )?catalog/i.test(text(n)))[0])||program.title;
 const reasons=[],requirements=[],obligations=[],seen=new Set(),sid='public-source-'+stableHash(url),source={id:sid,title:'University-published curriculum: '+title,url,checked:checkedOn,reviewStatus:'automated-public-source'};
 if(!titleNode&&!descendants(root,n=>n.tag==='h1'&&!/^(?:course |undergraduate |graduate )?catalog/i.test(text(n))).length)reasons.push(issue('program_title_missing','The retrieved source does not establish the exact degree identity.'));
 else if(!titleKey(title).startsWith(expectedTitle))reasons.push(issue('program_identity_mismatch','The published curriculum title does not match the selected degree or concentration.'));
 if(program.creditUnit==='quarter'||/\bquarter\s+(?:credit\s+)?(?:hours|credits)\b/i.test(body))reasons.push(issue('credit_system_conflict','This adapter is scoped to Liberty and ODU semester credits. A conflicting credit unit needs explicit review.'));
 if(!tables.length)reasons.push(issue('requirements_not_published_here','This page does not expose a CourseLeaf requirement table. A program-family or directory page is not a curriculum.'));
 for(let ti=0;ti<tables.length;ti++){
  const table=tables[ti],section=contexts.get(table)||'Degree requirements';let group=section,last=null;
  for(const tr of descendants(table,n=>n.tag==='tr')){
   const cells=(tr.children||[]).filter(n=>['td','th'].includes(n.tag));if(!cells.length||cells.every(c=>c.tag==='th'))continue;
   const cellValues=cells.map(text),joined=clean(cellValues.join(' ')),first=cellValues[0],cls=classes(tr);
   if(cls.has('listsum')||/^(?:sub)?total\b/i.test(first)){last=null;continue;}
   const codeCell=cells.find(c=>classes(c).has('codecol'))||cells[0],titleCell=cells.find(c=>classes(c).has('titlecol'))||cells[1],hoursCell=cells.find(c=>classes(c).has('hourscol'))||cells.at(-1);
   const rawCode=cellText(codeCell),code=courseCode(rawCode),isOr=cls.has('orclass')||/^or\b/i.test(rawCode),credit=credits(cellText(hoursCell));
   if(!code&&(cls.has('areaheader')||cells.length===1||cells[0].attrs?.colspan)){
    group=joined;if(/\b(?:choose|select|electives? from|one of the following|credits from)\b/i.test(joined))reasons.push(issue('choice_group_requires_audit','A source-defined selection group needs an explicit allocation: '+joined));last=null;continue;
   }
   if(code&&isOr){
    if(!last||credit&&credit.min!==last.credits||credit&&credit.min!==credit.max){reasons.push(issue('ambiguous_or_choice','An alternative course does not have a proven shared credit value: '+joined));continue;}
    if(last.allowedCourseCodes.includes(code))continue;
    last.allowedCourseCodes.push(code);last.selectionRequired=true;last.options.push({id:'university-'+slug(code),provider:'University',code,title:clean(cellText(titleCell).replace(/^or\s+/i,''))||code,receivingCode:code,credits:last.credits,upper:levelOfCode(code)>=300&&levelOfCode(code)<500,sourceIds:[sid],evidence:'published',url});
    continue;
   }
   if(code){
    if(!credit){reasons.push(issue('course_credits_missing','The source does not establish credits for '+code+'.'));last=null;continue;}
    if(credit.min!==credit.max){reasons.push(issue('variable_course_credits','The required course has variable credits that need a selected, approved scenario: '+code+' ('+credit.min+'–'+credit.max+').'));last=null;continue;}
    if(credit.min===0){obligations.push({title:code+' '+(text(titleCell)||''),notes:'The source lists this as a required zero-credit item. Confirm its completion and approval requirements.',sourceIds:[sid]});last=null;continue;}
    if(seen.has(norm(code))){reasons.push(issue('duplicate_requirement_code','The source repeats '+code+' across requirement tables. Credit allocation and overlap need review.'));last=null;continue;}
    seen.add(norm(code));const titleText=cellText(titleCell)||code,id='source-'+slug(code),upper=levelOfCode(code)>=300&&levelOfCode(code)<500;
    last={id,code,title:titleText,credits:credit.min,category:category(section),group:'source-section-'+ti,upper,sourceIds:[sid],allowedCourseCodes:[code],options:[{id:'university-'+slug(code),provider:'University',code,title:titleText,receivingCode:code,credits:credit.min,upper,sourceIds:[sid],evidence:'published',url}]};
    requirements.push(last);continue;
   }
   if(credit&&credit.max>0&&cells.length>=2){reasons.push(issue('unallocated_credit_bucket','The source contains a requirement that still needs course allocation: '+joined));last=null;}
   else if(/\b(?:choose|select)\b/i.test(joined)){reasons.push(issue('choice_group_requires_audit','The source contains an unresolved selection rule: '+joined));last=null;}
  }
 }
 const total=publishedTotal(root,tables,program),sum=requirements.reduce((n,r)=>n+r.credits,0);
 if(total&&(program.level==='bachelor'&&total.value<120||program.level==='associate'&&total.value<60))reasons.push(issue('implausible_whole_degree_total','The published table appears to describe only part of this award. Its credit total is below the degree-level quality threshold; no generic credits are added.'));
 if(/(?:required to take these courses residentially|in support of ABET accreditation|ABET coordinator review)/i.test(body))reasons.push(issue('program_specific_residency','The source imposes section-specific accreditation residency. Those course groups need explicit residency allocation before accelerated options can be proposed.'));
 if(!total||!Number.isFinite(total.value)||total.value<=0||total.value>300)reasons.push(issue('published_total_missing','The complete degree credit total is not established by this page. No generic degree total is inserted.'));
 else if(Math.abs(sum-total.value)>.001)reasons.push(issue('credit_total_mismatch','The unique fixed-credit courses account for '+sum+' credits; the published program total is '+total.value+'. Choices, shared requirements or missing courses need review.'));
 if(!requirements.length)reasons.push(issue('no_fixed_requirements','No complete list of fixed-credit required courses was recovered.'));
 if(reasons.length)return{status:'needs-audit',reasons:[...new Map(reasons.map(r=>[r.code+'|'+r.message,r])).values()],facts:{title,publishedCredits:total?.value??null,parsedCredits:sum,requirementCount:requirements.length},source};
 const modes=modalities(title,body,program),policies=degreePolicies(body,total.value,program.level),year=body.match(/Catalog\s+(20\d{2}\s*[-–]\s*20\d{2})/i)?.[1]||text(tree).match(/Catalog\s+(20\d{2}\s*[-–]\s*20\d{2})/i)?.[1]||null;
 const minimum=body.match(/Grade of\s*[‘'“"]?([ABCDF])[’'”"]?\s+Minimum required for all (?:courses|major courses)/i)?.[1];if(minimum)for(const req of requirements)req.minimumGrade=minimum;
 const model={id:'source-curriculum-'+stableHash(program.id+'|'+url),school:program.school,title,format:modes.length===2?'Online and Residential':modes[0]==='online'?'Online':modes[0]==='campus'?'Residential':'Format needs confirmation',modalities:modes,level:program.level,catalog:year,totalCredits:total.value,creditSystem:program.creditUnit==='quarter'?'quarter':'semester',...policies.policy,sources:[source],requirements,obligations,coverage:'complete',coverageLabel:'University-published requirement ledger; automated extraction and transfer applicability require review.',completeExecutablePathway:false,reviewStatus:'automated-public-source',policyReviewRequired:policies.unresolved.length>0,policyReview:policies.unresolved.map((message,i)=>({field:'source-policy-'+i,status:'unverified',message,sourceIds:[sid]})),unresolved:[...policies.unresolved,'Confirm individual admission, catalog eligibility, prerequisites, course offerings and transfer evaluation.'],rulesNotes:['Credits are allocated only to the published fixed-credit requirements. Closed course alternatives count once.',total.basis+'. Automated extraction is not university approval or a community-verified plan.'],curriculumSections:tables.map((t,i)=>({id:'source-section-'+i,title:contexts.get(t)||'Degree requirements',requirementIds:requirements.filter(r=>r.group==='source-section-'+i).map(r=>r.id),sourceId:sid})).filter(s=>s.requirementIds.length)};
 return{status:'ready',model,source,facts:{publishedCredits:total.value,parsedCredits:sum,requirementCount:requirements.length}};
}

function programList(catalog){return array(catalog?.programs).length?catalog.programs:array(catalog?.pathways);}
function variantsFrom(html,url,program){const tree=htmlTree(html),base=titleKey(program.title),out=new Map();for(const a of descendants(tree,n=>n.tag==='a'&&n.attrs?.href)){
 const href=secureURL(a.attrs.href,url),label=text(a);if(!href||new URL(href).hostname!==new URL(url).hostname||href===url||/\.pdf(?:$|\?)/i.test(href)||!label)continue;
 const key=titleKey(label),exact=key===base,descendant=new URL(href).pathname.startsWith(new URL(url).pathname.replace(/\/?$/,'/')),family=key.startsWith(base)&&descendant;
 if(!exact&&!family)continue;
 if(/minor|certificate|course search|print|download|catalog home/i.test(label))continue;
 out.set(href,{id:stableHash(href),title:label,modalities:modalities(label,'',{modalities:[]}),url:href});
 }return[...out.values()].slice(0,80);}
async function sourceHash(html){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(html));return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');}
async function limitedPage(url,fetcher,budget,timeoutMs=TIMEOUT_MS){
 let current=url;
 while(true){if(++budget.count>MAX_REQUESTS)throw issue('fetch_budget_exceeded','The source requires more catalogue pages than the bounded import can safely resolve.');if(!secureURL(current))throw issue('source_not_allowed','The catalogue redirected outside the permitted university source.');
  const controller=new AbortController();let timer;
  try{return await Promise.race([new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(issue('source_timeout','The university source did not respond within eight seconds.'));},timeoutMs);}), (async()=>{
   const response=await fetcher(current,{method:'GET',redirect:'manual',signal:controller.signal,credentials:'omit',headers:{Accept:'text/html','User-Agent':'DegreeSteps curriculum reader (public course requirements only)'}});
   if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('Location');const next=secureURL(location,current);if(!location||!next||new URL(next).hostname!==new URL(current).hostname)throw issue('source_not_allowed','The catalogue redirected outside the permitted university source.');return{redirect:next};}
   if(!response.ok)throw issue('source_http_error','The university source returned HTTP '+response.status+'.');
   const type=response.headers.get('Content-Type')||'';if(type&&!/text\/html|application\/xhtml\+xml/i.test(type))throw issue('unsupported_source_type','The source is not an HTML requirement page. Import its official audit or curriculum document for review.');
   const length=Number(response.headers.get('Content-Length'));if(length>MAX_BYTES)throw issue('source_too_large','The source exceeds the one-megabyte import limit.');
   const reader=response.body?.getReader();let html='',size=0;const decoder=new TextDecoder();
   if(reader){try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw issue('source_too_large','The source exceeds the one-megabyte import limit.');}html+=decoder.decode(part.value,{stream:true});}html+=decoder.decode();}finally{reader.releaseLock();}}
   else{html=await response.text();if(new TextEncoder().encode(html).byteLength>MAX_BYTES)throw issue('source_too_large','The source exceeds the one-megabyte import limit.');}
   if(!/<(?:!doctype|html|table|main|div)\b/i.test(html))throw issue('unsupported_source_type','The source response does not contain an HTML curriculum.');return{html,url:current};
  })()]);}finally{clearTimeout(timer);}
 }
}

function d1Cache(db){return{async get(key){const row=await db.prepare('SELECT payload_json, expires_at FROM curriculum_source_cache WHERE cache_key = ?').bind(key).first();if(!row||Date.parse(row.expires_at)<=Date.now())return null;try{return JSON.parse(row.payload_json);}catch{return null;}},async put(key,payload){await db.prepare('INSERT INTO curriculum_source_cache (cache_key, program_id, source_url, payload_json, source_hash, checked_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET program_id=excluded.program_id, source_url=excluded.source_url, payload_json=excluded.payload_json, source_hash=excluded.source_hash, checked_at=excluded.checked_at, expires_at=excluded.expires_at').bind(key,payload.programId,payload.source?.url||null,JSON.stringify(payload),payload.source?.hash||null,payload.retrievedAt,payload.expiresAt).run();}};}
function borrowedOptions(model,reviewedModels,checkedOn){const graduate=GRADUATE.has(model.level),sources=new Map(model.sources.map(s=>[s.id,s]));let count=0;
 for(const reviewed of array(reviewedModels)){if(norm(reviewed.school)!==norm(model.school)||isGraduate(reviewed.level)!==graduate)continue;
  const refs=new Map(array(reviewed.sources).map(s=>[s.id,s]));for(const target of model.requirements)for(const req of array(reviewed.requirements))for(const option of array(req.options)){
   if(!option||option.provider==='University'||!['published','conditional'].includes(option.evidence)||option.credits!==target.credits)continue;
   const receiving=option.receivingCode||req.code;if(!courseCode(receiving)||!target.allowedCourseCodes.some(c=>norm(c)===norm(receiving)))continue;
   if(option.creditSystem&&option.creditSystem!==model.creditSystem)continue;
   if(graduate&&(!option.graduateCredit||!(option.creditOrigin==='institutional'||option.institutionalCredit===true||option.issuerType==='college')||ALTERNATIVE_PROVIDERS.has(norm(option.provider))))continue;
   if(option.expiresOn&&option.expiresOn<checkedOn)continue;
   const requiredIds=[...new Set([...array(option.sourceIds),...array(option.identitySourceIds),...array(option.codeAliasEvidence).flatMap(evidence=>array(evidence.sourceIds))])];
   const optionRefs=requiredIds.map(id=>refs.get(id));if(!array(option.sourceIds).length||optionRefs.some(s=>!s))continue;
   const entry=clone(option),remapped=new Map();for(const ref of optionRefs){const id='borrowed-'+stableHash(ref.id+'|'+ref.url);sources.set(id,{...clone(ref),id});remapped.set(ref.id,id);}
   const mapped=array(option.sourceIds).map(id=>remapped.get(id));
   if(entry.identitySourceIds)entry.identitySourceIds=array(entry.identitySourceIds).map(id=>remapped.get(id));
   if(entry.codeAliasEvidence)entry.codeAliasEvidence=array(entry.codeAliasEvidence).map(evidence=>({...evidence,sourceIds:array(evidence.sourceIds).map(id=>remapped.get(id))}));
   entry.id='borrowed-'+stableHash(option.provider+'|'+(option.code||option.id)+'|'+receiving);if(target.options.some(o=>o.id===entry.id))continue;
   entry.receivingCode=receiving;entry.sourceIds=[...mapped,model.sources[0].id];entry.evidence='conditional';entry.mappingScope='Same-school published receiving-course award; individual degree application needs confirmation.';entry.conditions=[...array(entry.conditions),'This receiving-course equivalency was researched in another program at the same university. Confirm current course/version, accepted credit and application to this exact degree before purchase.'];target.options.push(entry);count++;
  }
 }
 model.sources=[...sources.values()];if(count)model.unresolved.push('Proposed accelerated options reuse source-linked awards for the exact receiving course. Their application to this degree remains conditional.');return count;}
async function discover(program,variant,options){
 const checkedOn=new Date().toISOString().slice(0,10),initial=secureURL(program.url);if(!initial)return{version:VERSION,status:'needs-audit',programId:program.id,reason:'Automatic public-source importing currently supports CourseLeaf catalogues at Liberty and Old Dominion. This program needs its official curriculum or degree audit imported.',reasons:[issue('unsupported_catalogue','This school’s source needs a separate, verified catalogue adapter.')]};
 const expectedSchool=new URL(initial).hostname==='catalog.liberty.edu'?'libertyuniversity':'olddominionuniversity';
 if(norm(program.school)!==expectedSchool)return{version:VERSION,status:'needs-audit',programId:program.id,reason:'The catalogue host and school identity do not match.',reasons:[issue('source_school_mismatch','Correct the indexed university source before importing this program.')]};
 const budget={count:0},seen=new Set(),timeout=Number.isFinite(options.timeoutMs)&&options.timeoutMs>0?Math.min(options.timeoutMs,TIMEOUT_MS):TIMEOUT_MS;let url=initial,lastSource=null,selectedVariant=null;
 for(let step=0;step<MAX_REQUESTS;step++){
  let page=await limitedPage(url,options.fetcher||fetch,budget,timeout);while(page.redirect){if(seen.has(page.redirect))throw issue('source_redirect_loop','The university source redirected in a loop.');seen.add(url);url=page.redirect;page=await limitedPage(url,options.fetcher||fetch,budget,timeout);}
  seen.add(page.url);const hash=await sourceHash(page.html);lastSource={url:page.url,hash,algorithm:'sha256',checkedOn,reviewStatus:'automated-public-source'};
  const result=parseCourseLeafHTML(page.html,{program,url:page.url,checkedOn});
  if(result.status==='ready'){
   const model=result.model;borrowedOptions(model,options.reviewedModels,checkedOn);model.sources[0].contentHash=hash;
   // Version semantic requirement/equivalency facts, not page nonces or retrieval
   // dates. Older saved plans keep a distinct immutable model identity.
   const semantic={programId:program.id,url:page.url,school:model.school,title:model.title,level:model.level,catalog:model.catalog,totalCredits:model.totalCredits,creditSystem:model.creditSystem,institutionMinCredits:model.institutionMinCredits,upperMinCredits:model.upperMinCredits,externalMaxCredits:model.externalMaxCredits,requirements:model.requirements,obligations:model.obligations,sources:model.sources.map(s=>({id:s.id,url:s.url,revisionId:s.revisionId??s.sourceRevisionId??null}))};
   const requirementHash=await sourceHash(JSON.stringify(semantic));model.id='source-curriculum-'+requirementHash.slice(0,32);lastSource.requirementsHash=requirementHash;model.sourceDiscovery={...lastSource,programId:program.id,version:VERSION};
   const id=program.id+'-source-'+requirementHash.slice(0,16);
   return{version:VERSION,status:'ready',programId:program.id,model,route:{...clone(program),id,parentId:program.id,modelId:model.id,title:model.title,modalities:model.modalities,url:page.url,courseMapStatus:'automated-public-source',reviewStatus:'automated-public-source'},source:lastSource};
  }
  let variants=variantsFrom(page.html,page.url,program).filter(v=>!seen.has(v.url));
  if(variant){const chosen=variants.find(v=>v.id===variant);if(!chosen)return{version:VERSION,status:'needs-audit',programId:program.id,reason:'The selected catalogue variant is no longer available from the official source.',reasons:[issue('variant_not_found','Reload the official program choices before selecting a variant.')],source:lastSource};selectedVariant=chosen;url=chosen.url;variant='';continue;}
  if(variants.length>1&&array(program.modalities).length===1){const matching=variants.filter(v=>v.modalities.length===1&&v.modalities[0]===program.modalities[0]);if(matching.length===1)variants=matching;}
  if(variants.length===1){selectedVariant=variants[0];url=variants[0].url;continue;}
  if(variants.length>1)return{version:VERSION,status:'choose-variant',programId:program.id,reason:'Choose the exact delivery format or concentration published by the university.',variants,source:lastSource};
  return{version:VERSION,status:'needs-audit',programId:program.id,reason:result.reasons[0].message,reasons:result.reasons,facts:result.facts,source:lastSource};
 }
 return{version:VERSION,status:'needs-audit',programId:program.id,reason:'The exact curriculum requires additional catalogue reconciliation.',reasons:[issue('fetch_budget_exceeded','More than three public-source requests would be required.')],source:lastSource};
}

/** GET /api/curriculum?program=<known id>[&variant=<server-derived id>]. */
export async function handleCurriculumDiscovery(request,env={},options={}){
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=60','X-Content-Type-Options':'nosniff'},respond=(value,status=200,extra={})=>new Response(JSON.stringify(value),{status,headers:{...headers,...extra}});
 if(request.method!=='GET')return respond({error:'Use GET to read public curriculum facts.'},405,{Allow:'GET'});
 const params=new URL(request.url).searchParams,id=params.get('program')||'',variant=params.get('variant')||'';
 if([...params.keys()].some(k=>!['program','variant'].includes(k))||id.length>200||!id||variant&&!/^[a-f0-9]{16}$/.test(variant))return respond({error:'Use a known program ID and a university-provided variant ID.'},400);
 const program=programList(options.catalog).find(p=>p.id===id);if(!program)return respond({error:'Program not found.'},404);
 const cache=options.cache||env.DB?.prepare&&d1Cache(env.DB);if(!cache)return respond({error:'Curriculum caching is not available. Your saved plan has not been changed.',code:'cache_unavailable'},503,{'Cache-Control':'no-store'});
 const key=REVISION+':'+id+':'+(variant||'default');
 try{
  const saved=await cache.get(key);if(saved&&(!saved.expiresAt||Date.parse(saved.expiresAt)>Date.now()))return respond({...saved,cached:true});
  if(!pending.has(key))pending.set(key,(async()=>{let payload;try{payload=await discover(program,variant,options);}catch(error){const reason=error?.code&&error?.message?error:issue('source_unavailable','The official curriculum could not be retrieved. Its requirements still need review.');payload={version:VERSION,status:'needs-audit',programId:id,reason:reason.message,reasons:[reason]};}
   const ttl=['ready','choose-variant'].includes(payload.status)?GOOD_TTL:OTHER_TTL;payload.retrievedAt=new Date().toISOString();payload.expiresAt=new Date(Date.now()+ttl*1000).toISOString();payload.cached=false;
   if(payload.status==='ready'){const revisionKey='revision:'+payload.model.id;if(!await cache.get(revisionKey)){const revision=clone(payload),revisionTtl=10*365*86400;revision.expiresAt=new Date(Date.now()+revisionTtl*1000).toISOString();await cache.put(revisionKey,revision,revisionTtl);}}
   await cache.put(key,payload,ttl);return payload;})().finally(()=>pending.delete(key)));
  return respond(await pending.get(key));
 }catch{return respond({error:'The curriculum cache could not be read or updated. Your saved plan has not been changed.',code:'cache_unavailable'},503,{'Cache-Control':'no-store'});}
}
