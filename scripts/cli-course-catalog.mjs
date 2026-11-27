/** Original CLI offerings only. This does not approve LES admission or receiving-school credit. */
import assert from 'node:assert/strict';
import {readFile,writeFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=resolve(import.meta.dirname,'..'),PROVIDER='Christian Leaders Institute',PROVIDER_ID='christianleadersinstitute';
const reviewPath='content/catalog/christian-leaders-course-identities-reviewed-2026-11-27.json';
const copy=structuredClone,list=value=>Array.isArray(value)?value:[],digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const text=value=>String(value??'').normalize('NFKC').replace(/\s+/g,' ').trim();
const code=value=>{const match=String(value??'').trim().toUpperCase().match(/^([A-Z]{2,5})[\s-]*(\d{3})$/);return match?match[1]+match[2]:null;};
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const safePath=value=>typeof value==='string'&&/^content\/research-batches\/[A-Za-z0-9_./-]+\.json$/.test(value)&&!value.split('/').some(part=>!part||part==='.'||part==='..');
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function https(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port;}catch{return false;}}
function providerURL(value){if(!https(value))return false;const host=new URL(value).hostname;return ['christianleaders.org','www.christianleaders.org','degrees.christianleaders.org','christianleadersinstitute.org','www.christianleadersinstitute.org'].includes(host);}
export const cliCourseReview=JSON.parse(await readFile(resolve(root,reviewPath),'utf8'));

export function validateCLICourseReview(review=cliCourseReview){
 assert(review?.kind==='christian-leaders-course-identities-reviewed'&&review.version===1&&typeof review.id==='string'&&review.id.trim()&&day(review.reviewedOn)&&review.provider===PROVIDER,'Use a dated original CLI course review.');
 assert(review.originalAcademicCreditRouteRequired===true&&review.freeCdsStudyAwardsAcademicCredit===false&&review.receivingAwardsPromoted===0&&review.studentCreditsAwarded===0&&review.publicationPromotionAllowed===false,'Source offerings cannot award free-study, student or receiving credits.');
 assert(review.eligibility?.status==='unresolved'&&review.eligibility.academicTranscriptRequired===true&&review.eligibility.personalAdmissionGuaranteed===false,'LES transcript and unresolved admission conditions must remain explicit.');
 assert(safePath(review.manifestPath)&&hash(review.manifestSha256),'Retain the native receipt manifest and its exact byte hash.');
 if(review.retention)assert(review.retention.manifestPath===review.manifestPath&&review.retention.manifestSha256===review.manifestSha256&&review.retention.originHttpCaptureClaimed===false,'Receipt retention must not claim an origin HTTP capture.');
 assert(Array.isArray(review.sources)&&Array.isArray(review.courses)&&review.courses.length>0&&review.courseCount===review.courses.length,'A source review needs its complete explicit course inventory.');
 const sources=new Map(),identities=new Set(),codes=new Set();
 for(const source of review.sources){
  assert(typeof source?.id==='string'&&source.id.trim()&&!sources.has(source.id)&&['provider','university','accreditor'].includes(source.kind)&&https(source.url)&&day(source.checkedOn)&&source.checkedOn<=review.reviewedOn,'Sources need unique IDs, HTTPS URLs and actual review dates.');
  assert(text(source.shortQuote).length>=12&&safePath(source.nativeReceiptPath)&&source.nativeReceiptPath.startsWith(dirname(review.manifestPath)+'/')&&hash(source.nativeReceiptSha256),'Every source needs a quote and retained native receipt.');
  if(source.kind==='provider')assert(providerURL(source.url),'Original CLI facts need an independently identified official provider URL.');
  sources.set(source.id,source);
 }
 const refs=(ids,providerOnly=true)=>Array.isArray(ids)&&ids.length>0&&new Set(ids).size===ids.length&&ids.every(id=>sources.has(id)&&(!providerOnly||sources.get(id).kind==='provider'&&providerURL(sources.get(id).url)));
 const references=new Set(sources.keys());
 for(const packet of list(review.retainedPacketReferences)){assert(typeof packet.id==='string'&&!references.has(packet.id)&&packet.kind==='retained-research-packet'&&safePath(packet.path)&&hash(packet.sha256)&&day(packet.reviewedOn)&&packet.reviewedOn<=review.reviewedOn&&packet.primaryEvidence===false&&packet.currentPrimaryRetrievalClaimed===false&&text(packet.shortQuote),'Historical research packets remain explicitly separate from primary observations.');references.add(packet.id);}
 const checkReferences=value=>{if(!value||typeof value!=='object')return;for(const[key,child]of Object.entries(value)){if(['source','accreditorSource'].includes(key)&&typeof child==='string')assert(references.has(child),'Eligibility evidence reference does not resolve.');else if(['sources','sourceIds'].includes(key)&&Array.isArray(child))assert(child.every(id=>references.has(id)),'Eligibility evidence references do not resolve.');else checkReferences(child);}};
 checkReferences(review.eligibility);
 assert(refs(review.eligibility.sourceIds,false),'Academic-route evidence references must resolve.');
 assert(review.academicUnitProof?.status==='live-official-semester-credit-policy-reviewed'&&review.academicUnitProof.creditSystem==='semester'&&refs(review.academicUnitProof.sourceIds),'Semester units need an independent provider academic policy.');
 for(const course of review.courses){
  const key=code(course.code),quote=text(course.sourceQuote),quoteCode=quote.match(/^([A-Z]{2,5})[\s-]*(\d{3})\b/);
  assert(key&&!codes.has(key)&&typeof course.identityId==='string'&&course.identityId.trim()&&!identities.has(course.identityId)&&text(course.title),'Each course needs a unique exact code and original identity.');codes.add(key);identities.add(course.identityId);
  assert([1,3,4].includes(course.sourceCredits)&&course.sourceCreditSystem==='semester'&&course.sourceUpper===null,'Only independently reviewed original semester quantities are known; source level stays unknown.');
  assert(providerURL(course.courseUrl)&&refs(course.identitySourceIds)&&refs(course.unitProofSourceIds)&&course.unitProofSourceIds.every(id=>review.academicUnitProof.sourceIds.includes(id)),'Offering identity and semester-unit evidence must be independent provider references.');
  assert(course.identitySourceIds.some(id=>sources.get(id).url===course.courseUrl),'The course URL must be the cited provider offering page.');
  assert(quoteCode&&quoteCode[1]+quoteCode[2]===key&&quote.includes(text(course.title))&&new RegExp('\\b'+course.sourceCredits+'\\s+credits?\\b','i').test(quote),'The exact code, title and original quantity need one reviewed offering quote.');
  assert(text(course.unitProofQuote).length>=12&&/semester/i.test(course.unitProofQuote)&&/credit|hour/i.test(course.unitProofQuote),'The original unit must have its own explicit academic-policy quote.');
  assert(course.academicCreditRouteRequired===true&&course.originalAcademicCreditRouteRequired===true&&course.publicationPromotionAllowed===false,'An offering requires the academic route; it cannot establish eligibility.');
  assert(course.academicTranscriptRequired===true&&course.freeCdsStudyAwardsAcademicCredit===false&&course.studentCreditAwarded===false&&course.eligibleToStart!==true&&(!course.eligibilityStatus||course.eligibilityStatus==='unresolved')&&(!course.schoolAcceptance||course.schoolAcceptance==='not-established-by-course-listing'),'Source identities cannot promote free study, personal eligibility or school acceptance.');
  assert(course.aceId==null&&course.recommendationStart==null&&course.recommendationEnd==null&&course.receivingCode===undefined&&course.receivingCredits===undefined&&course.credits===undefined&&!list(course.mappedCourseIds).length,'Institutional source listings cannot invent ACE periods or receiving awards.');
  assert(course.prerequisites===null&&course.prerequisiteStatus==='not-established'||Array.isArray(course.prerequisites)&&course.prerequisites.length>0&&course.prerequisiteStatus==='specific-prerequisite-reviewed','Unknown prerequisites must stay unknown, separate from reviewed requirements.');
  for(const prerequisite of list(course.prerequisites))assert(text(prerequisite.title)&&refs([prerequisite.sourceId])&&text(prerequisite.quote).length>=12,'Prerequisites retain their provider evidence.');
 }
 return review;
}
async function nativeJSON(base,path){const file=resolve(base,path),info=await lstat(file);assert(info.isFile()&&!info.isSymbolicLink()&&info.size<=8*1024*1024,'A retained native receipt must be a regular bounded JSON file.');const bytes=await readFile(file);assert(bytes.length<=8*1024*1024);return{bytes,value:JSON.parse(bytes.toString('utf8'))};}
function receiptText(value){return typeof value==='string'?value:Array.isArray(value)?value.map(receiptText).join(' '):value&&typeof value==='object'?Object.values(value).map(receiptText).join(' '):'';}
export async function validateCLICaptures(review=cliCourseReview,{base=root}={}){
 validateCLICourseReview(review);
 const manifest=await nativeJSON(base,review.manifestPath);assert.equal(digest(manifest.bytes),review.manifestSha256,'CLI native retention manifest bytes changed.');
 assert(manifest.value.kind==='shared-transfer-evidence-retention-manifest'&&manifest.value.version===1&&Array.isArray(manifest.value.files),'Use the retained shared-transfer receipt manifest.');
 const retained=new Map();
 for(const item of manifest.value.files){
  assert(safePath(item.path)&&item.path.startsWith(dirname(review.manifestPath)+'/')&&!retained.has(item.path)&&hash(item.sha256)&&Number.isSafeInteger(item.bytes)&&item.bytes>0,'Retained file identities, hashes and byte counts must be unique and bounded.');
  const file=await nativeJSON(base,item.path);assert.equal(file.bytes.length,item.bytes,'CLI retained receipt byte count changed.');assert.equal(digest(file.bytes),item.sha256,'CLI retained receipt bytes changed.');retained.set(item.path,{...item,text:text(receiptText(file.value))});
 }
 const bodies=new Map();
 for(const source of review.sources){
  const receipt=retained.get(source.nativeReceiptPath);assert(receipt&&receipt.kind==='connector-parsed-native-result'&&receipt.originHttpCapture===false&&receipt.sha256===source.nativeReceiptSha256,'CLI source receipt must match its native extraction manifest.');
  assert(receipt.text.includes(source.url)&&receipt.text.includes(text(source.shortQuote)),'The source URL and reviewed quote must occur in the retained extraction.');bodies.set(source.id,receipt.text);
 }
 for(const course of review.courses){
  assert(course.identitySourceIds.some(id=>bodies.get(id).includes(text(course.sourceQuote))),'The exact original course quote is absent from its provider receipt.');
  assert(course.unitProofSourceIds.some(id=>bodies.get(id).includes(text(course.unitProofQuote))),'The semester-unit proof is absent from its provider receipt.');
  for(const prerequisite of list(course.prerequisites))assert(bodies.get(prerequisite.sourceId).includes(text(prerequisite.quote)),'The prerequisite quote is absent from its provider receipt.');
 }
 for(const packet of list(review.retainedPacketReferences)){const retained=await nativeJSON(base,packet.path);assert.equal(digest(retained.bytes),packet.sha256,'A retained historical research packet changed.');assert(retained.bytes.toString('utf8').includes(packet.shortQuote),'The historical reference is absent from its retained packet.');}
 return review;
}

export function applyCLICourseCatalog(input,review=cliCourseReview){
 validateCLICourseReview(review);assert(input&&Array.isArray(input.courses)&&Array.isArray(input.sources),'CLI enriches an existing original-course catalog.');
 const catalog=copy(input),ids=new Set(),cliCodes=new Map(),sources=new Map();
 for(const row of catalog.courses){assert(typeof row.id==='string'&&!ids.has(row.id),'Catalog course IDs must be unique.');ids.add(row.id);if(row.provider!==PROVIDER)continue;const key=code(row.code||row.mappingCode);if(!key)continue;assert(!cliCodes.has(key),'An exact CLI source code must identify one catalog course.');if(row.code&&row.mappingCode)assert(code(row.code)===code(row.mappingCode),'Conflicting original CLI course codes require review.');cliCodes.set(key,row);}
 for(const source of catalog.sources){assert(!sources.has(source.id),'Catalog source IDs must be unique.');sources.set(source.id,source);}
 for(const proof of review.courses){
  const key=code(proof.code),existing=cliCodes.get(key);
  if(existing){for(const field of ['credits','sourceCredits'])assert(existing[field]==null||existing[field]===proof.sourceCredits,'Changed original source quantity requires a separate identity review.');for(const field of ['creditSystem','sourceCreditSystem'])assert(existing[field]==null||existing[field]==='semester','Changed original source units require review.');assert(existing.aceId==null&&!existing.recommendationStart&&!existing.recommendationEnd,'An institutional source cannot overwrite an ACE identity.');}
  const row={...(existing||{id:PROVIDER_ID+'-plan-'+key.toLowerCase(),provider:PROVIDER,providerId:PROVIDER_ID,mappingStatus:'source-listing',mappedCourseIds:[],codeAliases:[],assessment:null,price:null,priceNote:'Academic admission and transcript fees require confirmation; free study alone does not award academic credit.'}),title:proof.title,url:proof.courseUrl,code:existing?.code||proof.code,mappingCode:existing?.mappingCode||proof.code,providerCourseCode:proof.code,credits:proof.sourceCredits,creditSystem:'semester',sourceCredits:proof.sourceCredits,sourceCreditSystem:'semester',sourceUpper:null,creditBasis:'institutional-course',creditOrigin:'institutional',recommendationStatus:'not-applicable-institutional',sourceId:proof.identitySourceIds[0],checkedAt:review.reviewedOn,identityReviewId:review.id,identityId:proof.identityId,identitySourceIds:copy(proof.identitySourceIds),unitProofSourceIds:copy(proof.unitProofSourceIds),academicCreditRouteRequired:true,eligibilityStatus:'unresolved',schoolAcceptance:existing?.schoolAcceptance??'not-established-by-course-listing',prerequisites:copy(proof.prerequisites),prerequisiteStatus:proof.prerequisiteStatus};
  if(existing)Object.assign(existing,row);else{assert(!ids.has(row.id),'A stable CLI source ID conflicts with an existing catalog identity.');catalog.courses.push(row);ids.add(row.id);cliCodes.set(key,row);}
 }
 for(const source of review.sources.filter(source=>source.kind==='provider')){
  const old=sources.get(source.id);assert(!old||old.url===source.url&&(!old.nativeReceiptSha256||old.nativeReceiptSha256===source.nativeReceiptSha256),'Conflicting provider source facts require a separate review.');
  sources.set(source.id,{...copy(source),provider:PROVIDER,name:source.title||source.id,checkedAt:source.checkedOn,status:'source-course-review',scope:'Original CLI offering and academic-route evidence only; eligibility and receiving awards remain separate.'});
 }
 catalog.sources=[...sources.values()];return catalog;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2);assert(args.length===0||args.length===1&&['--check','--write'].includes(args[0]),'Use --check or --write.');
 await validateCLICaptures();const path=resolve(root,'dist/data/course-catalog.json'),original=JSON.parse(await readFile(path,'utf8')),result=applyCLICourseCatalog(original);
 if(args[0]==='--check')assert.deepEqual(original,result,'Course catalog needs the reviewed CLI source-course supplement.');else await writeFile(path,JSON.stringify(result)+'\n');
 console.log(JSON.stringify({review:cliCourseReview.id,reviewedOriginalCourses:cliCourseReview.courses.length,totalCatalogCourses:result.courses.length,receivingAwardsCreated:0,studentCreditsAwarded:0,check:args[0]==='--check'}));
}
