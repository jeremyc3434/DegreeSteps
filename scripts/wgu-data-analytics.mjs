/** Exact-program BSDA expansion; does not revise the twenty retained WGU plans. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {buildPrograms} from './wgu-agreement-ledgers.mjs';
import {root,isMain,stringifyKit} from './pathway-factory/lib.mjs';
import {registerDataAnalyticsIdentities} from './wgu-data-analytics-identities.mjs';

export const REVIEW_PATH='content/pathway-kits/wgu/reviews/data-analytics-2026-11-25.json';
export const PROGRAM={slug:'data-analytics-bs',code:'BSDA',programId:92,catalog:'202309',college:'IT'};
export const ROUTE={id:'wgu-bs-data-analytics-reviewed',school:'Western Governors University',title:'Data Analytics – B.S.',level:'bachelor',modalities:['online'],url:'https://www.wgu.edu/online-it-degrees/data-analytics-bachelors-program.html'};
const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const hash=text=>createHash('sha256').update(text).digest('hex');

export async function validateWguProgramReview(review,{program,reviewId,pageUrl,checkedOn='2026-11-25'}={}){
  assert.equal(review.version,1);assert.equal(review.id,reviewId);assert.equal(review.checkedOn,checkedOn);
  assert.deepEqual(review.program,program);
  assert.equal(review.captures.length,8);assert.equal(new Set(review.captures.map(source=>source.url)).size,8);
  for(const role of ['curriculum','guidelines','metadata','program-page'])assert.equal(review.captures.filter(source=>source.role===role).length,1);
  assert.equal(review.captures.filter(source=>source.role==='receiving-map').length,4);
  for(const source of review.captures){
    const body=await readFile(resolve(root,source.capture),'utf8');assert.equal(hash(body),source.sha256,'WGU evidence changed; review the new source explicitly');
    const sidecar=await read(source.capture.replace(/\.txt$/,'.json'));assert.equal(sidecar.url,source.url);assert.equal(sidecar.sha256,source.sha256);assert.equal(sidecar.status,200);
    assert(sidecar.fetchedAt.slice(0,10)<=review.checkedOn);
  }
  const byRole=role=>review.captures.find(source=>source.role===role);
  const api='https://marketing-api-gateway.wgu.edu/partner/v1/public/';
  assert.equal(byRole('curriculum').url,api+'program-data?pamsCodes='+program.code+'%3B'+program.catalog);assert.equal(byRole('guidelines').url,api+'transfer-guidelines/programs?programsCode='+program.programId);assert.equal(byRole('metadata').url,api+'program/college/IT');assert.equal(byRole('program-page').url,pageUrl);
  const ledger=JSON.parse(await readFile(resolve(root,byRole('curriculum').capture),'utf8'))[0].courses;
  assert(ledger.length>0&&ledger.every(row=>row.programCode===program.code&&row.catalogTerm===program.catalog));
  assert.equal(ledger.length,review.requirements);assert.equal(ledger.reduce((sum,row)=>sum+Number(row.competencyUnits),0),review.totalCredits);
  const capstones=ledger.filter(row=>/capstone/i.test(row.courseName));assert.deepEqual(capstones.map(row=>row.courseCode),review.capstoneCourseCodes);
  const guidelines=JSON.parse(await readFile(resolve(root,byRole('guidelines').capture),'utf8'));
  assert(capstones.every(course=>guidelines.some(row=>row.PAMS_bannerCode===course.courseCode&&row.transferArea==='Non-Transferable'&&JSON.parse(row.programs).includes(program.programId))));
  const metadata=JSON.parse(await readFile(resolve(root,byRole('metadata').capture),'utf8')).find(row=>row.id===program.programId);
  assert(metadata&&metadata.pamsProgramCode===program.code&&metadata.catalogTerm===program.catalog&&metadata.recordVersion===review.programRecordVersion&&metadata.inactiveProgram===0&&metadata.approvalStatus==='Approved');
  for(const source of review.captures.filter(source=>source.role==='receiving-map')){
    assert.equal(source.agreementId,({Sophia:7110,'Study.com':4424,StraighterLine:547,Saylor:671})[source.provider]);assert.equal(source.url,api+'partner-agreement/'+source.agreementId);
    const agreement=JSON.parse(await readFile(resolve(root,source.capture),'utf8'));
    assert.equal(agreement.id,source.agreementId);assert.equal(agreement.recordVersion,source.agreementRecordVersion);
    assert.equal(agreement.published,true);assert.equal(agreement.status,'APPROVED');assert.equal(agreement.college.code,'IT');assert(JSON.parse(agreement.agreementPrograms).includes(program.programId));
    assert(agreement.agreementPathways.some(pathway=>pathway.pathwayMappings.some(mapping=>mapping.program.id===program.programId&&mapping.program.pamsProgramCode===program.code)),'Other WGU programs cannot establish this exact receiving award');
  }
  return review;
}
export const validateDataAnalyticsReview=review=>validateWguProgramReview(review,{program:PROGRAM,reviewId:'wgu-bsda-exact-program-review-2026-11-25',pageUrl:ROUTE.url});

export async function buildDataAnalytics({check=false}={}){
  const identities=await registerDataAnalyticsIdentities({check});
  const review=await validateDataAnalyticsReview(await read(REVIEW_PATH)),page=review.captures.find(source=>source.role==='program-page');
  const pageText=await readFile(resolve(root,page.capture),'utf8');
  assert(/3,?925/.test(pageText)&&/200/.test(pageText)&&/6.month term/i.test(pageText),'Review the program-specific six-month tuition and resource fee');
  const sourceId='wgu-bsda-program-page-20261125';
  const seed={modelId:'curriculum-wgu-bs-data-analytics-reviewed',routeIds:[ROUTE.id],title:ROUTE.title,transferNotices:'reviewed-options-with-coverage-caveat',
    modelFields:{pricing:{model:'subscription',amount:4125,tuitionPerTerm:3925,resourceFeePerTerm:200,includesResourceFee:true,period:'6 months',currency:'USD',sourceUrl:page.url,sourceIds:[sourceId],checkedOn:review.checkedOn,notes:['Published six-month tuition and mandatory resource fee. Provider charges and any other applicable fees remain separate; this is not a quoted total degree cost.']}},
    supplementalSources:[{id:sourceId,title:'WGU Data Analytics: six-month tuition, resource fee, online format and admission routes',url:page.url,kind:'university',roles:['pricing','admissions'],checked:review.checkedOn,capture:page.capture,scope:{schoolName:ROUTE.school,programName:ROUTE.title,level:'bachelor',modality:'online',catalogYear:PROGRAM.catalog}}],
    additionalResearchNotices:[{owner:'student',status:'personal-task',message:'Confirm personal admission and catalog eligibility. WGU requires a high school diploma or equivalent plus one published readiness route: qualifying college GPA, an accredited prior degree, a transferable IT certification, qualifying high school GPA, or prior IT coursework at the required level.',sourceIds:[sourceId]}]};
  const study=review.captures.find(source=>source.provider==='Study.com');
  const studyReview={id:review.id,checkedOn:review.checkedOn,provider:'Study.com',agreementId:study.agreementId,agreementRecordVersion:study.agreementRecordVersion,sourceSha256:study.sha256,scope:{programs:[{programId:92,programCode:'BSDA',catalog:'202309'}]}};
  const result=await buildPrograms({check,configs:[PROGRAM],review:{id:review.id,checkedOn:review.checkedOn,reviewer:'Codex (exact Data Analytics curriculum, policy and receiving-agreement review)'},seeds:{[PROGRAM.slug]:seed},studyReview,captureReviews:Object.fromEntries(review.captures.map(source=>[source.url,source.sha256])),identityOverrides:identities.overrides});
  const path=resolve(root,'content/pathway-kits/wgu/school.json'),school=await read('content/pathway-kits/wgu/school.json');
  if(!school.programOrder.includes(PROGRAM.slug))school.programOrder.push(PROGRAM.slug);
  if(!school.routes.some(route=>route.id===ROUTE.id))school.routes.push(ROUTE);
  const published=school.publish.documents.find(document=>document.path==='content/curricula/wgu-pathway-kit.json');
  if(!published.programs.includes(PROGRAM.slug))published.programs.push(PROGRAM.slug);
  if(!published.routes.some(route=>route.id===ROUTE.id))published.routes.push(ROUTE);
  const text=stringifyKit(school)+'\n';
  if(check)assert.equal(await readFile(path,'utf8'),text,'Publish the exact BSDA route in the WGU kit');else await writeFile(path,text);
  if(check)assert.deepEqual(result.stale,[],'Regenerate the reviewed BSDA kit');
  return result;
}
if(isMain(import.meta))console.log(JSON.stringify(await buildDataAnalytics({check:process.argv.includes('--check')}),null,1));
