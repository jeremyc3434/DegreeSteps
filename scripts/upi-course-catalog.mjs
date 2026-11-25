/* UPI source-course discovery and recommendation facts. This never creates a receiving-school award. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {attachUPICoursePurchasePrice} from './upi-course-pricing.mjs';

const root=resolve(import.meta.dirname,'..'),copy=value=>JSON.parse(JSON.stringify(value));
export const upiReviewPath='content/catalog/upi-course-identities-reviewed-2026-11-25.json';
export const upiCourseReview=JSON.parse(await readFile(resolve(root,upiReviewPath),'utf8'));
const list=value=>Array.isArray(value)?value:[];
const date=value=>{if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(value))return false;const parsed=new Date(value);return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;};
const safeURL=(value,hosts)=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&hosts.includes(u.hostname.toLowerCase());}catch{return false;}};
const decode=value=>String(value).replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n))).replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,value=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '})[value]);
const text=value=>decode(String(value).replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
const iso=value=>{const m=String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);assert(m,'Use the exact published ACE recommendation date.');const result=m[3]+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0');assert(date(result));return result;};

/** Read only explicit ACE exhibit fields, never adjacent organization-page cards. */
export function parseUPIACEExhibit(html){
  const fields=new Map();
  for(const match of String(html).matchAll(/<div class="label[^\"]*">([\s\S]*?)<\/div>\s*<div class="value[^\"]*">([\s\S]*?)<\/div>/g)){
    const label=text(match[1]);assert(!fields.has(label),'Ambiguous duplicate ACE field: '+label);fields.set(label,{text:text(match[2]),html:match[2]});
  }
  assert(fields.get('Credit Type:')?.text==='Course'&&fields.get('Organization:')?.text==='UPI Study','This is not a UPI course exhibit.');
  const titleMatch=String(html).match(/<meta name="twitter:title" content="([^\"]+)"/),table=String(html).match(/<table class="credit-recommendations">([\s\S]*?)<\/table>/);
  assert(titleMatch&&table&&/Credits\s*\(SH\)/.test(text(table[1])),'Use the explicit ACE title and semester-hour table.');
  const values=[...table[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(match=>text(match[1]));
  assert(values.length===3&&['Lower-Division Baccalaureate','Upper-Division Baccalaureate'].includes(values[0]),'Review multiple awards or an unknown level explicitly.');
  const selected=fields.get('ACE Credit Recommendation Period:')?.html.match(/<option\b(?=[^>]*\bselected="selected")[^>]*>([\s\S]*?)<\/option>/);
  assert(selected,'Use the exact selected ACE recommendation period.');
  const period=text(selected[1]).split(/\s+-\s+/);assert(period.length===2);
  const result={aceId:fields.get('ACE ID:')?.text,title:decode(titleMatch[1]),providerCourseCode:fields.get("Organization's ID:")?.text,
    sourceCredits:Number(values[1]),sourceCreditSystem:'semester',sourceUpper:values[0]==='Upper-Division Baccalaureate',courseVersion:Number(fields.get('Version:')?.text),
    recommendationStart:iso(period[0]),recommendationEnd:iso(period[1]),minScore:Number(fields.get('Minimum Passing Score:')?.text),creditSubject:values[2],
    identityQuote:['ACE ID: '+fields.get('ACE ID:')?.text,'Version: '+fields.get('Version:')?.text,"Organization's ID: "+fields.get("Organization's ID:")?.text,'Organization: UPI Study'].join(' '),
    sourceCreditQuote:'Level Credits (SH) Subject '+values.join(' '),recommendationPeriodQuote:'ACE Credit Recommendation Period: '+text(selected[1])};
  assert(/^UPIS-\d{4}$/.test(result.aceId)&&result.providerCourseCode&&Number.isInteger(result.courseVersion)&&result.courseVersion>0&&result.sourceCredits>0&&result.minScore>=0&&result.minScore<=100,'The complete exact ACE source fields are required.');
  return result;
}

/** Use the page's own URL-bound Course graph, not its unrelated generic Thinkific product node. */
export function parseUPIProviderCourse(html,courseUrl){
  assert(safeURL(courseUrl,['www.upistudy.com','upistudy.com']));const nodes=[];
  for(const match of String(html).matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)){
    let graph;try{graph=JSON.parse(match[1]);}catch{continue;}
    nodes.push(...(Array.isArray(graph)?graph:Array.isArray(graph?.['@graph'])?graph['@graph']:[graph]));
  }
  const courses=nodes.filter(node=>node&&([node['@type']].flat().includes('Course'))&&node.url===courseUrl&&node.educationalCredentialAwarded?.identifier?.propertyID==='ACE course ID');
  assert.equal(courses.length,1,'Identify one exact current UPI Course graph with its own URL and ACE identity.');
  const course=courses[0],credential=course.educationalCredentialAwarded;
  assert(/^UPIS-\d{4}$/.test(credential.identifier.value)&&typeof course.courseCode==='string'&&date(credential.validFrom)&&date(credential.expires),'The provider course identity and recommendation claim must be exact.');
  return {aceId:credential.identifier.value,providerCourseCode:course.courseCode,title:course.name,courseUrl:course.url,
    recommendationStart:credential.validFrom,recommendationEnd:credential.expires,advertisedCredits:course.numberOfCredits,
    creditNote:credential.name,price:course.offers?.priceCurrency==='USD'&&course.offers?.category==='Paid'&&course.offers?.availability==='https://schema.org/InStock'?Number(course.offers.price):null,
    currency:course.offers?.priceCurrency||null,offerUrl:course.offers?.url||null};
}

export function validateUPICourseReview(review=upiCourseReview){
  assert(review?.version===1&&review.provider==='UPI Study'&&review.kind==='reviewed-source-course-catalog','Use the reviewed UPI source-course packet.');
  assert(date(review.checkedOn)&&review.courses?.length>0&&review.sources?.length>0,'UPI review needs a dated, nonempty course/source set.');
  const sources=new Map(),ids=new Set(),codes=new Set(),urls=new Set();
  for(const source of review.sources){
    assert(source?.id&&!sources.has(source.id)&&date(source.checkedOn)&&source.checkedOn<=review.checkedOn,'UPI source IDs and review dates must be exact.');
    assert(safeURL(source.url,['www.upistudy.com','upistudy.com','www.acenet.edu','www.nationalccrs.org','nationalccrs.org']),'Only the reviewed official UPI and recommender hosts establish source identities.');
    assert(typeof source.capture==='string'&&source.capture.startsWith('content/source-captures/')&&!source.capture.includes('..')&&/^[a-f0-9]{64}$/.test(source.sha256)&&source.status===200&&source.complete===true&&source.rawBodyCaptured===true,'Retain a hash-bound complete actual source capture.');
    sources.set(source.id,source);
  }
  for(const course of review.courses){
    assert(course?.id&&course.title&&typeof course.providerCourseCode==='string'&&course.providerCourseCode.trim(),'Identify the original UPI course, independently of any receiving requirement.');
    assert(!ids.has(course.id)&&!urls.has(course.courseUrl),'Do not create duplicate source-course listings.');ids.add(course.id);urls.add(course.courseUrl);
    assert(safeURL(course.courseUrl,['www.upistudy.com','upistudy.com'])&&new URL(course.courseUrl).pathname.startsWith('/courses/'),'Retain the exact active provider course URL.');
    assert(Number.isFinite(course.sourceCredits)&&course.sourceCredits>0&&course.sourceCredits<=30&&course.sourceCreditSystem==='semester','Source quantities must be independently known semester credits.');
    assert(course.sourceUpper===true||course.sourceUpper===false||course.sourceUpper===null,'Unknown source level must stay unknown.');
    assert(course.courseVersion===null||(typeof course.courseVersion==='number'&&Number.isInteger(course.courseVersion)&&course.courseVersion>0)||typeof course.courseVersion==='string'&&course.courseVersion.trim().length>0,'Course version must be exact or explicitly unknown.');
    assert(date(course.recommendationStart)&&date(course.recommendationEnd)&&course.recommendationStart<=review.checkedOn&&course.recommendationEnd>=review.checkedOn,'Only currently recommended course versions enter this reviewed source catalog.');
    assert(list(course.sourceIds).length>=2&&course.sourceIds.every(id=>sources.has(id))&&list(course.identitySourceIds).length>=2&&course.identitySourceIds.every(id=>course.sourceIds.includes(id)),'Independently retain current provider identity and recommendation evidence.');
    assert(course.mappingStatus==='source-listing'&&course.schoolAcceptance==='not-established-by-course-listing','Source recommendation facts cannot establish receiving acceptance.');
    assert(list(course.mappedCourseIds).length===0,'A source listing cannot invent requirement placements.');
    if(course.creditBasis==='ACE'){
      assert(/^UPIS-\d{4}$/.test(course.aceId)&&!codes.has(course.aceId),'ACE source identities must be unique exact UPI IDs.');codes.add(course.aceId);
      assert(course.identitySourceIds.some(id=>sources.get(id).kind==='ace-course-exhibit'),'An ACE label requires an independently reviewed ACE course exhibit.');
    }else{
      assert(course.creditBasis==='NCCRS'&&course.aceId===null&&typeof course.nccrsId==='string'&&course.nccrsId,'NCCRS-only courses cannot inherit an ACE identity.');
      assert(course.identitySourceIds.some(id=>sources.get(id).kind==='nccrs-course-exhibit'),'An NCCRS label requires an independently reviewed NCCRS course exhibit.');
    }
    assert(course.identitySourceIds.some(id=>['provider-course','provider-catalog'].includes(sources.get(id).kind)),'Current course availability requires an exact published provider offering.');
    assert(course.providerCatalogEvidence&&course.sourceIds.includes(course.providerCatalogEvidence.sourceId)&&typeof course.providerCatalogEvidence.cardTitle==='string'&&course.providerCatalogEvidence.courseUrl===course.courseUrl,'Bind the exact current published course card, not fallback catalog script defaults.');
  }
  return review;
}

export async function validateUPICaptures(review=upiCourseReview){
  validateUPICourseReview(review);
  const bodies=new Map();
  for(const source of review.sources){
    const body=await readFile(resolve(root,source.capture));
    assert.equal(createHash('sha256').update(body).digest('hex'),source.sha256,'UPI source capture changed: '+source.id);
    bodies.set(source.id,body.toString('utf8'));
  }
  for(const course of review.courses){
    if(course.creditBasis==='ACE'){
      const source=review.sources.find(source=>course.identitySourceIds.includes(source.id)&&source.kind==='ace-course-exhibit');
      const actual=parseUPIACEExhibit(bodies.get(source.id));
      for(const field of ['aceId','title','providerCourseCode','sourceCredits','sourceCreditSystem','sourceUpper','courseVersion','recommendationStart','recommendationEnd','minScore'])assert.deepEqual(course[field],actual[field],'UPI source fact differs from its exact ACE exhibit: '+course.id+' '+field);
    }
    const published=course.providerCatalogEvidence,html=bodies.get(published.sourceId);
    const cards=[...String(html).matchAll(/<a\b(?=[^>]*class="card card--published card--course")[^>]*href="([^\"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
    const matches=cards.filter(match=>new URL(decode(match[1]),'https://www.upistudy.com').href===course.courseUrl);
    assert.equal(matches.length,1,'Use one exact published course card, not a similarly titled course or fallback script.');
    const title=matches[0][2].match(/<h3 class="card__name">([\s\S]*?)<\/h3>/);
    assert.equal(text(title?.[1]||''),published.cardTitle,'The current provider course label changed.');
    const currentSource=review.sources.find(source=>course.identitySourceIds.includes(source.id)&&source.kind==='provider-course');
    assert(currentSource?.url===course.courseUrl,'Bind the exact provider page independently of its directory card.');
    const offering=parseUPIProviderCourse(bodies.get(currentSource.id),course.courseUrl);
    assert.equal(offering.aceId,course.aceId,'A provider page cannot inherit another course\'s recommendation.');
    assert.equal(offering.recommendationStart,course.recommendationStart);assert.equal(offering.recommendationEnd,course.recommendationEnd);
    assert.deepEqual(course.currentOffering,offering,'Retain provider quantity and product-price claims separately from ACE quantities.');
    assert(list(course.codeAliases).includes(offering.providerCourseCode)||course.providerCourseCode===offering.providerCourseCode,'Retain the exact current provider code.');
    const supportedAliases=[...new Set([course.providerCourseCode,offering.providerCourseCode,published.cardTitle.split(':',1)[0].trim()])];
    assert.deepEqual(course.codeAliases,supportedAliases,'Source aliases must come from this exhibit and current provider course/card, never generic catalog fallback script.');
  }
  return review;
}

export function upiCatalogCourse(course,review=upiCourseReview,{rates}={}){
  const canonical=course.aceId||course.providerCourseCode;
  const purchase=attachUPICoursePurchasePrice({provider:'UPI Study',code:canonical,url:course.courseUrl,
    creditOrigin:'alternative',sourceCredits:course.sourceCredits,sourceCreditSystem:course.sourceCreditSystem,
    courseVersion:course.courseVersion,recommendationStart:course.recommendationStart,recommendationEnd:course.recommendationEnd,
    identitySourceIds:[...course.identitySourceIds]},review,rates?{rates}:undefined);
  const priced=purchase.costVerified===true&&Number.isFinite(purchase.cost)&&purchase.costEvidence?.kind==='upi-standalone-course-purchase-v1';
  const displayPrice=priced?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:2}).format(purchase.cost):null;
  return {
    id:course.id,provider:'UPI Study',providerId:'upi-study',title:course.title,url:course.courseUrl,
    code:null,mappingCode:canonical,providerCourseCode:course.providerCourseCode,
    codeAliases:[...new Set([course.providerCourseCode,...list(course.codeAliases)].filter(value=>value&&value!==canonical))],
    credits:course.sourceCredits,creditSystem:course.sourceCreditSystem,creditBasis:course.creditBasis==='ACE'?'ace-recommendation':'nccrs-recommendation',
    creditOrigin:'alternative',sourceType:'alternative',subject:course.subject||'Other subjects',assessment:null,price:priced?purchase.cost:null,
    priceNote:priced?displayPrice+' standalone course purchase. Eligible memberships may cost less; transcript fees and taxes are separate.':'See UPI Study’s current enrollment prices. Transcript fees are separate.',
    priceEvidence:priced?copy(purchase.costEvidence):null,priceCheckedOn:priced?purchase.costEvidence.checkedOn:null,
    sourceId:course.identitySourceIds.find(id=>review.sources.find(source=>source.id===id)?.kind==='provider-course'),
    checkedAt:review.checkedOn,recommendationStatus:course.creditBasis==='ACE'?'current-ace-recommendation':'current-nccrs-recommendation',
    recommendationStart:course.recommendationStart,recommendationEnd:course.recommendationEnd,
    courseVersion:course.courseVersion,sourceUpper:course.sourceUpper,mappingStatus:'source-listing',mappedCourseIds:[],
    identityReviewId:review.id,identitySourceIds:[...course.identitySourceIds],schoolAcceptance:'not-established-by-course-listing'
  };
}

export function applyUPICourseCatalog(input,review=upiCourseReview,options={}){
  validateUPICourseReview(review);assert(input&&Array.isArray(input.courses)&&Array.isArray(input.sources),'UPI supplements an existing source catalog.');
  const catalog=copy(input),sourceIds=new Map(catalog.sources.map(source=>[source.id,source]));
  for(const proof of review.courses){
    const row=upiCatalogCourse(proof,review,options),existing=catalog.courses.find(course=>course.id===row.id||course.provider==='UPI Study'&&(course.mappingCode===row.mappingCode||course.url===row.url));
    if(existing){
      assert(existing.provider==='UPI Study'&&(!existing.mappingCode||existing.mappingCode===row.mappingCode),'Do not replace another provider or original course identity.');
      assert(existing.credits==null||existing.credits===row.credits,'Changed original source quantity requires an explicit course-version review.');
      const keptMappings=copy(list(existing.mappedCourseIds));Object.assign(existing,row);existing.mappedCourseIds=keptMappings;
      if(keptMappings.length)existing.mappingStatus='reviewed-destination-example';
    }else catalog.courses.push(row);
  }
  for(const source of review.sources){
    sourceIds.set(source.id,{...copy(source),provider:'UPI Study',name:source.title,checkedAt:source.checkedOn,status:'source-course-review',count:0,scope:'UPI original course identity and credit recommendation only; receiving-school awards remain separate.'});
  }
  // Replace only the empty provider-directory reference, retaining its source URL and date history.
  const directory=catalog.sources.find(source=>source.id==='directory-upi-study');
  if(directory)sourceIds.set(directory.id,{...directory,status:'source-courses-indexed',count:review.courses.length,checkedAt:review.checkedOn,scope:'Current reviewed UPI source-course listings. School acceptance and degree placement are evaluated separately.'});
  catalog.sources=[...sourceIds.values()];
  const addition='UPI Study course identities and original credit recommendations are included from reviewed official exhibits.';
  if(typeof catalog.scope==='string'&&!catalog.scope.includes(addition))catalog.scope+=' '+addition;
  return catalog;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  await validateUPICaptures();const path=resolve(root,'dist/data/course-catalog.json'),original=JSON.parse(await readFile(path,'utf8')),result=applyUPICourseCatalog(original);
  if(process.argv.includes('--check'))assert.deepEqual(original,result,'Course catalog needs the reviewed UPI source-course supplement.');
  else await writeFile(path,JSON.stringify(result)+'\n');
  console.log(JSON.stringify({review:upiCourseReview.id,upiCourses:upiCourseReview.courses.length,totalCatalogCourses:result.courses.length,receivingAwardsCreated:0,check:process.argv.includes('--check')}));
}
