import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');
const packet=JSON.parse(read('content/research-batches/umpi-undergraduate-components-2026-11-26.json'));
const proposal=packet.sources.find(source=>source.id==='umpi-applied-psychology-proposal-2025-reviewed-2026-11-26');
const current=packet.sources.find(source=>source.id==='umpi-current-psychology-yourpace-2026-11-26');
const body=read(proposal.capture),currentBody=read(current.capture),component=packet.reviewedProposalComponents[0];
const core=body.slice(body.indexOf('Psychology Core Requirements - 15 Credits'),body.indexOf('General Concentration - 30 Credits'));
const concentration=body.slice(body.indexOf('General Concentration - 30 Credits'),body.indexOf('General Electives- 5 credits/ Remainder to total 90 credits'));
const rows=text=>[...text.matchAll(/^([A-Z]{3} \d{3}) - (.*?) (\d+) credits$/gm)].map(match=>({code:match[1],title:match[2],credits:Number(match[3]),quote:match[0]}));
const courseCodes=courses=>courses.flatMap(course=>[course.code,...course.aliases||[]]);
const lookup=code=>[...component.fixedCore,...component.coreStatisticsChoice.options,...component.concentrationChoicePool.options].find(course=>course.code===code);

test('UMPI components bind retained primary text without relabeling the 2025 proposal as a current catalog',()=>{
  for(const source of packet.sources){
    if(!source.capture){assert.match(source.retrievalStatus,/capture-pending/);assert.equal(source.sha256,undefined);continue;}
    const text=read(source.capture),meta=JSON.parse(read(source.capture.replace(/\.txt$/,'.json'))),hash=createHash('sha256').update(text).digest('hex');
    assert.equal(source.sha256,hash,source.id);assert.equal(source.sourceContentHash,'sha256:'+hash);
    assert.equal(meta.url,source.url);assert.equal(meta.sha256,hash);assert.equal(meta.status,200);assert.equal(meta.fetchedAt.slice(0,10),source.checkedOn);
  }
  assert.match(body,/Program Proposal Submission Date: 3\.31\.25/);assert.match(body,/Date: May 13, 2025/);
  assert.match(proposal.documentPeriod,/2025/);assert.match(proposal.scope,/not relabeled/);
  assert.equal(proposal.documentSha256,undefined,'The text-capture hash must not be invented as the raw PDF hash');
  assert.match(proposal.captureIntegrity,/raw PDF document hash was not recorded/);
  for(const source of packet.additionalOfficialSourceLeads){
    const text=read(source.capture),hash=createHash('sha256').update(text).digest('hex');assert.equal(source.sha256,hash);
    assert.match(text,/scheduling aid|specific course offerings/i,'Named major maps are not promoted into a complete GEC catalog');
  }
});

test('major quantities and every concentration option are independently recovered from the retained institutional ledger',()=>{
  const coreRows=rows(core),concentrationRows=rows(concentration),pool=component.concentrationChoicePool;
  assert.equal(coreRows.length,6,'The proposal prints four fixed core courses plus two mutually exclusive statistics options');
  assert.deepEqual(courseCodes([...component.fixedCore,...component.coreStatisticsChoice.options]).filter(code=>code!=='SOC 311').sort(),coreRows.map(row=>row.code).sort());
  assert.deepEqual(courseCodes(pool.options).sort(),concentrationRows.map(row=>row.code).sort(),'The cross-listed Social Psychology row is retained as one logical choice');
  assert.equal(pool.options.length,19);assert.equal(concentrationRows.length,20);assert.equal(new Set(courseCodes(pool.options)).size,20);
  for(const [courses,ledger]of [[component.fixedCore,coreRows],[component.coreStatisticsChoice.options,coreRows],[pool.options,concentrationRows]])for(const course of courses){
    const published=ledger.find(row=>row.code===course.code);assert(published,course.code);
    assert.equal(course.credits,published.credits);assert.equal(course.evidence.sourceId,proposal.id);assert.equal(course.evidence.creditQuote,published.quote);
    if(course.evidence.prerequisiteQuote)assert(body.includes(course.evidence.prerequisiteQuote),course.code+' prerequisite text is retained exactly');
  }
  const statedCore=Number(body.match(/Psychology Core Requirements (\d+) credits/)[1]);
  const statedConcentration=Number(body.match(/General Concentration (\d+) credits/)[1]);
  assert.equal(component.coreCredits,statedCore);assert.equal(component.concentrationCredits,statedConcentration);
  assert.equal(component.fixedCore.reduce((sum,course)=>sum+course.credits,0)+component.coreStatisticsChoice.requiredCredits,statedCore);
  assert.equal(component.coreStatisticsChoice.selectCourses,1);assert.match(core,/MAT 101[^\n]+\nOR\nMAT 201/);
  assert.equal(pool.selectCourses*pool.options[0].credits,statedConcentration);assert.equal(component.majorCredits,statedCore+statedConcentration);
  const selection=body.match(/Select (\d+) courses from the following; at least (\d+) must be at 400-level:/);
  assert.equal(pool.selectCourses,Number(selection[1]));assert.equal(pool.minimum400LevelCourses,Number(selection[2]));
  assert.equal(pool.evidence.selectionQuote,selection[0]);
  assert(pool.options.some(course=>/^PSY 4\d{2}$/.test(course.code)));
  assert.deepEqual(pool.crossListingsAreOneCourse,[['PSY 200','SOC 200']]);
  assert.equal(pool.coreAndConcentrationMayNotDoubleCountTheSameMAT201,true);assert.equal(pool.oneUsePerCourse,true);
});

test('placement, prerequisite alternatives and university permissions remain separate academic conditions',()=>{
  assert.match(lookup('PSY 100').evidence.prerequisiteQuote,/reading and writing placement tests[\s\S]*ENG 100[\s\S]*non-degree seeking student/);
  assert.match(lookup('PSY 100').conditions.join(' '),/no placement waiver or test score is assumed/);
  assert.deepEqual(lookup('PSY 311').prerequisiteAlternatives,[['PSY 100','MAT 101'],['PSY 100','MAT 201'],['SOC 100','MAT 101'],['SOC 100','MAT 201']]);
  assert.match(lookup('PSY 311').evidence.prerequisiteQuote,/SOC 100 or PSY 100, and MAT 101 or MAT 201/);
  assert.deepEqual(lookup('PSY 311').aliases,['SOC 311']);assert.match(body,/Course Title: PSY 311\/SOC 311/);
  assert.deepEqual(lookup('PSY 446').prerequisiteAlternatives,[['PSY 100'],['BIO 112']]);
  assert.deepEqual(lookup('PSY 380').prerequisites,['PSY 235','PSY 370']);
  assert.match(lookup('PSY 382').evidence.prerequisiteQuote,/or permission of the instructor/);assert.match(lookup('PSY 382').conditions.join(' '),/not automatically granted/);
  assert.match(lookup('PSY 475').evidence.prerequisiteQuote,/Senior Standing,[\s\S]*two 300\/400 level courses/);
  assert.match(lookup('PSY 475').conditions.join(' '),/effect of senior standing in a 90-credit degree remains unconfirmed/);
  for(const code of ['PSY 480','PSY 496'])assert.match(lookup(code).evidence.prerequisiteQuote,/consent of[\s\S]*instructor/);
  assert.match(lookup('PSY 448').conditions.join(' '),/truncated/,'The missing recommendation is retained as unknown rather than invented');
});

test('the active 90-credit offering is not confused with the 120-credit version or a complete transfer template',()=>{
  const offering=packet.currentOffering;
  const amounts=currentBody.match(/This program includes (\d+) credit hours of general education courses, (\d+) credit hours of Psychology\/core courses, and a minimum of (\d+) credit hours of electives\./);
  assert(amounts,'The current page separately prints the 90-credit program allocation');
  assert.deepEqual([offering.generalEducationCredits,offering.psychologyCoreAndConcentrationCredits,offering.generalElectiveMinimumCredits],amounts.slice(1).map(Number));
  assert.equal(offering.degreeCredits,amounts.slice(1).reduce((sum,value)=>sum+Number(value),0));
  assert.match(currentBody,/at least 30 credits, including substantial advanced work in the major, must be awarded by UMPI/);
  assert.equal(offering.minimumCreditsAtUMPI,30);assert.equal(offering.outsideCeilingArithmeticOnly,offering.degreeCredits-offering.minimumCreditsAtUMPI);
  const system=packet.sources.find(source=>source.id==='ums-active-applied-degrees-update-reviewed-2026-11-26'),systemText=read(system.capture);
  assert.match(systemText,/approved by the System.s accreditor[\s\S]*November 2025/);
  assert.match(systemText,/These programs are active for Fall 2026:[\s\S]*Applied Psychology at the University of Maine at Presque Isle/);
  const gec=packet.sources.find(source=>source.id==='umpi-current-gec-2026-11-26'),gecText=read(gec.capture);
  assert.match(gecText,/Students newly accepted for the 2026-2027 academic year or future years will automatically follow the new curriculum/);
  assert.equal(offering.alternativeCreditCap,null,'The arithmetic ceiling is not converted into a resolved ACE cap');
  assert.equal(offering.eligibility.automaticAdmissionApproval,false);assert.match(currentBody,/after a two-year pause/);
  assert(offering.recognitionDisclosures.some(value=>/120-credit/.test(value)));assert(offering.recognitionDisclosures.some(value=>/financial aid/.test(value)));
  assert.equal(packet.publicationAllowed,false);assert.equal(packet.newStudentPlansVerified,0);assert.equal(packet.models,undefined);
  assert.equal(component.currentProgramCatalogMatchConfirmed,false);assert.equal(component.publicationAllowed,false);
  assert.equal(component.generalEducationCourses,undefined);assert.equal(component.generalEducationChoicePool,undefined);
  assert.match(offering.currentCatalogRetrievalStatus,/403/);assert(packet.remainingEvidence.some(value=>/GEC course list/.test(value)));
  const school=JSON.parse(read('content/pathway-kits/umpi/school.json'));
  assert(!JSON.stringify(school.publish).includes(packet.id),'An internal source component must not be used as a ready publication entry');
});
