/** Owner-only Search Console setup and private, provenance-labelled CSV reports.
 * The parent owner router authorizes ctx and enforces write CSRF before dispatch.
 * This adapter never requests arbitrary URLs or claims Google ownership from DNS.
 */
const PREFIX='/api/owner/search-console',PROPERTY='degreesteps.com';
const SITE='https://degreesteps.com/',SITEMAP=SITE+'sitemap.xml';
const MAX_CSV=2097152,MAX_ROWS=5000,MAX_NORMALIZED=1900000,DAY=86400000;
const DOH='https://cloudflare-dns.com/dns-query?name=degreesteps.com&type=TXT';
const encoder=new TextEncoder(),own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const stmt=(db,sql,...values)=>db.prepare(sql).bind(...values);
const first=(db,sql,...values)=>stmt(db,sql,...values).first();
const all=async(db,sql,...values)=>(await stmt(db,sql,...values).all()).results||[];
const changes=result=>Number(result?.meta?.changes??result?.changes??0);
const nullable=value=>value===undefined?null:value;
function bad(ctx,message,status=400){ctx.fail(status,message);}
function fields(ctx,value,allowed){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))bad(ctx,'Use the supported Search Console fields.');}
function bounded(ctx,value,label,max,{empty=false}={}){if(typeof value!=='string'||value.length>max||(!empty&&!value.trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))bad(ctx,'Check '+label+'.');return value.trim();}
function date(ctx,value,label){if(typeof value!=='string'||!/^20\d\d-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)bad(ctx,'Use YYYY-MM-DD for '+label+'.');return value;}
function pinned(ctx,value){if(value!==undefined&&value!==PROPERTY&&value!=='sc-domain:'+PROPERTY)bad(ctx,'This console is connected only to degreesteps.com.');}
function active(ctx){if(ctx?.ownerAuthorized!==true){if(typeof ctx?.fail==='function')ctx.fail(403,'Only the pinned owner can open Search Console data.');throw Error('Use the authorized owner console.');}if(!ctx?.db||!ctx?.user?.id||typeof ctx.json!=='function'||typeof ctx.fail!=='function'||typeof ctx.audit!=='function')throw Error('Use the authorized owner console.');}

function csvRows(ctx,input){
  if(typeof input!=='string'||encoder.encode(input).byteLength>MAX_CSV)bad(ctx,'Upload a CSV file no larger than 2 MiB.',413);
  if(input.startsWith('PK\u0003\u0004'))bad(ctx,'Unzip the Google export and upload one CSV file at a time.');
  input=input.replace(/^\uFEFF/,'');let rows=[],row=[],cell='',quoted=false,closed=false;
  const finishCell=()=>{if(row.length>=5)bad(ctx,'Upload one report dimension and its Clicks, Impressions, CTR and Position columns.');row.push(cell);cell='';closed=false;};
  const finishRow=()=>{finishCell();if(row.some(value=>value.trim())){rows.push(row);if(rows.length>MAX_ROWS+1)bad(ctx,'Upload at most 5,000 report rows.',413);}row=[];};
  for(let index=0;index<input.length;index++){
    const char=input[index];
    if(quoted){if(char==='"'){if(input[index+1]==='"'){cell+='"';index++;}else{quoted=false;closed=true;}}else cell+=char;continue;}
    if(char==='"'){if(cell||closed)bad(ctx,'The CSV has an unexpected quotation mark.');quoted=true;continue;}
    if(char===','){finishCell();continue;}
    if(char==='\r'||char==='\n'){if(char==='\r'&&input[index+1]==='\n')index++;finishRow();continue;}
    if(closed){if(char===' '||char==='\t')continue;bad(ctx,'The CSV has text after a quoted cell.');}
    cell+=char;
  }
  if(quoted)bad(ctx,'The CSV contains an unfinished quoted cell.');
  if(cell||row.length||closed)finishRow();
  if(rows.length<2)bad(ctx,'Upload a report CSV with a header and at least one data row.');
  return rows;
}
const headerKey=value=>value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
const dimensions=new Map([['date','date'],['query','query'],['queries','query'],['top queries','query'],['page','page'],['pages','page'],['top pages','page'],['country','country'],['countries','country'],['device','device'],['devices','device']]);
const metrics=new Map([['clicks','clicks'],['impressions','impressions'],['ctr','reportedCtr'],['average ctr','reportedCtr'],['position','position'],['average position','position']]);
const unknown=value=>['','-','~','n/a','na'].includes(value.toLowerCase());
function metric(ctx,value,key){
  value=value.trim();if(unknown(value))return null;
  if(key==='clicks'||key==='impressions'){
    if(/^\d{1,3}(?:,\d{3})+$/.test(value))value=value.replaceAll(',','');
    if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value)))bad(ctx,'Clicks and impressions must be whole numbers or unknown markers.');return Number(value);
  }
  if(key==='reportedCtr'){
    const percent=value.endsWith('%');if(percent)value=value.slice(0,-1).trim();
    if(!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value))bad(ctx,'CTR must be a percentage, decimal fraction, or unknown marker.');
    const result=Number(value)/(percent?100:1);if(!Number.isFinite(result)||result<0||result>1)bad(ctx,'Use a percentage sign for CTR values above one.');return result;
  }
  if(!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)||!Number.isFinite(Number(value))||Number(value)>1000000)bad(ctx,'Average position must be a nonnegative number or unknown marker.');
  return Number(value)===0?null:Number(value);
}
function dimensionValue(ctx,value,dimension,period){
  value=bounded(ctx,value,'the '+dimension+' value',dimension==='page'?2048:dimension==='query'?1000:120);
  if(dimension==='date'){date(ctx,value,'report dates');if(value<period.startDate||value>period.endDate)bad(ctx,'A report date is outside the declared reporting period.');}
  if(dimension==='page'){
    let url;try{url=new URL(value);}catch{bad(ctx,'A page row needs its full site URL.');}
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.port||!(url.hostname===PROPERTY||url.hostname.endsWith('.'+PROPERTY)))bad(ctx,'Page rows must belong to the degreesteps.com Domain property.');
  }
  return value;
}
function aggregate(ctx,rows,dimension,period){
  if(dimension!=='date')return null;
  const sum=key=>{if(rows.some(row=>row[key]===null))return null;const result=rows.reduce((total,row)=>total+row[key],0);if(!Number.isSafeInteger(result))bad(ctx,'The imported metric total is too large.');return result;};
  const clicks=sum('clicks'),impressions=sum('impressions');
  const usablePosition=impressions!==null&&impressions>0&&rows.every(row=>row.impressions===0||row.position!==null);
  const weighted=usablePosition?rows.reduce((total,row)=>total+(row.position||0)*row.impressions,0)/impressions:null;
  const expectedDays=(Date.parse(period.endDate)-Date.parse(period.startDate))/DAY+1;
  return{scope:'imported-date-rows',completePeriod:rows.length===expectedDays,rowCount:rows.length,expectedDays,clicks,impressions,ctr:clicks!==null&&impressions>0?clicks/impressions:null,position:Number.isFinite(weighted)?weighted:null,positionIsApproximate:true,ctrBasis:'sum-clicks-divided-by-sum-impressions',positionBasis:'impression-weighted-exported-average-positions'};
}
export function parseSearchConsoleCSV(input,metadata,ctx){
  fields(ctx,metadata,['period']);fields(ctx,metadata.period,['startDate','endDate']);
  const period={startDate:date(ctx,metadata.period.startDate,'period start'),endDate:date(ctx,metadata.period.endDate,'period end')};if(period.startDate>period.endDate)bad(ctx,'The reporting period ends before it starts.');
  const grid=csvRows(ctx,input),header=grid.shift().map(headerKey),mapped=header.map(key=>dimensions.has(key)?'dimension':metrics.get(key));
  if(mapped.some(key=>!key)||mapped.filter(key=>key==='dimension').length!==1||new Set(mapped).size!==mapped.length||!mapped.includes('clicks')||!mapped.includes('impressions'))bad(ctx,'Use one Google Date, Query, Page, Country, or Device CSV with Clicks and Impressions columns. English export headers are supported.');
  const dimension=dimensions.get(header[mapped.indexOf('dimension')]),seen=new Set();
  const rows=grid.map(cells=>{
    if(cells.length!==header.length)bad(ctx,'A CSV row does not match its header columns.');
    const row={value:'',clicks:null,impressions:null,reportedCtr:null,position:null};
    for(let index=0;index<mapped.length;index++){const key=mapped[index];if(key==='dimension')row.value=dimensionValue(ctx,cells[index],dimension,period);else row[key]=metric(ctx,cells[index],key);}
    if(seen.has(row.value))bad(ctx,'The CSV repeats a dimension value. Upload one uncombined report export.');seen.add(row.value);return row;
  });
  const summary=aggregate(ctx,rows,dimension,period),rowsJson=JSON.stringify(rows);if(encoder.encode(rowsJson).byteLength>MAX_NORMALIZED)bad(ctx,'The normalized report is too large. Export a smaller date range or fewer rows.',413);
  return{dimension,rows,rowsJson,period,summary};
}

function settingsView(row){return{revision:Number(row?.revision||0),verificationToken:row?.verification_token||null,dnsTokenSaved:!!row?.verification_token,dnsStatus:row?.dns_status||'unchecked',dnsCheckedAt:nullable(row?.dns_checked_at),googleOwnershipReported:row?.google_ownership_reported===1,googleOwnershipReportedAt:nullable(row?.google_ownership_reported_at),sitemapSubmittedReported:row?.sitemap_submitted_reported===1,sitemapSubmittedReportedAt:nullable(row?.sitemap_submitted_reported_at),ownershipMeaning:'DNS token presence is not a Google ownership decision. Google ownership and sitemap submission are owner-reported.'};}
const metadataColumns='id,file_name,dimension,start_date,end_date,exported_on,search_type,filters,row_count,imported_at';
function importView(row){return{id:row.id,source:'google-search-console-csv',property:PROPERTY,fileName:row.file_name,dimension:row.dimension,period:{startDate:row.start_date,endDate:row.end_date},exportedOn:row.exported_on,searchType:row.search_type,filters:row.filters,rowCount:row.row_count,importedAt:row.imported_at};}
function reportSummary(row){const summary=JSON.parse(row.summary_json);return summary?{...importView(row),reportId:row.id,...summary}:null;}
export async function ownerSearchOverview(ctx){
  active(ctx);const [settings,imports,latest]=await Promise.all([
    first(ctx.db,'SELECT * FROM owner_search_settings WHERE property=?',PROPERTY),
    all(ctx.db,'SELECT '+metadataColumns+' FROM owner_search_imports WHERE property=? ORDER BY imported_at DESC,id DESC LIMIT 20',PROPERTY),
    first(ctx.db,'SELECT '+metadataColumns+',summary_json FROM owner_search_imports WHERE property=? AND dimension=? ORDER BY imported_at DESC,id DESC LIMIT 1',PROPERTY,'date')
  ]);
  return{property:{domain:PROPERTY,siteUrl:SITE,sitemapUrl:SITEMAP},connection:{mode:'manual-csv',apiConnected:false,hasData:imports.length>0},verification:settingsView(settings),summary:latest?reportSummary(latest):null,imports:imports.map(importView),limits:{maxCsvBytes:MAX_CSV,maxRows:MAX_ROWS},importMeaning:'Each file is a separate owner-supplied Google export. Only one Date report supplies headline totals; query, page, country, device and overlapping imports are never added together.'};
}
function audit(ctx,action,targetId,details){return ctx.audit(action,'search-console',targetId,details);}
async function saveSettings(request,ctx){
  const body=await ctx.readJson(request,8192);fields(ctx,body,['revision','verificationToken','googleOwnershipReported','sitemapSubmittedReported']);
  if(!Number.isSafeInteger(body.revision)||body.revision<0)bad(ctx,'Reload Search Console setup before saving.');
  const current=await first(ctx.db,'SELECT * FROM owner_search_settings WHERE property=?',PROPERTY);if(Number(current?.revision||0)!==body.revision)bad(ctx,'Search Console setup changed. Reload before saving.',409);
  let token=current?.verification_token||null;if(own(body,'verificationToken')){if(body.verificationToken===null||body.verificationToken==='')token=null;else{token=bounded(ctx,body.verificationToken,'the Google TXT value',300);if(!/^google-site-verification=[A-Za-z0-9_-]{10,256}={0,2}$/.test(token))bad(ctx,'Paste the complete google-site-verification TXT value from Google.');}}
  for(const key of ['googleOwnershipReported','sitemapSubmittedReported'])if(own(body,key)&&typeof body[key]!=='boolean')bad(ctx,'Use true or false for owner-reported setup steps.');
  const changedToken=token!==(current?.verification_token||null),google=own(body,'googleOwnershipReported')?body.googleOwnershipReported:changedToken?false:current?.google_ownership_reported===1,sitemap=own(body,'sitemapSubmittedReported')?body.sitemapSubmittedReported:current?.sitemap_submitted_reported===1;
  const revision=body.revision+1,values=[PROPERTY,revision,token,changedToken?'unchecked':current?.dns_status||'unchecked',changedToken?null:current?.dns_checked_at??null,google?1:0,google?(current?.google_ownership_reported_at||ctx.now):null,sitemap?1:0,sitemap?(current?.sitemap_submitted_reported_at||ctx.now):null,ctx.user.id,ctx.now];
  const results=await ctx.db.batch([stmt(ctx.db,`INSERT INTO owner_search_settings(property,revision,verification_token,dns_status,dns_checked_at,google_ownership_reported,google_ownership_reported_at,sitemap_submitted_reported,sitemap_submitted_reported_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(property) DO UPDATE SET revision=excluded.revision,verification_token=excluded.verification_token,dns_status=excluded.dns_status,dns_checked_at=excluded.dns_checked_at,google_ownership_reported=excluded.google_ownership_reported,google_ownership_reported_at=excluded.google_ownership_reported_at,sitemap_submitted_reported=excluded.sitemap_submitted_reported,sitemap_submitted_reported_at=excluded.sitemap_submitted_reported_at,updated_by=excluded.updated_by,updated_at=excluded.updated_at WHERE owner_search_settings.revision=?`,...values,body.revision),audit(ctx,'search.settings',PROPERTY,{revision,dnsTokenChanged:changedToken,googleOwnershipReported:google,sitemapSubmittedReported:sitemap})]);
  if(!changes(results[0]))bad(ctx,'Search Console setup changed. Reload before saving.',409);
  return ctx.json({verification:settingsView(await first(ctx.db,'SELECT * FROM owner_search_settings WHERE property=?',PROPERTY))});
}
async function readDNS(response){
  if(!response.ok||response.redirected)throw Error('dns-response');const reader=response.body?.getReader();if(!reader)throw Error('dns-body');let size=0;const parts=[];
  while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>65536){await reader.cancel().catch(()=>{});throw Error('dns-size');}parts.push(chunk.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
function txtValue(input){
  if(typeof input!=='string'||input.length>2048)return null;
  const fragments=input.match(/"(?:[^"\\]|\\.)*"/g);if(!fragments?.length)return null;
  if(input.replace(/"(?:[^"\\]|\\.)*"/g,'').trim())return null;
  try{return fragments.map(part=>JSON.parse(part)).join('');}catch{return null;}
}
async function checkDNS(request,ctx){
  fields(ctx,await ctx.readJson(request,1024),[]);const current=await first(ctx.db,'SELECT * FROM owner_search_settings WHERE property=?',PROPERTY);if(!current?.verification_token)bad(ctx,'Save Google’s TXT value before checking DNS.');
  let status='check-failed';const controller=new AbortController(),duration=Math.min(5000,Math.max(1,Number(ctx.env?.OWNER_SEARCH_DNS_TIMEOUT_MS)||5000));let timeout;
  const deadline=new Promise((_,reject)=>{timeout=setTimeout(()=>{controller.abort();reject(Error('dns-timeout'));},duration);});
  try{const fetcher=typeof ctx.env?.OWNER_SEARCH_DNS_FETCH==='function'?ctx.env.OWNER_SEARCH_DNS_FETCH:fetch,data=await Promise.race([Promise.resolve().then(()=>fetcher(DOH,{method:'GET',headers:{Accept:'application/dns-json'},credentials:'omit',redirect:'manual',signal:controller.signal})).then(readDNS),deadline]);if(data?.Status===0||data?.Status===3){const present=(Array.isArray(data.Answer)?data.Answer:[]).some(record=>record?.type===16&&String(record.name||'').toLowerCase().replace(/\.$/,'')===PROPERTY&&txtValue(record.data)===current.verification_token);status=present?'present':'not-found';}}catch{/* The owner gets a bounded status, never provider response or credential text. */}finally{clearTimeout(timeout);}
  const revision=current.revision+1,results=await ctx.db.batch([stmt(ctx.db,'UPDATE owner_search_settings SET dns_status=?,dns_checked_at=?,revision=?,updated_by=?,updated_at=? WHERE property=? AND revision=?',status,ctx.now,revision,ctx.user.id,ctx.now,PROPERTY,current.revision),audit(ctx,'search.dns-check',PROPERTY,{revision,dnsStatus:status})]);if(!changes(results[0]))bad(ctx,'The TXT value changed during this check. Reload and check again.',409);
  return ctx.json({verification:settingsView(await first(ctx.db,'SELECT * FROM owner_search_settings WHERE property=?',PROPERTY)),message:status==='present'?'Google’s TXT value is published. Complete ownership verification in Google Search Console.':status==='not-found'?'The saved TXT value was not found. Check the Cloudflare record and retry after DNS updates.':'DNS could not be checked. Your Google ownership status has not changed.'});
}
async function importCSV(request,ctx){
  const body=await ctx.readJson(request,3145728);fields(ctx,body,['property','fileName','csv','period','exportedOn','searchType','filters']);pinned(ctx,body.property);
  const fileName=bounded(ctx,body.fileName,'the CSV filename',180);if(!/\.csv$/i.test(fileName)||/[\\/]/.test(fileName))bad(ctx,'Upload one CSV file from the unzipped Google report.');
  const parsed=parseSearchConsoleCSV(body.csv,{period:body.period},ctx),exportedOn=date(ctx,body.exportedOn,'the export date');if(parsed.period.endDate>exportedOn||Date.parse(exportedOn)>ctx.now+DAY)bad(ctx,'The export date must follow the reporting period and cannot be in the future.');
  const searchType=body.searchType;if(!['web','image','video','news','discover','google-news'].includes(searchType))bad(ctx,'Choose the Search Console search type for this export.');
  const filters=body.filters===undefined?'':bounded(ctx,body.filters,'the report filters',1200,{empty:true}),identity=JSON.stringify({property:PROPERTY,dimension:parsed.dimension,period:parsed.period,exportedOn,searchType,filters,rows:parsed.rows});
  const fingerprint=[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(identity)))].map(value=>value.toString(16).padStart(2,'0')).join(''),id='gsc-'+fingerprint;
  const results=await ctx.db.batch([stmt(ctx.db,'INSERT INTO owner_search_imports(id,property,fingerprint,file_name,dimension,start_date,end_date,exported_on,search_type,filters,row_count,rows_json,summary_json,imported_by,imported_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(property,fingerprint) DO NOTHING',id,PROPERTY,fingerprint,fileName,parsed.dimension,parsed.period.startDate,parsed.period.endDate,exportedOn,searchType,filters,parsed.rows.length,parsed.rowsJson,JSON.stringify(parsed.summary),ctx.user.id,ctx.now),audit(ctx,'search.import',id,{dimension:parsed.dimension,rowCount:parsed.rows.length,searchType})]);
  const row=await first(ctx.db,'SELECT '+metadataColumns+',summary_json FROM owner_search_imports WHERE id=? AND property=?',id,PROPERTY);return ctx.json({import:importView(row),summary:reportSummary(row),reused:!changes(results[0])},changes(results[0])?201:200);
}
async function listImports(ctx){
  const rawLimit=ctx.url.searchParams.get('limit')||'20';if(!/^\d{1,2}$/.test(rawLimit)||Number(rawLimit)<1||Number(rawLimit)>50)bad(ctx,'Choose a report page size from 1 to 50.');const limit=Number(rawLimit),cursor=ctx.url.searchParams.get('cursor');let before=null;
  if(cursor){try{before=JSON.parse(atob(cursor.replaceAll('-','+').replaceAll('_','/')));}catch{bad(ctx,'Reload the imported report list.');}if(cursor.length>300||!Array.isArray(before)||before.length!==2||!Number.isSafeInteger(before[0])||before[0]<0||!/^gsc-[a-f0-9]{64}$/.test(before[1]))bad(ctx,'Reload the imported report list.');}
  const rows=await all(ctx.db,'SELECT '+metadataColumns+' FROM owner_search_imports WHERE property=?'+(before?' AND (imported_at<? OR (imported_at=? AND id<?))':'')+' ORDER BY imported_at DESC,id DESC LIMIT ?',PROPERTY,...(before?[before[0],before[0],before[1]]:[]),limit+1),items=rows.slice(0,limit),last=items.at(-1);return ctx.json({items:items.map(importView),cursor:rows.length>limit&&last?btoa(JSON.stringify([last.imported_at,last.id])).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''):null});
}
export async function handleOwnerSearch(request,env,ctx){
  const path=ctx?.url?.pathname||new URL(request.url).pathname;if(path!==PREFIX&&!path.startsWith(PREFIX+'/'))return null;active(ctx);
  if(path===PREFIX&&request.method==='GET')return ctx.json(await ownerSearchOverview(ctx));
  if(path===PREFIX+'/settings'&&request.method==='POST')return saveSettings(request,ctx);
  if(path===PREFIX+'/check-dns'&&request.method==='POST')return checkDNS(request,ctx);
  if(path===PREFIX+'/imports'&&request.method==='POST')return importCSV(request,ctx);
  if(path===PREFIX+'/imports'&&request.method==='GET')return listImports(ctx);
  const detail=path.match(/^\/api\/owner\/search-console\/imports\/(gsc-[a-f0-9]{64})$/);
  if(detail&&request.method==='GET'){const row=await first(ctx.db,'SELECT * FROM owner_search_imports WHERE id=? AND property=?',detail[1],PROPERTY);if(!row)bad(ctx,'This imported report was not found.',404);return ctx.json({import:importView(row),summary:reportSummary(row),rows:JSON.parse(row.rows_json)});}
  return ctx.json({error:'Search Console action not found.'},404);
}
