/** Reuse curriculum structure only after the exact new degree independently proves it.
 * Outside-course evidence is layered separately by the TESU receiving/placement writers. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {root,sourceRefs} from './pathway-factory/lib.mjs';
import {validateConnectedWebCapture} from './pathway-factory/connected-web.mjs';

export const TESU_BUSINESS_CATALOG='Current undergraduate catalog · checked November 18, 2026';
export const TESU_BUSINESS_REVIEW_DATE='2026-11-26';
export const TESU_BUSINESS_CORE_CODES=Object.freeze(['ACC-1010','ACC-1020','CIS-1070','LAW-2010','MAN-2100','MKT-2010','FIN-3010','ECO-1110','ECO-1120','BUS-2100','STA-2010','MAN-3730','MAN-3720','BUS-4210']);
const copy=structuredClone,unique=values=>[...new Set(values)],norm=value=>String(value||'').replace(/[\u2018\u2019]/g,"'").replace(/\s+/g,' ').trim();
const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const hash=body=>createHash('sha256').update(body).digest('hex');
const replaceSource=(value,oldId,newId)=>Array.isArray(value)?value.map(v=>replaceSource(v,oldId,newId)):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replaceSource(v,oldId,newId)])):value===oldId?newId:value;

/** Original capture metadata is immutable; the source review date can be later
 * than retrieval. Native connected-web captures honestly retain unknown origin
 * HTTP status and a citation instead of inventing an HTTP response. */
export async function reviewedTESUBusinessSource(source,{reviewedOn=TESU_BUSINESS_REVIEW_DATE}={}){
 assert(source?.id&&source.kind==='university'&&source.capture&&source.url?.startsWith('https://'), 'A business source needs a primary URL and retained capture');
 assert(['tesu.smartcatalogiq.com','www.tesu.edu','tesu.edu','www2.tesu.edu'].includes(new URL(source.url).hostname),'The retained business source must be a primary TESU publication');
 const body=await readFile(resolve(root,source.capture),'utf8'),meta=await read(source.capture.replace(/\.txt$/,'.json')),actual=hash(body);
 assert.equal(actual,meta.sha256,source.id+': capture integrity');
 for(const field of ['sha256','sourceContentHash'])if(source[field]!==undefined)assert.equal(source[field].replace(/^sha256:/,''),actual,source.id+': independently pinned '+field);
 assert.equal(meta.url,source.url,source.id+': exact primary URL');
 if(source.captureFormat==='connected-web-rendered-extract'||meta.captureFormat==='connected-web-rendered-extract'||source.toolResponseReceipt||meta.toolResponseReceipt){
  assert(meta.status===null&&meta.captureFormat==='connected-web-rendered-extract'&&meta.citationRef,source.id+': successful origin response or explicit native rendered extraction');
  assert(source.toolResponseReceipt,source.id+': an academic source independently pins its actual native tool receipt');
  assert.deepEqual(meta.toolResponseReceipt,source.toolResponseReceipt,source.id+': academic source binds the exact citation, primary URL and raw receipt hash');
  await validateConnectedWebCapture({...meta,text:body});
 }else{assert.equal(meta.status,200,source.id+': successful retained origin response');assert(source.capture.includes(actual.slice(0,16)),source.id+': immutable content-addressed origin capture');}
 assert(/^\d{4}-\d{2}-\d{2}$/.test(reviewedOn)&&new Date(reviewedOn+'T00:00:00Z').toISOString().slice(0,10)===reviewedOn&&reviewedOn<=new Date().toISOString().slice(0,10),source.id+': valid non-future review date');
 assert(String(meta.fetchedAt).slice(0,10)<=source.checked&&source.checked<=reviewedOn,source.id+': honest retrieval/review dates');
 return {source:{...source,sha256:actual,sourceContentHash:actual},body};
}

export function assertTESUBusinessBlockEvidence(degreeBody,requirements){
 const text=norm(degreeBody);
 for(const claim of ['I. General Education Featured Courses (45 Credits)','II. Professional Business Requirements (42 Credits)','III. Area of Study (18 Credits)','IV. Electives (15 Credits)','Total Credit Hours: 120','minimum of 18 credits at the upper level'])assert(text.includes(claim),'Exact degree must independently establish '+claim);
 assert(/Complete 12 upper-level credits in the area of study, the Capstone,? and one additional 3 credit course,? which can be completed in the area of study or the Business Core\./.test(text),'Exact degree proves the 12-credit upper area, capstone and additional business/area course rule');
 for(const row of requirements.filter(r=>r.category==='general'||r.group==='business-core'))assert(text.includes(norm(row.code+' '+row.title+' '+row.credits)),row.code+': exact new degree names the shared course, title and credits');
 assert.deepEqual(requirements.filter(r=>r.group==='business-core').map(r=>r.code),TESU_BUSINESS_CORE_CODES,'Exact shared professional core order');
 assert.equal(requirements.filter(r=>r.category==='general').reduce((n,r)=>n+r.credits,0),45);
 assert.equal(requirements.filter(r=>r.group==='business-core').reduce((n,r)=>n+r.credits,0),42);
 assert.equal(requirements.filter(r=>r.freeElective).reduce((n,r)=>n+r.credits,0),15);
 return true;
}

export function namedTESUUniversityOption(requirement,sourceIds=requirement.sourceIds){
 return {inline:{id:'university-'+requirement.id,provider:'University',code:requirement.code,title:requirement.title,credits:requirement.credits,upper:requirement.upper===true,creditSystem:'semester',creditOrigin:'institutional',sourceIds:copy(sourceIds),evidence:'published'}};
}

/** A bounded, reviewed base: 29 shared requirements and five named free choices.
 * It does not clone Accounting's area, CPA conditions, outcome or outside options. */
export async function createTESUBusinessBlocks({slug,title,degreeSource,degreeBody,reviewedOn=TESU_BUSINESS_REVIEW_DATE,areaUpperCredits=18}){
 assert(slug&&title&&degreeSource?.id&&degreeSource.kind==='university');
 const base=await read('content/pathway-kits/tesu/programs/bsba-accounting.json'),oldDegree='tesu-accounting-current-2026-11-18';
 const requirements=base.requirements.filter(r=>r.category==='general'||r.group==='business-core'||r.freeElective).map(row=>{
  const r=replaceSource(copy(row),oldDegree,degreeSource.id);
  r.institutionalOnly=r.institutionalOnly===true;
  if(r.gradePolicyNote)r.gradePolicyNote='C or better in composition, Professional Business Requirements and the area of study; other general education and electives retain their applicable grade rules.';
  // A previous degree's option placement is never proof for this new degree.
  r.optionRows=r.freeElective?r.optionRows.filter(entry=>entry.inline?.provider==='University'):[namedTESUUniversityOption(r)];
  if(r.institutionalOnly)assert(r.optionRows.every(entry=>entry.inline?.provider==='University'));
  return r;
 });
 assert.equal(requirements.length,34);assertTESUBusinessBlockEvidence(degreeBody,requirements);
 const inherited=['policyEvidence','policySourceIds','gradePolicy','transferPolicyReview','graduationRequirements','providerEligibilityReview','policyReview'];
 const modelFields=Object.fromEntries(inherited.map(key=>[key,replaceSource(copy(base.modelFields[key]),oldDegree,degreeSource.id)]));
 assert(Number.isFinite(areaUpperCredits)&&areaUpperCredits>=12&&areaUpperCredits<=18,'The reviewed area must independently satisfy its upper-level minimum');
 modelFields.policyEvidence.upperMinCredits.scope=areaUpperCredits===18?'At least 12 upper-level credits in the area of study, the upper-level capstone, and an additional three upper-level credits in the area of study or Professional Business Requirements. The six chosen area courses are upper level.':'At least 12 upper-level credits in the area of study, the upper-level capstone, and an additional three upper-level credits in the area of study or Professional Business Requirements. The selected area contains '+areaUpperCredits+' upper-level credits; lower-level area courses do not contribute to that minimum.';
 modelFields.gradePolicy.detail='Composition, Professional Business Requirements and this degree’s area of study require C or better. Other general education and electives retain their applicable grade rules.';
 modelFields.catalogIdentity={kind:'reviewed-current-catalog',label:TESU_BUSINESS_CATALOG,sourceUrl:degreeSource.url,checkedOn:reviewedOn,sourceId:degreeSource.id,sourceSha256:degreeSource.sha256,capture:degreeSource.capture};
 modelFields.sourceIds=[degreeSource.id];
 modelFields.upperGroupMinimums=[{group:'area-of-study',credits:12},{group:'business-core',credits:3},{groups:['area-of-study','business-core'],credits:18}];
 modelFields.coverageLabel='Complete current degree curriculum with exact receiving-course and degree-placement evidence.';
 modelFields.existingCreditReview={kind:'tesu-business-course-currency',sourceIds:['tesu-accounting-business-policy-2026-11-18'],groups:[{id:'business-area',title:title+' area of study',requirementIds:[],maxAgeYears:10,maxOlderCredits:9,totalCredits:18},{id:'business-capstone',title:'Business capstone',requirementIds:['bus4210'],maxAgeYears:5,maxOlderCredits:0,totalCredits:3}]};
 modelFields.rulesNotes=['45 general education + 42 Professional Business Requirements + 18 area of study + 15 free electives = 120 semester credits.','The two selected Human Cultures choices are HIS-1140 and PHI-1300. Scientific category alternatives require independently published classification, not a course-title similarity.','The catalog label identifies the same receiving catalog as the existing exact course awards. This exact degree’s primary body, capture hash and November 26 review date are recorded separately.','The standard nonmilitary 15-credit eligible-course residency and 90-credit combined noncollegiate cap remain distinct. Cornerstone and capstone are taken at TESU.','At least half of the business area of study must be current within ten years of the most recent application date; the business capstone has a five-year currency limit.'];
 if(reviewedOn!==TESU_BUSINESS_REVIEW_DATE)modelFields.rulesNotes[2]='The catalog label identifies the same receiving catalog as the existing exact course awards. This exact degree’s primary body, capture hash and '+reviewedOn+' review date are recorded separately.';
 modelFields.unresolved=[{id:'tesu-'+slug+'-personal-catalog',status:'personal-task',owner:'student',message:'Have TESU apply your enrollment catalog and evaluate any previous coursework.',sourceIds:[degreeSource.id,'tesu-accounting-transfer-2026-11-18']},{id:'tesu-'+slug+'-personal-residency',status:'personal-task',owner:'student',message:'If you use military benefits or Edison Accelerate, select the residency route that applies to you.',sourceIds:['tesu-accounting-residency-2026-11-18']}];
 modelFields.pricingNotes=['Tuition comparisons use the separately dated published TESU tuition source. Books, provider checkout taxes and individual fees are separate from course-credit eligibility.'];
 modelFields.curriculumSections=copy(base.modelFields.curriculumSections).filter(section=>!section.id.includes('-required')&&!section.id.includes('-selected')).map(section=>({...section,id:section.id.replace('tesu-accounting-','tesu-'+slug+'-'),sourceId:degreeSource.id}));
 const policies={oneAwardPerSourceCourse:{value:true,sourceIds:['tesu-liberal-taxonomy-placement-2026-11-26'],quotes:[{sourceId:'tesu-liberal-taxonomy-placement-2026-11-26',text:'Some courses can be used to satisfy requirements in more than one category, but each course may only be used once in a degree.'}]}};
 const modelSourceIds=unique([degreeSource.id,...sourceRefs({requirements,modelFields,policies}).map(ref=>ref.id)]);
 return {requirements,modelFields,modelSourceIds,policies};
}
