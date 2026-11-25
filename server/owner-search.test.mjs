/** Real SQLite semantics over the owned Drizzle schema; all DNS is mocked. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync}from'node:sqlite';
import {getTableConfig,SQLiteSyncDialect}from'drizzle-orm/sqlite-core';
import {ownerSearchSettings,ownerSearchImports}from'../db/owner-search-schema.mjs';
import {handleOwnerSearch,ownerSearchOverview,parseSearchConsoleCSV}from'./owner-search.mjs';

const origin='https://owner.synthetic.invalid',base='/api/owner/search-console',token='google-site-verification=PublicGoogleToken12345';
const period={startDate:'2026-11-01',endDate:'2026-11-03'};
const dateCSV='Date,Clicks,Impressions,CTR,Position\n2026-11-01,10,100,10%,2\n2026-11-02,20,300,6.67%,8\n2026-11-03,0,0,-,-\n';
function createSchema(db,table){
  const config=getTableConfig(table),dialect=new SQLiteSyncDialect(),quote=value=>'"'+value.replaceAll('"','""')+'"';
  const columns=config.columns.map(column=>quote(column.name)+' '+column.getSQLType()+(column.primary?' PRIMARY KEY':'')+(column.notNull?' NOT NULL':'')+(column.default===undefined?'':' DEFAULT '+(typeof column.default==='number'?column.default:"'"+column.default.replaceAll("'","''")+"'")));
  for(const check of config.checks)columns.push('CONSTRAINT '+quote(check.name)+' CHECK('+dialect.sqlToQuery(check.value).sql+')');
  db.exec('CREATE TABLE '+quote(config.name)+'('+columns.join(',')+')');
  for(const index of config.indexes)db.exec('CREATE '+(index.config.unique?'UNIQUE ':'')+'INDEX '+quote(index.config.name)+' ON '+quote(config.name)+'('+index.config.columns.map(column=>quote(column.name)).join(',')+')');
}
function fixture(t,{fetcher,authorized=true,auditFailure=false}={}){
  const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());createSchema(sqlite,ownerSearchSettings);createSchema(sqlite,ownerSearchImports);
  sqlite.exec("CREATE TABLE audit_events(action TEXT CHECK(action!='forbidden'),target_id TEXT,details TEXT)");let calls=0,clock=Date.parse('2026-11-25T12:00:00Z');
  const db={prepare(sql){const query=sqlite.prepare(sql);return{bind(...args){return{async first(){calls++;return query.get(...args)||null;},async all(){calls++;return{results:query.all(...args)};},async run(){calls++;return{meta:{changes:Number(query.run(...args).changes)}};}};}};},async batch(statements){sqlite.exec('BEGIN');try{const out=[];for(const statement of statements)out.push(await statement.run());sqlite.exec('COMMIT');return out;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  const ctx={db,user:{id:'verified-owner',email:'owner@example.invalid'},ownerAuthorized:authorized,env:{OWNER_SEARCH_DNS_FETCH:fetcher||(async()=>{throw Error('No external DNS calls in tests');})},url:new URL(origin+base),get now(){return clock;},json:(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'}}),fail(status,message){const error=Error(message);error.status=status;throw error;},async readJson(request,maxBytes){const bytes=new Uint8Array(await request.arrayBuffer());if(bytes.length>maxBytes)this.fail(413,'Body too large');const value=JSON.parse(new TextDecoder().decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))this.fail(400,'Object required');return value;},audit(action,type,id,details){return db.prepare('INSERT INTO audit_events(action,target_id,details) SELECT ?,?,? WHERE changes()>0').bind(auditFailure?'forbidden':action,id,JSON.stringify(details));}};
  async function call(path='',{method='GET',body}={}){ctx.url=new URL(origin+base+path);const request=new Request(ctx.url,{method,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});try{const response=await handleOwnerSearch(request,ctx.env,ctx);return{status:response.status,body:await response.json(),headers:response.headers};}catch(error){if(error.status)return{status:error.status,body:{error:error.message}};throw error;}}
  return{sqlite,ctx,call,get calls(){return calls;},advance(ms=1){clock+=ms;}};
}
const upload=(csv=dateCSV,extra={})=>({fileName:'Dates.csv',csv,period,exportedOn:'2026-11-25',searchType:'web',...extra});
const parserContext={fail(status,message){const error=Error(message);error.status=status;throw error;}};

test('empty owner overview is private, read-only and shows no invented Google metrics or ownership',async t=>{
  const f=fixture(t),result=await f.call();assert.equal(result.status,200);assert.equal(result.body.connection.apiConnected,false);assert.equal(result.body.connection.hasData,false);assert.equal(result.body.summary,null);assert.equal(result.body.verification.googleOwnershipReported,false);assert.equal(result.body.verification.dnsStatus,'unchecked');assert.equal(result.body.property.domain,'degreesteps.com');assert.equal(result.body.property.sitemapUrl,'https://degreesteps.com/sitemap.xml');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_events').get().n,0);assert.match(result.headers.get('Cache-Control'),/no-store/);
});
test('search helpers require the private pinned-owner authorization marker before touching the database',async t=>{
  const f=fixture(t,{authorized:false});assert.equal((await f.call()).status,403);assert.equal(f.calls,0);await assert.rejects(()=>ownerSearchOverview(f.ctx),error=>error.status===403);assert.equal(f.calls,0);
});
test('Date export calculates ratios and impression-weighted positions rather than averages of averages',async t=>{
  const f=fixture(t),result=await f.call('/imports',{method:'POST',body:upload()});assert.equal(result.status,201);const sum=result.body.summary;assert.equal(sum.clicks,30);assert.equal(sum.impressions,400);assert.equal(sum.ctr,.075);assert.equal(sum.position,6.5);assert.equal(sum.completePeriod,true);assert.equal(sum.scope,'imported-date-rows');assert.equal(sum.positionIsApproximate,true);assert.equal(result.body.import.source,'google-search-console-csv');const detail=await f.call('/imports/'+result.body.import.id);assert.equal(detail.body.rows.length,3);assert.equal(detail.body.rows[2].reportedCtr,null);assert.equal(detail.body.rows[2].position,null);assert.equal(detail.body.import.exportedOn,'2026-11-25');
});
test('unknown metrics remain unknown and partial date exports do not claim complete-period coverage',()=>{
  const result=parseSearchConsoleCSV('Date,Clicks,Impressions,CTR,Position\n2026-11-01,~,100,-,2\n2026-11-03,2,-,~,0\n',{period},parserContext);assert.equal(result.rows[0].clicks,null);assert.equal(result.rows[1].impressions,null);assert.equal(result.rows[1].position,null);assert.equal(result.summary.clicks,null);assert.equal(result.summary.impressions,null);assert.equal(result.summary.ctr,null);assert.equal(result.summary.position,null);assert.equal(result.summary.completePeriod,false);assert.equal(result.summary.expectedDays,3);
});
test('zero impressions do not invent CTR or position and unknown exported CTR does not erase known counts',()=>{
  const zero=parseSearchConsoleCSV('Date,Clicks,Impressions,CTR,Position\n2026-11-01,0,0,-,-',{period},parserContext);assert.equal(zero.summary.ctr,null);assert.equal(zero.summary.position,null);const known=parseSearchConsoleCSV('Date,Clicks,Impressions,CTR\n2026-11-01,1,10,-',{period},parserContext);assert.equal(known.summary.ctr,.1);
});
test('actual Google query/page/country/device exports remain separate dimensions without fabricated traffic totals',async t=>{
  const f=fixture(t);for(const [header,value,expected]of[['Top queries','best transfer courses','query'],['Top pages','https://www.degreesteps.com/guides/','page'],['Country','United States','country'],['Device','Mobile','device']]){f.advance();const result=await f.call('/imports',{method:'POST',body:upload(header+',Clicks,Impressions,CTR,Position\n'+value+',3,10,30%,2',{fileName:expected+'.csv'})});assert.equal(result.status,201);assert.equal(result.body.import.dimension,expected);assert.equal(result.body.summary,null);}const overview=await f.call();assert.equal(overview.body.connection.hasData,true);assert.equal(overview.body.summary,null);assert.equal(overview.body.imports.length,4);
});
test('renamed duplicate exports are idempotent and overlapping periods or dimensions never add together',async t=>{
  const f=fixture(t),first=await f.call('/imports',{method:'POST',body:upload()});f.advance(100);const renamed=await f.call('/imports',{method:'POST',body:upload(dateCSV,{fileName:'Dates renamed.csv'})});assert.equal(renamed.status,200);assert.equal(renamed.body.reused,true);assert.equal(renamed.body.import.id,first.body.import.id);assert.equal(renamed.body.import.importedAt,first.body.import.importedAt);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_events').get().n,1);
  const newer=await f.call('/imports',{method:'POST',body:upload('Date,Clicks,Impressions,CTR,Position\n2026-11-03,7,10,70%,3',{period:{startDate:'2026-11-03',endDate:'2026-11-03'}})});f.advance(100);await f.call('/imports',{method:'POST',body:upload('Query,Clicks,Impressions,CTR,Position\nSame report query,9,10,90%,1')});const overview=await f.call();assert.equal(overview.body.summary.clicks,7);assert.equal(overview.body.summary.reportId,newer.body.import.id);assert.equal(overview.body.summary.id,newer.body.import.id);assert.notEqual(overview.body.summary.clicks,46);assert.equal(overview.body.imports.length,3);
});
test('CSV quoting, BOM and grouped counts are parsed without evaluating formula-like query text',()=>{
  const parsed=parseSearchConsoleCSV('\uFEFFTop queries,Clicks,Impressions,CTR,Position\r\n"college, work and family","1,200","2,000",60%,2.3\r\n"=SUM(A1:A2)",0,0,-,-',{period},parserContext);assert.equal(parsed.dimension,'query');assert.equal(parsed.rows[0].value,'college, work and family');assert.equal(parsed.rows[0].clicks,1200);assert.equal(parsed.rows[1].value,'=SUM(A1:A2)');assert.equal(parsed.summary,null);
});
test('invalid reports cannot mutate storage or accept cross-property page data',async t=>{
  const f=fixture(t),mutations=[
    value=>value.property='another.example',value=>value.fileName='report.zip',value=>value.fileName='../Dates.csv',value=>value.exportedOn='2026-10-01',value=>value.searchType='invented',value=>value.extra='unsupported',
    value=>value.csv='Date,Clicks,Impressions\n2026-11-30,1,1',value=>value.csv='Date,Clicks,Impressions\n2026-11-01,1.5,3',value=>value.csv='Date,Clicks,Impressions\n2026-11-01,-2,3',value=>value.csv='Date,Clicks,Impressions\n2026-11-01,1,3\n2026-11-01,1,3',value=>value.csv='Date,Query,Clicks,Impressions\n2026-11-01,course,1,3',value=>value.csv='Top pages,Clicks,Impressions\nhttps://other.example/private,1,3',value=>value.csv='Top pages,Clicks,Impressions\nhttps://user:password@degreesteps.com/a,1,3',value=>value.csv='Top queries,Clicks,Impressions\n"unfinished,1,3'
  ];for(const mutate of mutations){const body=upload();mutate(body);assert.equal((await f.call('/imports',{method:'POST',body})).status,400);}assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM owner_search_imports').get().n,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_events').get().n,0);
});
test('file and row limits are enforced before storing reports',async t=>{
  const f=fixture(t),oversized=upload('x'.repeat(2097153));assert.equal((await f.call('/imports',{method:'POST',body:oversized})).status,413);const rows='Query,Clicks,Impressions\n'+Array.from({length:5001},(_,n)=>'query'+n+',1,1').join('\n');assert.equal((await f.call('/imports',{method:'POST',body:upload(rows)})).status,413);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM owner_search_imports').get().n,0);
});
test('report insertion and audit logging roll back atomically',async t=>{
  const f=fixture(t,{auditFailure:true});await assert.rejects(()=>f.call('/imports',{method:'POST',body:upload()}));assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM owner_search_imports').get().n,0);
});
test('report pagination is stable at equal timestamps and returns metadata rather than private query rows',async t=>{
  const f=fixture(t);for(let n=0;n<5;n++)await f.call('/imports',{method:'POST',body:upload('Query,Clicks,Impressions\nprivate query '+n+',1,2')});let cursor=null,ids=[];for(let n=0;n<4;n++){const result=await f.call('/imports?limit=2'+(cursor?'&cursor='+encodeURIComponent(cursor):''));assert.equal(result.status,200);assert(!JSON.stringify(result.body).includes('private query'));ids.push(...result.body.items.map(item=>item.id));cursor=result.body.cursor;if(!cursor)break;}assert.equal(ids.length,5);assert.equal(new Set(ids).size,5);assert.equal((await f.call('/imports?cursor=not-json')).status,400);
});
test('reported Google ownership can be recorded without falsely claiming a DNS or API check',async t=>{
  const f=fixture(t),result=await f.call('/settings',{method:'POST',body:{revision:0,googleOwnershipReported:true}});assert.equal(result.status,200);assert.equal(result.body.verification.googleOwnershipReported,true);assert.equal(result.body.verification.dnsStatus,'unchecked');assert.equal(result.body.verification.dnsTokenSaved,false);const overview=await f.call();assert.equal(overview.body.connection.apiConnected,false);assert.equal(overview.body.summary,null);assert.match(overview.body.verification.ownershipMeaning,/owner-reported/);
});
test('settings use optimistic revisions and never store arbitrary verification payloads',async t=>{
  const f=fixture(t);assert.equal((await f.call('/settings',{method:'POST',body:{revision:0,verificationToken:token}})).status,200);assert.equal((await f.call('/settings',{method:'POST',body:{revision:0,googleOwnershipReported:true}})).status,409);assert.equal((await f.call('/settings',{method:'POST',body:{revision:1,verificationToken:'https://elsewhere.example/token'}})).status,400);assert.equal((await f.call('/settings',{method:'POST',body:{revision:1,googleOwnershipReported:'yes'}})).status,400);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_events').get().n,1);assert(!f.sqlite.prepare('SELECT details FROM audit_events').get().details.includes(token));
});
test('DNS checks use only the fixed Cloudflare HTTPS endpoint and split TXT records, not a Google ownership assertion',async t=>{
  const requests=[],f=fixture(t,{fetcher:async(url,options)=>{requests.push({url,options});return Response.json({Status:0,Answer:[{name:'degreesteps.com.',type:16,data:'"google-site-verification=" "PublicGoogleToken12345"'}]});}});await f.call('/settings',{method:'POST',body:{revision:0,verificationToken:token}});const result=await f.call('/check-dns',{method:'POST',body:{}});assert.equal(result.status,200);assert.equal(result.body.verification.dnsStatus,'present');assert.equal(result.body.verification.googleOwnershipReported,false);assert.equal(result.body.verification.revision,2);assert.equal(requests.length,1);assert.equal(requests[0].url,'https://cloudflare-dns.com/dns-query?name=degreesteps.com&type=TXT');assert.equal(requests[0].options.redirect,'manual');assert.equal(requests[0].options.credentials,'omit');assert.equal(requests[0].options.headers.Authorization,undefined);assert.match(result.body.message,/Complete ownership verification in Google/);
});
test('wrong TXT names and missing records cannot turn a token into a positive DNS result',async t=>{
  const f=fixture(t,{fetcher:async()=>Response.json({Status:0,Answer:[{name:'other.degreesteps.com.',type:16,data:JSON.stringify(token)}]})});await f.call('/settings',{method:'POST',body:{revision:0,verificationToken:token,googleOwnershipReported:true}});const result=await f.call('/check-dns',{method:'POST',body:{}});assert.equal(result.body.verification.dnsStatus,'not-found');assert.equal(result.body.verification.googleOwnershipReported,true);assert.equal((await f.call('/check-dns',{method:'POST',body:{url:'https://other.example'}})).status,400);
});
test('DNS timeouts, redirects and oversized provider responses fail boundedly without exposing provider text',async t=>{
  for(const fetcher of [async()=>new Response('Provider secret not for display',{status:302,headers:{Location:'https://other.example'}}),async()=>new Response('x'.repeat(65537)),async()=>new Promise(()=>{})]){const f=fixture(t,{fetcher});f.ctx.env.OWNER_SEARCH_DNS_TIMEOUT_MS=10;await f.call('/settings',{method:'POST',body:{revision:0,verificationToken:token}});const result=await f.call('/check-dns',{method:'POST',body:{}});assert.equal(result.status,200);assert.equal(result.body.verification.dnsStatus,'check-failed');assert(!JSON.stringify(result.body).includes('Provider secret'));}
});
test('a TXT value changed during a DNS request cannot receive the stale result or audit event',async t=>{
  let f;f=fixture(t,{fetcher:async()=>{f.sqlite.prepare('UPDATE owner_search_settings SET revision=2,verification_token=? WHERE property=?').run('google-site-verification=DifferentPublicToken12345','degreesteps.com');return Response.json({Status:0,Answer:[{name:'degreesteps.com.',type:16,data:JSON.stringify(token)}]});}});await f.call('/settings',{method:'POST',body:{revision:0,verificationToken:token}});assert.equal((await f.call('/check-dns',{method:'POST',body:{}})).status,409);const settings=f.sqlite.prepare('SELECT * FROM owner_search_settings').get();assert.equal(settings.revision,2);assert.equal(settings.dns_status,'unchecked');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_events').get().n,1);
});
