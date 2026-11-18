/** Private operator workbench over immutable, public academic evidence.
 * Review records never alter requirements, transfer authority, or publication.
 * The caller supplies build-owned artifacts; no student state or provider call
 * participates in this API.
 */
const DegreeAcademicCoverage = (() => {
  'use strict';
  const PREFIX='/api/admin/academic-coverage', MAX_BODY=16384;
  const DECISIONS=new Set(['reviewed-supported','needs-evidence','conflict']);
  const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/;
  const FINGERPRINT=/^[a-f0-9]{64}$/;
  const registryIndexes=new WeakMap();
  const REVIEW_MEANING='An administrator reviewed the cited evidence for this exact fact. This is not university approval, an awarded transfer credit, or permission to bypass an academic rule.';
  class Problem extends Error {
    constructor(status,message,extra={}) { super(message);this.status=status;this.extra=extra; }
  }
  const fail=(status,message,extra)=>{throw new Problem(status,message,extra);};
  const arr=value=>Array.isArray(value)?value:[];
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
  const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  const clean=value=>typeof value==='string'?value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim():'';
  const unique=values=>[...new Set(values)];
  const encodeCursor=value=>btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value)))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  const decodeCursor=value=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),character=>character.charCodeAt(0))));
  const stmt=(db,sql,...values)=>db.prepare(sql).bind(...values);
  const all=async(db,sql,...values)=>(await stmt(db,sql,...values).all()).results||[];
  const changes=value=>Number(value?.meta?.changes??value?.changes??0);
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{
    'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store',
    'Vary':'Cookie','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'
  }});
  const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>value&&own(value,key)&&value[key]!==undefined).map(key=>[key,clone(value[key])]));
  function publicURL(value) {
    try {
      if(typeof value!=='string'||value.length>2000)return null;
      const url=new URL(value);
      if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||!url.hostname.includes('.')||/^(?:\d|\[)/.test(url.hostname)||/(?:^|\.)(?:localhost|local|internal|invalid|test)$/.test(url.hostname))return null;
      if([...url.searchParams.keys()].some(key=>/^(?:access_token|refresh_token|token|api_key|apikey|authorization|password|session|session_id|sessionid|email|student_id|user_id)$/i.test(key)))return null;
      return url.href;
    } catch { return null; }
  }
  async function administrator(env) {
    const user=env.PORTAL_USER;
    if(!user||typeof user.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,255}$/.test(user.id))fail(401,'Sign in to open the coverage workbench.');
    if(!env.DB)fail(503,'The coverage review database is not connected.');
    const configured=typeof env.COMMUNITY_ADMIN_EMAIL==='string'?env.COMMUNITY_ADMIN_EMAIL.trim().toLowerCase():'';
    const configuredOwner=configured&&typeof user.email==='string'&&user.email.trim().toLowerCase()===configured;
    if(!configuredOwner) {
      const record=await stmt(env.DB,'SELECT role FROM community_users WHERE id=?',user.id).first();
      if(!['owner','moderator'].includes(record?.role))fail(403,'Only platform administrators can review academic coverage.');
    }
    return {id:user.id};
  }
  async function body(request) {
    if(request.headers.get('Origin')!==new URL(request.url).origin||request.headers.get('X-Portal-Request')!=='1'||request.headers.get('Sec-Fetch-Site')==='cross-site')fail(403,'Use the DegreeSteps workbench on this site.');
    if((request.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase()!=='application/json')fail(415,'Send application/json.');
    if(Number(request.headers.get('Content-Length'))>MAX_BODY)fail(413,'The review request is too large.');
    const reader=request.body?.getReader();if(!reader)fail(400,'Send a review request.');
    let length=0;const parts=[];
    while(true) {
      const part=await reader.read();if(part.done)break;
      length+=part.value.byteLength;if(length>MAX_BODY){await reader.cancel();fail(413,'The review request is too large.');}
      parts.push(part.value);
    }
    const bytes=new Uint8Array(length);let offset=0;
    for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
    let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail(400,'Send valid UTF-8 JSON.');}
    if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'Send a JSON object.');
    return value;
  }
  function base(context) {
    const registry=context?.registry;
    if(!registry||typeof registry.revision!=='string'||!/^academic-v[1-9]\d*:[a-f0-9]{64}$/.test(registry.revision)||!Array.isArray(registry.facts)||!Array.isArray(registry.programs)||!Array.isArray(registry.sources))fail(503,'The academic registry is not available in this release.');
    if(context.report?.registryRevision&&context.report.registryRevision!==registry.revision)fail(503,'The academic quality report needs to be rebuilt for this registry.');
    const cached=registryIndexes.get(registry);
    if(cached)return {registry,report:context.report||null,loadEvidence:context.loadEvidence,...cached};
    const facts=new Map(),programs=new Map(),sources=new Map();
    for(const fact of registry.facts) {
      if(!fact||!IDENTIFIER.test(fact.id||'')||!FINGERPRINT.test(fact.evidenceFingerprint||'')||facts.has(fact.id))fail(503,'The academic registry needs a rebuild.');
      facts.set(fact.id,fact);
    }
    for(const program of registry.programs) {
      if(!program||!IDENTIFIER.test(program.id||'')||programs.has(program.id))fail(503,'The academic registry needs a rebuild.');
      programs.set(program.id,program);
    }
    for(const source of registry.sources) {
      if(!source||!IDENTIFIER.test(source.id||'')||sources.has(source.id))fail(503,'The academic registry needs a rebuild.');
      sources.set(source.id,source);
    }
    const factsByProgram=new Map([...programs.keys()].map(id=>[id,new Set()])),factsBySource=new Map([...sources.keys()].map(id=>[id,[]]));
    for(const fact of facts.values()) {
      for(const id of arr(fact.programIds))factsByProgram.get(id)?.add(fact);
      for(const id of arr(fact.sourceIds))factsBySource.get(id)?.push(fact);
    }
    for(const program of programs.values())for(const id of arr(program.factIds))if(facts.has(id))factsByProgram.get(program.id).add(facts.get(id));
    const findings=arr(registry.findings),findingsById=new Map(findings.map(finding=>[finding.id,finding]));
    const scopes=new Map(arr(registry.scopes).map(row=>{const {id,...scope}=row;return [id,scope];}));
    const indexes={facts,programs,sources,scopes,findings,findingsById,factsByProgram:new Map([...factsByProgram].map(([id,items])=>[id,[...items]])),factsBySource};
    registryIndexes.set(registry,indexes);
    return {registry,report:context.report||null,loadEvidence:context.loadEvidence,...indexes};
  }
  function exactScope(data,scope) {
    if(!scope||typeof scope!=='object'||!own(scope,'$ref'))return scope;
    const expanded=data.scopes.get(scope.$ref);
    if(!expanded)fail(503,'The evidence scope is not available in this release.');
    return expanded;
  }
  async function hydrate(data,facts,sources=[]) {
    const paths=unique(facts.concat(sources).map(item=>item.detailPath).filter(Boolean));
    if(!paths.length)return {facts,sources};
    if(paths.some(path=>typeof path!=='string'||!/^\/data\/academic-evidence\/[a-f0-9]{64}\.json$/.test(path))||typeof data.loadEvidence!=='function')fail(503,'The evidence details are not available in this release.');
    const loaded=await data.loadEvidence(paths);
    const index=items=>items instanceof Map?items:new Map(arr(items).map(item=>[item.id,item]));
    const fullFacts=index(loaded?.facts),fullSources=index(loaded?.sources);
    return {
      facts:facts.map(fact=>{
        if(!fact.detailPath)return fact;
        const detail=fullFacts.get(fact.id);
        if(!detail||detail.evidenceFingerprint!==fact.evidenceFingerprint||!own(detail,'facts'))fail(503,'The evidence detail changed. Rebuild this academic release before reviewing it.');
        // Hydration is request-local. The compact index remains authoritative
        // for identity, scope, provenance, and review invalidation; it never
        // retains full shard payloads in the Worker-wide WeakMap.
        return {...detail,...fact,scope:exactScope(data,fact.scope),facts:detail.facts,sourceBinding:{...detail.sourceBinding,...fact.sourceBinding},...(own(detail,'declaredEvidence')?{declaredEvidence:detail.declaredEvidence}:{})};
      }),
      sources:sources.map(source=>{
        if(!source.detailPath)return source;
        const detail=fullSources.get(source.id);
        if(!detail||detail.metadataDigest!==source.metadataDigest)fail(503,'The source detail changed. Rebuild this academic release before reviewing it.');
        return {...detail,...source,...(own(detail,'metadata')?{metadata:detail.metadata}:{})};
      })
    };
  }
  function sourceView(source) {
    return {...pick(source,['id','title','metadataDigest','sourceContentHash','metadata','programIds','dependentFactIds','localReferences','checked','kind','roles']),url:publicURL(source.url)};
  }
  function reviewView(row,registryRevision) {
    if(!row)return {revision:0,decision:'unreviewed',attestation:false,sourceIds:[],exactFactReused:false};
    let sourceIds=[];try{sourceIds=JSON.parse(row.source_ids_json);}catch{fail(503,'A coverage review needs attention.');}
    return {revision:row.revision,decision:row.decision,note:row.note,sourceIds,attestation:row.attestation===1,reviewerId:row.reviewer_id,registryRevision:row.registry_revision,evidenceFingerprint:row.evidence_fingerprint,createdAt:row.created_at,updatedAt:row.updated_at??row.created_at,exactFactReused:row.registry_revision!==registryRevision};
  }
  async function currentReviews(db,facts) {
    const result=new Map();
    // Indexed joins against only current identities avoid scanning historical
    // registry versions. JSON binding also avoids SQLite's bind-variable limit.
    for(let index=0;index<facts.length;index+=500) {
      const pairs=facts.slice(index,index+500).map(fact=>[fact.id,fact.evidenceFingerprint]);
      const rows=await all(db,"SELECT r.* FROM json_each(?) a JOIN academic_fact_reviews r ON r.fact_id=json_extract(a.value,'$[0]') AND r.evidence_fingerprint=json_extract(a.value,'$[1]')",JSON.stringify(pairs));
      for(const row of rows)result.set(row.fact_id,row);
    }
    return result;
  }
  function factView(fact,reviews,data) {
    return {...pick(fact,['id','kind','label','facts','declaredEvidence','sourceIds','sourceReferenceIds','originalSourceIds','sourceBinding','programIds','requirementIds','evidenceFingerprint']),scope:clone(exactScope(data,fact.scope)),administrativeReview:reviewView(reviews.get(fact.id),data.registry.revision)};
  }
  function findingsFor(data,{factIds=[],programIds=[],sourceIds=[]}={}) {
    const facts=new Set(factIds),programs=new Set(programIds),sources=new Set(sourceIds);
    return data.findings.filter(finding=>arr(finding.factIds).some(id=>facts.has(id))||arr(finding.programIds).some(id=>programs.has(id))||arr(finding.sourceIds).some(id=>sources.has(id))).map(finding=>pick(finding,['id','category','code','message','owner','blocking','modelId','programIds','requirementIds','optionIds','originalSourceIds','sourceIds','sourceReferenceIds','factIds']));
  }
  function programFacts(data,program) {
    return data.factsByProgram.get(program.id)||[];
  }
  function programView(program,data,reviews,{detail=false}={}) {
    const facts=programFacts(data,program),statuses=facts.map(fact=>reviewView(reviews.get(fact.id),data.registry.revision).decision);
    const qualityRows=arr(data.report?.programs).concat(arr(data.report?.models),arr(data.report?.items));
    const quality=qualityRows.find(item=>(item.modelId||item.id||item.programId)===program.id);
    return {...pick(program,['id','institutionId','title','school','catalogIdentity','format','level','creditSystem','totalCredits','readyTemplate',...(detail?['requirementIds','factIds','findingIds','sourceIds']:[])]),reviewCounts:{total:facts.length,supported:statuses.filter(status=>status==='reviewed-supported').length,needsEvidence:statuses.filter(status=>status==='needs-evidence').length,conflict:statuses.filter(status=>status==='conflict').length,unreviewed:statuses.filter(status=>status==='unreviewed').length},...(quality?{quality:clone(quality)}:{})};
  }
  function query(url,allowed) {
    const result={};
    for(const [key,value] of url.searchParams) {
      if(!allowed.includes(key)||own(result,key))fail(400,'Choose supported workbench filters.');
      if(value.length>2000)fail(400,'This filter is too long.');result[key]=value;
    }
    if(result.limit!==undefined&&!/^(?:[1-9]|[1-9][0-9]|100)$/.test(result.limit))fail(400,'Choose between 1 and 100 results.');
    if(result.q!==undefined&&result.q.length>120||result.school!==undefined&&result.school.length>160)fail(400,'This filter is too long.');
    if(result.decision!==undefined&&!new Set(['unreviewed',...DECISIONS]).has(result.decision))fail(400,'Choose a review decision filter.');
    return result;
  }
  function page(items,filters,revision,scope) {
    const limit=Number(filters.limit||25),filterKey=JSON.stringify(Object.fromEntries(Object.entries(filters).filter(([key])=>!['cursor','limit'].includes(key)).sort(([a],[b])=>a.localeCompare(b))));
    let offset=0;
    if(filters.cursor) {
      let value;try{value=decodeCursor(filters.cursor);}catch{fail(400,'Use a valid page cursor.');}
      if(value.revision!==revision||value.scope!==scope||value.filters!==filterKey)fail(409,'The registry or filters changed. Start again from the first page.');
      if(!Number.isSafeInteger(value.offset)||value.offset<0||value.offset>items.length)fail(400,'Use a valid page cursor.');offset=value.offset;
    }
    const next=offset+limit;
    const nextCursor=next<items.length?encodeCursor({revision,scope,filters:filterKey,offset:next}):null;
    return {items:items.slice(offset,next),total:items.length,nextCursor};
  }
  function workQueue(data,reviews) {
    const groups=arr(data.registry.reviewQueue).map(item=>{
      const findings=arr(item.findingIds).map(id=>data.findingsById.get(id)).filter(Boolean);
      let factIds=unique(arr(item.factIds).concat(findings.flatMap(finding=>arr(finding.factIds))));
      if(item.targetType==='fact')factIds=unique([item.targetId,...factIds]);
      if(item.targetType==='source')factIds=unique([...factIds,...arr(data.factsBySource.get(item.targetId)).map(fact=>fact.id)]);
      if(item.targetType==='program')factIds=unique([...factIds,...programFacts(data,data.programs.get(item.targetId)||{id:item.targetId}).map(fact=>fact.id)]);
      factIds=factIds.filter(id=>data.facts.has(id));
      return {...pick(item,['id','targetType','targetId','category','code','message','findingIds','affectedProgramIds','affectedReadyTemplateIds','impactScore']),factIds};
    });
    const queued=new Set(groups.flatMap(item=>item.factIds));
    for(const fact of data.facts.values())if(!queued.has(fact.id))groups.push({id:'review-'+fact.id,targetType:'fact',targetId:fact.id,category:fact.kind,code:'administrative-evidence-review',message:'Review the evidence for this fact.',findingIds:[],affectedProgramIds:arr(fact.programIds),affectedReadyTemplateIds:arr(fact.programIds).filter(id=>data.programs.get(id)?.readyTemplate===true),impactScore:arr(fact.programIds).length,factIds:[fact.id]});
    return groups.map(item=>{
      const facts=item.factIds.map(id=>data.facts.get(id));
      const decisions=facts.map(fact=>reviewView(reviews.get(fact.id),data.registry.revision).decision);
      return {...item,reviewCounts:{total:facts.length,supported:decisions.filter(value=>value==='reviewed-supported').length,needsEvidence:decisions.filter(value=>value==='needs-evidence').length,conflict:decisions.filter(value=>value==='conflict').length,unreviewed:decisions.filter(value=>value==='unreviewed').length},reviewDecisions:unique(decisions),kinds:unique(facts.map(fact=>fact.kind))};
    }).sort((a,b)=>Number(b.reviewCounts.conflict>0)-Number(a.reviewCounts.conflict>0)||(b.impactScore||0)-(a.impactScore||0)||String(a.id).localeCompare(String(b.id)));
  }
  async function saveReview(request,env,data,user,fact) {
    const input=await body(request),allowed=['registryRevision','evidenceFingerprint','revision','decision','note','sourceIds','attestation'];
    if(Object.keys(input).some(key=>!allowed.includes(key)))fail(400,'This review contains unsupported fields.');
    if(input.registryRevision!==data.registry.revision)fail(409,'The academic registry changed. Reload this fact before reviewing it.');
    if(input.evidenceFingerprint!==fact.evidenceFingerprint)fail(409,'This fact or its evidence changed. Reload it before reviewing.');
    if(!Number.isSafeInteger(input.revision)||input.revision<0||input.revision>=Number.MAX_SAFE_INTEGER)fail(400,'Provide the current review revision.');
    if(!DECISIONS.has(input.decision))fail(400,'Choose reviewed-supported, needs-evidence, or conflict.');
    const note=clean(input.note);if(note.length<10||note.length>2000)fail(400,'Add a review note between 10 and 2,000 characters.');
    if(!Array.isArray(input.sourceIds)||input.sourceIds.length>40||input.sourceIds.some(id=>typeof id!=='string'||!arr(fact.sourceIds).includes(id)||!data.sources.has(id))||unique(input.sourceIds).length!==input.sourceIds.length)fail(400,'Use unique source references attached to this fact.');
    const supported=input.decision==='reviewed-supported';
    if(supported&&(input.attestation!==true||input.sourceIds.length===0||fact.sourceBinding?.bound!==true||fact.sourceBinding?.missingReferenceCount>0||arr(fact.sourceBinding?.missingLocalSourceIds).length||input.sourceIds.some(id=>!publicURL(data.sources.get(id).url))))fail(400,'Supporting this fact requires an explicit evidence-review attestation and attached public sources.');
    if(!supported&&input.attestation!==undefined&&input.attestation!==false)fail(400,'Attest only when the cited evidence supports this fact.');
    const evidence=await hydrate(data,[fact]);
    const revision=input.revision+1,stamp=Date.now(),eventId=crypto.randomUUID(),values=[data.registry.revision,revision,input.decision,note,JSON.stringify(input.sourceIds),supported?1:0,user.id,eventId,stamp];
    const update=input.revision===0
      ?stmt(env.DB,'INSERT INTO academic_fact_reviews (fact_id,evidence_fingerprint,registry_revision,revision,decision,note,source_ids_json,attestation,reviewer_id,last_event_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(fact_id,evidence_fingerprint) DO NOTHING',fact.id,fact.evidenceFingerprint,...values.slice(0,8),stamp,stamp)
      :stmt(env.DB,'UPDATE academic_fact_reviews SET registry_revision=?,revision=?,decision=?,note=?,source_ids_json=?,attestation=?,reviewer_id=?,last_event_id=?,updated_at=? WHERE fact_id=? AND evidence_fingerprint=? AND revision=?',...values,fact.id,fact.evidenceFingerprint,input.revision);
    // The random event token fences the audit INSERT to this exact successful
    // CAS. A stale/concurrent request cannot append somebody else's new state.
    const result=await env.DB.batch([update,stmt(env.DB,'INSERT INTO academic_fact_review_events (id,fact_id,evidence_fingerprint,registry_revision,revision,decision,note,source_ids_json,attestation,reviewer_id,created_at) SELECT last_event_id,fact_id,evidence_fingerprint,registry_revision,revision,decision,note,source_ids_json,attestation,reviewer_id,updated_at FROM academic_fact_reviews WHERE fact_id=? AND evidence_fingerprint=? AND last_event_id=? AND revision=?',fact.id,fact.evidenceFingerprint,eventId,revision)]);
    if(!changes(result[0]))fail(409,'Another administrator updated this review. Reload it before saving.');
    if(changes(result[1])!==1)fail(503,'The review audit could not be saved.');
    const row=await stmt(env.DB,'SELECT * FROM academic_fact_reviews WHERE fact_id=? AND evidence_fingerprint=?',fact.id,fact.evidenceFingerprint).first();
    const reviews=new Map([[fact.id,row]]);
    return json({registryRevision:data.registry.revision,fact:factView(evidence.facts[0],reviews,data),review:reviewView(row,data.registry.revision),publicationChanged:false,reviewMeaning:REVIEW_MEANING},input.revision===0?201:200);
  }
  async function handle(request,env,context) {
    const url=new URL(request.url);
    if(url.pathname!==PREFIX&&!url.pathname.startsWith(PREFIX+'/'))return null;
    try {
      const user=await administrator(env);
      // The graph can be large. Anonymous users and college-only accounts must
      // never trigger an asset fetch, JSON decode, or index allocation for it.
      const data=base(typeof context==='function'?await context():context),path=url.pathname.slice(PREFIX.length),method=request.method;
      if(method!=='GET'&&method!=='POST')fail(405,'Use GET to read coverage or POST to save a fact review.');
      const factMatch=path.match(/^\/facts\/([A-Za-z0-9_-]+)(\/review)?$/);
      if(factMatch) {
        const fact=data.facts.get(factMatch[1]);if(!fact)fail(404,'Academic fact not found.');
        if(factMatch[2]){if(method!=='POST')fail(405,'Use POST to save this review.');query(url,[]);return await saveReview(request,env,data,user,fact);}
        if(method!=='GET')fail(405,'Use GET to read this fact.');query(url,[]);
        const programs=arr(fact.programIds).map(id=>data.programs.get(id)).filter(Boolean),relatedFacts=unique([fact,...programs.flatMap(program=>programFacts(data,program))]);
        const sources=arr(fact.sourceIds).map(id=>data.sources.get(id)).filter(Boolean);
        const [reviews,history,evidence]=await Promise.all([currentReviews(env.DB,relatedFacts),all(env.DB,'SELECT * FROM academic_fact_review_events WHERE fact_id=? ORDER BY created_at DESC,id DESC LIMIT 50',fact.id),hydrate(data,[fact],sources)]);
        return json({registryRevision:data.registry.revision,fact:factView(evidence.facts[0],reviews,data),sources:evidence.sources.map(sourceView),programs:programs.map(program=>programView(program,data,reviews)),findings:findingsFor(data,{factIds:[fact.id]}),history:history.map(row=>({...reviewView(row,data.registry.revision),id:row.id,appliesToCurrentEvidence:row.evidence_fingerprint===fact.evidenceFingerprint})),reviewMeaning:REVIEW_MEANING});
      }
      if(method!=='GET')fail(405,'Save decisions on an individual fact.');
      if(path==='/programs') {
        const filters=query(url,['q','school','status','limit','cursor']),q=clean(filters.q).toLowerCase(),school=clean(filters.school).toLowerCase();
        let programs=[...data.programs.values()].filter(program=>(!q||(String(program.title)+' '+String(program.school)).toLowerCase().includes(q))&&(!school||String(program.school||program.institutionId).toLowerCase().includes(school)));
        if(filters.status&&!['ready','draft','all'].includes(filters.status))fail(400,'Choose ready, draft, or all programs.');
        if(filters.status&&filters.status!=='all')programs=programs.filter(program=>(program.readyTemplate===true)===(filters.status==='ready'));
        programs.sort((a,b)=>String(a.school).localeCompare(String(b.school))||String(a.title).localeCompare(String(b.title))||a.id.localeCompare(b.id));
        const selected=page(programs,filters,data.registry.revision,'programs'),reviews=await currentReviews(env.DB,unique(selected.items.flatMap(program=>programFacts(data,program))).filter(Boolean));
        return json({registryRevision:data.registry.revision,...selected,items:selected.items.map(program=>programView(program,data,reviews))});
      }
      const programMatch=path.match(/^\/programs\/([A-Za-z0-9_-]+)$/);
      if(programMatch) {
        query(url,[]);const program=data.programs.get(programMatch[1]);if(!program)fail(404,'Academic program not found.');
        const facts=programFacts(data,program),sources=unique(arr(program.sourceIds).concat(facts.flatMap(fact=>arr(fact.sourceIds)))).map(id=>data.sources.get(id)).filter(Boolean);
        const [reviews,evidence]=await Promise.all([currentReviews(env.DB,facts),hydrate(data,facts,sources)]);
        return json({registryRevision:data.registry.revision,program:programView(program,data,reviews,{detail:true}),facts:evidence.facts.map(fact=>factView(fact,reviews,data)),sources:evidence.sources.map(sourceView),findings:findingsFor(data,{programIds:[program.id],factIds:facts.map(fact=>fact.id)})});
      }
      const sourceMatch=path.match(/^\/sources\/([A-Za-z0-9_-]+)$/);
      if(sourceMatch) {
        query(url,[]);const source=data.sources.get(sourceMatch[1]);if(!source)fail(404,'Academic source not found.');
        const facts=data.factsBySource.get(source.id)||[],ids=unique(facts.flatMap(fact=>arr(fact.programIds)).concat(arr(source.programIds))),programs=ids.map(id=>data.programs.get(id)).filter(Boolean);
        // Shared guides can affect the whole school. Show indexed impacts here;
        // selected fact pages load their exact evidence within the detail cap.
        const [reviews,evidence]=await Promise.all([currentReviews(env.DB,unique([...facts,...programs.flatMap(program=>programFacts(data,program))])),hydrate(data,[],[source])]);
        return json({registryRevision:data.registry.revision,source:sourceView(evidence.sources[0]),facts:facts.map(fact=>factView(fact,reviews,data)),factsAreSummaries:true,programs:programs.map(program=>programView(program,data,reviews)),findings:findingsFor(data,{sourceIds:[source.id],factIds:facts.map(fact=>fact.id)})});
      }
      if(path==='/queue') {
        const filters=query(url,['q','school','programId','kind','decision','limit','cursor']),reviews=await currentReviews(env.DB,[...data.facts.values()]);
        let items=workQueue(data,reviews);
        if(filters.decision)items=items.filter(item=>item.reviewDecisions.includes(filters.decision));
        if(filters.kind)items=items.filter(item=>item.kinds.includes(filters.kind));
        if(filters.programId)items=items.filter(item=>arr(item.affectedProgramIds).includes(filters.programId));
        if(filters.school)items=items.filter(item=>arr(item.affectedProgramIds).some(id=>String(data.programs.get(id)?.school||'').toLowerCase().includes(filters.school.toLowerCase())));
        if(filters.q)items=items.filter(item=>JSON.stringify([item.code,item.message,item.targetId]).toLowerCase().includes(filters.q.toLowerCase()));
        return json({registryRevision:data.registry.revision,...page(items,filters,data.registry.revision,'queue'),reviewMeaning:REVIEW_MEANING});
      }
      if(path===''||path==='/') {
        query(url,[]);const facts=[...data.facts.values()],reviews=await currentReviews(env.DB,facts),states=facts.map(fact=>reviewView(reviews.get(fact.id),data.registry.revision).decision),programs=[...data.programs.values()];
        return json({registryRevision:data.registry.revision,summary:{programs:programs.length,readyTemplates:programs.filter(program=>program.readyTemplate===true).length,facts:facts.length,sources:data.sources.size,reviewedSupported:states.filter(state=>state==='reviewed-supported').length,needsEvidence:states.filter(state=>state==='needs-evidence').length,conflicts:states.filter(state=>state==='conflict').length,unreviewed:states.filter(state=>state==='unreviewed').length,findings:data.findings.length,blockingFindings:data.findings.filter(finding=>finding.blocking===true).length,queueItems:workQueue(data,reviews).length},qualitySummary:clone(data.report?.summary||data.report?.counts||data.registry.summary||null),institutions:unique(programs.map(program=>program.school)).filter(Boolean).sort(),reviewMeaning:REVIEW_MEANING,publicationChanged:false});
      }
      fail(404,'Coverage workbench action not found.');
    } catch(error) {
      if(error instanceof Problem)return json({error:error.message,...error.extra},error.status);
      return json({error:'The coverage workbench is temporarily unavailable. Your degree plans have not changed.'},503);
    }
  }
  return {handle};
})();

export async function handleAcademicCoverage(request,env,context={}) {
  return DegreeAcademicCoverage.handle(request,env,context);
}
