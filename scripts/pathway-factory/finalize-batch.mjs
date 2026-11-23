/**
 * Shared review finalization for automated factory batches. A batch script supplies, per school, its captured
 * transfer-limit and residency sources and policies, the drafts to keep unpublished (with the reason) and the explicit
 * Sophia category-award placement rules; this module adds those sources and policies, declares one online route per
 * reviewed program, marks open course-choice blocks as slots, and marks reviewed only the drafts that pass review.
 * Programs stay drafts (with a heldReason) when their captured page leaves a credit total unexplained, when no
 * published outside course joins any requirement, or when a residency or upper-level rule depends on choices the plan
 * cannot represent. Idempotent: re-running rewrites the same values.
 *
 * School config (`schools[id]`):
 *   sources                 captured school-level sources added to school.json
 *   levels.<level>          {transferMax?|residency?, alternativeMax?, upper?, majorResidency?, majorFraction?, upperResidency?, quotes}
 *     majorFraction         {value, quotes, exempt?: [slug]}: share of the program's `major` category credits the school
 *                           requires through the school (published as majorInstitutionFraction + majorResidencyBasisCredits)
 *     upperResidency        {credits, quotes}: upper-level credits (course numbers 300-499) required at the school; met
 *                           only when named upper-level courses with no outside option already reach it
 *   extraSlotKinds          [{category, titlePattern, kind, override?}]: codeless blocks of other categories that are open
 *                           choices (override: true replaces the default kind for that category, e.g. a restricted
 *                           "Program Electives" list is a major-elective choice, not a free elective)
 *   capstoneAtSchool        {quote}: named capstone courses are institutionalOnly (school policy)
 *   unpublished             {slug: reason}
 *   parents                 {slug: directory program id}
 */
import {join} from 'node:path';
import {readdir,rm} from 'node:fs/promises';
import {readJSON,writeJSON,loadKit,loadProviders,matchRequirement,inScope,rowStatus,root,programUnits,slotPieces,slotRowsFor,slotUpperOnly,list,normalizeText} from './lib.mjs';

export const GOALS=['any-degree','career-growth','change-career'];

/** Draft requirement category -> open-slot kind. Any other category on a codeless requirement keeps its program a draft. */
export const SLOT_KIND={'general-education':'gen-ed',elective:'free-elective',concentration:'concentration',major:'major-elective',core:'major-elective'};

export function slotKindOf(cfg,r){
  const match=list(cfg.extraSlotKinds).find(x=>x.category===r.category&&new RegExp(x.titlePattern,'i').test(r.title));
  if(match&&(match.override||!SLOT_KIND[r.category]))return match.kind;
  return SLOT_KIND[r.category];
}

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

async function writeSlotRules(dir,id,cfg){
  const path=join(dir,'equivalencies.json'),doc=await readJSON(path);
  if(!cfg){delete doc.slotPlacements;await writeJSON(path,doc,['equivalencies']);return;}
  doc.slotPlacements=cfg.rules.map(rule=>({id:`${id}-${rule.id}`,receivingText:rule.receivingText,slotKinds:rule.slotKinds,...(rule.labelPattern?{labelPattern:rule.labelPattern}:{}),lowerDivision:true,
    sourceIds:[...new Set([cfg.source,...list(rule.extraQuotes).map(q=>q.sourceId)])],quotes:[{sourceId:cfg.source,text:rule.receivingText},...list(rule.extraQuotes)],
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
function coveredCredits(kit,program,cfg){
  const rows=kit.equivalencies.equivalencies.filter(row=>rowStatus(row)==='published'&&inScope(row,program,kit)),units=programUnits(kit,program);
  return program.requirements.reduce((sum,r)=>{
    const kind=!r.code&&slotKindOf(cfg,r);
    if(kind){const slotReq={...r,slot:{kind,label:r.title}};return sum+slotPieces(r.credits,units).filter(credits=>slotRowsFor(kit,program,slotReq,{credits}).length).reduce((s,c)=>s+c,0);}
    return sum+(rows.some(row=>matchRequirement(row,program)?.id===r.id)?r.credits:0);
  },0);
}

/**
 * Upper-level credits the plan always places at the school: named 300-499 courses with no published outside option,
 * plus open choices whose own label restricts them to upper level (slot placement rules are lower-division only, so
 * no outside option can fill them).
 */
function schoolOnlyUpperCredits(kit,program){
  const rows=kit.equivalencies.equivalencies.filter(row=>rowStatus(row)==='published'&&inScope(row,program,kit));
  return program.requirements.filter(r=>{
    if(!r.code)return slotUpperOnly(r.title)&&list(kit.equivalencies.slotPlacements).every(rule=>rule.lowerDivision!==false);
    const number=Number(String(r.code).match(/(\d{3})/)?.[1]);
    return number>=300&&number<500&&(r.institutionalOnly||!rows.some(row=>matchRequirement(row,program)?.id===r.id));
  }).reduce((s,r)=>s+r.credits,0);
}

export async function finalizeSchools({schools,slotRules={},checked,base=root,only=null}){
  const REVIEW={status:'reviewed',reviewer:'DegreeSteps research (automated draft, human-directed review)',reviewedOn:checked};
  const kitsDir=join(base,'content/pathway-kits'),providers=await loadProviders(join(kitsDir,'providers')),report={};
  for(const[id,cfg]of Object.entries(schools)){
    if(only&&!only.includes(id))continue;
    const dir=join(kitsDir,id),schoolPath=join(dir,'school.json'),school=await readJSON(schoolPath);
    await writeSlotRules(dir,id,slotRules[id]);
    // Slots are judged on the unsplit draft ledger: clear any slot marks from an earlier run before loading.
    for(const file of (await readdir(join(dir,'programs'))).filter(f=>f.endsWith('.json'))){const path=join(dir,'programs',file),p=await readJSON(path);if(p.requirements.some(r=>r.slot)){p.requirements.forEach(r=>delete r.slot);await writeJSON(path,p,[]);}}
    const kit=await loadKit(dir,{providers});
    await copySlotIdentitySources(kitsDir,id,kit,school);
    school.checkedOn=checked;
    school.publish={path:`content/curricula/${id}.json`};
    school.programDefaults={format:'Online',modalities:['online'],paceModel:'course-term'};
    const known=new Set(school.sources.map(s=>s.id));for(const s of cfg.sources)if(!known.has(s.id))school.sources.push(s);else Object.assign(school.sources.find(x=>x.id===s.id),s);
    const routes=[],published=[],held=[];
    for(const file of (await readdir(join(dir,'programs'))).filter(f=>f.endsWith('.json')).sort()){
      const path=join(dir,'programs',file),program=await readJSON(path),slug=program.slug,level=cfg.levels[program.level];
      // School policy: capstone courses are completed at the school (quoted on the requirement).
      if(cfg.capstoneAtSchool)for(const r of program.requirements)if(r.category==='capstone'&&r.code){
        r.institutionalOnly=true;
        r.sourceIds=[...new Set([...list(r.sourceIds),cfg.capstoneAtSchool.quote.sourceId])];
        r.quotes=[...list(r.quotes).filter(q=>q.text!==cfg.capstoneAtSchool.quote.text),cfg.capstoneAtSchool.quote];
      }
      const covered=coveredCredits(kit,kit.programs.find(p=>p.slug===slug),cfg);
      const reason=cfg.unpublished[slug]||(!level?`No sourced ${program.level} transfer policy.`:covered<=0?'No published outside course joins any named requirement of this program.':null);
      const draftReview=heldReason=>({status:'draft',draftedBy:program.review.draftedBy,draftedOn:program.review.draftedOn,heldReason});
      if(reason){held.push({slug,reason});program.review=draftReview(reason);program.routeIds=[];await writeJSON(path,program,[]);continue;}
      const capHold=cfg.capHold?.includes(slug);
      const unit=school.creditSystem,total=program.totalCredits;
      const routeId=`${id}-${slug}`,primary=program.sources[0];
      let transferMax,institutionMin,basis;
      if(level.transferMax!==undefined){transferMax=level.transferMax;institutionMin=total-transferMax;basis=`${total} degree credits minus the ${transferMax}-credit transfer ceiling.`;}
      else{institutionMin=level.residency;transferMax=total-institutionMin;basis=`${total} degree credits minus the ${institutionMin}-credit in-residence minimum; no separate transfer ceiling is published.`;}
      const quotes=[...level.quotes,...(cfg.baQuote&&/arts|communication/i.test(program.title)&&program.level==='bachelor'?[cfg.baQuote]:[])];
      const policySourceIds=[...new Set(quotes.map(q=>q.sourceId))];
      program.policies={transferMaxCredits:{value:transferMax,creditSystem:unit,sourceIds:policySourceIds,quotes,basis}};
      if(level.alternativeMax!==undefined)program.policies.alternativeMaxCredits={value:level.alternativeMax,creditSystem:unit,sourceIds:policySourceIds,quotes:[level.quotes[0],cfg.alternativeQuote],basis:'Sophia credit is ACE-recommended, which the school counts as non-traditional transfer credit.'};
      const policyEvidence={
        externalMaxCredits:{value:transferMax,creditSystem:unit,sourceIds:policySourceIds,scope:basis},
        institutionMinCredits:{value:institutionMin,creditSystem:unit,sourceIds:policySourceIds,scope:'Minimum credits completed at the school.',calculation:basis}};
      // A reviewed current-catalog identity: the label must equal the model's catalog and the URL must be a source checked that day.
      program.catalog=`${school.name} current catalog page for ${program.title}, checked ${checked}`;
      const modelFields={catalogYear:`Current catalog page, checked ${checked}`,catalogIdentity:{kind:'reviewed-current-catalog',label:program.catalog,sourceUrl:primary.url,checkedOn:checked},defaultProviders:['Sophia'],institutionMinCredits:institutionMin,policyEvidence};
      if(level.upper){modelFields.upperMinCredits=level.upper;policyEvidence.upperMinCredits={value:level.upper,creditSystem:unit,sourceIds:policySourceIds,scope:'Upper-level (300–400) credit hours required for the degree.'};}
      if(level.majorResidency){
        const business=cfg.business21?.slugs.includes(slug);
        modelFields.majorMinInstitutionCredits=business?21:level.majorResidency;
        policyEvidence.majorMinInstitutionCredits={value:modelFields.majorMinInstitutionCredits,creditSystem:unit,sourceIds:policySourceIds,scope:business?'Upper-level major credit hours completed in residence for this business major.':'Major credit hours completed in residence.'};
        if(business)program.policies.transferMaxCredits.quotes=[...program.policies.transferMaxCredits.quotes,cfg.business21.quote];
      }
      if(level.majorFraction&&!list(level.majorFraction.exempt).includes(slug)){
        // The school's rule is a share of the major; the denominator is this program's own `major` category credits.
        const majorCredits=program.requirements.filter(r=>r.category==='major').reduce((s,r)=>s+r.credits,0);
        const fracSources=[...new Set(level.majorFraction.quotes.map(q=>q.sourceId))];
        if(majorCredits>0){
          Object.assign(modelFields,{majorInstitutionFraction:level.majorFraction.value,majorResidencyBasisCredits:majorCredits});
          policyEvidence.majorInstitutionFraction={value:level.majorFraction.value,creditSystem:unit,sourceIds:fracSources,scope:`Share of the ${majorCredits} major credits in this program's major block that must be completed at the school.`};
          program.policies.transferMaxCredits.quotes=[...program.policies.transferMaxCredits.quotes,...level.majorFraction.quotes];
          program.policies.transferMaxCredits.sourceIds=[...new Set([...program.policies.transferMaxCredits.sourceIds,...fracSources])];
        }
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
      const unsupported=placeholders.filter(r=>!slotKindOf(cfg,r));
      if(unsupported.length){
        const why=`Reviewed; ${unsupported.length} block(s) without a named course are not a course choice the student can make (${unsupported.map(r=>r.title).join('; ')}).`;
        held.push({slug,reason:why});program.review=draftReview(why);program.routeIds=[];await writeJSON(path,program,[]);continue;
      }
      // Upper-level credits the school requires in residence: verified only when named upper-level courses with no
      // outside option (the student necessarily takes them at the school) already reach the minimum.
      if(level.upperResidency){
        const schoolUpper=schoolOnlyUpperCredits(kit,kit.programs.find(p=>p.slug===slug));
        if(schoolUpper<level.upperResidency.credits){
          const why=`Reviewed; upper-level courses and upper-level-only choices with no outside option total ${schoolUpper} of the ${level.upperResidency.credits} upper-level credits required at the school, so meeting the rule depends on choices the plan cannot yet represent.`;
          held.push({slug,reason:why});program.review=draftReview(why);program.routeIds=[];await writeJSON(path,program,[]);continue;
        }
        const upperSources=[...new Set(level.upperResidency.quotes.map(q=>q.sourceId))];
        // Recorded with the transfer policy (the model's residencyPolicy field is reserved for WGU's capstone rule).
        program.policies.transferMaxCredits.basis+=` The school also requires ${level.upperResidency.credits} upper-level credits at the school; ${schoolUpper} upper-level credits in this program (named courses and upper-level-only choices) have no outside option, so the plan always meets it.`;
        program.policies.transferMaxCredits.quotes=[...program.policies.transferMaxCredits.quotes,...level.upperResidency.quotes];
        program.policies.transferMaxCredits.sourceIds=[...new Set([...program.policies.transferMaxCredits.sourceIds,...upperSources])];
      }
      // Owner-approved open slots (2026-11-23): a general-education, elective, concentration or major block without a
      // named course is a sourced choice the student fills; its quoted title is the slot label.
      for(const r of placeholders)r.slot={kind:slotKindOf(cfg,r),label:r.title};
      // Individual admission and transfer approval still apply, so the pathway is never marked executable.
      const openShare=placeholders.length?Math.round(placeholders.reduce((s,r)=>s+r.credits,0)/total*100):0;
      Object.assign(modelFields,{coverage:'complete',completeExecutablePathway:false,coverageLabel:`Complete ${total}-credit ${program.title} ledger from ${school.name}'s current catalog page${placeholders.length?`, including ${placeholders.length} open course choice block(s) (${openShare}% of credits) you fill`:''}, with outside options from Sophia's published ${school.name} partner table.`});
      if(capHold){
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
      routes.push({id:routeId,...(cfg.parents?.[slug]?{parentId:cfg.parents[slug]}:{}),title:program.title,school:school.name,schoolId:id,level:program.level,modalities:['online'],field,fields:[field],goals:GOALS,paceModel:'course-term',url:primary.url,sourceId:primary.id,degreeCredits:total,creditUnit:unit,status:'listed',checkedOn:checked});
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

export function printReport(report){
  for(const[id,r]of Object.entries(report)){
    console.log(`${id}: ${r.published.length} reviewed, ${r.held.length} held`);
    for(const h of r.held)console.log(`  held ${h.slug}: ${h.reason}`);
  }
}
