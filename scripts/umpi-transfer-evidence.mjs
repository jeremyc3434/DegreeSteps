/** Review current linked UMPI transfer evidence without inventing degree placements. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {root,isMain} from './pathway-factory/lib.mjs';

export const packetPath='content/pathway-kits/umpi/undergraduate-transfer-evidence-2026-11-26.json';
const checkedOn='2026-11-26',normalize=value=>String(value||'').replace(/\s+/g,' ').trim();
const definitions=[
 ['umpi-current-cpl-policy-20261126','efd09c53daa3c7ab','https://www.umpi.edu/academics/credit-for-prior-learning/',['credit-policy']],
 ['umpi-current-ace-cpl-policy-20261126','caf4cdebcf6395c9','https://www.umpi.edu/academics/credit-for-prior-learning/ace/',['credit-policy']],
 ['umpi-current-transfer-policy-20261126','401dcc039f07b563','https://www.umpi.edu/offices/student-records/transfer-credits/',['transfer-policy']],
 ['umpi-current-linked-clep-page-20261126','4669a7eddfa954c6','https://www.umpi.edu/offices/testing-services/clep/',['receiving-guide-link']],
 ['umpi-linked-clep-award-table-20261126','db7f4ad89ab5b3ce','https://mycampus.maine.edu/c/document_library/get_file?groupId=223854&uuid=5b90d446-d584-4906-86df-7d04f6799581',['receiving-course-awards']],
 ['umpi-yourpace-faq-retained-20261125','dcdb80a8ff024f38','https://www.umpi.edu/yourpace/faqs/',['residency-policy']]
];
// Exact receiving table labels. Original provider recommendations are deliberately
// not populated from these university-awarded quantities.
const awardRows=[
 ['CLEP-0003','Humanities',3,[], 'General Elective Credit',50,'Humanities 3 General Elective Credit 50'],
 ['CLEP-0004','College Mathematics',6,[], 'Math Elective',50,'College Mathematics 6 Math Elective 50'],
 ['CLEP-0007','American Government',3,['POS 101'],null,50,'American Government 3 POS101 50'],
 ['CLEP-0008','History of the United States I: Early Colonization to 1877',3,['HTY 161'],null,50,'U. S. History I 3 HTY161 50'],
 ['CLEP-0009','History of the United States II: 1865 to the Present',3,['HTY 162'],null,50,'U. S. History II 3 HTY162 50'],
 ['CLEP-0011','Analyzing and Interpreting Literature',3,['ENG 151'],null,50,'Analysis & Interpretation of 3 ENG 151 50 Literature'],
 ['CLEP-0013','College Algebra',3,['MAT 117'],null,50,'College Algebra 3 MAT117 50'],
 ['CLEP-0020','Introductory Psychology',3,['PSY 100'],null,50,'Introductory Psychology 3 PSY100 50'],
 ['CLEP-0021','Human Growth and Development',3,['PSY 205'],null,50,'Human Growth & Development 3 PSY205 50'],
 ['CLEP-0025','Introductory Business Law',3,['BUS 350'],null,50,'Introductory Business Law 3 BUS350 50'],
 ['CLEP-0026','Introductory Sociology',3,['SOC 100'],null,50,'Introduction to Sociology 3 SOC100 50'],
 ['CLEP-0027','Principles of Macroeconomics',3,['ECO 207'],null,50,'Principles of Macroeconomics 3 ECO207 50'],
 ['CLEP-0028','Principles of Management',3,[], 'Business Elective',50,'Principles of Management 3 Business Elective 50'],
 ['CLEP-0029','Principles of Marketing',3,['BUS 330'],null,50,'Principles of Marketing 3 BUS330 50'],
 ['CLEP-0030','Principles of Microeconomics',3,['ECO 207'],null,50,'Principles of Microeconomics 3 ECO207 50'],
 ['CLEP-0038','Calculus',4,['MAT 131'],null,50,'Calculus 4 MAT131 50'],
 ['CLEP-0039','Financial Accounting',3,['BUS 150'],null,50,'Financial Accounting 3 BUS150 50'],
 ['CLEP-0040','College Composition',6,['ENG 101','ENG 121'],null,50,'College Composition 6 ENG 101 and ENG 121 50'],
 ['CLEP-0041','College Composition Modular',3,['ENG 101'],null,50,'College Composition Modular 3 ENG 101 50']
];
export async function buildUMPITransferEvidence(){
 const bodies=new Map(),sources=[];
 for(const[id,stem,url,roles]of definitions){
  const capture='content/source-captures/'+stem+'.txt',body=await readFile(resolve(root,capture),'utf8'),meta=JSON.parse(await readFile(resolve(root,capture.replace(/\.txt$/,'.json')),'utf8'));
  assert.equal(meta.url,url);assert.equal(meta.status,200);assert.equal(createHash('sha256').update(body).digest('hex'),meta.sha256);
  const fetchedDate=meta.fetchedAt.slice(0,10);assert(fetchedDate<=checkedOn);
  sources.push({id,url,kind:'university',publisher:'University of Maine at Presque Isle',roles,capture,sha256:meta.sha256,checkedOn:fetchedDate,reviewedOn:checkedOn,...(stem==='db7f4ad89ab5b3ce'?{documentPeriod:null,scope:'Undated university receiving table linked by the current official CLEP page. A current link is not an inferred catalog edition or YourPace-specific placement.'}:{})});
  bodies.set(id,normalize(body));
 }
 const quote=(sourceId,text)=>{assert(bodies.get(sourceId)?.includes(normalize(text)),sourceId+': missing exact retained source quotation');return{sourceId,text};};
 const cpl='umpi-current-cpl-policy-20261126',ace='umpi-current-ace-cpl-policy-20261126',faq='umpi-yourpace-faq-retained-20261125',table='umpi-linked-clep-award-table-20261126';
 const facts=[
  {id:'published-general-bachelor-cpl-cap',value:30,creditSystem:'semester',scope:'Published general CPL policy; current YourPace alternative-course classification or catalog exception remains unresolved.',applicationResolved:false,quotes:[quote(cpl,'Students in Bachelor’s degree programs may earn a maximum of 30 credits.'),quote(cpl,'the combination of all forms of Credit for Prior Learning cannot exceed a total of 15 credits of an Associate’s degree and 30 credits of a Bachelor’s degree.')]},
  {id:'ace-classified-as-cpl-on-current-page',value:true,scope:'The current general ACE page directs official ACE records to CPL/PLA consideration. It does not state a YourPace-specific quantitative exception.',quotes:[quote(ace,'submit an official ACE transcript to the UMPI Registrar’s Office for Credit for Prior Learning Assessment (CPL) consideration.')]},
  {id:'published-bachelor-institutional-residency',value:30,creditSystem:'semester',quotes:[quote(faq,'Students must complete at least 30 credit hours through UMPI. At least 12 of these credits must be in the major, and at least 9 of those 12 credits must be at the upper level (300-level or above).')]},
  {id:'outside-credit-floor-is-program-dependent',scope:'The arithmetic outside ceiling is degree total minus the applicable institutional minimum; a 120-credit degree and a 90-credit applied degree must not inherit the same numeric ceiling.',value:null,quotes:[quote(faq,'Transfer credits are evaluated to determine how they apply toward your chosen program and degree requirements.')]}
 ];
 const receivingAwards=awardRows.map(([code,title,credits,receivingCourseCodes,receivingCategory,minScore,text])=>({id:'umpi-clep-'+code.toLowerCase(),provider:'CLEP',sourceCourseCode:code,sourceExamTitle:title,receivingCredits:credits,receivingCreditSystem:'semester',receivingCourseCodes,...(receivingCategory?{receivingCategory}:{}),minScore,universityPublishedAward:true,tableScope:'UMPI current-linked undated CLEP table',catalog:null,programs:[],degreePlacements:[],individualApproval:false,originalSourceCredits:null,originalSourceCreditSystem:null,originalQuantityEvidence:'Separate current original-provider evidence is required; the university receiving amount is not original credit proof.',sourceIds:[table],quotes:[quote(table,text)],...(['CLEP-0027','CLEP-0030'].includes(code)?{sameReceivingCourseGroup:'UMPI:ECO207',duplicateCreditNote:'Macroeconomics and Microeconomics both name ECO207. This does not authorize two separate ECO207 degree awards.'}:{}),...(code==='CLEP-0040'?{allocationNote:'The published six-credit award names ENG101 and ENG121 together; no per-course split or new GLO placement is inferred.'}:{})}));
 const restrictions=[
  {id:'education-certification-clep-section-a',maximumCredits:6,creditSystem:'semester',minimumScore:60,scope:'Education majors pursuing teacher certification; Section A.',quotes:[quote(table,'Education majors pursuing teacher certification should be aware that the State Department of Education (MDOE) has stated that “a maximum of six semester hours of Section A may be met through CLEP Exam(s) with a minimum score of 60 on subject exams.')]},
  {id:'selected-exams-not-guaranteed-requirements',scope:'An administered or accepted exam is not automatic satisfaction of every general-education or major requirement.',quotes:[quote('umpi-current-linked-clep-page-20261126','UMPI accepts only selected CLEP exams.'),quote('umpi-current-linked-clep-page-20261126','Not all CLEP examinations fulfill General Education and/or academic requirements.')]}
 ];
 return{version:1,id:'umpi-undergraduate-transfer-evidence-2026-11-26',checkedOn,schoolId:'umpi',status:'receiving-evidence-reviewed-program-applicability-open',publicationAllowed:false,automaticApprovals:0,degreePlansCreated:0,sources,policyFacts:facts,receivingAwards,restrictions,remainingGates:['Retrieve current governing catalog and resolve evaluated alternative-course versus general CPL scope.','Bind current exact degree and GEC course requirements separately.','Bind independent original provider identities, recommendation versions, periods, credits and units.','Check multi-course and duplicate-learning awards before allocation.']};
}
export async function writeUMPITransferEvidence({check=false}={}){
 const packet=await buildUMPITransferEvidence(),text=JSON.stringify(packet,null,2)+'\n';
 if(check)assert.equal(await readFile(resolve(root,packetPath),'utf8'),text,'Regenerate the reviewed UMPI receiving-evidence packet');else await writeFile(resolve(root,packetPath),text);
 return{review:packet.id,awards:packet.receivingAwards.length,degreePlansCreated:0,automaticApprovals:0,check};
}
if(isMain(import.meta))console.log(JSON.stringify(await writeUMPITransferEvidence({check:process.argv.includes('--check')})));
