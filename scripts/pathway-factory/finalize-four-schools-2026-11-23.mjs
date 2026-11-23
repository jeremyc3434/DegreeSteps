/**
 * One-time review finalization (2026-11-23) for the first automated factory batch: Strayer, Champlain College Online,
 * APUS and Bellevue. It adds each school's captured transfer-limit and residency sources and policies, declares one
 * online route per reviewed program, and marks reviewed only the drafts that passed review. Programs are left as drafts
 * when their captured page leaves a credit total unexplained or no published outside course joins any requirement.
 * Idempotent: re-running rewrites the same values. Usage: node scripts/pathway-factory/finalize-four-schools-2026-11-23.mjs
 */
import {join} from 'node:path';
import {readdir} from 'node:fs/promises';
import {readJSON,writeJSON,loadKit,loadProviders,matchRequirement,inScope,rowStatus,root} from './lib.mjs';

const CHECKED='2026-11-23';
const REVIEW={status:'reviewed',reviewer:'DegreeSteps research (automated draft, human-directed review)',reviewedOn:CHECKED};
const GOALS=['any-degree','career-growth','change-career'];

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
      'supply-chain-and-logistics-management':'The captured page gives two different major totals (54 and 57 credits) without explaining the difference.'}}};

/** Reviewed programs with the least outside-course coverage (below 11.8% of degree credits), held so the academic registry
 *  index stays inside its 12 MiB Worker budget. Coverage measured 2026-11-23 after the course-code join fix. */
const CAP_HOLD={
  bellevue:['associate-degree-in-multidisciplinary-studies','business-analytics','history','online-bachelor-s-degree-of-public-health'],
  apus:['associate-of-arts-in-criminal-justice','associate-of-science-in-cybersecurity','bachelor-of-arts-in-communication','bachelor-of-arts-in-criminal-justice','bachelor-of-arts-in-emergency-and-disaster-management','bachelor-of-arts-in-marketing','bachelor-of-arts-in-psychology','bachelor-of-arts-in-supply-chain-management','bachelor-of-science-in-computer-science','bachelor-of-science-in-cybersecurity','bachelor-of-science-in-finance','bachelor-of-science-in-fire-science-management','bachelor-of-science-in-healthcare-administration','bachelor-of-science-in-information-technology','bachelor-of-science-in-public-health'],
  champlain:['bachelor-of-science-in-cybersecurity','bachelor-of-science-in-information-technology','computer-information-systems','computer-science','data-science-and-artificial-intelligence','economic-crime-investigation','human-resource-management','marketing-and-communication','marketing-management','sociology-bachelor-of-arts'],
  strayer:['bachelor-of-science-in-criminal-justice','health-services-administration']};

/** Finder field from the program title (journey-engine field ids). */
export function fieldFor(title){
  const t=title.toLowerCase();
  if(/accounting|finance|financial/.test(t))return 'accounting-finance';
  if(/psycholog/.test(t))return 'psychology';
  if(/criminal|justice|crime|homeland|emergency|disaster|fire|security studies/.test(t))return 'criminal-justice';
  if(/health|medical|nursing/.test(t))return 'health';
  if(/cyber|computer|software|information|technology|data|analytics|network|systems|artificial/.test(t))return 'technology';
  if(/business|management|marketing|human resource|supply|project|administration|leadership/.test(t))return 'business';
  if(/history|sociology|social|political/.test(t))return 'social-science';
  if(/communication|english|humanities/.test(t))return 'humanities';
  return 'general';
}

function coveredCredits(kit,program){
  const rows=kit.equivalencies.equivalencies.filter(row=>rowStatus(row)==='published'&&inScope(row,program,kit));
  return program.requirements.filter(r=>rows.some(row=>matchRequirement(row,program)?.id===r.id)).reduce((s,r)=>s+r.credits,0);
}

export async function finalize({base=root}={}){
  const kitsDir=join(base,'content/pathway-kits'),providers=await loadProviders(join(kitsDir,'providers')),report={};
  for(const[id,cfg]of Object.entries(SCHOOLS)){
    const dir=join(kitsDir,id),schoolPath=join(dir,'school.json'),school=await readJSON(schoolPath);
    const kit=await loadKit(dir,{providers});
    school.checkedOn=CHECKED;
    school.publish={path:`content/curricula/${id}.json`};
    school.programDefaults={format:'Online',modalities:['online'],paceModel:'course-term'};
    const known=new Set(school.sources.map(s=>s.id));for(const s of cfg.sources)if(!known.has(s.id))school.sources.push(s);else Object.assign(school.sources.find(x=>x.id===s.id),s);
    const routes=[],published=[],held=[];
    for(const file of (await readdir(join(dir,'programs'))).filter(f=>f.endsWith('.json')).sort()){
      const path=join(dir,'programs',file),program=await readJSON(path),slug=program.slug,level=cfg.levels[program.level];
      const covered=coveredCredits(kit,kit.programs.find(p=>p.slug===slug));
      const reason=cfg.unpublished[slug]||(!level?`No sourced ${program.level} transfer policy.`:covered<=0?'No published outside course joins any named requirement of this program.':null);
      const draftReview=heldReason=>({status:'draft',draftedBy:program.review.draftedBy,draftedOn:program.review.draftedOn,heldReason});
      if(reason){held.push({slug,reason});program.review=draftReview(reason);program.routeIds=[];await writeJSON(path,program,[]);continue;}
      const capHold=CAP_HOLD[id]?.includes(slug);
      const unit=school.creditSystem,total=program.totalCredits;
      const routeId=`${id}-${slug}`,primary=program.sources[0];
      let transferMax,institutionMin,basis;
      if(level.transferMax!==undefined){transferMax=level.transferMax;institutionMin=total-transferMax;basis=`${total} degree credits minus the ${transferMax}-credit transfer ceiling.`;}
      else{institutionMin=level.residency;transferMax=total-institutionMin;basis=`${total} degree credits minus the ${institutionMin}-credit in-residence minimum; no separate transfer ceiling is published.`;}
      const quotes=[...level.quotes,...(id==='bellevue'&&/arts|communication/i.test(program.title)&&program.level==='bachelor'?[cfg.baQuote]:[])];
      const policySourceIds=[...new Set(quotes.map(q=>q.sourceId))];
      program.policies={transferMaxCredits:{value:transferMax,creditSystem:unit,sourceIds:policySourceIds,quotes,basis}};
      if(level.alternativeMax!==undefined)program.policies.alternativeMaxCredits={value:level.alternativeMax,creditSystem:unit,sourceIds:policySourceIds,quotes:[level.quotes[0],cfg.alternativeQuote],basis:'Sophia credit is ACE-recommended, which the school counts as non-traditional transfer credit.'};
      const policyEvidence={
        externalMaxCredits:{value:transferMax,creditSystem:unit,sourceIds:policySourceIds,scope:basis},
        institutionMinCredits:{value:institutionMin,creditSystem:unit,sourceIds:policySourceIds,scope:'Minimum credits completed at the school.',calculation:basis}};
      // A reviewed current-catalog identity: the label must equal the model's catalog and the URL must be a source checked that day.
      program.catalog=`${school.name} current catalog page for ${program.title}, checked ${CHECKED}`;
      const modelFields={catalogYear:`Current catalog page, checked ${CHECKED}`,catalogIdentity:{kind:'reviewed-current-catalog',label:program.catalog,sourceUrl:primary.url,checkedOn:CHECKED},defaultProviders:['Sophia'],institutionMinCredits:institutionMin,policyEvidence};
      if(level.upper){modelFields.upperMinCredits=level.upper;policyEvidence.upperMinCredits={value:level.upper,creditSystem:unit,sourceIds:policySourceIds,scope:'Upper-level (300–400) credit hours required for the degree.'};}
      if(level.majorResidency){
        const business=cfg.business21?.slugs.includes(slug);
        modelFields.majorMinInstitutionCredits=business?21:level.majorResidency;
        policyEvidence.majorMinInstitutionCredits={value:modelFields.majorMinInstitutionCredits,creditSystem:unit,sourceIds:policySourceIds,scope:business?'Upper-level major credit hours completed in residence for this business major.':'Major credit hours completed in residence.'};
        if(business)program.policies.transferMaxCredits.quotes=[...program.policies.transferMaxCredits.quotes,cfg.business21.quote];
      }
      program.modelFields=modelFields;
      delete program.status;
      const placeholders=program.requirements.filter(r=>!r.code);
      if(placeholders.length){
        // The plan finder needs a complete named baseline: one named course per requirement with matching credits. These
        // category, concentration and elective blocks need named course choices from the school's course catalog first.
        const share=Math.round(placeholders.reduce((s,r)=>s+r.credits,0)/total*100);
        const why=`Reviewed; needs a named baseline before publishing: ${placeholders.length} requirement(s) (${share}% of degree credits) are general-education, concentration or elective blocks without a named course.`;
        held.push({slug,reason:why});program.review=draftReview(why);program.routeIds=[];await writeJSON(path,program,[]);continue;
      }
      // Every requirement is a named course from the captured catalog page: the ledger is complete (individual admission and
      // transfer approval still apply, so the pathway is never marked executable).
      Object.assign(modelFields,{coverage:'complete',completeExecutablePathway:false,coverageLabel:`Complete ${total}-credit ${program.title} ledger from ${school.name}'s current catalog page, with outside options from Sophia's published ${school.name} partner table.`});
      if(capHold){
        // Reviewed and fully prepared, but held: publishing it would push dist/data/academic-registry.json past the
        // Worker's 12 MiB parse budget. Set review to reviewed and bind the route once the index is sharded.
        const why='Reviewed and ready; held only by the academic registry index size budget (12 MiB). Publish after the index is sharded.';
        held.push({slug,reason:why});program.review=draftReview(why);program.routeIds=[];await writeJSON(path,program,[]);continue;
      }
      program.routeIds=[routeId];
      program.review={...program.review,...REVIEW};
      delete program.review.heldReason;
      await writeJSON(path,program,[]);
      const field=fieldFor(program.title);
      routes.push({id:routeId,...(cfg.parents?.[slug]?{parentId:cfg.parents[slug]}:{}),title:program.title,school:school.name,schoolId:id,level:program.level,modalities:['online'],field,fields:[field],goals:GOALS,paceModel:'course-term',url:primary.url,sourceId:primary.id,degreeCredits:total,creditUnit:unit,status:'listed',checkedOn:CHECKED});
      published.push({slug,covered,total});
    }
    // A school with no publishable program publishes nothing: no curriculum document and no declared routes.
    if(published.length){school.routes=routes;school.programOrder=published.map(p=>p.slug);}
    else{delete school.publish;delete school.routes;delete school.programOrder;}
    await writeJSON(schoolPath,school,[]);
    report[id]={published,held};
  }
  return report;
}

if(import.meta.url===`file://${process.argv[1]}`){
  const report=await finalize();
  for(const[id,r]of Object.entries(report)){
    console.log(`${id}: ${r.published.length} reviewed, ${r.held.length} held`);
    for(const h of r.held)console.log(`  held ${h.slug}: ${h.reason}`);
  }
}
