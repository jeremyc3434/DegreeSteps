/** Exact Healthcare Management source review. No outside awards or publication decisions. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {root,isMain} from './pathway-factory/lib.mjs';
import {validateConnectedWebCapture} from './pathway-factory/connected-web.mjs';
import {assertTESUBusinessBlockEvidence} from './tesu-business-blocks.mjs';

export const HEALTHCARE_PACKET='content/pathway-kits/tesu/healthcare-management-review-2026-11-27.json';
export const HEALTHCARE_SOURCE_INDEX='content/pathway-kits/tesu/healthcare-management-course-sources-2026-11-27.json';
export const HEALTHCARE_REVIEW_DATE='2026-11-27';
export const HEALTHCARE_AREA=Object.freeze([
 ['HCM-3070','Principles of Healthcare Management'],
 ['HCM-3080','Healthcare Legal and Ethical Considerations'],
 ['HCM-3530','Comparative Healthcare Systems'],
 ['HCM-4040','Healthcare Quality and Outcomes: Measurement and Management'],
 ['HCM-4050','The Financing and Economics of Healthcare Delivery'],
 ['HCM-4060','Human Resources Management for Healthcare Organizations']
]);
const hash=value=>createHash('sha256').update(value).digest('hex');
const norm=value=>String(value||'').replace(/\s+/g,' ').trim();
const read=async file=>JSON.parse(await readFile(resolve(root,file),'utf8'));

export function assertHealthcareCourseBody(course,body){
 assert(HEALTHCARE_AREA.some(([code,title])=>code===course.code&&title===course.title),'Only exact current Healthcare Management area courses are reviewed');
 assert.equal(course.credits,3);assert.equal(course.upper,true);
 assert.equal(body.split('\n')[0],course.code+' '+course.title,'The actual primary heading establishes the exact course identity');
 assert(/\bCredits\s+3\b/.test(body),'The course has three original university credits');
 assert.equal(/^Prerequisites?\s*:?(?:\s|$)/im.test(body),false,'A new formal prerequisite must be researched, not ignored');
 assert.deepEqual(course.prerequisites,[]);assert.deepEqual(course.deliveryMethods,['Online']);
 const delivery=norm(body).match(/\bDelivery Methods\s+([\s\S]*?)(?=\bExample Syllabus Link\b|\bSemester Offered\b|$)/)?.[1]?.trim();
 assert.equal(delivery,'Online','Preserve the actual online delivery instead of inferring self-paced or no-proctor');
 return true;
}

async function assertRetainedSource(source){
 assert.equal(source.kind,'university');assert.equal(source.checked,HEALTHCARE_REVIEW_DATE);
 assert.equal(new URL(source.url).hostname,'tesu.smartcatalogiq.com');
 const body=await readFile(resolve(root,source.capture),'utf8'),meta=await read(source.capture.replace(/\.txt$/,'.json'));
 assert.equal(hash(body),source.sha256);assert.equal(meta.sha256,source.sha256);assert.equal(source.sourceContentHash,source.sha256);
 assert.equal(meta.url,source.url);assert.equal(meta.status,null);assert(meta.fetchedAt.slice(0,10)<=source.checked);
 assert.deepEqual(meta.toolResponseReceipt,source.toolResponseReceipt,'The academic review pins the actual raw tool receipt');
 await validateConnectedWebCapture({...meta,text:body});
 return body;
}

export async function reviewHealthcareSources(){
 const packet=await read(HEALTHCARE_PACKET),index=await read(HEALTHCARE_SOURCE_INDEX);
 assert.equal(packet.checkedOn,HEALTHCARE_REVIEW_DATE);assert.equal(index.checkedOn,HEALTHCARE_REVIEW_DATE);assert.equal(packet.spec.slug,'bs-healthcare-management');assert.equal(packet.spec.title,'B.S. in Healthcare Management');
 assert.deepEqual(packet.spec.areaCourses,HEALTHCARE_AREA);assert.equal(packet.spec.requiredCount,6);
 assert.deepEqual(packet.courses,index.courses);assert.equal(packet.courses.length,6);
 assert.deepEqual(packet.courses.map(course=>[course.code,course.title]),HEALTHCARE_AREA);
 assert.equal(packet.degreeSource.url,'https://tesu.smartcatalogiq.com/en/current/undergraduate-catalog/degree-programs-and-certificates/bachelor-of-science-in-business-administration/bs-in-healthcare-management/');
 const body=await assertRetainedSource(packet.degreeSource),base=await read('content/pathway-kits/tesu/programs/bsba-accounting.json');
 assert(body.startsWith('B.S. in Healthcare Management\n'));
 assertTESUBusinessBlockEvidence(body,base.requirements.filter(row=>row.category==='general'||row.group==='business-core'||row.freeElective));
 const area=norm(body).split('III. Area of Study (18 Credits)')[1]?.split('IV. Electives (15 Credits)')[0];assert(area,'The exact major boundary is present');
 const codes=[...area.matchAll(/\bHCM-\d{4}\b/g)].map(match=>match[0]);assert.deepEqual(codes,HEALTHCARE_AREA.map(([code])=>code));
 for(const course of packet.courses){assert(area.includes(norm(course.code+' '+course.title+' 3')));const courseBody=await assertRetainedSource(course.source);assertHealthcareCourseBody(course,courseBody);}
 return{program:'curriculum-tesu-bs-healthcare-management',degreeSources:1,courseSources:6,majorCredits:18,totalCredits:120,outsideAwardsCreated:0,publicationDecisions:0,reviewedOn:HEALTHCARE_REVIEW_DATE};
}
if(isMain(import.meta))console.log(JSON.stringify(await reviewHealthcareSources()));
