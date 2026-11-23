/**
 * Review finalization (2026-11-23) for the PDF-catalog factory batch: University of Maryland Global Campus (umgc) and
 * Columbia Southern University (columbia-southern). School policies are quoted from page-ranged captures of each
 * school's current catalog; outside options come from each school's Sophia partner table. Shared engine:
 * finalize-batch.mjs. Idempotent. Usage: node scripts/pathway-factory/finalize-umgc-csu-2026-11-23.mjs
 */
import {root} from './lib.mjs';
import {finalizeSchools,printReport} from './finalize-batch.mjs';

const CHECKED='2026-11-23';
const UMGC_POLICY='umgc-catalog-2026-2027-degree-policies-2026-11-23';
const CSU_POLICY='columbia-southern-catalog-2026-2028-policies-2026-11-23';

const SCHOOLS={
  umgc:{
    sources:[{id:UMGC_POLICY,title:'UMGC 2026–2027 catalog: credit limits, associate and bachelor’s degree requirements (PDF pp. 26, 30, 35)',url:'https://www.umgc.edu/content/dam/umgc/documents/upload/catalogs/2026-2027-catalog.pdf#pages=26,30,35&columns=2',checked:CHECKED,capture:'content/source-captures/8b7a594694f8d28f.txt'}],
    levels:{
      bachelor:{transferMax:90,quotes:[{sourceId:UMGC_POLICY,text:'90 credits from all sources combined toward the bachelor’s degree'},{sourceId:UMGC_POLICY,text:'At least 30 credits (normally the final 30) must be completed at UMGC.'}],
        majorFraction:{value:0.5,exempt:['bachelor-of-science-in-general-studies'],quotes:[{sourceId:UMGC_POLICY,text:'Half the required number of credits within the major (if you are not majoring in applied technology, described on p. 38, or general studies, described on p. 73) must be completed at UMGC.'}]},
        upperResidency:{credits:15,quotes:[{sourceId:UMGC_POLICY,text:'At least 15 credits of upper-level coursework (i.e., earned in courses numbered 300 to 499) must be completed at UMGC.'}]}},
      associate:{transferMax:45,quotes:[{sourceId:UMGC_POLICY,text:'45 credits from all sources combined toward the associate degree'},{sourceId:UMGC_POLICY,text:'at least 15 of which (normally the final 15) must be taken through UMGC'}]}},
    // The catalog's combined "Remaining General Education and Elective Courses" block mixes general education and
    // electives: it is an open choice, but only general-education-category awards may fill it (never a free-elective rule).
    extraSlotKinds:[{category:'other',titlePattern:'^Remaining General Education and Elective Courses',kind:'gen-ed'}],
    unpublished:{}},
  'columbia-southern':{
    sources:[{id:CSU_POLICY,title:'Columbia Southern University 2026–2028 catalog: transfer credit limits, tuition and fees, graduation requirements (PDF pp. 25, 28, 200)',url:'https://www.columbiasouthern.edu/hubfs/Downloads/PDF/University%20Catalog/university_catalog.pdf#pages=25,28,200&columns=2',checked:CHECKED,capture:'content/source-captures/ce1320e395ba226d.txt'}],
    levels:{
      bachelor:{residency:30,quotes:[{sourceId:CSU_POLICY,text:'A minimum of 25% of an associate or bachelor’s degree must be completed at CSU.'},{sourceId:CSU_POLICY,text:'complete at least 25 percent of the courses within an undergraduate program at CSU.'}]},
      associate:{residency:15,quotes:[{sourceId:CSU_POLICY,text:'A minimum of 25% of an associate or bachelor’s degree must be completed at CSU.'},{sourceId:CSU_POLICY,text:'complete at least 25 percent of the courses within an undergraduate program at CSU.'}]}},
    capstoneAtSchool:{quote:{sourceId:CSU_POLICY,text:'Capstone courses must be completed at CSU.'}},
    // "Program Electives" are chosen from a program list, so they are a major-elective choice, not an open elective.
    extraSlotKinds:[{category:'elective',titlePattern:'^Program Electives',kind:'major-elective',override:true}],
    unpublished:{}}};

const UMGC_FREE='^(Elective Courses|Electives|Remaining elective courses)';
const UMGC_ARTS_HUMANITIES={sourceId:UMGC_POLICY,text:'Two 3-credit courses chosen from the following disciplines: ARTH, ARTT, ASTD, ENGL (except ENGL 281 and ENGL 384), GRCO, HIST, HUMN, MUSC, PHIL, THET, dance, literature, or a foreign language'};
const CSU_HUMANITIES_AB='^Humanities and Fine Arts\\s*[–-]?\\s*Group A or B$';

/**
 * Explicit category-award placements from each school's Sophia partner table (owner-approved open slots).
 * receivingText is the exact category text the table prints. All Sophia awards here are lower-division.
 * UMGC: discipline electives fill the open elective blocks; HUMN and PHIL electives also fill the Arts and Humanities
 * general-education choice because UMGC's catalog lists HUMN and PHIL among its Arts and Humanities disciplines.
 * Columbia Southern: "Open Electives" fills only open elective blocks; "Humanities A/B" and "Humanities B" fill only a
 * Group A or B humanities choice (never a Group A-only choice, since the table does not say the course is in Group A).
 */
const SLOT_RULES={
  umgc:{source:'umgc-sophia-partner-page',school:'UMGC',rules:[
    {id:'elective',receivingText:'Elective',slotKinds:['free-elective'],labelPattern:UMGC_FREE},
    {id:'bmgt-elective',receivingText:'BMGT Elective',slotKinds:['free-elective'],labelPattern:UMGC_FREE},
    {id:'comm-elective',receivingText:'COMM Elective',slotKinds:['free-elective'],labelPattern:UMGC_FREE},
    {id:'sdev-elective',receivingText:'SDEV Elective',slotKinds:['free-elective'],labelPattern:UMGC_FREE},
    {id:'humn-elective',receivingText:'HUMN Elective',slotKinds:['free-elective','gen-ed'],labelPattern:UMGC_FREE.slice(0,-1)+'|Arts and Humanities)',extraQuotes:[UMGC_ARTS_HUMANITIES]},
    {id:'phil-elective',receivingText:'PHIL Elective',slotKinds:['free-elective','gen-ed'],labelPattern:UMGC_FREE.slice(0,-1)+'|Arts and Humanities)',extraQuotes:[UMGC_ARTS_HUMANITIES]}]},
  'columbia-southern':{source:'columbia-southern-sophia-partner-page',school:'Columbia Southern University',rules:[
    {id:'open-electives',receivingText:'Open Electives',slotKinds:['free-elective'],labelPattern:'^Open Electives'},
    {id:'humanities-a-b',receivingText:'Humanities A/B',slotKinds:['gen-ed'],labelPattern:CSU_HUMANITIES_AB},
    {id:'humanities-b',receivingText:'Humanities B',slotKinds:['gen-ed'],labelPattern:CSU_HUMANITIES_AB},
    {id:'phl-2350-or-humanities-a-b',receivingText:'PHL 2350 Philosophies of World Religions or Humanities A/B',slotKinds:['gen-ed'],labelPattern:CSU_HUMANITIES_AB},
    {id:'natural-sciences',receivingText:'Natural Sciences',slotKinds:['gen-ed'],labelPattern:'^Natural Sciences$'},
    {id:'social-behavioral-sciences',receivingText:'Social and Behavioral Sciences',slotKinds:['gen-ed'],labelPattern:'^Social and Behavioral Sciences(\\s*/\\s*History)?$'},
    {id:'mat-1301-or-mathematics',receivingText:'MAT 1301 Liberal Arts Math or Mathematics',slotKinds:['gen-ed'],labelPattern:'^Mathematics$'}]}};

export function finalize({base=root}={}){
  return finalizeSchools({schools:SCHOOLS,slotRules:SLOT_RULES,checked:CHECKED,base});
}

if(import.meta.url===`file://${process.argv[1]}`)printReport(await finalize());
