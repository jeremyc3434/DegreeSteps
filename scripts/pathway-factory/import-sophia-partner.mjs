/**
 * Imports a Sophia partner page (https://<partner>.sophia.org/) into a school kit's equivalency table.
 *
 * The page is provider-published: Sophia states which of its courses transfer to the partner school and as which
 * receiving course. Rows are therefore evidence "conditional" with evidenceType "provider-published-equivalency"; the
 * school must still confirm them. Only a row whose receiving text names exactly one receiving course code, in the kit's
 * own credit units, becomes a published row (scope all). Electives, "X OR Y" choices, category or transfer buckets,
 * Sophia's own course codes and awards whose units the page does not state stay candidates, which never compile.
 *
 * Usage: node scripts/pathway-factory/import-sophia-partner.mjs --school <kit-id> --partner <sub>
 *          [--name "<Official School Name>"] [--credit-system semester|quarter] [--check]
 * --check fetches and parses the live page but writes nothing; it exits 1 when the kit would change.
 */
import {join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {htmlToText,decodeEntities,USER_AGENT,storeCapture} from './capture.mjs';
import {readJSON,writeJSON,exists,loadProviders,loadKit,kitDirs,sourceRefs,resolveKitDir,capturesRoot,root,sha256,normalizeText,slug,today as todayDate,parseArgs,isMain,list,same,creditSystems} from './lib.mjs';

export const IMPORT_EVIDENCE_TYPE='provider-published-equivalency';
export const reviewIdFor=partner=>`sophia-partner-import-${partner}`;
export const sourceIdFor=school=>`${school}-sophia-partner-page`;
export const partnerUrl=partner=>`https://${partner}.sophia.org/`;
const CONDITION_ID='sophia-partner-provider-published';
const EPS=1e-6;

const cellText=html=>decodeEntities(String(html).replace(/<[^>]+>/g,' ')).replace(/[\s ]+/g,' ').trim();
/** Every table row on the page that has an ACE id cell, as {cells:[{title,text}]}. Header and layout rows are dropped. */
export function tableRows(html){
  const rows=[];
  for(const tr of String(html).match(/<tr\b[\s\S]*?<\/tr>/gi)||[]){
    const cells=[];
    for(const m of tr.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)){const title=/data-title=(['"])([\s\S]*?)\1/i.exec(m[1]);cells.push({title:title?decodeEntities(title[2]).replace(/\s+/g,' ').trim():'',text:cellText(m[2])});}
    if(cells.some(c=>/ace/i.test(c.title)&&/^SOPH-\d{4}$/.test(c.text)))rows.push({cells});
  }
  return rows;
}
const isAce=t=>/\bace\b/i.test(t),isCredits=t=>/credit|^sem$|^qtr$/i.test(t),isReviews=t=>/review|rating/i.test(t),isSophia=t=>/^sophia courses?$/i.test(t),isCategory=t=>/^category$/i.test(t);
/** One parsed partner row: Sophia title, verbatim receiving text (null when the row only names a category), credits and their column header. */
export function parseRows(html){
  return tableRows(html).map(({cells})=>{
    const titled=cells.filter(c=>c.title);
    const ace=titled.find(c=>isAce(c.title)),credit=titled.find(c=>isCredits(c.title)),sophia=titled.find(c=>isSophia(c.title)),category=titled.find(c=>isCategory(c.title));
    const receiving=titled.find(c=>!isAce(c.title)&&!isCredits(c.title)&&!isReviews(c.title)&&!isSophia(c.title)&&!isCategory(c.title));
    const credits=credit&&/^\d+(\.\d+)?$/.test(credit.text)?Number(credit.text):null;
    return {code:ace.text,sophiaTitle:sophia?.text||'',receivingHeader:receiving?.title||null,receiving:receiving?.text||null,category:category?.text||null,credits,creditHeader:credit?.title||null};
  });
}
/** The unit a credit column states: "Qtr Credits" → quarter, "Sem Credits"/"Semester Credits"/"Sem" → semester, "Credits" → null (unstated). */
export function headerUnits(header){
  if(/\b(qtr|quarter)\b/i.test(header||''))return 'quarter';
  if(/\bsem(ester)?\b/i.test(header||''))return 'semester';
  return null;
}
const CODE=String.raw`[A-Z]{2,5}[ -]?\d{2,4}[A-Z]{0,2}`;
const BUCKET=/\b(electives?|transfer|general education|gen\.? ?ed\.?|categor(y|ies)|requirements?)\b|\barea\s+[a-z]\b/i;
/**
 * Classifies verbatim receiving text. Returns {kind:'course', code, title, qualifiers} for exactly one named receiving
 * course, else {kind:'candidate', reason}. Never guesses: anything with a choice, a bucket word or no code is a candidate.
 */
export function classifyReceiving(text,{aliases=[]}={}){
  const raw=String(text||'').trim();
  if(!raw)return {kind:'candidate',reason:'no-receiving-course'};
  if(/\/\/|\s\|\s|\bor\b|;/i.test(raw))return {kind:'candidate',reason:'choice-or-multiple'};
  const qualifiers=[];let rest=raw;
  // A trailing "(CODE)" names the course; other parentheticals are qualifiers stated by the page.
  let code=null,title=null;const trailing=new RegExp(String.raw`^(.*?)\s*\((${CODE})\)$`).exec(rest);
  if(trailing){title=trailing[1].trim();code=trailing[2];rest='';}
  else{
    rest=rest.replace(/\s*\(([^()]*)\)/g,(match,inner)=>{qualifiers.push(inner.trim());return '';}).trim();
    const leading=new RegExp(String.raw`^(${CODE})(?![A-Za-z0-9])\s*[-–—:]?\s*(.*)$`).exec(rest);
    if(leading){code=leading[1];title=leading[2].trim()||null;}
    if(leading&&/^[-–—]?\s*\d/.test(leading[2]))return {kind:'candidate',reason:'code-range'};// "HRMN 100-300"
  }
  if(!code)return {kind:'candidate',reason:BUCKET.test(raw)?'elective-or-category':'no-course-code'};
  if(BUCKET.test(title||'')||BUCKET.test(raw.replace(/\([^()]*\)/g,''))||qualifiers.some(q=>BUCKET.test(q)))return {kind:'candidate',reason:'elective-or-category'};
  // A second course code ("ACCT100 … /ACCT105", "BUS 215/FIN 215", a requisite note) means more than one course is involved.
  if([title||'',...qualifiers].some(part=>new RegExp(CODE).test(part)))return {kind:'candidate',reason:'choice-or-multiple'};
  // A qualifier with a number ("5 Qtr Credits", "Upper Level, 6 Qtr Credits") states a quantity that may differ from the listed award.
  if(qualifiers.some(q=>/\d/.test(q)))return {kind:'candidate',reason:'quantity-qualifier'};
  // "SCI 201 (Unlocking the Secrets of Science)": a lone parenthetical after a bare code is the course title, not a restriction.
  if(!title&&qualifiers.length===1&&!/\b(only|no|not|credit|level|division|lab|lecture|requisite)\b/i.test(qualifiers[0])){title=qualifiers.pop();}
  if(aliases.some(a=>a.replace(/[ -]/g,'').toUpperCase()===code.replace(/[ -]/g,'').toUpperCase()))return {kind:'candidate',reason:'sophia-own-course-code'};
  return {kind:'course',code,title:title||null,qualifiers};
}
/** The award unit a row states, given its column header and the Sophia course's original semester credits. */
export function rowUnits(row,sourceCredits){
  const stated=headerUnits(row.creditHeader);if(stated)return stated;
  if(!(row.credits>0)||!(sourceCredits>0))return null;
  if(Math.abs(row.credits-sourceCredits*1.5)<EPS)return 'quarter';// a quarter award listed under a plain "Credits" header
  if(Math.abs(row.credits-sourceCredits)<EPS)return 'semester';// Sophia's own semester credits, equal to a semester award
  return null;
}
/** Builds the rows, skips and report for one parsed page. Pure: no I/O, no clock. */
export function buildRows(parsed,{school,schoolName,partner,creditSystem,sophia,checked,sourceId,captureText}){
  const courses=new Map(list(sophia?.courses).map(c=>[c.code,c])),text=normalizeText(captureText),report={published:0,candidates:0,skipped:[],noReceiving:0,duplicates:0,conflicts:[],reasons:{}};
  const unique=new Map();
  for(const row of parsed){
    if(!row.receiving){report.noReceiving++;continue;}// "Sophia Courses Without Transfer Equivalency" table
    const key=row.code;if(!unique.has(key))unique.set(key,[]);
    const seen=unique.get(key);if(seen.some(r=>r.receiving===row.receiving&&r.credits===row.credits)){report.duplicates++;continue;}
    seen.push(row);
  }
  const rows=[];
  for(const[code,variants]of unique){
    const course=courses.get(code);
    if(!course){report.skipped.push({code,title:variants[0].sophiaTitle,reason:'no Sophia identity in content/pathway-kits/providers/sophia.json'});continue;}
    if(variants.length>1)report.conflicts.push({code,receiving:variants.map(v=>v.receiving)});
    for(const[index,row]of variants.entries()){
      const cells=[row.sophiaTitle,row.receiving,row.code,row.credits==null?'':String(row.credits)].filter(Boolean).join(' ');
      const quote=text.includes(normalizeText(cells))?cells:text.includes(normalizeText(row.receiving+' '+row.code))?row.receiving+' '+row.code:null;
      if(!quote){report.skipped.push({code,title:row.sophiaTitle,reason:'row text not found in the capture'});continue;}
      if(!(row.credits>0)){report.skipped.push({code,title:row.sophiaTitle,reason:'no credit quantity listed'});continue;}
      const units=rowUnits(row,course.sourceCredits);
      let verdict=variants.length>1?{kind:'candidate',reason:'conflicting-rows-for-one-course'}:classifyReceiving(row.receiving,{aliases:list(course.codeAliases)});
      if(verdict.kind==='course'&&!units)verdict={kind:'candidate',reason:'award-units-unstated'};
      if(verdict.kind==='course'&&units!==creditSystem)verdict={kind:'candidate',reason:'award-units-differ-from-school'};
      const base={provider:'Sophia',code,credits:row.credits,creditSystem:units||'semester',sourceIds:[sourceId],evidence:'conditional',evidenceType:IMPORT_EVIDENCE_TYPE,creditOrigin:'alternative',sourceType:'alternative',conditionIds:[CONDITION_ID],mappingChecked:checked,mappingReviewId:reviewIdFor(partner),quotes:[{sourceId,text:quote}],scope:{all:true}};
      const extra={partnerReceivingText:row.receiving,partnerColumn:row.receivingHeader,partnerCreditColumn:row.creditHeader};
      if(!units)extra.listedCreditsBasis='The page lists this quantity under a plain "Credits" header that does not state the award units.';
      if(verdict.kind==='course'){
        const out={id:`sophia-${code.toLowerCase()}-to-${slug(verdict.code)}`,status:'published',...base,receivingCode:verdict.code};
        if(verdict.title)out.receivingTitle=verdict.title;
        if(verdict.qualifiers.length)out.conditions=verdict.qualifiers.map(q=>`${schoolName}'s Sophia partner page adds: ${q}.`);
        out.extra=extra;rows.push(out);report.published++;
      }else{
        rows.push({id:`sophia-${code.toLowerCase()}-${school}-partner-candidate${variants.length>1?'-'+(index+1):''}`,status:'candidate',...base,receivingTitle:row.receiving,extra:{...extra,candidateReason:verdict.reason}});
        report.candidates++;report.reasons[verdict.reason]=(report.reasons[verdict.reason]||0)+1;
      }
    }
  }
  return {rows,report};
}
export const conditionText=(name,partner)=>`Sophia publishes this course match on its ${name} partner page (${partnerUrl(partner)}); it is not taken from a ${name} document. ${name} decides transfer credit when it evaluates your Sophia transcript, so confirm it applies to your program and catalog year before relying on it.`;
/** Merges imported rows into an equivalencies document: replaces this partner's earlier import, keeps every other row. */
export function mergeRows(doc,rows,{school,partner,name}){
  const reviewId=reviewIdFor(partner),kept=list(doc.equivalencies).filter(r=>r.mappingReviewId!==reviewId);
  const taken=new Set(kept.map(r=>r.id)),existing=new Set(kept.filter(r=>(r.status||'published')==='published').map(r=>[r.provider,r.code,r.receivingCode||'',r.receivingTitle||''].join('|')));
  const overlaps=[],added=[];
  for(const row of rows){
    if(taken.has(row.id)||existing.has([row.provider,row.code,row.receivingCode||'',row.receivingTitle||''].join('|'))){overlaps.push(row.id);continue;}
    taken.add(row.id);added.push(row);
  }
  const conditionLibrary={...(doc.conditionLibrary||{}),[CONDITION_ID]:conditionText(name,partner)};
  return {doc:{kind:'pathway-kit-equivalencies',version:1,...doc,school,conditionLibrary,equivalencies:[...kept,...added]},overlaps};
}
/** A hash of the parsed course table, without the page's live review counts. */
export const tableSignature=parsed=>sha256(JSON.stringify(parsed.map(r=>[r.code,r.sophiaTitle,r.receivingHeader,r.receiving,r.category,r.credits,r.creditHeader])));
export function sourceEntry({school,name,partner,checked,capture,tableSha256}){
  return {id:sourceIdFor(school),title:`Sophia partner page: Sophia courses that transfer to ${name}`,url:partnerUrl(partner),checked,capture,tableSha256,kind:'provider',publisher:'Sophia Learning',evidenceType:IMPORT_EVIDENCE_TYPE,roles:['transfer-equivalency'],scope:`Provider-published course matches for ${name}; ${name} confirms transfer credit when it evaluates the transcript.`};
}
const placeholder=name=>/\(official school name needed\)$/.test(name||'');

/**
 * Fetches and imports one partner page into kitDir. fetchImpl, now and capturesDir are injectable for tests.
 * Returns {report, overlaps, changed, schoolCreated, capture}.
 */
export async function importPartner({school,partner,name,creditSystem,kitDir,check=false,fetchImpl=globalThis.fetch,now=()=>new Date(),capturesDir=capturesRoot,providersDir,base=root}){
  if(!/^[a-z0-9][a-z0-9-]{1,48}$/.test(school||''))throw Error('--school must be a kit id: lowercase letters, digits and hyphens.');
  if(!/^[a-z0-9][a-z0-9-]*$/.test(partner||''))throw Error('--partner must be the Sophia partner subdomain, such as snhu.');
  if(creditSystem&&!creditSystems.includes(creditSystem))throw Error(`--credit-system must be one of ${creditSystems.join(', ')}.`);
  kitDir=kitDir||resolveKitDir(school);
  const schoolPath=join(kitDir,'school.json'),eqPath=join(kitDir,'equivalencies.json');
  const existingSchool=await exists(schoolPath)?await readJSON(schoolPath):null;
  if(existingSchool&&existingSchool.id!==school)throw Error(`${schoolPath} belongs to ${existingSchool.id}, not ${school}.`);
  const url=partnerUrl(partner);
  const response=await fetchImpl(url,{redirect:'follow',headers:{'user-agent':USER_AGENT,'accept':'text/html'}});
  if(!response.ok)throw Error(`Capture failed: HTTP ${response.status} for ${url}`);
  const finalUrl=response.url||url;
  if(new URL(finalUrl).hostname!==new URL(url).hostname)throw Error(`${url} redirected to ${finalUrl}; it is not a partner page.`);
  const html=await response.text(),text=htmlToText(html),page={text,sha256:sha256(text),url,finalUrl,contentType:response.headers?.get?.('content-type')||'text/html',status:response.status};
  const parsed=parseRows(html);
  if(!parsed.some(r=>r.receiving))throw Error(`${url} lists no receiving-school course column; nothing to import.`);
  const checked=now().toISOString().slice(0,10);
  const units=creditSystem||existingSchool?.creditSystem||inferPageUnits(parsed,await loadProviders(providersDir||join(kitDir,'..','providers')));
  if(!units)throw Error(`The page does not state its credit units; pass --credit-system.`);
  if(existingSchool&&existingSchool.creditSystem!==units)throw Error(`${school} is a ${existingSchool.creditSystem} kit; --credit-system ${units} disagrees.`);
  const schoolName=name||existingSchool?.name;
  if(!schoolName||placeholder(schoolName))throw Error('Pass --name "<Official School Name>" for a new or unnamed kit.');
  const providers=await loadProviders(providersDir||join(kitDir,'..','providers')),sophia=providers.get('Sophia');
  if(!sophia)throw Error('No Sophia provider identities found.');
  const sourceId=sourceIdFor(school),tableSha256=tableSignature(parsed);
  // The page shows live review counts, so its full text changes on every load. When the course table itself (titles,
  // receiving courses, ACE ids, credits) is unchanged, the earlier capture, checked date and rows stand.
  const previous=list(existingSchool?.sources).find(s=>s.id===sourceId);
  const unchanged=Boolean(previous?.capture&&previous.tableSha256===tableSha256&&await exists(join(base,previous.capture)));
  const captureRel=unchanged?previous.capture:(capturesDir.startsWith(base+'/')?capturesDir.slice(base.length+1):capturesDir)+'/'+page.sha256.slice(0,16)+'.txt';
  const captureText=unchanged?await readFile(join(base,previous.capture),'utf8'):text;
  const {rows,report}=buildRows(parsed,{school,schoolName,partner,creditSystem:units,sophia,checked:unchanged?sourceDateOf(previous):checked,sourceId,captureText});
  const eqDoc=await exists(eqPath)?await readJSON(eqPath):{kind:'pathway-kit-equivalencies',version:1,school,equivalencies:[]};
  const {doc,overlaps}=mergeRows(eqDoc,rows,{school,partner,name:schoolName});
  const schoolDoc=existingSchool?{...existingSchool}:{kind:'pathway-kit-school',version:1,id:school,name:schoolName,creditSystem:units,checkedOn:checked,sources:[]};
  if(placeholder(schoolDoc.name))schoolDoc.name=schoolName;
  const source=sourceEntry({school,name:schoolName,partner,checked:unchanged?sourceDateOf(previous):checked,capture:captureRel,tableSha256});
  schoolDoc.sources=[...list(schoolDoc.sources).filter(s=>s.id!==sourceId&&s.copiedFor!==copyTag(partner)),source];
  const identity=await resolveIdentitySources({doc,schoolDoc,providers,partner,kitDir});
  report.published-=identity.demoted.length;report.candidates+=identity.demoted.length;
  if(identity.demoted.length)report.reasons['provider-identity-unverifiable']=(report.reasons['provider-identity-unverifiable']||0)+identity.demoted.length;
  report.copiedSources=identity.copied;
  const changed=!existingSchool||!same(existingSchool,schoolDoc)||!same(eqDoc,doc);
  if(!check&&changed){
    if(!unchanged)await storeCapture(page,{dir:capturesDir,now});
    await writeJSON(schoolPath,schoolDoc);await writeJSON(eqPath,doc,['equivalencies']);
  }
  return {report:{school,partner,name:schoolName,creditSystem:units,...report},overlaps,changed,schoolCreated:!existingSchool,capture:captureRel};
}
const sourceDateOf=s=>s.checked??s.checkedOn;
const copyTag=partner=>`${reviewIdFor(partner)}:provider-identity`;
/**
 * A published row compiles the shared Sophia identity, whose evidence may cite a source that another school kit defines
 * (for example a Sophia course page first captured for WGU). Such a source record is copied verbatim into this kit's
 * school.json, tagged copiedFor/copiedFrom, so the identity keeps its evidence. A row whose identity cites a source no
 * kit defines is demoted to a candidate. Mutates doc and schoolDoc; returns {copied, demoted}.
 */
async function resolveIdentitySources({doc,schoolDoc,providers,partner,kitDir}){
  const known=new Set([...list(schoolDoc.sources).map(s=>s.id),...[...providers.values()].flatMap(p=>list(p.sources).map(s=>s.id))]);
  const elsewhere=new Map(),kitsDir=join(kitDir,'..');
  for(const dir of await kitDirs(kitsDir)){
    if(dir===kitDir)continue;
    const kit=await loadKit(dir,{providers}),name=dir.split(/[\\/]/).pop();
    for(const s of list(kit.school.sources))if(!s.copiedFor&&!elsewhere.has(s.id))elsewhere.set(s.id,{source:s,from:name+'/school.json'});// copies are not origins
    for(const p of kit.programs)for(const s of list(p.sources))if(!elsewhere.has(s.id))elsewhere.set(s.id,{source:s,from:name+'/'+p.file});
  }
  const courses=new Map(list(providers.get('Sophia')?.courses).map(c=>[c.code,c])),copied=new Map(),demoted=[];
  for(const row of doc.equivalencies){
    if(row.mappingReviewId!==reviewIdFor(partner)||row.status!=='published')continue;
    const identity={...courses.get(row.code),...(row.identity||{})};for(const field of list(row.identityOmit))delete identity[field];
    const missing=[...new Set(sourceRefs(identity).map(r=>r.id))].filter(id=>!known.has(id)&&!copied.has(id));
    if(missing.some(id=>!elsewhere.has(id))){
      row.status='candidate';row.id=row.id.replace(/^sophia-(soph-\d{4})-to-.*$/,`sophia-$1-${schoolDoc.id}-partner-candidate`);
      row.extra={...row.extra,candidateReason:'provider-identity-unverifiable'};demoted.push(row.code);continue;
    }
    for(const id of missing)copied.set(id,elsewhere.get(id));
  }
  for(const[id,{source,from}]of [...copied].sort(([a],[b])=>a.localeCompare(b)))schoolDoc.sources.push({...source,copiedFor:copyTag(partner),copiedFrom:from});
  return {copied:[...copied.keys()].sort(),demoted};
}
/** The page's award unit when the caller passes none: explicit headers first, else the plain-credits ratio to Sophia's own credits. */
export function inferPageUnits(parsed,providers){
  const courses=new Map(list(providers.get('Sophia')?.courses).map(c=>[c.code,c])),found=new Set();
  for(const row of parsed.filter(r=>r.receiving)){const u=rowUnits(row,courses.get(row.code)?.sourceCredits);if(u)found.add(u);}
  return found.size===1?[...found][0]:null;
}
async function main(){
  const args=parseArgs(process.argv.slice(2));
  if(!args.school||!args.partner)throw Error('Usage: import-sophia-partner.mjs --school <kit-id> --partner <sub> [--name "<Official School Name>"] [--credit-system semester|quarter] [--check]');
  const result=await importPartner({school:args.school,partner:args.partner,name:typeof args.name==='string'?args.name:undefined,creditSystem:typeof args['credit-system']==='string'?args['credit-system']:undefined,check:Boolean(args.check)});
  console.log(JSON.stringify({...result.report,overlaps:result.overlaps,changed:result.changed,schoolCreated:result.schoolCreated,capture:result.capture},null,2));
  if(args.check&&result.changed)process.exitCode=1;
}
if(isMain(import.meta))await main();
