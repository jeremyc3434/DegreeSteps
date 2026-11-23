/**
 * One-time review finalization (2026-11-23) for the first automated factory batch: Strayer, Champlain College Online,
 * APUS and Bellevue. It adds each school's captured transfer-limit and residency sources and policies, declares one
 * online route per reviewed program, and marks reviewed only the drafts that passed review. Programs are left as drafts
 * when their captured page leaves a credit total unexplained or no published outside course joins any requirement.
 * Idempotent: re-running rewrites the same values. Usage: node scripts/pathway-factory/finalize-four-schools-2026-11-23.mjs
 */
import {join} from 'node:path';
import {readdir,rm} from 'node:fs/promises';
import {readJSON,writeJSON,loadKit,loadProviders,matchRequirement,inScope,rowStatus,root,slug,programUnits,slotPieces,slotRowsFor,slotUpperOnly,list,normalizeText} from './lib.mjs';

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

/** Reviewed programs with the least outside-course coverage (below 11.8% of degree credits), held so the academic registry
 *  index stays inside its 12 MiB Worker budget. Coverage measured 2026-11-23 after the course-code join fix. */
// The registry is sharded per school (2026-11-23), so no reviewed program is held for the index size budget any more.
const CAP_HOLD={};

/** Draft requirement category -> open-slot kind. Any other category on a codeless requirement keeps its program a draft. */
const SLOT_KIND={'general-education':'gen-ed',elective:'free-elective',concentration:'concentration',major:'major-elective',core:'major-elective'};

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

/**
 * A slot-placed provider course keeps its reviewed identity evidence: identity sources defined only in another kit's
 * school.json are copied here, tagged copiedFor/copiedFrom (as the Sophia importer does for published rows).
 */
async function copySlotIdentitySources(kitsDir,id,kit,school){
  const tag=`slot-placements-${id}:provider-identity`,texts=new Set(list(kit.equivalencies.slotPlacements).map(rule=>normalizeText(rule.receivingText)));
  school.sources=school.sources.filter(s=>s.copiedFor!==tag);
  const have=new Set([...school.sources.map(s=>s.id),...[...kit.providers.values()].flatMap(p=>list(p.sources).map(s=>s.id))]),need=new Set();
  for(const row of list(kit.equivalencies.equivalencies)){
    if(row.receivingCode||!texts.has(normalizeText(row.receivingTitle||'')))continue;
    const course=list(kit.providers.get(row.provider)?.courses).find(c=>c.code===row.code);
    for(const ref of [...list(course?.identitySourceIds),...list(course?.sourceCreditVerification?.sourceIds)])if(!have.has(ref))need.add(ref);
  }
  if(!need.size)return;
  const origins=new Map();
  for(const name of (await readdir(kitsDir)).sort()){
    if(name==='providers'||name===id)continue;
    try{for(const s of list((await readJSON(join(kitsDir,name,'school.json'))).sources))if(!s.copiedFor&&!origins.has(s.id))origins.set(s.id,{source:s,from:name+'/school.json'});}catch{}
  }
  for(const ref of [...need].sort()){const origin=origins.get(ref);if(origin)school.sources.push({...origin.source,copiedFor:tag,copiedFrom:origin.from});}
}

async function writeSlotRules(dir,id){
  const cfg=SLOT_RULES[id],path=join(dir,'equivalencies.json'),doc=await readJSON(path);
  if(!cfg){delete doc.slotPlacements;await writeJSON(path,doc,['equivalencies']);return;}
  doc.slotPlacements=cfg.rules.map(rule=>({id:`${id}-${rule.id}`,receivingText:rule.receivingText,slotKinds:rule.slotKinds,...(rule.labelPattern?{labelPattern:rule.labelPattern}:{}),lowerDivision:true,
    sourceIds:[cfg.source],quotes:[{sourceId:cfg.source,text:rule.receivingText}],
    condition:`Sophia's ${cfg.school} partner table lists this course as "${rule.receivingText}" credit, not as a named course. ${cfg.school} decides whether it fills this open course choice; confirm before you enroll.`,
    basis:'Owner-approved open slot (2026-11-23): an elective or category award fills only an open choice of the matching kind.'}));
  await writeJSON(path,doc,['equivalencies']);
}

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

/** Credits that have at least one outside option: named requirements joined by a published row, plus slot choices a rule fills. */
function coveredCredits(kit,program){
  const rows=kit.equivalencies.equivalencies.filter(row=>rowStatus(row)==='published'&&inScope(row,program,kit)),units=programUnits(kit,program);
  return program.requirements.reduce((sum,r)=>{
    const kind=!r.code&&SLOT_KIND[r.category];
    if(kind){const slotReq={...r,slot:{kind,label:r.title}};return sum+slotPieces(r.credits,units).filter(credits=>slotRowsFor(kit,program,slotReq,{credits}).length).reduce((s,c)=>s+c,0);}
    return sum+(rows.some(row=>matchRequirement(row,program)?.id===r.id)?r.credits:0);
  },0);
}

export async function finalize({base=root}={}){
  const kitsDir=join(base,'content/pathway-kits'),providers=await loadProviders(join(kitsDir,'providers')),report={};
  for(const[id,cfg]of Object.entries(SCHOOLS)){
    const dir=join(kitsDir,id),schoolPath=join(dir,'school.json'),school=await readJSON(schoolPath);
    await writeSlotRules(dir,id);
    // Slots are judged on the unsplit draft ledger: clear any slot marks from an earlier run before loading.
    for(const file of (await readdir(join(dir,'programs'))).filter(f=>f.endsWith('.json'))){const path=join(dir,'programs',file),p=await readJSON(path);if(p.requirements.some(r=>r.slot)){p.requirements.forEach(r=>delete r.slot);await writeJSON(path,p,[]);}}
    const kit=await loadKit(dir,{providers});
    await copySlotIdentitySources(kitsDir,id,kit,school);
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
      // Bellevue's catalog defines upper level by course number ("Upper-level (300-400)"): mark named 300- and 400-level
      // courses upper level so the 30 upper-level credit rule can be checked.
      if(cfg.upperLevelQuote){
        for(const r of program.requirements){const number=Number(String(r.code||'').match(/(\d{3})/)?.[1]);if(r.code&&number>=300&&number<500)r.upper=true;else delete r.upper;}
        program.quotes=[...list(program.quotes).filter(q=>q.text!==cfg.upperLevelQuote.text),cfg.upperLevelQuote];
        delete program.sourceIds;// program-level quotes resolve against school sources
      }
      delete program.status;
      const placeholders=program.requirements.filter(r=>!r.code);
      const unsupported=placeholders.filter(r=>!SLOT_KIND[r.category]);
      if(unsupported.length){
        const why=`Reviewed; ${unsupported.length} block(s) without a named course are not a course choice the student can make (${unsupported.map(r=>r.title).join('; ')}).`;
        held.push({slug,reason:why});program.review=draftReview(why);program.routeIds=[];await writeJSON(path,program,[]);continue;
      }
      // Owner-approved open slots (2026-11-23): a general-education, elective, concentration or major block without a
      // named course is a sourced choice the student fills; its quoted title is the slot label.
      for(const r of placeholders)r.slot={kind:SLOT_KIND[r.category],label:r.title};
      // Individual admission and transfer approval still apply, so the pathway is never marked executable.
      const openShare=placeholders.length?Math.round(placeholders.reduce((s,r)=>s+r.credits,0)/total*100):0;
      Object.assign(modelFields,{coverage:'complete',completeExecutablePathway:false,coverageLabel:`Complete ${total}-credit ${program.title} ledger from ${school.name}'s current catalog page${placeholders.length?`, including ${placeholders.length} open course choice block(s) (${openShare}% of credits) you fill`:''}, with outside options from Sophia's published ${school.name} partner table.`});
      if(capHold){
        // Reviewed and fully prepared, but held: publishing it would push dist/data/academic-registry.json past the
        // Worker's 12 MiB parse budget. Set review to reviewed and bind the route once the index is sharded.
        const why='Reviewed and ready; held only by the academic registry index size budget (12 MiB). Publish after the index is sharded.';
        held.push({slug,reason:why});program.review=draftReview(why);program.routeIds=[];await writeJSON(path,program,[]);continue;
      }
      // The plan treats an open elective as a course of unknown level, so upper-level and upper-level-major residency
      // minimums must be met by named courses (or upper-level-only slots). Otherwise the student's elective choices
      // decide feasibility, which the plan cannot show yet: keep the program a draft.
      if(level.upper){
        const upperNamed=program.requirements.filter(r=>r.upper||r.slot&&slotUpperOnly(r.slot.label)).reduce((s,r)=>s+r.credits,0);
        const businessMajor=cfg.business21?.slugs.includes(slug),majorUpper=program.requirements.filter(r=>r.code&&(r.upper||!businessMajor)&&['major','core','concentration'].includes(r.category)).reduce((s,r)=>s+r.credits,0);
        const why=upperNamed<level.upper?`Reviewed; named upper-level courses total ${upperNamed} of the ${level.upper} required upper-level credits, so the open electives would have to be upper level, which the plan cannot yet represent.`
          :modelFields.majorMinInstitutionCredits&&majorUpper<modelFields.majorMinInstitutionCredits?`Reviewed; named ${businessMajor?'upper-level ':''}major courses total ${majorUpper} of the ${modelFields.majorMinInstitutionCredits} ${businessMajor?'upper-level ':''}major credits required in residence.`:null;
        if(why){held.push({slug,reason:why});program.review=draftReview(why);program.routeIds=[];for(const r of program.requirements)delete r.slot;await writeJSON(path,program,[]);continue;}
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
    // One compact document per program: open-slot choices repeat their outside options, so a student's worksheet loads
    // only its own degree instead of the whole school.
    if(published.length){
      school.routes=routes;school.programOrder=published.map(p=>p.slug);
      school.publish={compiledBy:'pathway-factory',compact:true,documents:published.map(p=>({path:`content/curricula/${id}-${p.slug}.json`,programs:[p.slug],sources:'own',routes:routes.filter(r=>r.id===`${id}-${p.slug}`)}))};
    }
    else{delete school.publish;delete school.routes;delete school.programOrder;}
    await rm(join(base,`content/curricula/${id}.json`),{force:true});
    for(const name of await readdir(join(base,'content/curricula')))if(name.startsWith(id+'-')&&name.endsWith('.json')&&!published.some(p=>name===`${id}-${p.slug}.json`))await rm(join(base,'content/curricula',name),{force:true});
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
