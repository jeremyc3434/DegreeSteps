/**
 * School policy review (2026-11-26) for the open policy questions on confirmation-tier factory schools.
 *
 * Each value below is copied from the school's own published policy or catalog (quoted from a capture the factory
 * verifier checks). Where the published text does not settle a question, the question stays open with specific wording
 * instead of a guessed value. Course mappings are not touched.
 *
 * - alternativeMaxCredits: the most ACE/NCCRS-recommended (alternative) credit the degree accepts.
 * - upperMinCredits: a degree-wide upper-level credit minimum.
 * - School policy notes (school.json `policies`): rules that limit or condition outside credit without changing a plan.
 *
 * Idempotent: re-running rewrites the same values. It edits kit files in place and never re-runs the 2026-11-23
 * finalization, so later kit edits (choice pools, slot rules) are preserved.
 * Usage: node scripts/pathway-factory/record-school-policies-2026-11-26.mjs
 */
import {join} from 'node:path';
import {readdir} from 'node:fs/promises';
import {readFile} from 'node:fs/promises';
import {root,readJSON,writeJSON,normalizeText} from './lib.mjs';

export const CHECKED='2026-11-26';
const src=(id,title,url,capture)=>({id,title,url,checked:CHECKED,capture:`content/source-captures/${capture}.txt`});
const q=(sourceId,text)=>({sourceId,text});

const CSU_POLICY='columbia-southern-catalog-2026-2028-policies-2026-11-23';
const CSU_SOURCES='columbia-southern-catalog-2026-2028-transfer-sources-2026-11-26';
const CSU_PAGE='columbia-southern-transfer-credit-policy-page-2026-11-26';
const CSU_SOPHIA='columbia-southern-sophia-agreement-2026-11-26';
const UMGC_POLICY='umgc-catalog-2026-2027-degree-policies-2026-11-23';
const UMGC_NONCOLLEGIATE='umgc-catalog-2026-2027-noncollegiate-credit-2026-11-26';
const UMGC_BACHELOR='umgc-catalog-2026-2027-bachelor-requirements-2026-11-26';
const CHAMP_CATALOG='champlain-cco-catalog-2026-2027-academic-policies-2026-11-26';
const CHAMP_PLA='champlain-prior-learning-credit-2026-11-26';
const STRAYER_ADMISSION='strayer-undergraduate-admission-transfer-limits-2026-11-23';
const STRAYER_CONFERRAL='strayer-degree-conferral-requirements-2026-11-23';
const APUS_BACHELORS='apus-apu-catalog-bachelors-programs-2026-11-26';
const BELLEVUE='bellevue-catalog-2025-2027-degree-requirements';

/**
 * Per school:
 * - sources: new captured sources added to school.json.
 * - alternative: {levels:{associate|bachelor:'transfer'|{question,...}}, quotes, basis}. 'transfer' records the
 *   alternative-credit limit as the program's own transfer maximum (the published rules put ACE/NCCRS-evaluated
 *   learning inside the all-sources transfer limit with no separate ceiling); an object keeps the question open.
 * - upper: {resolved:{quotes,basis,resolution}} or {open:{quotes,question,message}} for bachelor's programs.
 * - notes: school-level policy notes written to school.json `policies`.
 */
export const SCHOOLS={
  'columbia-southern':{
    sources:[
      src(CSU_SOURCES,'Columbia Southern University 2026–2028 catalog: Transfer Credit Policy and Sources of Transfer Credit (PDF pp. 24–25)','https://www.columbiasouthern.edu/hubfs/Downloads/PDF/University%20Catalog/university_catalog.pdf#pages=24,25&columns=2','538b182f195853fa'),
      src(CSU_PAGE,'Columbia Southern University: Transfer Credit Policy (admissions page)','https://www.columbiasouthern.edu/admissions/transfer-credit/transfer-credit-policy','a3109189bfe71de1'),
      src(CSU_SOPHIA,'Columbia Southern University: Sophia Learning, LLC course equivalency agreement and addendums (published PDF)','https://www.columbiasouthern.edu/hubfs/Downloads/PDF/Articulation%20Agreements/sophia_mou__2_addendums.pdf','5313a2323b198114')],
    alternative:{
      levels:{associate:'transfer',bachelor:'transfer'},
      quotes:[
        q(CSU_SOURCES,'military and employer courses reviewed by the American Council on Education (ACE)'),
        q(CSU_SOURCES,'CSU uses ACE guidelines to determine if training programs, certificates, professional licenses, and/or military training warrant awarding academic credit.'),
        q(CSU_SOURCES,'will consider experiential learning credit through a Prior Learning Assessment (PLA) review.'),
        q(CSU_SOURCES,'A minimum of 25% of an associate or bachelor’s degree must be completed at CSU. Transfer credit for experiential learning may not exceed 25% of the degree program.'),
        q(CSU_PAGE,'Transfer credit for experiential learning may not exceed 25% of the degree program.'),
        q(CSU_SOPHIA,'Credit will be awarded based on current transfer credit policy and the ACE recommendation at the time of completion, which is subject to change.')],
      basis:'CSU lists ACE-reviewed courses, credit by examination and ACE-evaluated training as sources of transfer credit separate from “Experiential or Equivalent Learning”, which its catalog defines as a Prior Learning Assessment (PLA) review. The 25% experiential-learning cap therefore limits PLA credit, not ACE-recommended courses; CSU’s published Sophia agreement awards Sophia credit under the current transfer credit policy. So ACE/NCCRS-recommended credit is limited only by the overall transfer maximum (75% of the degree).'},
    upper:{open:{
      quotes:[],programQuote:'taking into consideration the degree program upper-level requirements.',
      message:'The catalog asks students to choose open electives “taking into consideration the degree program upper-level requirements” but publishes no number for them.',
      question:'Ask Columbia Southern: how many upper-level (3000- and 4000-level) credits does this degree require? Its catalog refers to “the degree program upper-level requirements” for open electives but doesn’t give a number.'}},
    notes:{
      experientialLearningMax:{value:0.25,scope:'Prior Learning Assessment (experiential learning) credit only; not ACE-recommended courses, exams or training.',sourceIds:[CSU_SOURCES,CSU_PAGE],
        quotes:[q(CSU_SOURCES,'will consider experiential learning credit through a Prior Learning Assessment (PLA) review.'),q(CSU_SOURCES,'Transfer credit for experiential learning may not exceed 25% of the degree program.'),q(CSU_PAGE,'Transfer credit for experiential learning may not exceed 25% of the degree program.')]},
      capstoneAtSchool:{value:true,sourceIds:[CSU_SOURCES],quotes:[q(CSU_SOURCES,'Capstone courses must be completed at CSU.')],basis:'Applied: every captured capstone requirement is institution-only.'},
      relevantEquivalentContent:{value:true,sourceIds:[CSU_SOURCES],quotes:[q(CSU_SOURCES,'Accepted courses are relevant to the program of study and equivalent in both content and degree level.')]},
      minimumGradeExceptions:{value:'C',scope:'A transferred grade of D is not accepted for English Composition or the Mathematics requirement.',sourceIds:[CSU_SOURCES],
        quotes:[q(CSU_SOURCES,'Courses with a grade of “D” or above may apply to undergraduate degree requirements unless a minimum grade of “C” is required to satisfy specific program requirements.'),q(CSU_SOURCES,'A grade of “D” is not accepted as transfer credit for the following:'),q(CSU_SOURCES,'English Composition courses'),q(CSU_SOURCES,'Mathematics requirement')]},
      transferCreditAge:{value:null,status:'case-by-case',sourceIds:[CSU_SOURCES],basis:'No fixed age limit is published; the Academic Program Director reviews older courses.',
        quotes:[q(CSU_SOURCES,'Some courses may not be transferrable due to age of credit. In these cases, the Academic Program Director will review the course information to determine transferability.')]},
      directTransferMinimumCredits:{value:3,creditSystem:'semester',sourceIds:[CSU_SOPHIA],basis:'Sophia courses under 3 semester credits count only as open electives; no 1- or 2-credit course is placed in a named requirement.',
        quotes:[q(CSU_SOPHIA,'Direct transfer credit for a Major Requirement, Program Electives, and/or General Education course requires the transfer course to be a minimum of 3 semester hours.')]}}},
  umgc:{
    sources:[
      src(UMGC_NONCOLLEGIATE,'UMGC 2026–2027 catalog: credit from noncollegiate courses and training (PDF p. 20)','https://www.umgc.edu/content/dam/umgc/documents/upload/catalogs/2026-2027-catalog.pdf#pages=20&columns=2','87a7cb2586ea8967'),
      src(UMGC_BACHELOR,'UMGC 2026–2027 catalog: bachelor’s degree requirements (PDF pp. 34–35)','https://www.umgc.edu/content/dam/umgc/documents/upload/catalogs/2026-2027-catalog.pdf#pages=34,35&columns=2','c6ed9fdcf1527a8a')],
    alternative:{
      levels:{associate:'transfer',bachelor:'transfer'},
      quotes:[
        q(UMGC_POLICY,'45 credits from all sources combined toward the associate degree'),
        q(UMGC_POLICY,'90 credits from all sources combined toward the bachelor’s degree'),
        q(UMGC_NONCOLLEGIATE,'UMGC may accept for credit noncollegiate courses and training'),
        q(UMGC_NONCOLLEGIATE,'or the National College Credit Recommendation Service (NCCRS, formerly PONSI).')],
      basis:'UMGC counts ACE- and NCCRS-evaluated noncollegiate courses as an external source of credit, limited by the combined maximum from all external sources (45 associate, 90 bachelor’s). No separate ceiling for ACE/NCCRS credit is published.'},
    upper:{residencyCheck:{credits:15,category:null,
      quotes:[q(UMGC_BACHELOR,'You must complete a minimum of 120 credits.'),q(UMGC_BACHELOR,'At least 15 credits of upper-level coursework (i.e., earned in courses numbered 300 to 499) must be completed at UMGC.')],
      basis:'UMGC’s bachelor’s degree requirements set no degree-wide upper-level minimum. Their only upper-level rule is 15 upper-level credits (courses numbered 300 to 499) completed at UMGC.',
      label:'named upper-level courses',
      question:'Ask UMGC which upper-level (300–499) courses in this plan count toward the 15 upper-level credits it requires you to take at UMGC.'}},
    notes:{
      gradedCourseworkInMajor:{value:0.5,scope:'At least half the major’s credits must be graded coursework; ACE/NCCRS noncollegiate credit is not graded coursework. Met by the half-major residency rule, because UMGC courses are graded.',sourceIds:[UMGC_BACHELOR],
        quotes:[q(UMGC_BACHELOR,'Credits earned by examination, industry certifications, portfolio assessment, and noncollegiate training do not count as graded coursework.')]}}},
  champlain:{
    sources:[
      src(CHAMP_CATALOG,'Champlain College Online 2026–2027 Undergraduate Catalog: Academic Information and Policies (PLA credit award guidelines, degree requirements, transfer of credits)','https://catalog.champlain.edu/content.php?catoid=71&navoid=2026','8740d501ede745fb'),
      src(CHAMP_PLA,'Champlain College Online: Credit for Prior Learning & Experience','https://online.champlain.edu/admission/prior-learning-experience-credit','1658af3e37e0ffb1')],
    alternative:{
      levels:{associate:'transfer',bachelor:'transfer'},
      quotes:[
        q(CHAMP_CATALOG,'CCO may apply a maximum of 45 credits towards an associate degree and 90 credits towards a bachelor’s degree for any combination of direct transfer credit options (i.e courses from regionally-accredited institutions, and described in Transfer of Credit policy) and the PLA options described above.'),
        q(CHAMP_CATALOG,'Alternative course provides')],
      basis:'Champlain’s catalog applies one combined maximum (45 associate, 90 bachelor’s) to transfer credit and every PLA option, which include ACE/NCCRS-evaluated alternative course providers. Its only narrower limit is for examination programs such as CLEP or AP (30 associate, 60 bachelor’s), which this plan does not use.'},
    upper:{residencyCheck:{credits:15,category:'major',label:'named 300-level or higher major courses',
      quotes:[q(CHAMP_CATALOG,'Earn at least 120 credit hours, 30 of which must be earned at Champlain College.'),q(CHAMP_CATALOG,'Students in bachelor’s degree programs must complete 15 hours of 300-level or higher courses in the major.')],
      basis:'Champlain’s bachelor’s degree requirements set no degree-wide upper-level minimum. Their only upper-level rule is 15 credits of 300-level or higher major courses at Champlain.',
      question:'Ask Champlain which 300-level or higher major courses in this plan count toward the 15 upper-level major credits it requires you to take at Champlain.'}},
    notes:{
      examinationProgramMax:{value:{associate:30,bachelor:60},creditSystem:'semester',scope:'Examination programs such as CLEP and AP only.',sourceIds:[CHAMP_CATALOG],
        quotes:[q(CHAMP_CATALOG,'The maximum number of credits that can be earned through any examination program (e.g. CLEP, AP) is 30 for an associate degree and 60 for a bachelor’s degree.')]},
      alternativeCreditBeforeEnrollment:{value:true,scope:'Sophia and Study.com credit earned after enrolling at Champlain may not be accepted; finish those courses before you enroll.',sourceIds:[CHAMP_PLA],
        quotes:[q(CHAMP_PLA,'Credits earned through sophia.org prior to enrollment at CCO are eligible for transfer, credits earned at sophia.org after enrolling at CCO may not be considered.')]}}},
  strayer:{
    sources:[],
    alternative:{
      levels:{associate:'transfer',bachelor:'transfer'},
      quotes:[
        q(STRAYER_ADMISSION,'No more than 126 quarter hours of transfer credit from all sources may be applied toward a bachelor’s degree'),
        q(STRAYER_ADMISSION,'no more than 63 quarter hours of transfer credit from all sources may be applied toward an associate degree'),
        q(STRAYER_ADMISSION,'Strayer accepts credits from acceptable organizations that have been reviewed by the American Council on Education, National College Credit Recommendation Service')],
      basis:'Strayer treats ACE- and NCCRS-reviewed credit as transfer credit under its all-sources maximum (126 quarter hours bachelor’s, 63 associate). Its 30% cap applies to credit for life or work experience, a different source.'},
    upper:{resolved:{resolution:'no-degree-wide-upper-level-minimum',
      quotes:[q(STRAYER_CONFERRAL,'Complete at least 90 quarter credit hours of course work for an associate degree and 180 quarter credit hours of course work for a bachelor’s degree with a minimum cumulative GPA of 2.0.')],
      basis:'Strayer’s degree conferral requirements set the total, GPA and residency for a bachelor’s degree but no degree-wide upper-level minimum.'}},
    notes:{
      lifeWorkExperienceMax:{value:0.3,scope:'Credit for life or work experience only.',sourceIds:[STRAYER_ADMISSION],quotes:[q(STRAYER_ADMISSION,'no more than 30% of credit in a student’s degree program may be awarded from life or work experience')]},
      transferCreditAge:{value:10,unit:'years',scope:'Accounting and computer-related courses only (except a CIS101 equivalent).',sourceIds:[STRAYER_ADMISSION],quotes:[q(STRAYER_ADMISSION,'Credits from courses in accounting and computer-related areas are subject to a 10-year limitation when being evaluated')]},
      duplicateCredit:{value:'one-source-only',sourceIds:[STRAYER_ADMISSION],quotes:[q(STRAYER_ADMISSION,'If a student submits transcripts from two institutions or sources that include credit for the same or similar course, credit from only one source will be posted.')]}}},
  apus:{
    sources:[src(APUS_BACHELORS,'American Public University catalog: Bachelor’s Programs','https://catalog.apus.edu/apu/academic-programs/bachelors/','71286e539ec299f5')],
    upper:{resolved:{resolution:'no-degree-wide-upper-level-minimum',
      quotes:[q(APUS_BACHELORS,'Bachelor degree programs require a minimum of 120 semester hours and a GPA of 2.0 for graduation.'),q(APUS_BACHELORS,'In most cases, these are comprised of general education, major, and elective requirements.')],
      basis:'APU’s bachelor’s degree requirements set a total and GPA but no degree-wide upper-level minimum; upper-level courses are the named courses in each program’s published curriculum.'}}},
  bellevue:{
    sources:[],
    alternative:{
      levels:{associate:'transfer',bachelor:{
        message:'The catalog accepts up to 90 hours of experiential/prior learning but does not say whether ACE-recommended courses count toward that limit or only toward the 97-credit transfer maximum.',
        question:'Ask Bellevue whether ACE-recommended courses (such as Sophia) count toward its 90-hour limit on experiential/prior learning, or only toward the overall transfer maximum.'}},
      quotes:[q(BELLEVUE,'University will accept up to 90 hours of experiential/prior'),q(BELLEVUE,'Associate of Science (A.S.) • 60 • • 2.0 2.5 15 NA NA')],
      basis:'For an associate degree the overall transfer maximum (45 of 60 credits, after the 15-credit residency) is the binding limit: Bellevue’s only narrower published limit on prior learning is 90 hours, which is higher.'}}
};

const isUpperCode=code=>{const n=Number(String(code||'').match(/(\d{3})/)?.[1]);return n>=300&&n<500;};
/** Named 300–499 major credits the plan always takes at the school (the compiled model offers no outside option). */
async function schoolOnlyUpperCredits(base,routeId,majorOnly){
  try{
    const doc=await readJSON(join(base,'content/curricula',routeId+'.json')),model=(doc.models||[doc])[0];
    return model.requirements.filter(r=>r.code&&isUpperCode(r.code)&&(!majorOnly||['major','core','capstone'].includes(r.category))&&!list(r.options).some(o=>o.provider&&o.provider!=='University')).reduce((s,r)=>s+r.credits,0);
  }catch{return 0;}
}
const list=value=>Array.isArray(value)?value:[];
const sourceIdsOf=quotes=>[...new Set(quotes.map(item=>item.sourceId))];

export async function record({base=root,only=null}={}){
  const report={};
  for(const[id,cfg]of Object.entries(SCHOOLS)){
    if(only&&!only.includes(id))continue;
    const dir=join(base,'content/pathway-kits',id),schoolPath=join(dir,'school.json'),school=await readJSON(schoolPath);
    for(const source of cfg.sources){const at=school.sources.findIndex(s=>s.id===source.id);if(at<0)school.sources.push(source);else school.sources[at]={...school.sources[at],...source};}
    if(cfg.notes){school.policies={...(school.policies||{})};for(const[name,note]of Object.entries(cfg.notes))school.policies[name]={...note,checked:CHECKED};}
    await writeJSON(schoolPath,school,[]);
    const rows=[];
    for(const file of (await readdir(join(dir,'programs'))).filter(f=>f.endsWith('.json')).sort()){
      const path=join(dir,'programs',file),program=await readJSON(path);
      if(!list(program.routeIds).length||!program.policies?.transferMaxCredits||!program.modelFields)continue;// drafts keep their hold reason
      const routeId=program.routeIds[0],level=program.level,unit=program.policies.transferMaxCredits.creditSystem;
      const alt=cfg.alternative?.levels?.[level],upper=level==='bachelor'?cfg.upper:null;
      const managed=[alt&&'alternativeMaxCredits',upper&&'upperMinCredits'].filter(Boolean);
      if(!managed.length)continue;
      const review=list(program.modelFields.policyReview).filter(item=>!managed.includes(item.field));
      if(alt)delete program.policies.alternativeMaxCredits;
      if(upper)delete program.policies.upperLevelMinimum;
      const row={routeId,level};
      if(alt==='transfer'){
        const quotes=cfg.alternative.quotes;
        program.policies.alternativeMaxCredits={value:program.policies.transferMaxCredits.value,creditSystem:unit,sourceIds:sourceIdsOf(quotes),quotes,basis:cfg.alternative.basis,reviewed:CHECKED};
        row.alternativeMaxCredits=program.policies.alternativeMaxCredits.value;
      }else if(alt){
        review.push({field:'alternativeMaxCredits',status:'unverified',message:alt.message,question:alt.question,sourceIds:sourceIdsOf(cfg.alternative.quotes),checkedOn:CHECKED});
        row.alternativeMaxCredits='open';
      }
      if(upper){
        let resolved=upper.resolved,open=upper.open;
        if(upper.residencyCheck){
          const check=upper.residencyCheck,credits=await schoolOnlyUpperCredits(base,routeId,check.category==='major'),need=check.credits;
          if(credits>=need)resolved={resolution:'no-degree-wide-upper-level-minimum',quotes:upper.residencyCheck.quotes,basis:`${upper.residencyCheck.basis} This plan’s ${check.label} with no outside option total ${credits} credits, so it meets that rule.`};
          else open={quotes:upper.residencyCheck.quotes,message:`${upper.residencyCheck.basis} This plan’s ${check.label} with no outside option total ${credits} of ${need} credits, so meeting the rule depends on the student’s choices.`,question:upper.residencyCheck.question};
          row.upperMajorAtSchool=credits;
        }
        if(resolved){
          const ids=sourceIdsOf(resolved.quotes);
          program.policies.upperLevelMinimum={value:null,status:'none-published',sourceIds:ids,quotes:resolved.quotes,basis:resolved.basis,reviewed:CHECKED};
          review.push({field:'upperMinCredits',status:'resolved',resolution:resolved.resolution,sourceIds:ids,checkedOn:CHECKED,message:resolved.basis});
          row.upperMinCredits='resolved';
        }else if(open){
          if(open.programQuote){// quote the program's own catalog pages, which state the reference to upper-level requirements
            for(const source of list(program.sources).filter(s=>s.capture)){
              const captured=normalizeText(await readFile(join(base,source.capture),'utf8').catch(()=>''));
              if(captured.includes(normalizeText(open.programQuote))){open={...open,quotes:[q(source.id,open.programQuote)]};break;}
            }
          }
          const ids=sourceIdsOf(open.quotes);
          if(open.quotes.length)program.policies.upperLevelMinimum={value:null,status:'not-established',sourceIds:ids,quotes:open.quotes,basis:open.message,reviewed:CHECKED};
          review.push({field:'upperMinCredits',status:'unverified',message:open.message,question:open.question,sourceIds:ids,checkedOn:CHECKED});
          row.upperMinCredits='open';
        }
      }
      if(review.length)program.modelFields.policyReview=review;else delete program.modelFields.policyReview;
      await writeJSON(path,program,[]);
      rows.push(row);
    }
    report[id]=rows;
  }
  return report;
}

if(import.meta.url===`file://${process.argv[1]}`){
  const report=await record();
  for(const[id,rows]of Object.entries(report))console.log(id,JSON.stringify(rows));
}
