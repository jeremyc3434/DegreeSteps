/** Limited source, citation and verbatim-overlap checks. No proprietary plagiarism corpus.
 * Source reachability is never evidence that a claim is accurate or that a supplied excerpt is authentic.
 * All returned strings are untrusted plain data; callers must escape them before HTML rendering.
 */
const learningSourcesApi=(()=>{
  'use strict';
  const MAX_SOURCES=12,MAX_EXCERPT=12000,MAX_EXCERPTS=60000,MAX_CONTENT=100000;
  const MAX_FETCH_BYTES=196608,MAX_FETCH_TEXT=24000,MAX_OVERLAPS=24,SHINGLE=8;
  const RETRIEVAL_HOSTS=new Set([
    'openstax.org','www.openstax.org','arxiv.org','export.arxiv.org','www.gutenberg.org','gutenberg.org',
    'www.britannica.com','www.cdc.gov','www.nih.gov','www.ncbi.nlm.nih.gov','pubmed.ncbi.nlm.nih.gov','pmc.ncbi.nlm.nih.gov',
    'www.nature.com','www.science.org','www.pnas.org','www.sciencedirect.com','www.census.gov','www.bls.gov',
    'www.bea.gov','www.federalreserve.gov','www.sec.gov','www.nist.gov','www.noaa.gov','www.nasa.gov','www.loc.gov',
    'www.archives.gov','www.who.int','www.worldbank.org','www.imf.org','www.oecd.org','www.un.org',
    'www.khanacademy.org','www.saylor.org','learn.saylor.org','www.sophia.org','app.sophia.org','study.com','www.study.com',
    'www.wgu.edu','www.liberty.edu','www.tesu.edu','www.umpi.edu','www.umassglobal.edu','www.south.edu','www.phoenix.edu',
    'www.nber.org','www.pewresearch.org','ourworldindata.org','www.jstor.org','academic.oup.com','journals.sagepub.com',
    'onlinelibrary.wiley.com','link.springer.com','www.tandfonline.com','www.frontiersin.org','www.mdpi.com',
    'doi.org','www.doi.org','en.wikipedia.org'
  ]);
  const SECRET=/(?:^|[-_\[\]])(?:access[-_]?token|refresh[-_]?token|token|key|api[-_]?key|apikey|authorization|password|passwd|secret|session(?:[-_]?id)?|signature|credential|jwt|bearer|auth)(?:$|[-_\[\]])/i;
  const PERSONAL=/^(?:email|student[-_]?id|user[-_]?id|contact[-_]?id|lead[-_]?id|prospect[-_]?id)(?:\[\])?$/i;
  const TRACKING=/^(?:utm_.+|fbclid|gclid|dclid|msclkid|gbraid|wbraid|mc_cid|mc_eid|_ga|_gl)$/i;
  class SourceError extends Error{constructor(message){super(message);this.status=400;this.code='invalid_sources';}}
  const fail=message=>{throw new SourceError(message);};
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const clean=value=>String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim();
  const analysisText=value=>clean(value).normalize('NFKC').replace(/[\p{Cf}\p{Cs}]/gu,'');
  function field(value,label,max,{fallback=''}={}){
    if(value===undefined||value===null)return fallback;
    if(typeof value!=='string')fail(label+' must be text.');
    const result=clean(value);if(result.length>max)fail(label+' is too long.');return result;
  }
  function safeURL(value){
    if(typeof value!=='string'||value.length>2000||/[\s\p{Cc}\p{Cf}\\]/u.test(value))return null;
    try{
      const u=new URL(value),host=u.hostname.toLowerCase().replace(/\.$/,'');
      if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!host.includes('.')||host.startsWith('[')||/^\d/.test(host))return null;
      if(!/^[a-z0-9.-]+$/.test(host)||host.split('.').some(label=>!label||label.length>63||label.startsWith('-')||label.endsWith('-')))return null;
      if(/(?:^|\.)(?:localhost|local|internal|invalid|test|example|onion|home|lan|arpa)$/.test(host))return null;
      if(/(?:^|\.)(?:localhost|localhostlocaldomain|metadata\.google\.internal|metadata\.aws\.internal)$/.test(host))return null;
      const fragment=decodeURIComponent(u.hash);
      for(const part of fragment.split(/[?#&]/)){if(!part.includes('='))continue;const key=part.split('=',1)[0];if(SECRET.test(key)||PERSONAL.test(key)||/^(?:x-amz-|x-goog-)/i.test(key))return null;}
      // Public URLs may select an article with a query. Never keep signed/private-session links.
      for(const [key,val]of [...u.searchParams]){
        if(SECRET.test(key)||PERSONAL.test(key)||/^(?:x-amz-|x-goog-)/i.test(key)||/^Bearer\s/i.test(val)||/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(val))return null;
        if(TRACKING.test(key))u.searchParams.delete(key);
      }
      u.hostname=host;u.searchParams.sort();return u.href;
    }catch{return null;}
  }
  function normalize(sources){
    if(sources===undefined||sources===null)return[];
    if(!Array.isArray(sources)||sources.length>MAX_SOURCES)fail('Use at most '+MAX_SOURCES+' sources.');
    const used=new Set();
    for(const source of sources){
      if(!object(source))fail('Each source must contain a URL or excerpt.');
      if(source.id!==undefined){if(typeof source.id!=='string'||!/^S[1-9]\d?$/i.test(source.id))fail('Source IDs must use S1 through S99.');const id=source.id.toUpperCase();if(used.has(id))fail('Source IDs must be unique.');used.add(id);}
    }
    let excerptTotal=0,nextId=1;
    return sources.map((source,index)=>{
      let id=source.id?.toUpperCase();if(!id){while(used.has('S'+nextId))nextId++;id='S'+nextId++;used.add(id);}
      const urlInput=field(source.url,'Source URL',2000),url=urlInput?safeURL(urlInput):'';
      if(urlInput&&!url)fail('Use a public HTTPS source URL without passwords, private addresses or access tokens.');
      const excerpt=field(source.excerpt,'Source excerpt',MAX_EXCERPT);excerptTotal+=excerpt.length;
      if(excerptTotal>MAX_EXCERPTS)fail('The combined source excerpts are too long.');
      if(!url&&!excerpt)fail('Each source needs a public URL or a source excerpt.');
      const title=field(source.title,'Source title',300,{fallback:''})||'Source '+(index+1);
      return{id,title,url,excerpt};
    });
  }
  function comparableURL(value){const safe=safeURL(value);if(!safe)return null;const u=new URL(safe);u.hash='';return u.href;}
  function htmlText(value){
    return clean(value.replace(/<!--[\s\S]*?-->/g,' ').replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ')
      .replace(/<\/(?:p|div|li|h[1-6]|section|article|blockquote|tr)\s*>/gi,'\n').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,' ')
      .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,entity=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '})[entity])
      .replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_,value)=>{const n=value[0].toLowerCase()==='x'?parseInt(value.slice(1),16):parseInt(value,10);return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):' ';})
      .replace(/[\t ]+/g,' ').replace(/\n[\t ]+/g,'\n').replace(/\n{3,}/g,'\n\n')).slice(0,MAX_FETCH_TEXT);
  }
  async function boundedText(response,signal){
    if(Number(response.headers.get('Content-Length'))>MAX_FETCH_BYTES){await response.body?.cancel();throw Error('oversized');}
    if(!response.body)throw Error('empty');
    const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let size=0,result='';
    const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
    try{
      while(true){if(signal.aborted)throw Error('timeout');const part=await reader.read();if(signal.aborted)throw Error('timeout');if(part.done)break;size+=part.value.byteLength;if(size>MAX_FETCH_BYTES)throw Error('oversized');result+=decoder.decode(part.value,{stream:true});}
      result+=decoder.decode();return result;
    }finally{signal.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});reader.releaseLock();}
  }
  async function retrieve(source,env){
    const base={id:source.id,title:source.title,url:source.url,status:'not_checked',reachable:false,evidenceOrigin:source.excerpt?'provided-excerpt':'none',contentExcerpt:source.excerpt,reason:source.url?'This public URL has not been retrieved.':'Only the supplied excerpt was available.'};
    if(!source.url)return{view:{...base,status:'provided'},material:source.excerpt?[{origin:'provided-excerpt',text:source.excerpt}]:[]};
    if(!RETRIEVAL_HOSTS.has(new URL(source.url).hostname))return{view:{...base,reason:'This host is outside the limited public-source retrieval list. Its URL and supplied excerpt remain available.'},material:source.excerpt?[{origin:'provided-excerpt',text:source.excerpt}]:[]};
    const timeout=Math.min(8000,Math.max(250,Number(env.LEARNING_SOURCE_TIMEOUT_MS)||4000)),controller=new AbortController();let timer;
    try{
      const work=(async()=>{
        const fetcher=typeof env.LEARNING_SOURCE_FETCH==='function'?env.LEARNING_SOURCE_FETCH:fetch;
        const response=await fetcher(source.url,{method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',headers:{Accept:'text/html, text/plain;q=0.9','User-Agent':'DegreeSteps-Source-Check/1.0'},signal:controller.signal});
        if(response.status>=300&&response.status<400){await response.body?.cancel();return{status:'not_checked',reachable:false,reason:'The source redirects. The destination was not followed or verified.'};}
        if(!response.ok){await response.body?.cancel();return{status:'unavailable',reachable:false,reason:'The source could not be read publicly.'};}
        const type=(response.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase();
        if(!['text/html','text/plain','application/xhtml+xml'].includes(type)){await response.body?.cancel();return{status:'not_checked',reachable:true,reason:'The URL responded, but this file format was not read by the limited source checker.'};}
        const raw=await boundedText(response,controller.signal),text=type==='text/plain'?clean(raw).slice(0,MAX_FETCH_TEXT):htmlText(raw);
        if(text.length<40)return{status:'not_checked',reachable:true,reason:'The URL responded, but too little readable public text was available.'};
        return{status:'retrieved',reachable:true,evidenceOrigin:'retrieved-page',contentExcerpt:text.slice(0,MAX_EXCERPT),reason:'Public page text was retrieved. This does not verify its claims, credibility or a supplied excerpt.',text};
      })();
      const result=await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('timeout'));},timeout);})]);
      const{text,...view}=result;
      return{view:{...base,...view},material:[...(source.excerpt?[{origin:'provided-excerpt',text:source.excerpt}]:[]),...(text?[{origin:'retrieved-page',text}]:[])]};
    }catch{return{view:{...base,status:'unavailable',reason:'The public source could not be read within the size or time limits.'},material:source.excerpt?[{origin:'provided-excerpt',text:source.excerpt}]:[]};}
    finally{clearTimeout(timer);controller.abort();}
  }
  function words(text){return[...text.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)].map(m=>({value:m[0].toLowerCase(),start:m.index,end:m.index+m[0].length}));}
  function quoteRanges(content){
    const ranges=[];for(const pattern of [/"[^"\n]{1,20000}"/g,/“[^”]{1,20000}”/g,/^\s*>[^\n]*(?:\n\s*>[^\n]*)*/gm])for(const match of content.matchAll(pattern))ranges.push([match.index,match.index+match[0].length]);return ranges;
  }
  function citations(content){
    const found=new Set();for(const marker of content.matchAll(/\[\s*S\d{1,4}(?:\s*[,;]\s*S\d{1,4})*\s*\]/gi))for(const id of marker[0].match(/S\d{1,4}/gi)||[])found.add(id.toUpperCase());return found;
  }
  function citationNear(content,start,end,id){
    const before=content.lastIndexOf('\n\n',start),after=content.indexOf('\n\n',end),section=content.slice(Math.max(before<0?0:before+2,start-220),Math.min(after<0?content.length:after,end+220));return citations(section).has(id);
  }
  function urlsIn(content){
    const result=new Set();for(const match of content.matchAll(/https?:\/\/[^\s<>"'\]\)]+/gi)){const safe=comparableURL(match[0].replace(/[.,;:!?]+$/,''));if(safe)result.add(safe);}return result;
  }
  function findOverlaps(content,draftWords,materials,sourceId,ranges){
    const results=[];
    for(const material of materials){
      const sourceText=analysisText(material.text),sourceWords=words(sourceText),index=new Map();
      for(let j=0;j<=sourceWords.length-SHINGLE;j++){const key=sourceWords.slice(j,j+SHINGLE).map(w=>w.value).join(' ');let at=index.get(key);if(!at){at=[];index.set(key,at);}if(at.length<4)at.push(j);}
      for(let i=0;i<=draftWords.length-SHINGLE;i++){
        const key=draftWords.slice(i,i+SHINGLE).map(w=>w.value).join(' '),positions=index.get(key);if(!positions)continue;
        let length=SHINGLE;for(const at of positions){let count=SHINGLE;while(count<120&&i+count<draftWords.length&&at+count<sourceWords.length&&draftWords[i+count].value===sourceWords[at+count].value)count++;length=Math.max(length,count);}
        const start=draftWords[i].start,end=draftWords[i+length-1].end,quoted=ranges.some(([a,b])=>start>=a&&end<=b),cited=citationNear(content,start,end,sourceId);
        results.push({sourceId,text:content.slice(start,end).slice(0,1000),wordCount:length,quoted,cited,needsQuotation:!quoted,needsCitation:!cited,needsAttribution:!quoted||!cited,evidenceOrigin:material.origin,note:quoted&&cited?'This matching passage is marked as a quotation with a nearby source marker.':!quoted?'This wording overlaps a compared source. Review whether it needs quotation marks or a substantive rewrite, with attribution.':'This matching quotation needs a nearby source marker.'});
        i+=length-1;if(results.length>=MAX_OVERLAPS)return results;
      }
    }
    return results;
  }
  async function check({content='',sources=[],fetchSources=false}={},env={}){
    if(typeof content!=='string'||content.length>MAX_CONTENT)fail('The document is too large for this source check.');
    const normalized=normalize(sources),body=analysisText(content),draftWords=words(body),ranges=quoteRanges(body),known=new Set(normalized.map(s=>s.id)),used=citations(body),urls=urlsIn(body),knownURLs=new Set(normalized.map(s=>comparableURL(s.url)).filter(Boolean));
    const rows=new Array(normalized.length);let cursor=0;
    async function worker(){while(cursor<normalized.length){const i=cursor++,source=normalized[i];rows[i]=fetchSources===true?await retrieve(source,env):{view:{id:source.id,title:source.title,url:source.url,status:source.excerpt?'provided':'not_checked',reachable:false,evidenceOrigin:source.excerpt?'provided-excerpt':'none',contentExcerpt:source.excerpt,reason:source.excerpt?'Only the supplied excerpt was compared. Its source and authenticity were not independently verified.':'The URL has not been retrieved.'},material:source.excerpt?[{origin:'provided-excerpt',text:source.excerpt}]:[]};}}
    await Promise.all(Array.from({length:Math.min(3,normalized.length)},worker));
    const unique=new Map();let truncated=false;for(const row of rows){const found=findOverlaps(body,draftWords,row.material,row.view.id,ranges);if(found.length>=MAX_OVERLAPS)truncated=true;for(const overlap of found){const key=overlap.sourceId+'|'+overlap.text;if(!unique.has(key))unique.set(key,overlap);if(unique.size>=MAX_OVERLAPS){truncated=true;break;}}if(unique.size>=MAX_OVERLAPS)break;}
    const overlaps=[...unique.values()],checkedSources=rows.map(row=>({...row.view,cited:used.has(row.view.id)||Boolean(comparableURL(row.view.url)&&urls.has(comparableURL(row.view.url)))}));
    const unknownCitations=[...used].filter(id=>!known.has(id)),unknownSourceURLs=[...urls].filter(url=>!knownURLs.has(url)),uncitedSources=body?checkedSources.filter(s=>!s.cited).map(s=>s.id):[];
    const compared=rows.filter(row=>row.material.length).length,retrieved=checkedSources.filter(s=>s.status==='retrieved').length;
    return{
      status:unknownCitations.length||unknownSourceURLs.length||overlaps.some(o=>o.needsAttribution)?'needs-review':'limited-check-complete',
      checkedSources,overlaps,overlapsMayBeTruncated:truncated,unknownCitations,unknownSourceURLs,uncitedSources,
      coverage:'Compared the document with material from '+compared+' supplied sources; retrieved readable public text from '+retrieved+' sources. This is a limited source and citation check, not a comprehensive plagiarism search.',
      claimSupportVerified:false,
      limitations:[
        'Only supplied excerpts and successfully retrieved public page text were compared. Unlisted websites, books, paid databases and other students’ submissions were not searched.',
        'A reachable source, a source marker or an absence of overlap does not establish accuracy, originality, academic credibility or support for a claim.',
        'Verbatim matches of eight or more words are flagged for review. Common wording can match; paraphrased copying and semantic similarity may not be detected.',
        'Source markers are checked as [S1] references. Citation style, bibliographic metadata and quotations still require review against the actual source.',
        'Public retrieval uses an exact host allowlist, bounded text and time limits, and does not follow redirects or access signed-in content.'
      ]
    };
  }
  return{normalize,check};
})();

export function normalizeLearningSources(sources){return learningSourcesApi.normalize(sources);}
export async function checkLearningSources(input,env={}){return learningSourcesApi.check(input,env);}
