/** Original provider facts for BSDA; no receiving award or learner credit is created. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {root,stringifyKit,isMain} from './pathway-factory/lib.mjs';
import {run as checkSophiaBundle} from './build-wgu-sophia-identities.mjs';
import {isIndependentProviderIdentitySource} from './pathway-quality.mjs';
export const identityPath='content/pathway-kits/wgu/reviews/data-analytics-provider-identities-2026-11-25.json';
const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const hash=text=>createHash('sha256').update(text).digest('hex');
const paths={'Study.com':'content/pathway-kits/providers/study-com.json',Sophia:'content/pathway-kits/providers/sophia.json'};

export async function loadDataAnalyticsIdentities({asOf='2026-11-25'}={}){
  await checkSophiaBundle({check:true});
  const packet=await read(identityPath),bundle=await read('content/reuse/wgu-sophia-provider-identities.json');
  assert.equal(packet.version,1);assert.equal(packet.id,'wgu-data-analytics-independent-identities-2026-11-25');assert.equal(packet.checkedOn,'2026-11-25');assert(packet.checkedOn<=asOf);
  assert.deepEqual(packet.courses.map(course=>course.code),['SDCM-0210','SDCM-0218','SOPH-0062']);
  assert(!['programId','receivingCredits','mappingEvidence','credits'].some(field=>Object.hasOwn(packet,field)));
  const sourceMap=new Map(packet.sources.map(source=>[source.id,source]));assert.equal(sourceMap.size,packet.sources.length);
  for(const source of packet.sources){
    assert.equal(source.checkedOn,packet.checkedOn);assert.equal(source.kind,'provider');assert(source.roles.includes('provider-identity'));
    const url=new URL(source.url);assert.equal(url.protocol,'https:');assert((source.provider==='Study.com'&&url.hostname==='study.com')||(source.provider==='Sophia'&&(url.hostname==='www.sophia.org'||url.hostname==='cdn2.sophia.org')));
    const body=await readFile(resolve(root,source.capture),'utf8');assert.equal(hash(body),source.extractedTextSha256||source.sha256);
    if(source.captureMethod==='native-public-web-rendered-extract'){assert.equal(source.rawBodyCaptured,false);assert.equal(body,source.reviewedExtract);}
    else {assert.equal(source.captureMethod,'origin-pdf-text-extraction');const sidecar=await read(source.capture.replace(/\.txt$/,'.json'));assert.equal(sidecar.url,source.url);assert.equal(sidecar.sha256,source.sha256);assert.equal(sidecar.status,200);assert(body.includes('SOPH-0062')&&/3 semester\s+hours/.test(body));}
  }
  for(const course of packet.courses){
    assert.equal(course.sourceCredits,3);assert.equal(course.sourceCreditSystem,'semester');assert.equal(course.sourceUpper,false);assert.equal(course.sourceCreditStatus,'verified');assert.equal(course.identityCheckedOn,packet.checkedOn);assert.equal(course.identityReviewId,packet.id);
    assert(!['credits','creditSystem','receivingCode','mappingEvidence','recommendationStart','recommendationEnd','courseVersion'].some(field=>Object.hasOwn(course,field)),'Do not infer a receiving quantity or an unpublished ACE recommendation version');
    assert(course.codeAliases.includes(course.providerCourseCode));assert.equal(course.sourceCreditVerification.credits,3);assert.equal(course.sourceCreditVerification.creditSystem,'semester');
    assert(course.identitySourceIds.length&&course.identitySourceIds.every(id=>sourceMap.has(id)));assert(course.sourceCreditVerification.sourceIds.length&&course.sourceCreditVerification.sourceIds.every(id=>course.identitySourceIds.includes(id)));
    for(const id of course.identitySourceIds)assert.deepEqual(sourceMap.get(id).observed,{aceId:course.code,offered:true,sourceCredits:3,sourceCreditSystem:'semester',sourceUpper:false});
  }
  const overrides={},sophiaCandidates=[],sophiaProvider=await read(paths.Sophia);
  for(const course of [...bundle.courses,...packet.courses]){
    assert(course.sourceCreditStatus==='verified'&&course.sourceCredits>0&&course.sourceCreditSystem==='semester');
    if(course.recommendationStart)assert(course.recommendationStart<=asOf);if(course.recommendationEnd)assert(course.recommendationEnd>=asOf);
    for(const id of course.identitySourceIds){const source=[...bundle.sources,...packet.sources].find(source=>source.id===id);assert(source);const checked=source.checked||source.checkedOn;assert(checked<=asOf&&Date.parse(asOf)-Date.parse(checked)<30*86400000,'Independent identity evidence needs a current review');}
    const reviewed=structuredClone(course);
    // An ACE index can establish a recommendation period while the actual
    // course exhibit/provider page establishes original credits. Retain every
    // dated period citation, but do not mislabel an index as a course exhibit.
    const sources=[...bundle.sources,...packet.sources];
    reviewed.identitySourceIds=course.identitySourceIds.filter(id=>isIndependentProviderIdentitySource(sources.find(source=>source.id===id),course,{asOf}));
    assert(reviewed.identitySourceIds.length,'An identity needs an independently usable original-course source');
    reviewed.sourceCreditVerification.sourceIds=reviewed.identitySourceIds;
    if(bundle.courses.includes(course))sophiaCandidates.push(reviewed);
    if(bundle.courses.includes(course)&&sophiaProvider.courses.find(item=>item.code===course.code)?.sourceCreditStatus==='verified')continue;
    (overrides[course.provider]??={})[course.code]=reviewed;
  }
  return {packet,bundle,overrides,sophiaCandidates};
}

/** Append only previously absent courses and their new source records. Existing
 * identities are kept byte-for-byte; the exact BSDA rows carry reviewed overrides. */
export async function registerDataAnalyticsIdentities({check=false}={}){
  const review=await loadDataAnalyticsIdentities(),added=[];
  for(const [provider,path]of Object.entries(paths)){
    const document=await read(path),before=JSON.stringify(document);
    for(const source of review.packet.sources.filter(source=>source.provider===provider)){
      const existing=document.sources.find(item=>item.id===source.id);if(existing)assert.deepEqual(existing,source);else document.sources.push(source);
    }
    for(const course of review.packet.courses.filter(course=>course.provider===provider)){
      const {provider:_provider,...identity}=course,existing=document.courses.find(item=>item.code===course.code);
      if(existing){if(['SDCM-0218','SOPH-0062'].includes(course.code))assert.deepEqual(existing,identity,'A changed registered identity needs a separate independent review');continue;}
      document.courses.push(identity);added.push(course.code);
    }
    const output=stringifyKit(document,provider==='Sophia'?['courses']:['sources','courses'])+'\n';
    if(check)assert.equal(JSON.stringify(document),before,'Register the independently reviewed new source courses first');else await writeFile(resolve(root,path),output);
  }
  return {...review,added};
}
if(isMain(import.meta)){const result=await registerDataAnalyticsIdentities({check:process.argv.includes('--check')});console.log(JSON.stringify({registered:result.added,independentCourses:result.packet.courses.length,reusedSophiaFacts:result.bundle.courses.length}));}
