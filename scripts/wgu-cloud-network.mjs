/** Four separately reviewed current WGU Cloud and Network Engineering tracks. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {buildPrograms} from './wgu-agreement-ledgers.mjs';
import {validateWguProgramReview} from './wgu-data-analytics.mjs';
import {root,stringifyKit,isMain} from './pathway-factory/lib.mjs';

export const PAGE='https://www.wgu.edu/online-it-degrees/cloud-network-engineering-bachelors-program.html';
export const PROGRAMS=[
  {slug:'cloud-network-engineering-general-bs',code:'BSCNE',programId:246,catalog:'202608',college:'IT'},
  {slug:'cloud-network-engineering-aws-bs',code:'BSCNEAWS',programId:247,catalog:'202608',college:'IT'},
  {slug:'cloud-network-engineering-cisco-bs',code:'BSCNECIS',programId:248,catalog:'202608',college:'IT'},
  {slug:'cloud-network-engineering-azure-bs',code:'BSCNEAZR',programId:249,catalog:'202608',college:'IT'}
];
const tracks={BSCNE:'General',BSCNEAWS:'Amazon Web Services',BSCNECIS:'Cisco',BSCNEAZR:'Microsoft Azure'};
export const routes=PROGRAMS.map(program=>({id:'wgu-bs-'+program.slug.replace(/-bs$/,'')+'-reviewed',school:'Western Governors University',title:'Cloud and Network Engineering – B.S. ('+tracks[program.code]+')',level:'bachelor',modalities:['online'],url:PAGE}));
export const REVIEW_PATH='content/pathway-kits/wgu/reviews/cloud-network-family-2026-11-25.json';
const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));

export async function validateCloudNetworkReview(review){
  assert.equal(review.version,1);assert.equal(review.id,'wgu-cloud-network-family-2026-11-25');assert.equal(review.checkedOn,'2026-11-25');assert.equal(review.programs.length,4);
  assert.deepEqual(review.programs.map(program=>program.program),PROGRAMS);
  for(const item of review.programs){
    const program=PROGRAMS.find(program=>program.code===item.program.code);
    await validateWguProgramReview(item,{program,reviewId:'wgu-'+program.code.toLowerCase()+'-exact-program-review-2026-11-25',pageUrl:PAGE});
    assert.equal(item.capstoneCourseCodes.length,1,'Each track needs its own named, nontransferable capstone');
  }
  const page=review.programs[0].captures.find(source=>source.role==='program-page'),body=await readFile(resolve(root,page.capture),'utf8');
  for(const track of ['General Track','AWS Track','Azure Track','Cisco Track'])assert(body.includes(track));
  assert(/3,?925/.test(body)&&/Resources Fee/.test(body)&&/200/.test(body)&&/6.month term/i.test(body));
  assert(/all-online program/.test(body)&&/no limit on the number of units you can complete each term/.test(body),'CBE acceleration needs actual source-supported format and pace, not a label alone');
  assert(/high school diploma/.test(body)&&/2\.25/.test(body)&&/2\.75/.test(body)&&/300 level or higher/.test(body));
  return review;
}

export async function buildCloudNetwork({check=false}={}){
  const review=await validateCloudNetworkReview(await read(REVIEW_PATH)),seeds={},captureReviews={};
  for(const item of review.programs){
    const program=item.program,route=routes.find(route=>route.id==='wgu-bs-'+program.slug.replace(/-bs$/,'')+'-reviewed'),page=item.captures.find(source=>source.role==='program-page'),sourceId='wgu-'+program.code.toLowerCase()+'-program-page-20261125';
    for(const source of item.captures){assert(!captureReviews[source.url]||captureReviews[source.url]===source.sha256);captureReviews[source.url]=source.sha256;}
    seeds[program.slug]={modelId:'curriculum-'+route.id,routeIds:[route.id],title:route.title,
      modelFields:{pricing:{model:'subscription',amount:4125,tuitionPerTerm:3925,resourceFeePerTerm:200,includesResourceFee:true,period:'6 months',currency:'USD',sourceUrl:PAGE,sourceIds:[sourceId],checkedOn:review.checkedOn,notes:['The official family page separately lists all four named tracks at the same published tuition. The term basket includes the mandatory resource fee; provider charges and other applicable fees remain separate. No complete degree-price or finish-time quote is asserted.']}},
      supplementalSources:[{id:sourceId,title:'WGU Cloud and Network Engineering: four explicit tracks, six-month tuition, resource fee, all-online competency pace and admission routes',url:PAGE,kind:'university',roles:['pricing','admissions','learning-format'],checked:review.checkedOn,capture:page.capture,scope:{schoolName:route.school,programName:route.title,programId:program.programId,programCode:program.code,level:'bachelor',modality:'online',catalogYear:program.catalog},reviewedFacts:{tuitionPerTerm:3925,resourceFeePerTerm:200,period:'6 months',allOnline:true,noLimitOnUnitsPerTerm:true,track:tracks[program.code]}}],
      additionalResearchNotices:[{owner:'student',status:'personal-task',message:'Confirm personal admission and catalog eligibility. The published family requirements call for a high school diploma or equivalent plus one readiness route: college coursework with at least2.25GPA, an accredited prior associate or bachelor degree, a transferable IT certification, high school transcripts with at least2.75GPA, or prior IT coursework at300level or higher.',sourceIds:[sourceId]}]};
  }
  const study=review.programs[0].captures.find(source=>source.provider==='Study.com'),studyReview={id:review.id,checkedOn:review.checkedOn,provider:'Study.com',agreementId:study.agreementId,agreementRecordVersion:study.agreementRecordVersion,sourceSha256:study.sha256,scope:{programs:PROGRAMS.map(program=>({programId:program.programId,programCode:program.code,catalog:program.catalog}))}};
  const result=await buildPrograms({check,configs:PROGRAMS,review:{id:review.id,checkedOn:review.checkedOn,reviewer:'Codex (four exact current Cloud and Network Engineering track ledgers and receiving maps)'},seeds,studyReview,captureReviews});
  const path=resolve(root,'content/pathway-kits/wgu/school.json'),school=await read('content/pathway-kits/wgu/school.json'),published=school.publish.documents.find(document=>document.path==='content/curricula/wgu-pathway-kit.json');
  for(const program of PROGRAMS)if(!school.programOrder.includes(program.slug))school.programOrder.push(program.slug);
  for(const route of routes){if(!school.routes.some(existing=>existing.id===route.id))school.routes.push(route);if(!published.routes.some(existing=>existing.id===route.id))published.routes.push(route);}
  for(const program of PROGRAMS)if(!published.programs.includes(program.slug))published.programs.push(program.slug);
  const text=stringifyKit(school)+'\n';if(check)assert.equal(await readFile(path,'utf8'),text,'Publish all four exact track routes');else await writeFile(path,text);
  if(check)assert.deepEqual(result.stale,[],'Regenerate the separately reviewed track plans');return result;
}
if(isMain(import.meta))console.log(JSON.stringify(await buildCloudNetwork({check:process.argv.includes('--check')}),null,1));
