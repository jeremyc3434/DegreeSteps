/* Reviewed receiving-school awards, kept separate from degree requirements.
 * Run after import-liberty-curricula.py; --check never writes files. */
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {applyCourseListingIdentities} from './reviewed-course-identities.mjs';
import {applyLibertyCurrentEvidence} from './liberty-current-evidence.mjs';

const root=resolve(import.meta.dirname,'..');
export const checkedOn='2026-11-10';
const clone=value=>JSON.parse(JSON.stringify(value));
const slug=value=>value.toLowerCase().replace(/[^a-z0-9]+/g,'-');
const key=value=>String(value||'').replace(/\s+/g,'').toUpperCase();
const base='https://www.liberty.edu/';
const common='Published receiving-school award; individual credit, duplicate learning, catalog eligibility, and the current provider recommendation version require Liberty evaluation. No student award is asserted.';

export const guides={
  Sophia:{online:['2026-07','online/wp-content/uploads/Sophia-Learning-Transfer-Equivalencies.pdf'],residential:['2026-05','residential/wp-content/uploads/Sophia-Learning-Transfer-Equivalencies.pdf']},
  'Study.com':{online:['2026-05','online/wp-content/uploads/Study.com-Course-Equivalency-Guide.pdf'],residential:['2026-05','residential/wp-content/uploads/Study.com-Transfer-Equivalency-Guide-Finalized.pdf']},
  StraighterLine:{online:['2026-04','online/wp-content/uploads/StraighterLine-Transfer-Equivalencies.pdf'],residential:['2026-04','residential/wp-content/uploads/Straighterline-Transfer-Equivalency-Guide-Finalized.pdf']},
  CLEP:{online:['2025-08','registrar/wp-content/uploads/sites/119/CLEP-Transfer-Equivalency-Guide-Finalized-8.25.25-1.pdf'],residential:['2025-08','registrar/wp-content/uploads/sites/119/CLEP-Transfer-Equivalency-Guide-Finalized-8.25.25-1.pdf']},
};

// Provider, ACE identity, provider course identity, source title, actual receiving
// award, credits, PDF page, explicit additional fulfillment codes (if any).
export const mappings=[
  ['Sophia','SOPH-0015','ENG1001','English Composition I','ENGL 101',3,1],
  ['Sophia','SOPH-0030','ENG1002','English Composition II','ENGL 102',3,1],
  ['Sophia','SOPH-0024','COMM1002','Public Speaking','COMS 101',3,1],
  ['Sophia','SOPH-0009','COMM1005','Visual Communications','ARTS 209',3,1],
  ['Sophia','SOPH-0001','MATH1001','College Algebra','MATH 121',3,1],
  ['Sophia','SOPH-0055','MA1020','Introduction to College Mathematics','MATH 115',3,1],
  ['Sophia','SOPH-0020','PHIL1002','Introduction to Ethics','ETHC 101',3,1],
  ['Sophia','SOPH-0002','SCIE1020','Human Biology','BIOL 102',3,1],
  ['Sophia','SOPH-0073','SCIE1050','Anatomy & Physiology I','BIOL 102',3,1],
  ['Sophia','SOPH-0048','PSYC1010','Intro to Psychology','PSYC 101',3,1],
  ['Sophia','SOPH-0078','HLTH1020','Lifespan Development','PSYC 210',3,1],
  ['Sophia','SOPH-0051','SOCI1010','Introduction to Sociology','SOCI 200',3,1],
  ['Sophia','SOPH-0005','STAT1001','Introduction to Statistics','MATH 201',3,1,['BUSI 230']],
  ['Sophia','SOPH-0071','HIST1020','U.S. Government','GOVT 220',3,1],
  ['Sophia','SOPH-0090','CRIM1001','Intro to Criminal Justice','CJUS 200',3,1],
  ['Sophia','SOPH-0012','ECON1001','Macroeconomics','ECON 214',3,1],
  ['Sophia','SOPH-0011','ECON1002','Microeconomics','ECON 213',3,1],
  ['Sophia','SOPH-0086','BUSI2030','Operations Management','BUSI 411',3,1],
  ['Sophia','SOPH-0083','BUSI2015','Organizational Behavior','BUSI 240',3,1],
  ['Sophia','SOPH-0044','BUSI1060','Personal Finance','BUSI 223',3,1],
  ['Sophia','SOPH-0085','BUSI2020','Principles of Marketing','BUSI 330',3,1],
  ['Sophia','SOPH-0014','BUS1001','Introduction to Business','BUSI 101',3,1,[],{residentialReceivingCode:'BUSI 105'}],
  ['Study.com','SDCM-0057','English 104','College Composition I','ENGL 101',3,2],
  ['Study.com','SDCM-0244','English 204','English Composition I','ENGL 101',3,2],
  ['Study.com','SDCM-0088','English 103','Analyzing and Interpreting Literature','ENGL 102',3,2],
  ['Study.com','SDCM-0089','English 105','College Composition II','ENGL 102',3,2],
  ['Study.com','SDCM-0245','English 205','English Composition II','ENGL 102',3,2],
  ['Study.com','SDCM-0055','Communications 101','Public Speaking','COMS 101',3,1],
  ['Study.com','SDCM-0013','Math 101','College Algebra','MATH 121',3,2],
  ['Study.com','SDCM-0033','Math 105','Precalculus Algebra','MATH 121',3,2],
  ['Study.com','SDCM-0014','Math 102','College Mathematics','MATH 115',3,2],
  ['Study.com','SDCM-0064','Math 107','Quantitative Literacy','MATH 115',3,2],
  ['Study.com','SDCM-0016','Math 104','Calculus','MATH 131',4,2],
  ['Study.com','SDCM-0210','Math 108','Discrete Mathematics','MATH 250',3,2],
  ['Study.com','SDCM-0161','Philosophy 103','Ethics - Theory & Practice','ETHC 101',3,3],
  ['Study.com','SDCM-0047','Humanities 101','Introduction to Humanities','CSTU 101',3,2],
  ['Study.com','SDCM-0003','Biology 105','Anatomy and Physiology','BIOL 102',3,1],
  ['Study.com','SDCM-0017','Psychology 101','Intro to Psychology','PSYC 101',3,3],
  ['Study.com','SDCM-0019','Psychology 103','Human Growth and Development','PSYC 210',3,3],
  ['Study.com','SDCM-0044','Psychology 107','Life Span Developmental Psychology','PSYC 210',3,3],
  ['Study.com','SDCM-0043','Psychology 105','Research Methods in Psychology','PSYC 255',3,3],
  ['Study.com','SDCM-0178','Psychology 306','Advanced Abnormal Psychology','PSYC 430',3,3],
  ['Study.com','SDCM-0181','Psychology 311','Physiological Psychology','PSYC 380',3,3],
  ['Study.com','SDCM-0183','Psychology 314','Psychology of Learning','PSYC 365',3,3],
  ['Study.com','SDCM-0182','Psychology 316','Advanced Social Psychology','PSYC 312',3,3],
  ['Study.com','SDCM-0048','Sociology 101','Intro to Sociology','SOCI 200',3,3],
  ['Study.com','SDCM-0225','Business 212','Business Statistics','BUSI 230',3,1,['MATH 201']],
  ['Study.com','SDCM-0068','Statistics 101','Principles of Statistics','MATH 201',3,3,['BUSI 230']],
  ['Study.com','SDCM-0042','Political Science 102','American Government','GOVT 220',3,3],
  ['Study.com','SDCM-0067','Criminal Justice 101','Intro to Criminal Justice','CJUS 200',3,2],
  ['Study.com','SDCM-0128','Criminal Justice 305','The Juvenile Justice System','CJUS 310',3,2],
  ['Study.com','SDCM-0177','Criminal Justice 306','Research Methods in Criminal Justice','CJUS 230',3,2],
  ['Study.com','SDCM-0069','Economics 101','Principles of Microeconomics','ECON 213',3,2],
  ['Study.com','SDCM-0060','Economics 102','Macroeconomics','ECON 214',3,2],
  ['Study.com','SDCM-0009','Business 107','Organizational Behavior','BUSI 240',3,1],
  ['Study.com','SDCM-0053','Business 307','Leadership and Organizational Behavior','BUSI 240',3,1],
  ['Study.com','SDCM-0054','Business 308','Globalization and International Management','BUSI 303',3,1],
  ['Study.com','SDCM-0071','Business 306','Strategic Human Resources Management','BUSI 342',3,1],
  ['Study.com','SDCM-0050','Business 312','Advanced Operations Management','BUSI 411',3,1],
  ['Study.com','SDCM-0073','Business 311','Project Management','BUSI 313',3,1],
  ['Study.com','SDCM-0147','Business 321','Small Business Management','BUSI 336',3,1],
  ['Study.com','SDCM-0086','Business 315','Logistics and Supply Chain Management','BUSI 371',3,1],
  ['Study.com','SDCM-0120','Business 325','Union & Labor Relations','BUSI 343',3,1],
  ['Study.com','SDCM-0059','Finance 102','Personal Finance','BUSI 223',3,2],
  ['Study.com','SDCM-0153','Finance 301','Corporate Finance','BUSI 320',3,2,[],{receivingTitle:'Corporate Finance',note:'The guide names BUSI 320 Corporate Finance; the 2026–27 catalog names the same code Finance Principles. Confirm current title and applicability with Liberty.'}],
  ['Study.com','SDCM-0024','Business 100','Intro to Business','BUSI 101',3,1,[],{residentialReceivingCode:'BUSI 105'}],
  ['StraighterLine','OOSL-0005','ENG101','English Composition I','ENGL 101',3,1],
  ['StraighterLine','OOSL-0006','ENG102','English Composition II','ENGL 102',3,1],
  ['StraighterLine','OOSL-0052','COM101','Introduction to Communications','COMS 101',3,1],
  ['StraighterLine','OOSL-0002','MAT101','College Algebra','MATH 121',3,1],
  ['StraighterLine','OOSL-0108','MAT102','Quantitative Reasoning','MATH 115',3,1],
  ['StraighterLine','OOSL-0012','MAT250','General Calculus I','MATH 131',4,1],
  ['StraighterLine','OOSL-0019','MAT251','General Calculus II','MATH 132',4,1],
  ['StraighterLine','OOSL-0123','PHIL102','Intro to Ethics','ETHC 101',3,1],
  ['StraighterLine','OOSL-0028','BIO201','Anatomy & Physiology I','BIOL 102',3,1],
  ['StraighterLine','OOSL-0027','PSY101','Introduction to Psychology','PSYC 101',3,1],
  ['StraighterLine','OOSL-0107','PSY120','Life-Span Development','PSYC 210',3,1],
  ['StraighterLine','OOSL-0035','SOC101','Introduction to Sociology','SOCI 200',3,1],
  ['StraighterLine','OOSL-0011','MAT150','Business Statistics','BUSI 230',3,1,['MATH 201']],
  ['StraighterLine','OOSL-0070','MAT202','Introduction to Statistics','MATH 201',3,1,['BUSI 230']],
  ['StraighterLine','OOSL-0063','POLS101','American Government','GOVT 220',3,1],
  ['StraighterLine','OOSL-0004','CJ101','Introduction to Criminal Justice','CJUS 200',3,1],
  ['StraighterLine','OOSL-0008','ECON102','Microeconomics','ECON 213',3,1],
  ['StraighterLine','OOSL-0007','ECON101','Macroeconomics','ECON 214',3,1],
  ['StraighterLine','OOSL-0042','BUS120','Organizational Behavior','BUSI 240',3,1],
  ['StraighterLine','OOSL-0125','HRM200','Human Resource Management','BUSI 342',3,1],
  ['StraighterLine','OOSL-0036','FIN101','Personal Finance','BUSI 223',3,1],
  ['StraighterLine','OOSL-0001','BUS101','Introduction to Business','BUSI 101',3,1,[],{residentialReceivingCode:'BUSI 105'}],
  ['CLEP','CLEP-0041','College Composition Modular','College Composition Modular','ENGL 101',3,1],
  ['CLEP','CLEP-0011','Analyzing and Interpreting Literature','Analyzing and Interpreting Literature','ENGL 102',3,1],
  ['CLEP','CLEP-0013','College Algebra','College Algebra','MATH 121',3,1],
  ['CLEP','CLEP-0004','College Mathematics','College Mathematics','MATH 115',3,1],
  ['CLEP','CLEP-0038','Calculus','Calculus','MATH 131',4,1],
  ['CLEP','CLEP-0020','Introductory Psychology','Introductory Psychology','PSYC 101',3,1],
  ['CLEP','CLEP-0021','Human Growth and Development','Human Growth and Development','PSYC 210',3,1],
  ['CLEP','CLEP-0026','Introductory Sociology','Introductory Sociology','SOCI 200',3,1],
  ['CLEP','CLEP-0003','Humanities','Humanities','CSTU 101',3,1],
  ['CLEP','CLEP-0039','Financial Accounting','Financial Accounting','ACCT 211',3,1],
  ['CLEP','CLEP-0030','Principles of Microeconomics','Principles of Microeconomics','ECON 213',3,1],
  ['CLEP','CLEP-0027','Principles of Macroeconomics','Principles of Macroeconomics','ECON 214',3,1],
  ['CLEP','CLEP-0007','American Government','American Government','GOVT 220',3,1],
];

export function guideSource(provider,mode){
  const [guideUpdated,path]=guides[provider][mode];
  return {id:'liberty-official-'+slug(provider)+'-'+mode+'-'+guideUpdated,title:`Liberty ${mode} ${provider} receiving-course equivalency guide · ${guideUpdated}`,url:base+path,checked:checkedOn,guideUpdated,evidenceType:'official-receiving-school-equivalency',scope:'Schoolwide named receiving-course awards; exact degree, catalog and individual applicability require evaluation.'};
}

export function officialOptions(requirement,mode){
  if(requirement.institutionalOnly||!requirement.code||requirement.bucket)return [];
  return mappings.flatMap(([provider,code,providerCourseCode,title,award,credits,page,crosslists=[],extra={}])=>{
    const receivingCode=mode==='residential'&&extra.residentialReceivingCode?extra.residentialReceivingCode:award;
    if(credits!==requirement.credits||![receivingCode,...crosslists].some(c=>key(c)===key(requirement.code)))return [];
    const source=guideSource(provider,mode),crosslisted=key(receivingCode)!==key(requirement.code);
    return [{id:provider.toLowerCase().replace(/[^a-z0-9]/g,'')+'-'+slug(code),provider,code,providerCourseCode,codeAliases:providerCourseCode===code?[]:[providerCourseCode],identitySourceIds:[source.id],codeAliasEvidence:[{alias:providerCourseCode,sourceIds:[source.id]}],title,credits,creditSystem:'semester',...(provider==='CLEP'?{sourceCreditBasis:'Independent CLEP/ACE source-credit quantity not established by the receiving-school guide.'}:{sourceCredits:credits,sourceCreditSystem:'semester'}),receivingCode,...(crosslisted?{fulfillsCode:requirement.code,crossListedReceivingCodes:[receivingCode,...crosslists]}:{}),...(extra.receivingTitle?{receivingTitle:extra.receivingTitle}:{}),upper:/^[A-Z]+\s+[34]\d\d$/.test(receivingCode),sourceIds:[source.id],url:source.url,evidence:'published',mappingChecked:checkedOn,guideUpdated:source.guideUpdated,mappingReviewId:'liberty-official-2026-11-10',mappingScope:'Exact named receiving-course award in the official guide linked by Liberty for this delivery format; degree placement uses the independently sourced requirement code.',sourcePage:provider==='Sophia'&&mode==='online'&&code==='SOPH-0009'?2:page,...(provider==='CLEP'?{minScore:50}:{}),conditions:[common,...(crosslisted?[`The guide explicitly says ${receivingCode} also meets ${requirement.code}; these are alternative placements for one award and cannot be counted twice.`]:[]),...(provider==='CLEP'?['Minimum CLEP score: 50. Submit the official College Board report for evaluation.']:[]),...(extra.note?[extra.note]:[])]}];
  });
}

function upsertSources(model,sources){
  model.sources=model.sources||[];
  for(const source of sources){const index=model.sources.findIndex(s=>s.id===source.id);if(index<0)model.sources.push(source);else model.sources[index]=source;}
}

const allMajorIds=new Set(['curriculum-liberty-accounting-bs-online','curriculum-liberty-accounting-bs-residential','curriculum-liberty-computer-science-general-residential','curriculum-liberty-human-services-bs-online','liberty-criminal-justice-online','liberty-criminal-justice-residential']);
export function applyGradePolicy(model){
  const allMajor=allMajorIds.has(model.id),sid=model.sources.find(source=>/2026.*27|2026.*2027/.test(source.title))?.id||model.sources[0].id;
  const detail=allMajor?'At least C in the requirements under the catalog major section, including its listed foundations and other named major sections.':'At least C in upper-level courses in the major.';
  for(const row of model.requirements){
    const upper=row.upper||row.upperOnly||Number(row.minCourseLevel)>=300||Number(row.minimumCourseLevel)>=300;
    if(row.category==='major'&&(allMajor||upper)){row.minimumGrade='C';row.minimumGradeSourceIds=[sid];}
    else if(row.category==='major'&&!allMajor&&(row.bucket||row.freeElective||row.allocationSlot)){
      row.minimumGradeWhenUpper='C';row.minimumGradeSourceIds=[sid];row.gradePolicyNote='The catalog C minimum applies when an upper-level course is chosen for this major elective. Lower-level choices do not acquire this upper-level-only rule.';
    }
  }
  model.gradePolicy={minimumGrade:'C',scope:allMajor?'major-requirements':'upper-level-major',sourceIds:[sid],checked:checkedOn,detail,...(/accounting|criminal-justice/.test(model.id)?{scopeNote:'The catalog says all courses in the major and places foundations and major courses under Major Requirements; confirm individual evaluation of foundations with Liberty.'}:{})};
  model.graduationRequirements=model.graduationRequirements||[];
  const grade={id:'major-minimum-grade',title:'Major course grades',detail,sourceIds:[sid]};
  const i=model.graduationRequirements.findIndex(row=>row.id===grade.id);if(i<0)model.graduationRequirements.push(grade);else model.graduationRequirements[i]=grade;
}

export function applyBusinessBaseline(model){
  if(model.id!=='curriculum-liberty-business-bs-online')return;
  const sid=model.sources[0].id;
  if(!model.requirements.some(row=>row.code==='UNIV 104')){
    model.requirements.push({id:'univ-104',code:'UNIV 104',title:'Instructional Technology for Successful Online Learning',credits:3,category:'general',group:'technology',upper:false,institutionalOnly:true,sourceIds:[sid],options:[],allocationBasis:'Conservative three-credit case of the source 0–3-credit requirement; any zero-credit determination requires individual confirmation.'});
    const free=model.requirements.find(row=>row.id==='free-electives');assert(free&&free.credits===39,'Unexpected online Business free-elective baseline');free.credits=36;
  }
  const free=model.requirements.find(row=>row.id==='free-electives');
  free.choiceNote='This 36-credit block and the separate 3-credit upper-level free elective provide 39 free-elective credits within the published 27–42 range.';
  model.obligations=(model.obligations||[]).map(item=>item.title==='UNIV 104 evaluation'?{...item,notes:'The source lists UNIV 104 as 0–3 credits. This ledger retains 3 credits. A university-confirmed zero-credit case would release 3 credits for additional nonduplicating electives; the degree still requires 120 total credits.'}:item);
  model.rulesNotes=(model.rulesNotes||[]).map(note=>note.includes('The source prints UNIV 104 as 0–3 credits')?'UNIV 104 retains 3 credits in this baseline; a zero-credit determination needs individual university confirmation.':note).filter(note=>!/^A120-credit|^A three-credit UNIV104/.test(note));
  const note='A 120-credit proposed allocation: 30 unique general-education credits, 15 foundations, 36 major-core credits, and 39 free-elective credits, including a separate 3-credit upper-level elective.';
  if(!model.rulesNotes.includes(note))model.rulesNotes.push(note);
  model.univ104Scenario={baselineCredits:3,publishedCreditsRange:[0,3],zeroCreditCaseRequiresIndividualConfirmation:true,replacementElectiveCreditsIfZero:3,sourceIds:[sid]};
  const section=model.curriculumSections?.find(section=>section.id==='general');if(section&&!section.requirementIds.includes('univ-104'))section.requirementIds.push('univ-104');
  assert.equal(model.requirements.reduce((sum,row)=>sum+row.credits,0),120);
}

export function supplementModel(input){
  const model=clone(input),mode=/^online$/i.test(model.format)?'online':'residential';
  applyBusinessBaseline(model);
  applyGradePolicy(model);
  for(const requirement of model.requirements){
    const options=officialOptions(requirement,mode);
    if(!options.length)continue;
    const identities=new Set(options.map(o=>o.provider+'|'+o.code));
    requirement.options=[...(requirement.options||[]).filter(o=>!identities.has(o.provider+'|'+o.code)),...options];
    upsertSources(model,options.map(o=>guideSource(o.provider,mode)));
  }
  if(model.transferWaiverVariant?.requirements){
    const variant=supplementModel({...clone(model),transferWaiverVariant:undefined,requirements:model.transferWaiverVariant.requirements});
    model.transferWaiverVariant.requirements=variant.requirements;
    upsertSources(model,variant.sources);
  }
  model.officialMappingCheckedOn=checkedOn;
  return applyLibertyCurrentEvidence(applyCourseListingIdentities(model));
}

export function supplementDocument(input){
  const document=clone(input);
  document.models=document.models.map(supplementModel);
  document.checkedOn=checkedOn;
  return document;
}

export async function run({check=false}={}){
  const files=['content/curricula/liberty.json','dist/data/liberty.json','dist/data/liberty-criminal-justice-online.json','dist/data/liberty-criminal-justice-residential.json'];
  let placements=0;const identities=new Set(),courses=new Set();
  for(const file of files){
    const path=resolve(root,file),original=JSON.parse(await readFile(path,'utf8'));
    const result=original.models?supplementDocument(original):supplementModel(original);
    if(check)assert.deepEqual(original,result,file+' needs scripts/add-liberty-official-mappings.mjs');
    else await writeFile(path,JSON.stringify(result,null,2)+'\n');
    for(const model of result.models||[result])for(const row of model.requirements)for(const option of row.options||[])if(option.mappingReviewId==='liberty-official-2026-11-10'){placements++;identities.add(option.provider+'|'+option.code);courses.add(option.receivingCode);}
  }
  return {files:files.length,reviewedPlacements:placements,providerCourses:identities.size,receivingCourses:courses.size,checkedOn,check};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(await run({check:process.argv.includes('--check')})));
