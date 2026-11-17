/* Reviewed provider-published SNHU mappings supplement the separate degree ledger.
 * Run after import-umpi-snhu-curricula.py. --check validates without writing. */
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=resolve(import.meta.dirname,'..');
export const checkedOn='2026-11-11';
export const reviewId='snhu-provider-evidence-2026-11-11';
const clone=value=>JSON.parse(JSON.stringify(value));
const key=value=>String(value||'').replace(/[^a-z0-9]/gi,'').toUpperCase();
const partner='https://study.com/college/school/southern-new-hampshire-university/general-education-collection.html';
const sophia='https://snhu.sophia.org/';
const transfer='https://www.snhu.edu/admission/transferring-credits';
const tuition='https://www.snhu.edu/tuition-and-financial-aid/online';
const policyId='snhu-online-transfer-policy-current';
const tuitionId='snhu-online-undergraduate-tuition-2026-27';
const tableId='snhu-study-provider-current';
const sourceId=code=>'snhu-provider-course-'+code.toLowerCase();
const caveat='Provider-published equivalency checked on '+checkedOn+'. Confirm the applicable SNHU catalog, current course version, completion date, duplicate learning, and individual degree allocation before enrolling. This is conditional planning evidence; no individual student award is asserted.';
const gradeNote='SNHU requires C- or better for incoming course transfer. Provider pass grades and missing grades require SNHU evaluation; they are not converted into a letter grade or an official award here.';

// Source and receiving quantities are independent reviewed facts. The six Study
// mappings are transcribed from the provider's SNHU table, not inferred from a
// source title. Individual course pages establish source ACE identities/credits.
export const mappings=[
  {provider:'Study.com',code:'SDCM-0057',providerCourseCode:'English 104',title:'College Composition I',receivingCode:'ENG130',sourceCredits:3,credits:3,courseUrl:'https://study.com/academy/course/college-composition-writing-course.html'},
  {provider:'Study.com',code:'SDCM-0089',providerCourseCode:'English 105',title:'College Composition II',receivingCode:'ENG190',sourceCredits:3,credits:3,courseUrl:'https://study.com/academy/course/english-105-college-composition-ii.html'},
  {provider:'Study.com',code:'SDCM-0161',providerCourseCode:'Philosophy 103',title:'Ethics - Theory & Practice',receivingCode:'PHL212',sourceCredits:3,credits:3,courseUrl:'https://study.com/academy/course/philosophy-103-ethics-theory-practice.html'},
  {provider:'Study.com',code:'SDCM-0068',providerCourseCode:'Statistics 101',title:'Principles of Statistics',receivingCode:'MAT240',sourceCredits:3,credits:3,courseUrl:'https://study.com/academy/course/statistics-course.html'},
  {provider:'Study.com',code:'SDCM-0069',providerCourseCode:'Economics 101',title:'Principles of Microeconomics',receivingCode:'ECO201',sourceCredits:3,credits:3,courseUrl:'https://study.com/academy/course/microeconomics-course.html',quantityUrl:'https://www.acenet.edu/National-Guide/Pages/Course.aspx?cid=75ea2d86-83f1-f011-8406-6045bd02b4cc&oid=82099b28-9016-e811-810f-5065f38bf0e1&org=Study.com%2C+LLC'},
  {provider:'Study.com',code:'SDCM-0060',providerCourseCode:'Economics 102',title:'Macroeconomics',receivingCode:'ECO202',sourceCredits:3,credits:3,courseUrl:'https://study.com/academy/course/macroeconomics-course.html'},
  {provider:'Sophia',code:'SOPH-0050',providerCourseCode:'ENG1010',title:'Workplace Writing I',receivingCode:'ENG130',sourceCredits:3,credits:3,courseUrl:sophia+'online-courses/workplace-writing-i',duplicateNote:'Sophia says students who have already taken English Composition I should not enroll in Workplace Writing I. These are alternatives for the same ENG130 award.'},
  {provider:'Sophia',code:'SOPH-0049',providerCourseCode:'ENG1020',title:'Workplace Writing II',receivingCode:'ENG190',sourceCredits:3,credits:3,courseUrl:sophia+'online-courses/workplace-writing-ii',duplicateNote:'Sophia says students who have already taken English Composition II should not enroll in Workplace Writing II. These are alternatives for the same ENG190 award.'},
  {provider:'Sophia',code:'SOPH-0055',providerCourseCode:'MATH1020',title:'Introduction to College Mathematics',receivingCode:'MAT136',sourceCredits:3,credits:3,courseUrl:sophia+'online-courses/introduction-to-college-mathematics-2'},
  {provider:'Sophia',code:'SOPH-0065',providerCourseCode:'PHIL1005',title:'Critical Thinking',receivingCode:'PHL111',sourceCredits:3,credits:3,courseUrl:sophia+'online-courses/critical-thinking-2'},
];

export const sources=[
  {id:policyId,title:'SNHU current online undergraduate transfer grades and institutional residency',url:transfer,checked:checkedOn,evidenceType:'official-university-policy',scope:'Incoming undergraduate transfer minimum C-; 90-credit transfer ceiling; 30 SNHU credits including 12 in the major.'},
  {id:tuitionId,title:'SNHU official 2026–27 online undergraduate tuition',url:tuition,checked:checkedOn,evidenceType:'official-university-tuition',scope:'General online undergraduate rate of $354 per credit; individual discounts, materials, fees and future rate changes require a student quote.'},
  {id:tableId,title:'Study.com provider-published SNHU general education equivalencies',url:partner,checked:checkedOn,evidenceType:'provider-published-equivalency',scope:'Named SNHU awards only. The provider page is not a receiving-school evaluation or a statement that every SNHU catalog uses these courses.'},
  ...mappings.map(mapping=>({id:sourceId(mapping.code),title:mapping.provider+' '+mapping.providerCourseCode+' source identity and credit evidence',url:mapping.quantityUrl||mapping.courseUrl,checked:checkedOn,evidenceType:mapping.quantityUrl?'source-credit-recommendation':'provider-course-identity-and-credits',scope:'Original source-course identity and semester-credit quantity, independent of SNHU degree placement.'})),
];

function providerOption(mapping){
  const identityId=sourceId(mapping.code),mappingSource=mapping.provider==='Sophia'?'snhu-sophia-current':tableId;
  return {
    id:(mapping.provider==='Sophia'?'sophia-':'studycom-')+mapping.code.toLowerCase(),
    provider:mapping.provider,code:mapping.code,providerCourseCode:mapping.providerCourseCode,
    codeAliases:[mapping.providerCourseCode],identitySourceIds:[identityId],codeAliasEvidence:[{alias:mapping.providerCourseCode,sourceIds:[identityId]}],
    title:mapping.title,sourceCredits:mapping.sourceCredits,sourceCreditSystem:'semester',credits:mapping.credits,creditSystem:'semester',creditOrigin:'ace',
    receivingCode:mapping.receivingCode,upper:false,sourceIds:[mappingSource,identityId],url:mapping.provider==='Sophia'?sophia:partner,courseUrl:mapping.courseUrl,
    evidence:'conditional',evidenceOrigin:'provider-published-equivalency',mappingChecked:checkedOn,mappingReviewId:reviewId,
    mappingScope:'Exact provider-published SNHU receiving-course award. Degree placement is limited to the separately sourced named requirement or its existing published category allocation.',
    conditions:[caveat,...(mapping.duplicateNote?[mapping.duplicateNote]:[])],
  };
}

// A category is eligible only if its existing researched menu already contains
// this exact SNHU course. No new placement is inferred from titles or subjects.
export function reviewedOptions(requirement){
  if(requirement.institutionalOnly)return [];
  const awards=new Set([requirement.code,...(requirement.options||[]).map(option=>option.receivingCode)].map(key));
  return mappings.filter(mapping=>mapping.credits===requirement.credits&&awards.has(key(mapping.receivingCode))).map(mapping=>{
    const option=providerOption(mapping);
    if(key(requirement.code)!==key(mapping.receivingCode))option.conditions.push('Proposed placement in the independently published category already containing '+mapping.receivingCode+'; confirm the exact allocation with SNHU and count the receiving course only once.');
    return option;
  });
}

export function supplementDocument(input){
  const document=clone(input);
  document.sources=document.sources||[];
  const SophiaSource=document.sources.find(source=>source.id==='snhu-sophia-current');
  if(SophiaSource)Object.assign(SophiaSource,{title:'Sophia provider-published SNHU transfer-equivalency table',checked:checkedOn,evidenceType:'provider-published-equivalency',scope:'Provider-published named SNHU awards; current SNHU catalog, course version, completion date and individual evaluation control applicability.'});
  for(const source of sources){const index=document.sources.findIndex(item=>item.id===source.id);if(index<0)document.sources.push(clone(source));else document.sources[index]=clone(source);}
  for(const model of document.models){
    assert.equal(model.school,'Southern New Hampshire University');
    const policySourceId=policyId;
    model.transferGradePolicy={minimumGrade:'C-',scope:'incoming-transfer',sourceIds:[policySourceId],checked:checkedOn,detail:gradeNote};
    model.majorMinInstitutionCredits=12;
    model.majorResidencySourceIds=[policyId];
    if(model.format==='Online'&&model.level==='bachelor')model.pricing={...(model.pricing||{}),model:'per-credit',amount:354,period:'credit',currency:'USD',sourceUrl:tuition,sourceIds:[tuitionId],checkedOn,notes:['General published 2026–27 online undergraduate tuition. Student-specific quotes, aid and eligible discounts may differ.','Tuition only. The source lists a $100 conferral fee and variable course materials; applicable remaining fees and materials are not assumed to be zero.']};
    for(const requirement of model.requirements){
      const additions=reviewedOptions(requirement),identities=new Set(additions.map(option=>option.provider+'|'+option.code));
      requirement.options=[...(requirement.options||[]).filter(option=>!identities.has(option.provider+'|'+option.code)),...additions];
      for(const option of requirement.options){
        if(option.provider==='University')continue;
        option.minimumTransferGrade='C-';option.minimumTransferGradeSourceIds=[policySourceId];
        option.conditions=[...new Set([...(option.conditions||[]),caveat,gradeNote])];
        // The original menu used a Sophia-hosted table. Preserve that provenance
        // rather than describing it as an individual or university-issued award.
        if(option.sourceIds?.includes('snhu-sophia-current')){
          option.evidence='conditional';option.evidenceOrigin='provider-published-equivalency';option.mappingChecked=checkedOn;
        }
      }
    }
    model.rulesNotes=(model.rulesNotes||[]).map(note=>note.startsWith('Published Sophia equivalencies are school awards;')?'Provider-published Sophia equivalencies identify proposed SNHU course awards; current catalog, duplicate learning and individual evaluation determine degree applicability.':note);
    const residencyNote='Current SNHU policy requires 30 institutional credits, including at least 12 within the major. Incoming transfer grades must be C- or better; this is not an institutional completion-grade minimum.';
    if(!model.rulesNotes.includes(residencyNote))model.rulesNotes.push(residencyNote);
    model.transferEvidenceCheckedOn=checkedOn;
  }
  document.checkedOn=checkedOn;
  return document;
}

export async function run({check=false}={}){
  const path=resolve(root,'content/curricula/snhu.json'),original=JSON.parse(await readFile(path,'utf8')),document=supplementDocument(original);
  if(check)assert.deepEqual(original,document,'SNHU source needs scripts/add-snhu-transfer-evidence.mjs');
  else await writeFile(path,JSON.stringify(document,null,2)+'\n');
  const placements=document.models.flatMap(model=>model.requirements.flatMap(row=>row.options||[]));
  const reviewed=placements.filter(option=>option.mappingReviewId===reviewId);
  return {models:document.models.length,externalPlacements:placements.filter(option=>option.provider!=='University').length,reviewedPlacements:reviewed.length,reviewedProviderCourses:new Set(reviewed.map(option=>option.provider+'|'+option.code)).size,studyPlacements:reviewed.filter(option=>option.provider==='Study.com').length,checkedOn,check};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(await run({check:process.argv.includes('--check')})));
