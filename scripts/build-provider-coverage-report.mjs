/** Count usable provider coverage without turning listings or claims into awards.
 * Static, deterministic, no solver, network, student data or publication changes. */
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Assessment=require('../dist/course-assessment.js');
const root=resolve(import.meta.dirname,'..'),list=value=>Array.isArray(value)?value:[];
const text=value=>typeof value==='string'?value.trim():'',norm=value=>text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const sorted=values=>[...values].sort((a,b)=>String(a).localeCompare(String(b),'en'));
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validCount=value=>Number.isSafeInteger(value)&&value>=0;
const day=value=>{const s=text(value).slice(0,10);if(!/^20\d{2}-\d{2}-\d{2}$/.test(s))return null;const d=Date.parse(s+'T00:00:00Z');return Number.isFinite(d)&&new Date(d).toISOString().slice(0,10)===s?s:null;};
const fresh=(value,asOf)=>{const d=day(value);return Boolean(d&&d<=asOf&&Date.parse(asOf)-Date.parse(d)<30*86400000);};
const sourceDay=source=>source?.checkedOn||source?.checked||source?.checkedAt;
const https=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
const near=(a,b)=>typeof a==='number'&&Number.isFinite(a)&&typeof b==='number'&&Number.isFinite(b)&&Math.abs(a-b)<0.000001;
const aliases={sophia:['Sophia','Sophia Learning'],saylor:['Saylor','Saylor Academy','Saylor Direct Credit'],clep:['CLEP'],dsst:['DSST'],'study-com':['Study.com'],'asu-ulc':['ASU Universal Learner'],'christian-leaders':['Christian Leaders','Christian Leaders Institute','Christian Leaders College'],'upi-study':['UPI Study','UPIStudy','University Pathways International']};
const code=value=>norm(String(value??''));
function originalIdentity(item,{option=false}={}){
 const candidates=[item.aceId,item.recommendationId,item.mappingCode,item.code,item.providerCourseCode];
 const known=candidates.find(value=>/^[a-z][a-z0-9]{1,10}-\d{3,6}$/i.test(text(value))),key=code(known||candidates.find(value=>text(value))||item.id);
 const rawVersion=item.courseVersion??item.version??null,version=typeof rawVersion==='string'&&/^\d+$/.test(rawVersion)?Number(rawVersion):rawVersion;
 // Unknown versions and original units are never merged into known ones.
 return JSON.stringify([key||'unidentified',version,option?item.sourceCredits??null:item.sourceCredits??item.credits??null,option?item.sourceCreditSystem??null:item.sourceCreditSystem??item.creditSystem??null,item.recommendationStart??null,item.recommendationEnd??null]);
}
function sourceSet(model){return new Map(list(model.sources).map(source=>[source.id,source]));}
function boundSources(ids,sources,asOf){return list(ids).length>0&&ids.every(id=>{const s=sources.get(id);return s&&https(s.url)&&fresh(sourceDay(s),asOf);});}
function originalReviewed(option,sources,asOf){
 const proof=option.sourceCreditVerification||option.sourceCreditEvidence,ids=list(option.identitySourceIds);
 return ['verified','verified-current-provider-and-ace','reviewed-independent-recommendation'].includes(option.sourceCreditStatus)&&typeof option.sourceCredits==='number'&&option.sourceCredits>0&&['semester','quarter','competency-unit'].includes(option.sourceCreditSystem)&&near(proof?.credits,option.sourceCredits)&&proof?.creditSystem===option.sourceCreditSystem&&boundSources(ids,sources,asOf)&&boundSources(proof?.sourceIds,sources,asOf);
}
function libertyGuideSource(source,model,option){
 if(model.school!=='Liberty University'||source?.evidenceType!=='official-receiving-school-equivalency'||source.provider!==option.provider||!https(source.url))return false;
 const u=new URL(source.url);return /(^|\.)liberty\.edu$/.test(u.hostname)&&/\.pdf$/i.test(u.pathname)&&source.modality==='online'&&/^sha256:[a-f0-9]{64}$/.test(source.sourceContentHash||'');
}
function libertyCalculatorSource(source,model,option){
 if(model.school!=='Liberty University'||source?.kind!=='university'||!list(source.roles).includes('receiving-map')||source.evidenceType!=='official-receiving-school-calculator'||!https(source.url)||!/^[a-f0-9]{64}$/.test(source.captureSha256||''))return false;
 const u=new URL(source.url);return u.hostname==='webapi.liberty.edu'&&u.pathname==='/transfer-credits/'&&text(option.calculatorInstitutionCode)&&u.searchParams.get('institution')===option.calculatorInstitutionCode;
}
function awardSourceIds(model,option,sources){
 return list(option.mappingEvidence?.sourceIds).length?option.mappingEvidence.sourceIds:list(option.sourceIds).filter(id=>libertyGuideSource(sources.get(id),model,option)||libertyCalculatorSource(sources.get(id),model,option));
}
function institutionalAward(model,option,sources,asOf){
 const award=option.mappingEvidence,ids=awardSourceIds(model,option,sources),receiving=option.receivingCode||option.receivingCategory;
 if(option.mappingResearchClosed===false||!text(receiving)||!boundSources(ids,sources,asOf))return false;
 // Existing Liberty packets bind the receiving guide and degree placement in
 // separate records rather than an invented mappingEvidence object.
 if(!award){
  const p=option.degreePlacementEvidence,range=option.calculatorAwardRange;
  if(option.evidenceType==='official-receiving-school-calculator')return option.receivingMapStatus==='published-university-calculator'&&fresh(option.mappingChecked,asOf)&&text(option.mappingReviewId)&&near(range?.low,option.credits)&&near(range?.high,option.credits)&&ids.some(id=>libertyCalculatorSource(sources.get(id),model,option));
  return option.evidence==='published'&&option.mappingResearchClosed===true&&option.evidenceType==='official-receiving-school-equivalency'&&p?.modelId===model.id&&code(p.receivingCode)===code(receiving)&&near(p.credits,option.credits)&&p.creditSystem===(option.creditSystem||model.creditSystem)&&boundSources(p.sourceIds,sources,asOf)&&ids.some(id=>libertyGuideSource(sources.get(id),model,option));
 }
 const reviewed=option.mappingResearchClosed===true&&/^published-/.test(option.receivingMapStatus||'')||option.mappingResearchClosed===undefined&&option.evidence==='published'&&text(option.mappingReviewId)&&fresh(option.mappingChecked,asOf)&&option.universityMapRecord;
 if(!reviewed||!['official-receiving-school-equivalency','school-submitted-equivalency'].includes(option.evidenceType)||award.schoolName!==model.school||norm(award.provider)!==norm(option.provider)||code(award.providerCourseCode)!==code(option.code)||code(award.receivingCode||award.receivingCategory)!==code(receiving)||!near(award.credits,option.credits)||award.creditSystem!==(option.creditSystem||model.creditSystem))return false;
 // A provider's "verified" label, partner page or directory listing is not
 // reclassified as an institution-published course award by this report.
 return ids.some(id=>{const s=sources.get(id),url=new URL(s.url),roles=list(s.roles);return roles.includes('receiving-map')&&s.kind==='university'&&(s.publisher===model.school||s.scope?.schoolName===model.school)||url.hostname==='www.acenet.edu'&&s.kind==='ace'&&roles.includes('receiving-institution-submitted-equivalency')&&award.claimOrigin==='receiving-institution-submitted';});
}
function receivingIdentity(model,option,sources){
 const award=option.mappingEvidence||{};
 return JSON.stringify([model.school,award.catalogYear??model.catalogYear??model.catalog??null,award.programName??null,award.modality??model.format??null,award.level??model.level??null,originalIdentity(option,{option:true}),option.receivingCode||option.receivingCategory||null,option.credits??null,option.creditSystem||model.creditSystem||null,sorted(awardSourceIds(model,option,sources).map(id=>https(sources.get(id)?.url)||'unbound:'+id))]);
}
function claimedKind(model,option,sources,asOf){
 if(institutionalAward(model,option,sources,asOf))return 'institutionSourceBound';
 if(/provider|partner/.test(option.mappingEvidence?.claimOrigin||option.evidenceType||'')&&boundSources(option.mappingEvidence?.sourceIds||option.sourceIds,sources,asOf))return 'providerPublished';
 return 'unresolved';
}
const counter=()=>({institutionSourceBound:0,providerPublished:0,unresolved:0,total:0});
const countSets=sets=>({institutionSourceBound:sets.institutionSourceBound.size,providerPublished:sets.providerPublished.size,unresolved:sets.unresolved.size,total:sets.institutionSourceBound.size+sets.providerPublished.size+sets.unresolved.size});
const claimSets=()=>({institutionSourceBound:new Set(),providerPublished:new Set(),unresolved:new Set()});

export function buildProviderCoverageReport({directory={},courseCatalogs=[],models=[],publication={},baselines={},rates={},assessment={},asOf}={}){
 if(!day(asOf)||day(asOf)!==asOf)throw Error('Provider coverage needs an exact review date.');
 if(!text(publication.registryRevision))throw Error('Provider coverage needs the publication registry revision.');
 if(baselines.registryRevision&&baselines.registryRevision!==publication.registryRevision)throw Error('Provider coverage cannot mix different academic registry revisions.');
 if(!Array.isArray(models)||new Set(models.map(model=>model.id)).size!==models.length)throw Error('Provider coverage model IDs must be distinct.');
 if([directory,...list(courseCatalogs),publication,baselines,rates,assessment,...models].some(value=>value?.privateStudentRecordsIncluded===true)||models.some(model=>model.auditProvenance?.status==='student-provided'))throw Error('Private student records cannot enter provider coverage.');
 const assess=Assessment.create(assessment,{asOf});if(!assess.valid)throw Error('Provider coverage needs a valid reviewed assessment packet.');
 const names=new Map(),rows=new Map(),ready=new Map(list(publication.plans).filter(plan=>plan.publicationReady===true).map(plan=>[plan.modelId,new Set(list(plan.routeIds))]));
 for(const provider of [...list(directory.sources)].sort((a,b)=>text(a.id).localeCompare(text(b.id),'en'))){
  if(!text(provider.id)||rows.has(provider.id)||!text(provider.name))throw Error('Provider directory identities must be distinct.');
  const row={id:provider.id,name:provider.name,directoryListed:true,directoryStatus:provider.status||'not-stated',kind:provider.kind||'not-stated',indexed:new Map(),originals:new Set(),claims:claimSets(),placements:claimSets(),models:new Set(),readyAlternatives:new Set(),readyBaselines:new Set(),defaultModels:new Set(),assessmentKnown:new Set()};rows.set(row.id,row);
  for(const name of [provider.id,provider.name,...list(aliases[provider.id])]){const key=norm(name);if(names.has(key)&&names.get(key)!==row.id)throw Error('Ambiguous provider alias: '+name);names.set(key,row.id);}
 }
 function get(provider){
  const label=text(provider);if(!label||norm(label)==='university')return null;
  const id=names.get(norm(label))||'unlisted-'+norm(label);if(!rows.has(id))rows.set(id,{id,name:label,directoryListed:false,directoryStatus:'unlisted',kind:'not-stated',indexed:new Map(),originals:new Set(),claims:claimSets(),placements:claimSets(),models:new Set(),readyAlternatives:new Set(),readyBaselines:new Set(),defaultModels:new Set(),assessmentKnown:new Set()});return rows.get(id);
 }
 for(const catalog of list(courseCatalogs))for(const item of list(catalog.courses)){
  const row=get(item.provider);if(!row)continue;const key=originalIdentity(item);if(!row.indexed.has(key))row.indexed.set(key,item);
  if(assess.statusFor(null,{...item,code:item.mappingCode||item.code},asOf)!=='unknown')row.assessmentKnown.add(key);
 }
 for(const model of [...models].sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'))){
  const sources=sourceSet(model),defaults=new Set(list(model.defaultProviders).map(value=>get(value)?.id));
  for(const requirement of list(model.requirements))for(const option of list(requirement.options)){
   const row=get(option.provider);if(!row)continue;row.models.add(model.id);if(defaults.has(row.id))row.defaultModels.add(model.id);if(ready.has(model.id))row.readyAlternatives.add(model.id);
   const key=originalIdentity(option,{option:true});if(originalReviewed(option,sources,asOf))row.originals.add(key);
   const awardKey=receivingIdentity(model,option,sources),kind=claimedKind(model,option,sources,asOf),placement=JSON.stringify([model.id,requirement.id,awardKey]);row.claims[kind].add(awardKey);row.placements[kind].add(placement);
  }
 }
 for(const baseline of Object.values(baselines.baselines||{})){
  if(!ready.get(baseline.modelId)?.has(baseline.pathwayId))continue;
  for(const item of list(baseline.rows)){const row=get(item.provider);if(row&&row.models.has(baseline.modelId))row.readyBaselines.add(baseline.modelId);}
 }
 const providers=[...rows.values()].sort((a,b)=>a.name.localeCompare(b.name,'en')||a.id.localeCompare(b.id,'en')).map(row=>{
  const currentRates=list(rates.providers).filter(rate=>(names.get(norm(rate.provider))||'unlisted-'+norm(rate.provider))===row.id&&typeof rate.amount==='number'&&Number.isFinite(rate.amount)&&rate.amount>=0&&boundSources(rate.sourceIds,new Map(list(rates.sources).map(source=>[source.id,source])),asOf));
  const receivingClaims=countSets(row.claims),placements=countSets(row.placements),indexedIdentities=row.indexed.size,unknownAssessment=indexedIdentities-row.assessmentKnown.size;
  const gaps=[];if(!indexedIdentities)gaps.push('no-indexed-courses');if(!row.originals.size)gaps.push('no-source-reviewed-mapped-identities');if(!receivingClaims.institutionSourceBound)gaps.push('no-institution-source-bound-awards');if(!row.readyBaselines.size)gaps.push('not-used-in-publication-ready-baseline');if(!currentRates.length)gaps.push('no-current-provider-rate');if(unknownAssessment)gaps.push('assessment-details-incomplete');if(row.models.size&&!row.defaultModels.size)gaps.push('not-in-fresh-plan-provider-defaults');
  return {id:row.id,name:row.name,directoryListed:row.directoryListed,directoryStatus:row.directoryStatus,kind:row.kind,stage:row.readyBaselines.size?'used-in-ready-baseline':placements.total?'receiving-claims-placed':indexedIdentities?'courses-indexed':'directory-only',indexedIdentities,sourceReviewedMappedIdentities:row.originals.size,receivingClaims,placements,modelsWithOptions:row.models.size,modelsEnabledByDefault:row.defaultModels.size,publicationReadyAlternativeModels:row.readyAlternatives.size,publicationReadyBaselineModels:row.readyBaselines.size,assessment:{knownIndexedIdentities:row.assessmentKnown.size,unknownIndexedIdentities:unknownAssessment},pricing:{currentSourceBoundProviderRates:currentRates.length,eligibleRateScopeRequired:true,completePriceGuaranteed:false},gaps};
 });
 const report={schemaRevision:'provider-coverage-v1',revision:'',registryRevision:publication.registryRevision,asOf,privateStudentRecordsIncluded:false,runtimeAiCalls:0,publicationAllowed:false,studentCreditAwarded:false,scope:'Internal provider integration counts. Listings, source identities, receiving claims, degree placements, ready alternatives and selected ready baselines are separate stages; none awards individual credit.',methodology:{indexed:'Distinct provider/code, declared original version, quantity, units and recommendation period across the course-library inputs; unknown facts are not filled from another version.',receivingAwards:'Institution-source-bound requires exact typed award fields and a current local receiving-map source. Provider-published and unresolved claims are separate; these are evidence-coverage counts, not new approval decisions.',placements:'A distinct requirement/source-award placement. The same award reused in several requirements is not several original courses.',readiness:'Ready alternatives exist in a publication-ready model; ready baselines count only providers selected in its publication-index route. No automatic promotion occurs.',pricing:'A current source-bound provider rate exists; eligibility, chosen tier, duration and other charges still govern a student estimate.',assessment:'Current exact course-code or supported provider-policy evidence, using the existing assessment engine.'},summary:{directoryProviders:providers.filter(row=>row.directoryListed).length,observedProviders:providers.length,indexedProviders:providers.filter(row=>row.indexedIdentities>0).length,directoryOnlyProviders:providers.filter(row=>row.directoryListed&&row.indexedIdentities===0&&row.placements.total===0).length,providersWithReceivingClaims:providers.filter(row=>row.receivingClaims.total>0).length,providersWithInstitutionSourceBoundAwards:providers.filter(row=>row.receivingClaims.institutionSourceBound>0).length,providersUsedInReadyBaselines:providers.filter(row=>row.publicationReadyBaselineModels>0).length,indexedIdentities:providers.reduce((sum,row)=>sum+row.indexedIdentities,0),publicationReadyPlans:ready.size},providers,inputFingerprints:{directory:digest(directory),courseCatalogs:digest(courseCatalogs),models:digest(models),publication:digest(publication),baselines:digest(baselines),rates:digest(rates),assessment:digest(assessment)}};
 report.revision='provider-coverage-v1:'+digest(report);return assertProviderCoverageReport(report);
}

export function assertProviderCoverageReport(report){
 if(report?.schemaRevision!=='provider-coverage-v1'||!/^provider-coverage-v1:[a-f0-9]{64}$/.test(report.revision||'')||!text(report.registryRevision)||!day(report.asOf)||report.privateStudentRecordsIncluded!==false||report.runtimeAiCalls!==0||report.publicationAllowed!==false||report.studentCreditAwarded!==false||!Array.isArray(report.providers)||report.providers.length>250)throw Error('Provider coverage report is invalid.');
 const ids=new Set();for(const row of report.providers){
  if(!/^[a-z0-9][a-z0-9-]{0,159}$/.test(row.id||'')||ids.has(row.id)||!text(row.name)||row.name.length>200||typeof row.directoryListed!=='boolean'||!['directory-only','courses-indexed','receiving-claims-placed','used-in-ready-baseline'].includes(row.stage)||!Array.isArray(row.gaps))throw Error('Provider coverage identity is invalid.');ids.add(row.id);
  for(const key of ['indexedIdentities','sourceReviewedMappedIdentities','modelsWithOptions','modelsEnabledByDefault','publicationReadyAlternativeModels','publicationReadyBaselineModels'])if(!validCount(row[key]))throw Error('Provider coverage counts must be nonnegative integers.');
  for(const key of ['receivingClaims','placements']){if(!row[key]||Object.keys(counter()).some(field=>!validCount(row[key][field]))||row[key].total!==row[key].institutionSourceBound+row[key].providerPublished+row[key].unresolved)throw Error('Receiving claims and placements must stay separate and balanced.');}
  if(row.publicationReadyBaselineModels>row.publicationReadyAlternativeModels||row.publicationReadyAlternativeModels>row.modelsWithOptions||row.modelsEnabledByDefault>row.modelsWithOptions||!validCount(row.assessment?.knownIndexedIdentities)||!validCount(row.assessment?.unknownIndexedIdentities)||row.assessment.knownIndexedIdentities+row.assessment.unknownIndexedIdentities!==row.indexedIdentities||!validCount(row.pricing?.currentSourceBoundProviderRates)||row.pricing.eligibleRateScopeRequired!==true||row.pricing.completePriceGuaranteed!==false)throw Error('Provider coverage stages or qualifications are inconsistent.');
 }
 const summary=report.summary,rows=report.providers;
 const expected={directoryProviders:rows.filter(row=>row.directoryListed).length,observedProviders:rows.length,indexedProviders:rows.filter(row=>row.indexedIdentities>0).length,directoryOnlyProviders:rows.filter(row=>row.directoryListed&&row.indexedIdentities===0&&row.placements.total===0).length,providersWithReceivingClaims:rows.filter(row=>row.receivingClaims.total>0).length,providersWithInstitutionSourceBoundAwards:rows.filter(row=>row.receivingClaims.institutionSourceBound>0).length,providersUsedInReadyBaselines:rows.filter(row=>row.publicationReadyBaselineModels>0).length,indexedIdentities:rows.reduce((sum,row)=>sum+row.indexedIdentities,0)};
 if(!summary||Object.values(summary).some(value=>!validCount(value))||Object.entries(expected).some(([key,value])=>summary[key]!==value)||!validCount(summary.publicationReadyPlans)||rows.some(row=>row.publicationReadyAlternativeModels>summary.publicationReadyPlans))throw Error('Provider coverage summary does not match its rows.');
 if(report.revision!=='provider-coverage-v1:'+digest({...report,revision:''}))throw Error('Provider coverage content fingerprint does not match.');
 return report;
}

export async function runProviderCoverageReport({base=root,check=false}={}){
 const read=async path=>JSON.parse(await readFile(resolve(base,path),'utf8'));
 const [directory,catalog,mapped,registry,publication,baselines,rates,assessment]=await Promise.all(['dist/data/credit-sources.json','dist/data/course-catalog.json','dist/data/curriculum-course-index.json','dist/data/curriculum-registry.json','dist/data/publication-index.json','dist/data/baseline-index.json','dist/data/plan-estimate-rates.json','content/discovery/course-assessment-reviews.json'].map(read));
 const packs=new Map();for(const entry of list(registry.models))if(!packs.has(entry.path))packs.set(entry.path,await read('dist/'+entry.path));
 const available=new Map();for(const pack of packs.values())for(const model of list(pack.models).length?pack.models:[pack])available.set(model.id,model);
 const models=list(registry.models).map(entry=>{const model=available.get(entry.id);if(!model)throw Error('Provider coverage model not found: '+entry.id);return model;});
 const asOf=sorted([directory.checkedOn,registry.checkedOn,publication.asOf,rates.checkedOn,...list(assessment.sources).map(source=>source.checkedOn)].map(day).filter(Boolean)).at(-1);
 const report=buildProviderCoverageReport({directory,courseCatalogs:[catalog,mapped],models,publication,baselines,rates,assessment,asOf}),bytes=JSON.stringify(report,null,2)+'\n',path=resolve(base,'dist/data/provider-coverage-report.json');
 if(check){if(await readFile(path,'utf8')!==bytes)throw Error('Provider coverage is stale. Run node scripts/build-provider-coverage-report.mjs.');}else{await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);}
 return report;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){if(process.argv.slice(2).some(arg=>arg!=='--check'))throw Error('Usage: node scripts/build-provider-coverage-report.mjs [--check]');const report=await runProviderCoverageReport({check:process.argv.includes('--check')});console.log(JSON.stringify({revision:report.revision,...report.summary,check:process.argv.includes('--check')}));}
