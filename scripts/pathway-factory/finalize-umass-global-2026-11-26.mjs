/**
 * Review finalization (2026-11-26) for University of Massachusetts Global credit-hour bachelor's programs in the School
 * of Business and Professional Studies (plus the B.S. Cybersecurity). Ledgers are hand-drafted from page captures of the
 * 2026–2027 catalog; outside options come from Sophia's UMass Global partner table (provider-published, so every
 * outside course stays "confirm with UMass Global"). Shared engine: finalize-batch.mjs, then UMass Global-specific
 * policy notes. Idempotent. Usage: node scripts/pathway-factory/finalize-umass-global-2026-11-26.mjs
 */
import {join} from 'node:path';
import {readdir} from 'node:fs/promises';
import {root,readJSON,writeJSON,list} from './lib.mjs';
import {finalizeSchools,printReport} from './finalize-batch.mjs';

const CHECKED='2026-11-26';
const GE='umass-global-general-education-2026-2027';
const DEGREE='umass-global-credit-hour-degree-requirements-2026-2027';
const CPL='umass-global-credit-for-prior-learning';
const SOPHIA='umass-global-sophia-partner-page';
const POLICIES='umass-global-undergraduate-credit-hour-policies-2026-2027';

const RESIDENCY_QUOTE={sourceId:DEGREE,text:'Minimum of 30 credits completed in residence at University of Massachusetts Global; 18 of which must be upper-division credits, 12 of which must be completed in students major.'};
const UPPER_QUOTE={sourceId:DEGREE,text:'36 credits earned in upper-division coursework.'};
const MAJOR_UPPER_QUOTE={sourceId:DEGREE,text:'A minimum of 21 credits of upper-division coursework in the major;'};
const NUMBERING_QUOTE={sourceId:POLICIES,text:'300-499 Upper Division Undergraduate Coursework'};
const TRANSFER75_QUOTE={sourceId:POLICIES,text:'Up to 75% of an undergraduate degree program’s required credit hours can be accepted via transfer and is subject to programmatic restrictions.'};
const ACE_QUOTE={sourceId:CPL,text:'UMass Global accepts eligible ACE credit recommendations, subject to program requirements and other academic policies.'};

const SCHOOLS={
  'umass-global':{
    sources:[
      {id:GE,title:'UMass Global 2026–2027 catalog: General Education Requirements (credit hour)',url:'https://catalog.umassglobal.edu/general-education-requirements/general-education-requirements.pdf#pages=1-2&columns=2',checked:CHECKED,capture:'content/source-captures/1a8a8b36ebab3f28.txt',kind:'university',roles:['curriculum','policy']},
      {id:DEGREE,title:'UMass Global 2026–2027 catalog: Undergraduate Credit Hour and MyPath Degree Requirements',url:'https://catalog.umassglobal.edu/academic-policies-procedures/undergraduate-credit-hour-degree-requirement/undergraduate-credit-hour-degree-requirement.pdf#pages=1-1&columns=2',checked:CHECKED,capture:'content/source-captures/abecd4fa3d29ac6a.txt',kind:'university',roles:['policy','residency']},
      {id:POLICIES,title:'UMass Global 2026–2027 catalog: Undergraduate Credit-Hour and MyPath Academic Policies and Procedures (pp. 1–4)',url:'https://catalog.umassglobal.edu/academic-policies-procedures/undergraduatecredit-hourandmypathpolicies/undergraduatecredit-hourandmypathpolicies.pdf#pages=1-4&columns=2',checked:CHECKED,capture:'content/source-captures/baf4fdde7c7ba931.txt',kind:'university',roles:['policy']},
      {id:CPL,title:'UMass Global: Credit for Prior Learning (ACE-recommended learning, Sophia and Study.com)',url:'https://www.umassglobal.edu/admissions/transfer-center/credit-prior-learning',checked:CHECKED,capture:'content/source-captures/1602df48618dc216.txt',kind:'university',roles:['policy']}],
    levels:{bachelor:{residency:30,majorResidency:12,upper:36,quotes:[RESIDENCY_QUOTE,UPPER_QUOTE,TRANSFER75_QUOTE],upperResidency:{credits:18,quotes:[RESIDENCY_QUOTE]}}},
    // Codeless major blocks are restricted program lists or discipline areas: a major-elective choice, never a free elective.
    extraSlotKinds:[{category:'major',titlePattern:'^(Major|Program) electives',kind:'major-elective',override:true}],
    // The catalog's course numbering system defines upper division as 300-499: named 300- and 400-level courses are upper level.
    upperLevelQuote:NUMBERING_QUOTE,
    unpublished:{}}};

const HUMANITIES={sourceId:GE,text:'Select 9 credits from the following areas: Communications English Fine Arts Foreign Languages Humanities Liberal Studies Philosophy Religious Studies'};
const SOCIAL={sourceId:GE,text:'Select 9 credits from three different areas: 9 Criminal Justice Early Childhood Education Economics History Marketing Organizational Leadership Political Science/Legal Studies Psychology Social Science Social Work Sociology'};
const NATURAL={sourceId:GE,text:'Natural Sciences: Select 6 credits 6'};
const FREE='^Free electives$';
const free=text=>({id:text.toLowerCase().replace(/[^a-z0-9]+/g,'-'),receivingText:text,slotKinds:['free-elective'],labelPattern:FREE});
const both=(text,pattern,quote)=>({id:text.toLowerCase().replace(/[^a-z0-9]+/g,'-'),receivingText:text,slotKinds:['free-elective','gen-ed'],labelPattern:`(${FREE.slice(1,-1)}|${pattern})`,extraQuotes:[quote]});

/**
 * Category awards from Sophia's UMass Global table (discipline-level codes such as "PHLU 10000"). A discipline code fills
 * the general-education area whose quoted list names that discipline (Philosophy, English, Communications, Foreign
 * Languages for SPNU and FRNU, Fine Arts for ARTU; Psychology and Criminal Justice in Social Sciences; Biology and
 * Chemistry in Natural Sciences) and any free elective. Major electives are never filled by category awards: the
 * catalog requires 21 upper-division credits in the major and these awards are lower division.
 */
const SLOT_RULES={'umass-global':{source:SOPHIA,school:'UMass Global',rules:[
  both('ENGU 10000','^General Education: Humanities$',HUMANITIES),
  both('PHLU 10000','^General Education: Humanities$',HUMANITIES),
  both('COMU 10000','^General Education: Humanities$',HUMANITIES),
  both('SPNU 10000','^General Education: Humanities$',HUMANITIES),
  both('FRNU 10000','^General Education: Humanities$',HUMANITIES),
  both('ARTU 10000','^General Education: Humanities$',HUMANITIES),
  both('PSYU 10000','^General Education: Social Sciences',SOCIAL),
  both('CJCU 10000','^General Education: Social Sciences',SOCIAL),
  both('BIOU 10000','^General Education: Natural Sciences$',NATURAL),
  both('CHMU 10000','^General Education: Natural Sciences$',NATURAL),
  free('BUSU 10000'),free('TRNU 10000'),free('CSCU 10000'),free('MATU 10000'),free('ATPU 10000'),free('HRCU 10000'),free('BUSU 30000'),free('MGTU 30000')]}};

export async function finalize({base=root}={}){
  const report=await finalizeSchools({schools:SCHOOLS,slotRules:SLOT_RULES,checked:CHECKED,base});
  // UMass Global-specific policy notes on every reviewed program.
  const dir=join(base,'content/pathway-kits/umass-global/programs');
  for(const file of (await readdir(dir)).filter(f=>f.endsWith('.json'))){
    const path=join(dir,file),program=await readJSON(path);
    if(program.review?.status!=='reviewed')continue;
    program.policies.alternativeMaxCredits={value:program.policies.transferMaxCredits.value,creditSystem:'semester',sourceIds:[DEGREE,CPL],quotes:[RESIDENCY_QUOTE,ACE_QUOTE],
      basis:'UMass Global reviews ACE-recommended learning (Sophia courses carry ACE recommendations) as transfer credit; no separate ceiling for ACE or NCCRS credit is published, so the 90-credit transfer limit (120 minus the 30-credit residency) applies.',reviewed:CHECKED};
    // The 21 upper-division credits in the major are met by named major courses (300-499), which the plan always lists.
    const majorUpper=program.requirements.filter(r=>r.upper&&['major','core','concentration'].includes(r.category)).reduce((s,r)=>s+r.credits,0);
    if(majorUpper<21)throw Error(`${program.slug}: named upper-division major courses total ${majorUpper} of the 21 the catalog requires.`);
    program.modelFields.policyReview=list(program.modelFields.policyReview).filter(item=>item.field!=='upperMinCredits');
    if(!program.modelFields.policyReview.length)delete program.modelFields.policyReview;
    program.policies.transferMaxCredits.basis+=` The catalog also requires 21 upper-division credits in the major; this program's named 300- and 400-level major courses total ${majorUpper}.`;
    program.policies.transferMaxCredits.quotes=[...program.policies.transferMaxCredits.quotes.filter(q=>q.text!==MAJOR_UPPER_QUOTE.text),MAJOR_UPPER_QUOTE];
    await writeJSON(path,program,[]);
  }
  return report;
}

if(import.meta.url===`file://${process.argv[1]}`)printReport(await finalize());
