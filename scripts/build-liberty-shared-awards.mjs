/** Reviewed school awards and provider identities, stored once for compatible
 * Liberty online undergraduate curricula. No student credit is created. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {validateReviewedOnlineAwards} from './liberty-online-guide-awards.mjs';
import {validateLibertyHealthUpperReview} from './liberty-health-upper-identities.mjs';
const ROOT=resolve(import.meta.dirname,'..');
export const libertySharedAwardsPath='content/reuse/liberty-undergraduate-awards.json';
export const libertySharedAwardInputs={guide:'content/transfer-awards/snapshots/liberty-online-guide-awards-reviewed-2026-11-18.json',identities:'content/catalog/sophia-liberty-baseline-identities-reviewed-2026-11-18.json',health:'content/curricula/snapshots/liberty/health-upper-provider-identities-2026-11-18-reviewed.json',extraIdentities:'content/reuse/liberty-extra-provider-identities.json',policy:'content/curricula/snapshots/liberty/shared-online-policy-2026-2027-reviewed.json'};
const list=v=>Array.isArray(v)?v:[],copy=v=>JSON.parse(JSON.stringify(v)),unique=v=>[...new Set(v)];
const hash=v=>createHash('sha256').update(v).digest('hex');
const actualHash=s=>s.sourceContentHash||(/^([a-f0-9]{64})$/.test(s.sha256||'')?'sha256:'+s.sha256:null);
const day=v=>typeof v==='string'&&/^20\d\d-\d\d-\d\d$/.test(v)&&new Date(v).toISOString().slice(0,10)===v;

export function buildLibertySharedAwards({guide,identities,health,extraIdentities,policy}){
 validateReviewedOnlineAwards(guide);validateLibertyHealthUpperReview(health);
 assert(identities.version===1&&identities.id==='sophia-liberty-baseline-identities-2026-11-18'&&identities.checkedOn==='2026-11-18','Use the independent current Sophia review.');
 assert(policy.reviewStatus==='verified'&&policy.rawCapture?.supportsResidencyFacts===true&&policy.rawSourceContentHash==='sha256:'+policy.source.sha256&&policy.school===guide.school&&policy.catalogYear===guide.catalogYear,'Schoolwide applicability requires the reviewed actual undergraduate catalog.');
 assert(policy.policies.creditSystem==='semester'&&policy.residencyQuote==='25% of major and 25% of degree must be taken through Liberty University.','Do not replace the reviewed scope with an inferred school policy.');
 const sources=[],sourceByOriginal=new Map();
 function source(input,roles,scope){
  const key=input.id+'|'+input.url,old=sourceByOriginal.get(key);
  if(old){old.roles=unique([...old.roles,...roles]).sort();return old.id;}
  assert(actualHash(input)&&/^sha256:[a-f0-9]{64}$/.test(actualHash(input))&&day(input.checkedOn||input.checked),'Every shared source needs its actual captured digest and original review date.');
  const url=new URL(input.url);assert(url.protocol==='https:'&&!url.username&&!url.password,'Only public primary-source references are accepted.');
  const next={...copy(input),id:'liberty-shared-source-'+hash(key).slice(0,24),kind:roles.includes('provider-identity')?(input.kind==='ace'?'ace':'provider'):'university',roles:[...roles].sort(),sourceContentHash:actualHash(input),originalSourceId:input.id,...(scope?{sourceReviewScope:input.scope||null,scope:copy(scope)}:{})};
  sources.push(next);sourceByOriginal.set(key,next);return next.id;
 }
 const identitySources=new Map(identities.sources.map(s=>[s.id,s])),healthSources=new Map(health.sources.map(s=>[s.id,s]));
 const providerCourses=[];
 for(const c of identities.courses){
  assert(/^SOPH-\d{4}$/.test(c.aceId)&&c.activeOffering===true&&Number.isSafeInteger(c.aceVersion)&&c.aceVersion>0&&c.sourceCredits>0&&c.sourceCreditSystem==='semester'&&c.recommendationStart<=identities.checkedOn&&c.recommendationEnd>=identities.checkedOn,'A provider family or unknown version cannot become a reusable course.');
  const refs=unique([...c.identitySourceIds,...c.recommendationPeriodSourceIds]);assert(refs.every(id=>identitySources.has(id)),'Independent identity references must remain complete.');
  providerCourses.push({id:'sophia-'+c.aceId.toLowerCase()+'-v'+c.aceVersion,provider:'Sophia',code:c.aceId,title:c.title,courseVersion:String(c.aceVersion),providerCourseCode:c.providerCourseCode,codeAliases:[c.providerCourseCode],sourceCredits:c.sourceCredits,sourceCreditSystem:c.sourceCreditSystem,sourceUpper:c.sourceUpper,sourceCreditBasis:'Independent provider offering, provider-linked syllabus and exact ACE recommendation window.',recommendationStart:c.recommendationStart,recommendationEnd:c.recommendationEnd,identitySourceIds:refs.map(id=>source(identitySources.get(id),['provider-identity'])),url:c.courseUrl,eligibilityReview:{status:'current-provider-version-reviewed',eligibleToStart:true,recommendationPeriodStatus:'reviewed-current-window'}});
 }
 for(const c of health.courses){
  const refs=[c.aceSourceId,...(c.providerSourceId?[c.providerSourceId]:[])];assert(refs.every(id=>healthSources.has(id)),'Independent Study.com references must remain complete.');
  providerCourses.push({id:'study-'+c.code.toLowerCase()+'-v'+c.aceVersion,provider:'Study.com',code:c.code,title:c.title,courseVersion:String(c.aceVersion),providerCourseCode:c.providerCourseCode,codeAliases:[c.providerCourseCode],sourceCredits:c.sourceCredits,sourceCreditSystem:c.sourceCreditSystem,sourceUpper:c.sourceUpper,sourceCreditBasis:'Independent current ACE exhibit with original provider code, source quantity, recommendation window and passing requirement.',recommendationStart:c.recommendationStart,recommendationEnd:c.recommendationEnd,identitySourceIds:refs.map(id=>source(healthSources.get(id),['provider-identity'])),url:c.providerCourseUrl,eligibilityReview:{status:'current-provider-version-reviewed',eligibleToStart:true,recommendationPeriodStatus:'reviewed-current-window'}});
 }
 assert(extraIdentities?.version===1&&extraIdentities.reviewStatus==='approved'&&typeof extraIdentities.id==='string'&&day(extraIdentities.checkedOn)&&list(extraIdentities.courses).length>0,'Additional reusable identities require an explicitly approved, dated independent review.');
 const extraSources=new Map(list(extraIdentities.sources).map(s=>[s.id,s]));
 assert(extraSources.size===extraIdentities.sources.length,'Independent identity source IDs must be unique.');
 for(const c of extraIdentities.courses){
  assert(c.id&&c.provider&&c.code&&c.title&&typeof c.courseVersion==='string'&&/^\d+$/.test(c.courseVersion)&&Number(c.courseVersion)>0&&c.activeOffering===true&&Number.isFinite(c.sourceCredits)&&c.sourceCredits>0&&c.sourceCreditSystem==='semester'&&typeof c.sourceUpper==='boolean','Additional reusable courses require exact current independent identities and original semester credits.');
  assert(day(c.recommendationStart)&&day(c.recommendationEnd)&&c.recommendationStart<=extraIdentities.checkedOn&&c.recommendationEnd>=extraIdentities.checkedOn&&c.eligibilityReview?.eligibleToStart===true&&c.eligibilityReview.status==='current-provider-version-reviewed'&&c.eligibilityReview.recommendationPeriodStatus==='reviewed-current-window','An expired or unreviewed identity cannot become a reusable course.');
  const refs=unique(list(c.identitySourceIds));assert(refs.length>0&&refs.every(id=>{const s=extraSources.get(id);return s&&['provider','accreditor','ace'].includes(s.kind)&&list(s.roles).includes('provider-identity')&&s.provider===c.provider&&list(s.courseCodes).includes(c.code);}),'Independent identity references must be exact-code provider, accreditor or ACE evidence.');
  const courseUrl=new URL(c.url);assert(courseUrl.protocol==='https:'&&!courseUrl.username&&!courseUrl.password,'A current course requires its public provider link.');
  const next=copy(c);delete next.activeOffering;
  providerCourses.push({...next,identitySourceIds:refs.map(id=>source(extraSources.get(id),['provider-identity']))});
 }
 assert(providerCourses.length>0&&new Set(providerCourses.map(c=>c.id)).size===providerCourses.length&&new Set(providerCourses.map(c=>c.provider+'|'+c.code)).size===providerCourses.length,'Independent reusable course IDs and provider/code identities must be unique.');
 assert.deepEqual([...guide.degreeLevels].sort(),['associate','bachelor'],'The reviewed guide scope must remain undergraduate.');
 const schoolScope={schoolName:guide.school,catalogYear:guide.catalogYear,modality:'online',levels:[...guide.degreeLevels].sort()};
 const catalogSource=source(policy.source,['policy','curriculum'],schoolScope);
 const guideSources=new Map(guide.sources.map(s=>[s.id,source(s,['receiving-map'],schoolScope)]));
 const awards=[],placementRules=[];
 for(const level of ['associate','bachelor']){
  const modelIds=policy.programs.filter(p=>p.format==='Online'&&p.level===level).map(p=>p.id).sort();assert(modelIds.length>0,'An empty reviewed scope cannot publish awards.');
  for(const course of providerCourses){
   const matches=guide.awards.filter(a=>a.provider===course.provider&&a.code===course.code);
   for(const award of matches){
    assert(award.creditSystem==='semester'&&award.credits===course.sourceCredits,'Original source and receiving units/quantities must each remain evidenced; this pilot supports no conversion.');
    const guideSource=guide.sources.find(s=>s.id===award.sourceIds[0]);
    awards.push({id:award.id+'-'+level,providerCourseId:course.id,receivingCode:award.receivingCode,receivingTitle:award.receivingTitle,credits:award.credits,creditSystem:award.creditSystem,upper:award.upper,evidence:'published',sourceIds:award.sourceIds.map(id=>guideSources.get(id)),scopeSourceIds:[catalogSource,...award.sourceIds.map(id=>guideSources.get(id))],scopeQuote:guideSource.provider==='Sophia'?'Liberty University — Transfer Equivalency Guide for Sophia Learning — updated on July 2026':'Liberty University — Transfer Equivalency Guide for Study.com — updated on May 2026',sourcePage:award.sourcePage,reviewedExtract:award.reviewedExtract,scope:{school:guide.school,catalog:guide.catalogYear,modality:'online',level,programIds:[...modelIds]}});
   }
  }
  const awardIds=awards.filter(a=>a.scope.level===level).map(a=>a.id);
  for(const kind of ['exact','free-elective'])placementRules.push({id:'liberty-online-'+level+'-'+kind,kind,modelIds:[...modelIds],sourceIds:[catalogSource],awardIds:[...awardIds]});
 }
 return {version:1,id:'liberty-shared-online-undergraduate-awards-v1',reviewStatus:'approved',checkedOn:'2026-11-20',school:guide.school,sources:sources.sort((a,b)=>a.id.localeCompare(b.id)),providerCourses:providerCourses.sort((a,b)=>a.id.localeCompare(b.id)),awards:awards.sort((a,b)=>a.id.localeCompare(b.id)),placementRules,inputFingerprints:Object.fromEntries(Object.entries({guide,identities,health,extraIdentities,policy}).map(([key,value])=>[key,hash(JSON.stringify(value))])),scopeReview:{basis:'The reviewed university-hosted online transfer tables establish named school receiving awards. The current undergraduate catalog supplies online associate/bachelor policy scope and unrestricted elective-credit policy. Explicit model IDs are retained from that separately reviewed policy packet. Exact degree requirements remain independently bound to their own sources; no residential, graduate, unlisted future program, university-only course, restricted major elective or individual student award inherits this bundle.',programIds:policy.programs.map(p=>p.id).sort(),catalogSourceId:catalogSource,reviewedGuideAwardCount:guide.awards.length,independentProviderCourseCount:providerCourses.length,compositeAwardsExcluded:guide.heldAwards.length},publicationAllowed:false,personalAwardsCreated:0,runtimeAiCalls:0};
}
export async function readLibertySharedAwardInputs(base=ROOT){return Object.fromEntries(await Promise.all(Object.entries(libertySharedAwardInputs).map(async([key,path])=>[key,JSON.parse(await readFile(resolve(base,path),'utf8'))])));}
export async function writeLibertySharedAwards({base=ROOT,check=false}={}){
 const bundle=buildLibertySharedAwards(await readLibertySharedAwardInputs(base)),path=resolve(base,libertySharedAwardsPath),body=JSON.stringify(bundle,null,2)+'\n';
 if(check)assert.equal(await readFile(path,'utf8'),body,'Liberty reusable awards are stale; rebuild them from their source packets.');
 else{await mkdir(dirname(path),{recursive:true});await writeFile(path,body);}
 return {bundleId:bundle.id,providerCourses:bundle.providerCourses.length,awards:bundle.awards.length,programs:bundle.scopeReview.programIds.length,placementRules:bundle.placementRules.length,check};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)console.log(JSON.stringify(await writeLibertySharedAwards({check:process.argv.includes('--check')})));
