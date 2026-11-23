/**
 * One-time review finalization (2026-11-23) for the first automated factory batch: Strayer, Champlain College Online,
 * APUS and Bellevue. It adds each school's captured transfer-limit and residency sources and policies, declares one
 * online route per reviewed program, and marks reviewed only the drafts that passed review. Programs are left as drafts
 * when their captured page leaves a credit total unexplained or no published outside course joins any requirement.
 * Idempotent: re-running rewrites the same values. Usage: node scripts/pathway-factory/finalize-four-schools-2026-11-23.mjs
 */
import {root,slug} from './lib.mjs';
import {finalizeSchools,printReport,fieldFor} from './finalize-batch.mjs';

const CHECKED='2026-11-23';

const SCHOOLS={
  strayer:{
    sources:[
      {id:'strayer-undergraduate-admission-transfer-limits-2026-11-23',title:'Strayer University catalog: Undergraduate Admission (transfer credit limits)',url:'https://coursecatalog.strayer.edu/undergraduate-admission',checked:CHECKED,capture:'content/source-captures/99fbc2ca5bf0ebb6.txt'},
      {id:'strayer-degree-conferral-requirements-2026-11-23',title:'Strayer University catalog: Graduation, Degree Conferral and Commencement',url:'https://coursecatalog.strayer.edu/graduation-degree-conferral-and-commencement',checked:CHECKED,capture:'content/source-captures/d70243623ec81146.txt'}],
    levels:{
      bachelor:{transferMax:126,quotes:[{sourceId:'strayer-undergraduate-admission-transfer-limits-2026-11-23',text:'No more than 126 quarter hours of transfer credit from all sources may be applied toward a bachelor’s degree'},{sourceId:'strayer-degree-conferral-requirements-2026-11-23',text:'180 quarter credit hours of course work for a bachelor’s degree'}]},
      associate:{transferMax:63,quotes:[{sourceId:'strayer-undergraduate-admission-transfer-limits-2026-11-23',text:'no more than 63 quarter hours of transfer credit from all sources may be applied toward an associate degree'},{sourceId:'strayer-degree-conferral-requirements-2026-11-23',text:'Complete at least 90 quarter credit hours of course work for an associate degree'}]}},
    unpublished:{}},
  champlain:{
    sources:[{id:'champlain-transfer-credit-options-2026-11-23',title:'Champlain College Online: Transfer Credit Options (undergraduate transfer policy)',url:'https://online.champlain.edu/admission/transfer-credit-options',checked:CHECKED,capture:'content/source-captures/0229a38247d087df.txt'}],
    levels:{
      bachelor:{transferMax:90,quotes:[{sourceId:'champlain-transfer-credit-options-2026-11-23',text:'Up to 90 credit hours toward a bachelor’s degree.'}]},
      associate:{transferMax:45,quotes:[{sourceId:'champlain-transfer-credit-options-2026-11-23',text:'Up to 45 credit hours toward an associate degree.'}]}},
    unpublished:{
      'bachelor-of-science-in-accounting':'The captured page states a 54-credit Professional Courses block but lists only 48 credits of professional courses; the remaining 6 credits are not identified.',
      'associate-of-science-in-general-studies':'The captured page lists CRIT 100 as both a professional and a general education requirement without saying whether one course satisfies both, leaving 3 of 60 credits unexplained.'}},
  apus:{
    sources:[{id:'apus-apu-transfer-credit-limits-2026-11-23',title:'American Public University: Transfer Credit (transfer credit limits)',url:'https://www.apu.apus.edu/admissions/transfer-credit/',checked:CHECKED,capture:'content/source-captures/e29c9dad46c3f266.txt'}],
    levels:{
      bachelor:{transferMax:90,alternativeMax:60,quotes:[{sourceId:'apus-apu-transfer-credit-limits-2026-11-23',text:'At APU, our transfer credit limits are: 45 academic credits toward an associate degree (up to 30 non-traditional credits) 90 academic credits toward a bachelor’s degree (up to 60 non-traditional credits)'}]},
      associate:{transferMax:45,alternativeMax:30,quotes:[{sourceId:'apus-apu-transfer-credit-limits-2026-11-23',text:'At APU, our transfer credit limits are: 45 academic credits toward an associate degree (up to 30 non-traditional credits)'}]}},
    alternativeQuote:{sourceId:'apus-apu-transfer-credit-limits-2026-11-23',text:'“Non-traditional” transfer credits are those earned based on assessment, competency testing (i.e. CLEP or ACE exams)'},
    unpublished:{}},
  bellevue:{
    sources:[{id:'bellevue-catalog-2025-2027-degree-requirements',title:'Bellevue University 2025–2027 Academic Catalog and Student Handbook (undergraduate degree requirements)',url:'https://www.bellevue.edu/wp-content/uploads/2025/12/25-27-catalog.pdf',checked:CHECKED,capture:'content/source-captures/d033d7f984f7917f.txt'}],
    // Residency comes from the catalog's undergraduate degree requirements table (columns: cumulative GPA, major GPA,
    // in-residence credit hours, upper-level credit hours, major credit hours in residence). No separate transfer
    // ceiling is published, so the transfer maximum is the degree total minus the in-residence minimum.
    levels:{
      bachelor:{residency:30,upper:30,majorResidency:12,quotes:[{sourceId:'bellevue-catalog-2025-2027-degree-requirements',text:'Bachelor of Science (B.S.) • 1271 • • 2.0 2.5 30 30 12'},{sourceId:'bellevue-catalog-2025-2027-degree-requirements',text:'Resident credit hours are credits earned at Bellevue University in all approved delivery formats.'}]},
      associate:{residency:15,quotes:[{sourceId:'bellevue-catalog-2025-2027-degree-requirements',text:'Associate of Science (A.S.) • 60 • • 2.0 2.5 15 NA NA'}]}},
    upperLevelQuote:{sourceId:'bellevue-catalog-2025-2027-degree-requirements',text:'Upper-level (300-400)'},
    baQuote:{sourceId:'bellevue-catalog-2025-2027-degree-requirements',text:'Bachelor of Arts (B.A.) • 127 • • 2.0 2.5 30 30 12'},
    business21:{slugs:['bachelor-of-science-in-accounting','bachelor-of-science-in-business-administration','bachelor-of-science-in-finance'],quote:{sourceId:'bellevue-catalog-2025-2027-degree-requirements',text:'The Accounting, Business Administration, Finance, and Financial Planning majors require 21 upper-level credit hours completed in residence.'}},
    parents:{
      'associate-degree-in-multidisciplinary-studies':'bellevue-multidisciplinary-studies-as','associate-of-science-in-business':'bellevue-business-as',
      'bachelor-of-science-in-accounting':'bellevue-accounting-bs','bachelor-of-science-in-business-administration':'bellevue-business-administration-bs',
      'bachelor-of-science-in-computer-science':'bellevue-computer-science-bs','bachelor-of-science-in-criminal-justice':'bellevue-criminal-justice-bs',
      'bachelor-of-science-in-cybersecurity':'bellevue-cybersecurity-bs','bachelor-of-science-in-finance':'bellevue-finance-bs',
      'bachelor-of-science-in-healthcare-management':'bellevue-healthcare-management-bs','bachelor-of-science-in-management-information-systems':'bellevue-management-information-systems-bs',
      'bachelor-of-science-in-project-management':'bellevue-project-management-bs','bachelor-of-science-in-psychology':'bellevue-psychology-bs',
      'bachelor-of-science-marketing':'bellevue-marketing-bs','business-analytics':'bellevue-business-analytics-bs','communication-studies':'bellevue-communication-studies-ba',
      'emergency-management':'bellevue-emergency-management-bs','history':'bellevue-history-bs','management-of-human-resources':'bellevue-management-of-human-resources-bs',
      'online-bachelor-s-degree-of-information-technology':'bellevue-information-technology-bs','online-bachelor-s-degree-of-management':'bellevue-management-bs',
      'online-bachelor-s-degree-of-public-health':'bellevue-public-health-bs','supply-chain-and-logistics-management':'bellevue-supply-chain-and-logistics-management-bs'},
    unpublished:{
      'bachelor-of-science-in-psychology':'The captured page states 41 major credits but lists only 34; the source of the remaining 7 major credits is not stated.',
      'supply-chain-and-logistics-management':'The captured page gives two different major totals (54 and 57 credits) without explaining the difference.',
      'bachelor-of-science-in-business-administration':'The plan checker cannot keep the 21 upper-level major credits Bellevue requires in residence with the named major courses and the open upper-level coursework block, so the student\'s choices decide feasibility (planner: "At least 21 major credits must be earned through the university in this model.").'}}};

/**
 * Explicit category-award placements from each school's Sophia partner table (owner-approved open slots, 2026-11-23).
 * receivingText is the exact category text the table prints; quotes repeat it from the captured table. Only elective
 * or named-category awards fill a slot, and only a slot of the stated kind (labelPattern narrows gen-ed rules to the
 * slot whose own quoted label names that category). All Sophia awards here are lower-division.
 */
const SLOT_RULES={
  strayer:{source:'strayer-sophia-partner-page',school:'Strayer',rules:[
    ['general-elective','General Elective (ELC 000)'],['elc-000','ELC 000'],['philosophy-elective','Philosophy Elective (PHI 001)'],
    ['language-elective-1','Language Elective (LAN 001)'],['language-elective-2','Language Elective (LAN 002)'],['language-elective-3','Language Elective (LAN 003)'],
    ['science-elective','Science Elective (SCI 005)'],['soc-psy-elective','SOC/PSY Elective']].map(([id,text])=>({id,receivingText:text,slotKinds:['free-elective']}))},
  champlain:{source:'champlain-sophia-partner-page',school:'Champlain College Online',rules:[
    {id:'gen-1xx-general-electives',receivingText:'GEN-1XX',slotKinds:['free-elective']},
    ...['ARTS','COMM','ENGL','HIST','MATH','PHIL','SCIE'].map(prefix=>({id:prefix.toLowerCase()+'-1xx-gen-ed-elective',receivingText:prefix+'-1XX',slotKinds:['gen-ed'],
      labelPattern:`^General Education Electives?\\s*\\((?:Any|two courses from)\\b[^)]*\\b${prefix}\\b`}))]},
  apus:{source:'apus-sophia-partner-page',school:'APUS',rules:[
    {id:'arts-humanities',receivingText:'Arts & Humanities / Humanities',slotKinds:['gen-ed'],labelPattern:'^(?:General Education: )?Arts & Humanities'},
    {id:'span100-arts-humanities',receivingText:'SPAN100: Gen Ed Arts & Humanities',slotKinds:['gen-ed'],labelPattern:'^(?:General Education: )?Arts & Humanities'},
    {id:'rels101-elective-only',receivingText:'RELS101: Introduction to the Study of Religions (Elective-only course; not Arts & Humanities)',slotKinds:['free-elective']},
    {id:'elective-in-all-other-programs',receivingText:'Applies to specific degree concentrations or as an elective in all other programs. Please speak with your academic advisor before registering.',slotKinds:['free-elective']},
    {id:'elective-only',receivingText:'Elective Only',slotKinds:['free-elective']},{id:'elective-only-lower',receivingText:'Elective only',slotKinds:['free-elective']}]},
  bellevue:{source:'bellevue-sophia-partner-page',school:'Bellevue University',rules:[
    'UE TLL Unclassified Lower-Level Elective','UE TLL Unclassified Lower Level Elective','Unclassified Lower Level Elective','BA TLL Business Administration Lower-Level Elective',
    'CA TLL1 Communication Lower 100-Level Elective','EN TLL1 English 100-Level Elective','GD TLL Graphic Design Lower- Level Elective','PH TLL Philosophy Lower-Level Elective',
    'FL TLL1 Foreign Language Lower 100-Level Elective','BI TLL Biology Lower-Level Elective','CIS TLL Computer Information Systems Lower-Level Elective','CH TLL Chemistry Lower-Level Elective',
    'MA TLL2 to Math Lower 200-Level Elective','TN TLL Technology Lower-Level Elective','MA TLL2 Math Lower 200-Level Elective','SO TLL Sociology Lower Level Elective'].map((text,index)=>({id:`${index+1}-${slug(text)}`,receivingText:text,slotKinds:['free-elective']}))}};

export {fieldFor};

export function finalize({base=root}={}){
  return finalizeSchools({schools:SCHOOLS,slotRules:SLOT_RULES,checked:CHECKED,base});
}

if(import.meta.url===`file://${process.argv[1]}`)printReport(await finalize());
