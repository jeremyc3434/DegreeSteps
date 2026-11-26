/** Independent Study.com identities. No receiving-school credit is created here. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {root,isMain,stringifyKit} from './pathway-factory/lib.mjs';

export const packetPath='content/reuse/wgu-study-software-identities-2026-11-25.json';
const providerPath='content/pathway-kits/providers/study-com.json';
const hash=text=>createHash('sha256').update(text).digest('hex');
const forbidden=['school','modelId','programId','receivingCode','receivingCredits','credits','creditSystem','mappingEvidence','universityMapRecord','evidence'];
const key=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');

export function validateStudyExpansion(packet,{asOf='2026-11-25'}={}){
  assert.equal(packet.version,1);assert.equal(packet.provider,'Study.com');
  assert.equal(packet.id,'study-independent-software-expansion-2026-11-25');
  assert.equal(packet.checkedOn,'2026-11-25');assert(packet.checkedOn<=asOf,'Do not accept a future identity review');
  assert(forbidden.every(field=>!Object.hasOwn(packet,field)),'Provider identities cannot contain university awards');
  const sources=new Map(packet.sources.map(source=>[source.id,source]));
  assert.equal(sources.size,packet.sources.length);assert(packet.courses.length>0);
  const codes=new Set();
  for(const course of packet.courses){
    assert.equal(course.provider,'Study.com');assert(/^SDCM-\d{4}$/.test(course.code));assert(!codes.has(course.code));codes.add(course.code);
    assert(forbidden.every(field=>!Object.hasOwn(course,field)),'A receiving award cannot verify an original course');
    assert.equal(course.sourceCreditStatus,'verified');assert(Number.isFinite(course.sourceCredits)&&course.sourceCredits>0);assert.equal(course.sourceCreditSystem,'semester');
    assert.equal(course.identityCheckedOn,packet.checkedOn);assert.equal(course.identityReviewId,packet.id);assert.equal(typeof course.sourceUpper,'boolean');
    assert(course.providerCourseCode&&course.codeAliases.includes(course.providerCourseCode));
    assert.equal(new URL(course.url).hostname,'study.com');assert.equal(new URL(course.url).protocol,'https:');
    assert(course.identitySourceIds.length>0);
    for(const id of course.identitySourceIds){const source=sources.get(id);assert(source);
      assert(['study.com','www.acenet.edu'].includes(new URL(source.url).hostname));assert.equal(new URL(source.url).protocol,'https:');
      assert.equal(source.checkedOn,packet.checkedOn);assert(source.roles.includes('provider-identity'));
      if(source.captureMethod==='native-public-web-rendered-extract'){assert.equal(source.rawBodyCaptured,false);assert.equal(source.extractedTextSha256,hash(source.reviewedExtract));}
      else {assert.equal(source.captureMethod,'origin-response-body');assert.equal(source.rawBodyCaptured,true);assert.equal(source.kind,'ace');assert(/^[a-f0-9]{64}$/.test(source.sha256));}
      assert(source.reviewedExtract.includes(course.code));assert(source.reviewedExtract.includes('semester')||source.reviewedExtract.includes('Credits (SH)'),'The unit must be independently published');
      assert.deepEqual(source.observed,{aceId:course.code,offered:true,sourceCredits:course.sourceCredits,sourceCreditSystem:'semester',sourceUpper:course.sourceUpper});
    }
    assert.equal(course.sourceCreditVerification.credits,course.sourceCredits);assert.equal(course.sourceCreditVerification.creditSystem,'semester');assert(course.sourceCreditVerification.sourceIds.length>0&&course.sourceCreditVerification.sourceIds.every(id=>course.identitySourceIds.includes(id)));
    if(course.recommendationStart||course.recommendationEnd){assert(course.recommendationStart<=packet.checkedOn&&packet.checkedOn<=course.recommendationEnd);assert(course.recommendationPeriodSourceIds.length>0);for(const id of course.recommendationPeriodSourceIds){const source=sources.get(id);assert(source&&course.identitySourceIds.includes(id));assert.equal(source.aceId,course.code);assert.equal(source.aceVersion,course.courseVersion);assert.equal(source.reviewedFacts.recommendationStart,course.recommendationStart);assert.equal(source.reviewedFacts.recommendationEnd,course.recommendationEnd);}}
  }
  return packet;
}

export async function loadStudyExpansion(){
  const packet=validateStudyExpansion(JSON.parse(await readFile(resolve(root,packetPath),'utf8')));
  for(const source of packet.sources){const text=await readFile(resolve(root,source.capture),'utf8');assert.equal(hash(text),source.extractedTextSha256||source.sha256);if(source.rawBodyCaptured===false)assert.equal(text,source.reviewedExtract);}
  return packet;
}

export function applyStudyExpansion(provider,packet){
  validateStudyExpansion(packet);assert.equal(provider.provider,'Study.com');const next=structuredClone(provider);
  for(const source of packet.sources){assert(next.sources.filter(item=>item.id===source.id).length<=1,'A reviewed source must occur exactly once');const i=next.sources.findIndex(item=>item.id===source.id);if(i<0)next.sources.push(structuredClone(source));else assert.deepEqual(next.sources[i],source,'A provider source revision cannot silently change');}
  for(const course of packet.courses){assert(next.courses.filter(item=>item.code===course.code).length<=1,'A reviewed original course must occur exactly once');const i=next.courses.findIndex(item=>item.code===course.code),{provider:_provider,...facts}=course;if(i<0)next.courses.push(structuredClone(facts));else next.courses[i]={...next.courses[i],...structuredClone(facts)};}
  // Other independently reviewed batches may append their own courses. Their
  // position belongs to that batch too: sorting the entire shared library made
  // an already-applied review fail --check merely because CS204 was appended.
  // Missing owned records are appended in the packet's stable order; applying
  // this review again preserves every existing record and array position.
  return next;
}

/** A university's label/identifier disagreement is held rather than guessed away. */
export function studyIdentityMatchesReceivingLabel(course,partnerCourse,code){
  const matches=[...String(partnerCourse).matchAll(/([A-Za-z][A-Za-z -]*?\s+\d{2,3}[A-Za-z]?)\s*\(\s*(SDCM-\d{4})\s*\)/g)];
  const declared=matches.filter(match=>match[2]===code).map(match=>match[1].replace(/^(?:(?:or|and)\s+)+/i,'').trim());
  if(!declared.length)return true; // An ID-only official row has no contradictory label.
  const aliases=[course?.providerCourseCode,...(course?.codeAliases||[]),String(course?.title||'').split(':')[0]].filter(value=>/\d/.test(String(value))).map(key);
  return declared.every(label=>aliases.includes(key(label)));
}

if(isMain(import.meta)){
  const packet=await loadStudyExpansion(),path=resolve(root,providerPath),before=JSON.parse(await readFile(path,'utf8')),next=applyStudyExpansion(before,packet);
  if(process.argv.includes('--check'))assert.deepEqual(next,before,'Apply the independently reviewed Study.com expansion first');
  else await writeFile(path,stringifyKit(next,['sources','courses'])+'\n');
  console.log(JSON.stringify({review:packet.id,providerIdentities:packet.courses.length,totalIdentities:next.courses.length,receivingAwardsCreated:0,check:process.argv.includes('--check')}));
}
