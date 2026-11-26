/* Course-first presentation of the existing ledger. No new awards or matches. */
(function (root, factory) {
  const common = typeof module === 'object' && module.exports;
  const api = factory(common ? require('./planner.js') : root.DegreePlanner, common ? require('./provider-registry.js') : root.DegreeCreditProviders);
  if (common) module.exports = api;
  else root.DegreeCoursePlanView = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Planner, Providers) {
  'use strict';
  const list = value => Array.isArray(value) ? value : [];
  const text = value => typeof value === 'string' ? value.trim() : '';
  const key = value => text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const providerKey = value => Providers ? Providers.key(value) : ({sophialearning:'sophia',sophiaorg:'sophia',collegelevelexaminationprogram:'clep'}[key(value)] || key(value));
  const known = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
  // Validate against the complete, original ledger before displaying actual
  // earned credit instead of native course weight. Section subsets are views,
  // never independently authorized variable-credit degree models.
  function creditProjection(draft) {
    const program = draft?.program, plan = draft?.plan;
    const candidate = program?.degreeCreditBalancePolicy?.enabled === true && program.degreeCreditBalancePolicy.kind === 'gcu-earned-credit-balance-v1';
    const rejected = candidate && plan ? {...draft,plan:{...plan,validation:{...plan.validation,academicCountsValid:false}}} : draft;
    const empty = {draft:rejected,balance:null,inactive:new Set()};
    if (!Planner?.creditBalancePolicy || !Planner?.validate || !program?.id || plan?.programId !== program.id || plan.validation?.academicCountsValid !== true || !Array.isArray(program.requirements) || !Array.isArray(plan.rows)) return empty;
    try {
      const balance = Planner.creditBalancePolicy(program), requirements = new Map(program.requirements.map(req => [req.id,req]));
      if (!balance || requirements.size !== program.requirements.length || plan.rows.length !== requirements.size) return empty;
      const rows = new Map(plan.rows.map(row => [row.requirementId,row]));
      if (rows.size !== requirements.size || [...rows.keys()].some(id => !requirements.has(id)) || Planner.validate(program,plan).academicCountsValid !== true) return empty;
      const inactive = new Set(balance.balanceRequirementIds.filter(id => rows.get(id)?.credits === 0 && rows.get(id)?.option === null));
      const actualRequirements = program.requirements.map(req => ({...req,credits:rows.get(req.id).credits}));
      return {draft:{...draft,program:{...program,requirements:actualRequirements}},balance,inactive};
    } catch {return empty;}
  }
  function visibleRows(draft) {
    const view = creditProjection(draft);
    return list(draft?.plan?.rows).filter(row => !view.inactive.has(row.requirementId));
  }
  const knownUnits = value => ['semester','quarter','competency-unit'].includes(value);
  function originalQuantity(option, record) {
    if (known(record?.credits) && knownUnits(record.creditSystem)) return {credits:record.credits,creditSystem:record.creditSystem};
    const credits = known(option.bundleCredits) ? option.bundleCredits : option.sourceCredits;
    return known(credits) && knownUnits(option.sourceCreditSystem) ? {credits,creditSystem:option.sourceCreditSystem} : {credits:null,creditSystem:null};
  }
  const unique = values => [...new Set(values.filter(Boolean))];
  const codes = value => unique([value?.code,value?.mappingCode,...list(value?.codeAliases)].map(key));
  const safeURL = value => {try {const u = new URL(value);return u.protocol === 'https:' && !u.username && !u.password ? u.href : null;} catch {return null;}};
  const providerDirectories = {
    sophia:'https://www.sophia.org/online-courses/all-courses/',
    studycom:'https://study.com/college/online-college-courses.html',
    straighterline:'https://www.straighterline.com/online-college-courses/',
    clep:'https://clep.collegeboard.org/clep-exams',
    saylor:'https://www.saylor.org/',
    dsst:'https://getcollegecredit.com/',
    christianleadersinstitute:'https://www.christianleadersinstitute.org/'
  };
  function sameSource(left, right) {
    if (!providerKey(left?.provider) || providerKey(left.provider) !== providerKey(right?.provider)) return false;
    const values = codes(left);
    return values.length > 0 && codes(right).some(code => values.includes(code));
  }
  function actualCourseURL(value, provider) {
    if (Providers) return Providers.courseURL(value, provider);
    const url = safeURL(value); if (!url) return null;
    const u = new URL(url), host = u.hostname.toLowerCase().replace(/^www\./,''), path = u.pathname.replace(/\/+$/,'');
    if (/\.(?:pdf|docx?|xlsx?)(?:$|\?)/i.test(path) || /degreeforum|reddit|acenet\.edu/.test(host)) return null;
    const p = providerKey(provider);
    if (p === 'sophia' && host === 'sophia.org') {
      const match = path.match(/^\/online-courses\/(.+)$/);
      if (match && !['all-courses','business','math','science','humanities','social-science','english-and-communication','computer-science-and-it'].includes(match[1])) return url;
    }
    if (p === 'straighterline' && host === 'straighterline.com' && /^\/online-college-courses\/[^/]+/.test(path)) return url;
    if (p === 'studycom' && (host === 'study.com' || host.endsWith('.study.com')) && /^\/academy\/course\/[^/]+/.test(path)) return url;
    if (p === 'clep' && host === 'clep.collegeboard.org' && /^\/clep-exams\/[^/]+/.test(path)) return url;
    if (p === 'dsst' && host === 'getcollegecredit.com' && /^\/exam\/[^/]+$/.test(path)) return url;
    if (p === 'saylor' && host === 'learn.saylor.org' && path === '/course/view.php' && u.searchParams.has('id')) return url;
    if (p === 'christianleadersinstitute' && host === 'christianleaders.org' && path === '/course/view.php' && /^\d+$/.test(u.searchParams.get('id')||'')) return url;
    return null;
  }
  function links(option, provider, catalog) {
    const matches = list(catalog?.courses).filter(course => sameSource(option,course));
    const courseURLs = unique(matches.map(course => actualCourseURL(course.url,provider)));
    const courseUrl = courseURLs.length === 1 ? courseURLs[0] : actualCourseURL(option?.courseUrl || option?.url,provider);
    let providerUrl = Providers?.directory(provider) || providerDirectories[providerKey(provider)] || null;
    if(providerKey(provider)==='christianleadersinstitute'&&safeURL(option?.providerDirectoryUrl)){const directory=new URL(option.providerDirectoryUrl);if(directory.hostname==='christianleaders.org'&&directory.pathname==='/course/index.php'&&/^\d+$/.test(directory.searchParams.get('categoryid')||''))providerUrl=directory.href;}
    return {courseUrl:courseUrl || null,providerUrl,providerLinkLabel:providerKey(provider) === 'clep' ? 'Browse CLEP exams' : 'Find course at '+provider};
  }
  function sourceRecords(row, option, program) {
    const identityOnly = new Set(list(option?.identitySourceIds));
    const receivingClaim=source=>{
      const roles=[...list(source?.role),...list(source?.roles),...(typeof source?.role==='string'?[source.role]:[])];
      const submitted=roles.includes('receiving-institution-submitted-equivalency')&&option?.mappingEvidence?.claimOrigin==='receiving-institution-submitted'&&list(option.mappingEvidence.sourceIds).includes(source.id)&&key(option.mappingEvidence.receivingCode)===key(row.code);
      const receiving=key(option?.receivingCode),target=key(row.code),crossListed=list(option?.crossListedReceivingCodes).map(key);
      // A reviewed guide can explicitly place one receiving award against a
      // different requirement. Keep that guide only when both named codes and
      // the exact fulfillment claim are bound to this option's source.
      const alternate=receiving&&target&&key(option?.fulfillsCode)===target&&crossListed.includes(receiving)&&crossListed.includes(target)&&list(option?.sourceIds).includes(source?.id);
      const guide=source?.evidenceType==='official-receiving-school-equivalency'&&text(option?.mappingReviewId)&&text(option?.mappingChecked)&&receiving&&target&&(receiving===target||alternate);
      return submitted||guide;
    };
    const ids = unique([...list(option?.sourceIds),...list(row.sourceIds)]).filter(id => !identityOnly.has(id)||receivingClaim(list(program?.sources).find(source=>source.id===id)));
    return ids.map(id => list(program?.sources).find(source => source.id === id)).filter(Boolean);
  }
  // Plans that open while they need school confirmation label every row honestly. The per-option review comes from
  // data/option-review.json (globalThis.DegreeOptionReview[modelId]); an option it does not list is a published match.
  function reviewMap(program) {const all=typeof globalThis!=='undefined'?globalThis.DegreeOptionReview:null;const value=all&&program&&all[program.id];return value&&typeof value==='object'?value:null;}
  function conditionText(option) {const value=list(option?.conditions).map(text).find(Boolean);if(!value)return '';const clean=value.replace(/[.;:\s]+$/,'');return clean.length>110?clean.slice(0,107).replace(/\s+\S*$/,'')+'…':clean;}
  function reviewKind(requirement, option, review) {
    if(Planner&&typeof Planner.openSlotPlaceholder==='function'&&Planner.openSlotPlaceholder(requirement,option))return 'choose';
    if(!review||!option||!option.id||option.provider==='University')return option&&option.provider==='University'?'settled':null;
    return review[option.id]==='confirm'?'confirm':review[option.id]==='conditional'?'conditional':'settled';
  }
  function reviewLabel(requirement, option, review) {
    const kind=reviewKind(requirement,option,review);
    if(kind==='choose')return 'You choose this course';
    if(!review||!option||option.provider==='University')return '';
    if(kind==='confirm')return 'Confirm with school';
    if(kind==='conditional'){
      // The provider (not the school) publishes this match; the school decides when it evaluates the transcript.
      if(option.evidenceType==='provider-published-equivalency')return 'Counts if the school confirms this '+text(option.provider)+'-published match for your program';
      const condition=conditionText(option);return condition?'Counts if: '+condition:'Counts if the school approves it';
    }
    return 'Published match for this degree';
  }
  function mappingEvidence(row, option, sources, group) {
    if (group === 'unmapped') return row.placementReason === 'excluded-source' ? 'Source not included' : row.placementReason === 'conditional-gap' ? 'Conditional match excluded' : 'Course match needed';
    if (group === 'universityRequired') return 'School requirement';
    if (group === 'universityReserved') return row.placementReason==='reserved-university'?'University credit minimum':'University course selected';
    if (row.status === 'confirmed') return 'School confirmed';
    if (option?.evidence === 'student-record') return 'Student record';
    if(option?.receivingMapStatus==='published-school-submitted'&&option.mappingEvidence?.claimOrigin==='receiving-institution-submitted'&&key(option.mappingEvidence.receivingCode)===key(row.code)&&sources.some(source=>list(option.mappingEvidence.sourceIds).includes(source.id)&&/^https:\/\/(?:www\.)?acenet\.edu\//i.test(source.url||'')))return option.evidence==='published'?'School-submitted mapping':'School-submitted · conditional';
    if (option?.evidenceType === 'community-reported' || sources.some(source => /^df-/.test(source.id || '') || /degreeforum|reddit/.test(source.url || ''))) return 'Community-reported match';
    const official = option?.evidenceType === 'official-receiving-school-equivalency' || option?.evidenceType==='official-receiving-school-calculator'&&key(option.receivingCode)===key(row.code)&&option.calculatorAwardRange?.low===row.credits&&option.calculatorAwardRange?.high===row.credits || sources.some(source => source.evidenceType==='official-receiving-school-equivalency' ||
      /equivalenc|institution-submitted/i.test(source.title || '') && /\.edu(?:\/|$)|smartcatalogiq\.com/i.test(source.url || ''));
    if (official) return option?.evidence === 'conditional' ? 'School-listed · conditions apply' : 'School-listed match';
    return 'Mapping needs review';
  }
  function selectedUniversityCourse(row,requirement,program){
    const option=row.option,sources=new Set(list(program?.sources).map(source=>source.id));
    return option?.provider==='University'&&!row.selectionRequired&&!option.selectionRequired&&!requirement?.researchGap&&text(option.code)&&text(option.title)&&option.evidence==='published'&&known(option.credits)&&Math.abs(option.credits-row.credits)<0.001&&list(option.sourceIds).length>0&&option.sourceIds.every(id=>sources.has(id))&&list(requirement?.options).some(candidate=>candidate.id===option.id&&candidate.provider==='University'&&key(candidate.code)===key(option.code)&&candidate.evidence==='published'&&candidate.credits===option.credits);
  }
  function groupFor(row, requirement,program) {
    if (['reported','confirmed'].includes(row.status)) return 'completed';
    if (!row.option) return 'unmapped';
    if (row.option.provider !== 'University') return ['research-gap','conditional-gap','excluded-source'].includes(row.placementReason)?'unmapped':'transfer';
    if (row.placementReason === 'required-university' || requirement?.institutionalOnly === true) return 'universityRequired';
    if (row.placementReason === 'reserved-university'||selectedUniversityCourse(row,requirement,program)) return 'universityReserved';
    return 'unmapped';
  }
  function recordFor(row, option, program, records, matches, group) {
    const placement = matches.find(item => item.requirementId === row.requirementId);
    const placed = placement?.learningId ? records.find(item => item.id === placement.learningId) : null;
    if (placed) return placed;
    return records.find(item => sameSource(option,item) &&
      (group === 'completed' ? item.status === 'earned' : item.status === 'in-progress') &&
      (providerKey(option.provider) !== 'university' ||
        Boolean(key(program.school)) && key(item.institution) === key(program.school) && item.sourceProgramId === program.id));
  }
  function progressState(row, option, program, record, group) {
    if (row.unknownProvenance) return 'needs-course';
    if (['reported','confirmed'].includes(row.status)) return 'completed';
    if (group === 'unmapped') return 'needs-course';
    const unknownSource = option.sourceCreditStatus === 'unknown';
    const original = unknownSource ? originalQuantity(option,record) : null;
    const units = original ? original.creditSystem : option.sourceCreditSystem || option.creditSystem || program.creditSystem || 'semester';
    const sourceCredits = original ? original.credits : known(option.bundleCredits) ? option.bundleCredits : known(option.sourceCredits) ? option.sourceCredits : known(option.credits) ? option.credits : row.credits;
    if (record?.status === 'in-progress' && known(record.credits) &&
      ['semester','quarter','competency-unit'].includes(record.creditSystem) && record.creditSystem === units &&
      known(sourceCredits) && record.credits+0.001 >= sourceCredits) return 'in-progress';
    return 'not-started';
  }
  function progress(draft) {return progressLedger(creditProjection(draft).draft);}
  function progressLedger(draft) {
    const program = draft?.program || {}, rows = list(draft?.plan?.rows), records = list(draft?.state?.learning), matches = list(draft?.match?.completed);
    const totalCredits = known(program.totalCredits) ? program.totalCredits : 0;
    let confirmedCredits = 0, pendingReviewCredits = 0, inProgressCredits = 0, accountedCredits = 0, duplicateRequirement = false;
    const seen = new Set();
    for (const row of rows) {
      if (!row.requirementId) continue;
      if (seen.has(row.requirementId)) {duplicateRequirement=true;continue;}
      seen.add(row.requirementId);
      const requirement = list(program.requirements).find(req => req.id === row.requirementId);
      if (!requirement || !known(row.credits)) continue;
      const native = typeof requirement.credits === 'number' && Number.isFinite(requirement.credits) && requirement.credits >= 0 ? requirement.credits : row.credits;
      const credits = Math.min(row.credits,native), option = row.option || {}, group = groupFor(row,requirement,program);
      accountedCredits += credits;
      const status = progressState(row,option,program,recordFor(row,option,program,records,matches,group),group);
      if (status === 'completed') {
        if (row.status === 'confirmed') confirmedCredits += credits;
        else pendingReviewCredits += credits;
      } else if (status === 'in-progress') inProgressCredits += credits;
    }
    // The chart partitions degree requirements, never independently adds source
    // credit awards or duplicate enrollments. Invalid ledgers remain identifiable.
    confirmedCredits = Math.min(totalCredits,confirmedCredits);
    pendingReviewCredits = Math.min(totalCredits-confirmedCredits,pendingReviewCredits);
    const completedCredits = confirmedCredits+pendingReviewCredits;
    inProgressCredits = Math.min(totalCredits-completedCredits,inProgressCredits);
    const remainingCredits = Math.max(0,totalCredits-completedCredits-inProgressCredits);
    return {totalCredits,completedCredits,confirmedCredits,pendingReviewCredits,inProgressCredits,remainingCredits,
      completedPercent:totalCredits ? completedCredits/totalCredits*100 : 0,
      inProgressPercent:totalCredits ? inProgressCredits/totalCredits*100 : 0,
      remainingPercent:totalCredits ? remainingCredits/totalCredits*100 : 0,
      valid:Boolean(totalCredits && !duplicateRequirement && draft?.plan?.validation?.academicCountsValid === true && Math.abs(accountedCredits-totalCredits)<0.001)};
  }
  const sectionLabels = {general:'General education',core:'Core requirements',major:'Major requirements','area-of-study':'Area of study',concentration:'Concentration',minor:'Minor requirements',elective:'Free electives',institutional:'University requirements'};
  const sectionOrder = ['general','core','major','area-of-study','concentration','minor','elective','institutional'];
  const sectionId = category => text(category) === 'electives' ? 'elective' : text(category) || 'other';
  const sectionTitle = id => sectionLabels[id] || (id === 'other' ? 'Other requirements' : id.replace(/[-_]+/g,' ').replace(/^./,letter=>letter.toUpperCase()));
  const copy = value => JSON.parse(JSON.stringify(value));
  function mergeEnrollment(existing, entry) {
    existing.requirementIds.push(...entry.requirementIds); existing.requirements.push(...entry.requirements); existing.credits += entry.credits;
    existing.conditions = unique([...existing.conditions,...entry.conditions]); existing.sourceIds = unique([...existing.sourceIds,...entry.sourceIds]);
    existing.statuses = unique([...existing.statuses,...entry.statuses]);
    if (existing.sourceCredits !== entry.sourceCredits) existing.sourceCredits = null;
    if (existing.statuses.includes('reported')) {existing.status='reported';existing.evidenceLabel='School review pending';}
    if (!existing.courseUrl && entry.courseUrl) existing.courseUrl=entry.courseUrl;
    if (!existing.evidenceUrl && entry.evidenceUrl) existing.evidenceUrl=entry.evidenceUrl;
  }
  function sections(draft, allocations) {
    const program = draft?.program || {}, rows = list(draft?.plan?.rows), buckets = new Map(), seen = new Set(), shared = new Map();
    // These are receiving-degree allocations. One original bundled enrollment
    // may appear in different sections, but its credits are never repeated.
    const uniqueAllocations = allocations.filter(entry=>{if(seen.has(entry.requirementId))return false;seen.add(entry.requirementId);return true;});
    for (const entry of uniqueAllocations) {
      const id = sectionId(entry.category);
      if (!buckets.has(id)) buckets.set(id,{id,title:sectionTitle(id),credits:0,entries:[],requirementIds:[],enrollments:new Map()});
      const bucket=buckets.get(id), item=copy(entry);
      bucket.credits+=item.credits;bucket.requirementIds.push(...item.requirementIds);
      const enrollment=item.bundle?providerKey(item.provider)+'|'+item.bundle:null, mergeKey=enrollment?item.kind+'|'+enrollment:null;
      if (enrollment) {
        if (!shared.has(enrollment)) shared.set(enrollment,{id:enrollment,sectionIds:[],requirementIds:[],totalAppliedCredits:0,sourceCredits:item.sourceCredits,primaryRequirementId:item.requirementId});
        const source=shared.get(enrollment);source.sectionIds=unique([...source.sectionIds,id]);source.requirementIds.push(...item.requirementIds);source.totalAppliedCredits+=item.credits;
        if(source.sourceCredits!==item.sourceCredits)source.sourceCredits=null;
      }
      const existing=mergeKey&&bucket.enrollments.get(mergeKey);
      if(existing)mergeEnrollment(existing,item);
      else {bucket.entries.push(item);if(mergeKey)bucket.enrollments.set(mergeKey,item);}
    }
    const rank=id=>sectionOrder.includes(id)?sectionOrder.indexOf(id):sectionOrder.length;
    return [...buckets.values()].sort((a,b)=>rank(a.id)-rank(b.id)).map(bucket=>{
      const ids=new Set(bucket.requirementIds), requirements=list(program.requirements).filter(req=>ids.has(req.id));
      const sectionDraft={...draft,program:{...program,totalCredits:bucket.credits,requirements},plan:{...draft.plan,rows:rows.filter(row=>ids.has(row.requirementId))}};
      for(const entry of bucket.entries) {
        const source=entry.bundle&&shared.get(providerKey(entry.provider)+'|'+entry.bundle);
        if(source&&source.sectionIds.length>1){entry.crossSectionBundle=true;entry.sharedSource=copy(source);}
      }
      return {id:bucket.id,title:bucket.title,credits:bucket.credits,progress:progressLedger(sectionDraft),entries:bucket.entries};
    });
  }
  function curriculumHierarchy(draft, roots, allocations) {
    const definitions=list(draft?.program?.curriculumSections), issues=[], rootIds=new Set(roots.map(root=>root.id));
    roots.forEach(root=>{root.children=[];});
    if(!definitions.length)return {sections:roots,issues};
    const raw=new Map(), requirements=new Map(list(draft?.program?.requirements).map(req=>[req.id,req])), nodes=new Map(), counts=new Map();
    for(const entry of allocations)if(!raw.has(entry.requirementId))raw.set(entry.requirementId,entry);
    for(const definition of definitions){const id=text(definition?.id);if(id)counts.set(id,(counts.get(id)||0)+1);}
    const issue=(code,nodeId,requirementId)=>issues.push({code,nodeId,...(requirementId?{requirementId}:{})});
    for(const definition of definitions){
      const id=text(definition?.id), parentId=text(definition?.parentId);
      if(!id||!parentId){issue('invalid-section',id);continue;}
      if(counts.get(id)>1){if(!issues.some(item=>item.code==='duplicate-section-id'&&item.nodeId===id))issue('duplicate-section-id',id);continue;}
      if(rootIds.has(id)){issue('reserved-section-id',id);continue;}
      nodes.set(id,{...definition,id,parentId,title:text(definition.title)||sectionTitle(id)});
    }
    const paths=new Map(), visiting=new Set();
    function pathFor(id){
      if(paths.has(id))return paths.get(id);
      const node=nodes.get(id);if(!node||visiting.has(id))return null;
      visiting.add(id);const parent=rootIds.has(node.parentId)?[node.parentId]:pathFor(node.parentId);visiting.delete(id);
      const result=parent?[...parent,id]:null;paths.set(id,result);return result;
    }
    for(const id of nodes.keys())if(!pathFor(id))issue('invalid-section-parent',id);
    const childIds=new Map(), claims=new Map();
    for(const [id,node] of nodes){
      const path=paths.get(id);if(!path)continue;
      if(!childIds.has(node.parentId))childIds.set(node.parentId,[]);childIds.get(node.parentId).push(id);
      for(const requirementId of unique(list(node.requirementIds).map(text))){
        const entry=raw.get(requirementId);
        if(!entry){if(!requirements.has(requirementId))issue('unknown-requirement',id,requirementId);continue;}
        if(sectionId(entry.category)!==path[0]){issue('wrong-category',id,requirementId);continue;}
        if(!claims.has(requirementId))claims.set(requirementId,[]);claims.get(requirementId).push(id);
      }
    }
    const owners=new Map();
    for(const [id,entry] of raw){
      const candidates=claims.get(id)||[], deepest=candidates.filter(candidate=>!candidates.some(other=>other!==candidate&&paths.get(other)?.includes(candidate)));
      if(deepest.length===1)owners.set(id,deepest[0]);
      else {owners.set(id,sectionId(entry.category));if(deepest.length>1)issue('ambiguous-requirement',deepest.join(','),id);}
    }
    function entriesFor(items){
      const entries=[], merged=new Map();
      for(const original of items){const entry=copy(original), enrollment=entry.bundle?entry.kind+'|'+providerKey(entry.provider)+'|'+entry.bundle:null, existing=enrollment&&merged.get(enrollment);if(existing)mergeEnrollment(existing,entry);else {entries.push(entry);if(enrollment)merged.set(enrollment,entry);}}
      return entries;
    }
    function creditsFor(items){return items.reduce((sum,entry)=>sum+entry.credits,0);}
    function progressFor(items, references=new Map()){
      const owned=new Set(items.map(entry=>entry.requirementId)), ids=new Set([...owned,...references.keys()]);
      const rows=list(draft?.plan?.rows).filter(row=>ids.has(row.requirementId)).map(row=>references.has(row.requirementId)&&!owned.has(row.requirementId)?{...row,credits:references.get(row.requirementId)}:row);
      const selected=list(draft?.program?.requirements).filter(req=>ids.has(req.id)).map(req=>references.has(req.id)&&!owned.has(req.id)?{...req,credits:references.get(req.id)}:req);
      return progressLedger({...draft,program:{...draft?.program,totalCredits:creditsFor(items)+[...references.values()].reduce((sum,value)=>sum+value,0),requirements:selected},plan:{...draft?.plan,rows}});
    }
    function sharedFor(node, owned){
      const result=new Map();
      for(const requirementId of unique(list(node.sharedRequirementIds).map(text))){
        const entry=raw.get(requirementId);if(!entry){if(!requirements.has(requirementId))issue('unknown-shared-requirement',node.id,requirementId);continue;}
        if(owned.has(requirementId))continue;
        const override=node.sharedCreditOverrides&&Object.prototype.hasOwnProperty.call(node.sharedCreditOverrides,requirementId)?node.sharedCreditOverrides[requirementId]:undefined;
        if(override!==undefined&&(!Number.isFinite(override)||override<0||override>entry.credits)){issue('invalid-shared-credit',node.id,requirementId);continue;}
        result.set(requirementId,override===undefined?entry.credits:override);
      }
      return result;
    }
    function fallback(parentId,title,items){return{id:parentId+'--other',title:'Other '+title.toLowerCase()+' requirements',parentId,requirementIds:items.map(entry=>entry.requirementId),credits:creditsFor(items),progress:progressFor(items),allocatedProgress:progressFor(items),requirementCredits:creditsFor(items),sharedCredits:0,sharedEntries:[],entries:entriesFor(items),children:[],_owned:items,_references:new Map()};}
    function makeNode(id){
      const definition=nodes.get(id), children=(childIds.get(id)||[]).map(makeNode).filter(Boolean), direct=[...raw.values()].filter(entry=>owners.get(entry.requirementId)===id), items=[...direct,...children.flatMap(child=>child._owned)], owned=new Set(items.map(entry=>entry.requirementId));
      const directReferences=sharedFor(definition,owned), references=new Map(directReferences);
      for(const child of children)for(const [requirementId,amount] of child._references){
        if(owned.has(requirementId))continue;
        if(references.has(requirementId)&&references.get(requirementId)!==amount){issue('conflicting-shared-credit',id,requirementId);references.set(requirementId,Math.min(references.get(requirementId),amount));}
        else references.set(requirementId,amount);
      }
      if(!items.length&&!references.size&&!children.length)return null;
      if(children.length&&direct.length)children.push(fallback(id,definition.title,direct));
      const credits=creditsFor(items), sharedCredits=[...references.values()].reduce((sum,value)=>sum+value,0);
      const sharedEntries=[...directReferences].map(([requirementId,amount])=>({...copy(raw.get(requirementId)),credits:0,sharedCredits:amount,canonicalRequirementId:requirementId,isSharedReference:true,reference:true}));
      return {id,title:definition.title,parentId:definition.parentId,...(text(definition.sourceId)?{sourceId:text(definition.sourceId)}:{}),requirementIds:items.map(entry=>entry.requirementId),sharedRequirementIds:[...references.keys()],credits,sharedCredits,requirementCredits:credits+sharedCredits,progress:progressFor(items,references),allocatedProgress:progressFor(items),entries:entriesFor(items),sharedEntries,children,_owned:items,_references:references};
    }
    for(const root of roots){
      const rootChildren=(childIds.get(root.id)||[]).map(makeNode).filter(Boolean), unassigned=[...raw.values()].filter(entry=>owners.get(entry.requirementId)===root.id);
      if((childIds.get(root.id)||[]).length&&unassigned.length)rootChildren.push(fallback(root.id,root.title,unassigned));
      root.children=rootChildren;
      const owned=[...raw.values()].filter(entry=>sectionId(entry.category)===root.id), ownedIds=new Set(owned.map(entry=>entry.requirementId)), references=new Map();
      for(const child of rootChildren)for(const [requirementId,amount] of child._references){
        if(ownedIds.has(requirementId))continue;
        if(references.has(requirementId)&&references.get(requirementId)!==amount){issue('conflicting-shared-credit',root.id,requirementId);references.set(requirementId,Math.min(references.get(requirementId),amount));}
        else references.set(requirementId,amount);
      }
      root.sharedEntries=[];root.sharedRequirementIds=[...references.keys()];root.sharedCredits=[...references.values()].reduce((sum,value)=>sum+value,0);root.requirementCredits=root.credits+root.sharedCredits;root.fulfillmentProgress=progressFor(owned,references);
    }
    // A source split between leaf subsections remains one reviewed enrollment.
    const leaves=[];const collect=node=>{if(node.children.length)node.children.forEach(collect);else leaves.push(node);};roots.forEach(collect);
    const enrollments=new Map();
    for(const leaf of leaves)for(const entry of leaf.entries){
      if(!entry.bundle)continue;const id=providerKey(entry.provider)+'|'+entry.bundle;
      if(!enrollments.has(id))enrollments.set(id,{id,sectionIds:[],categoryIds:[],requirementIds:[],totalAppliedCredits:0,sourceCredits:entry.sourceCredits,primaryRequirementId:entry.requirementId});
      const enrollment=enrollments.get(id);enrollment.sectionIds=unique([...enrollment.sectionIds,leaf.id]);enrollment.categoryIds=unique([...enrollment.categoryIds,sectionId(entry.category)]);enrollment.requirementIds.push(...entry.requirementIds);enrollment.totalAppliedCredits+=entry.credits;if(enrollment.sourceCredits!==entry.sourceCredits)enrollment.sourceCredits=null;
    }
    for(const leaf of leaves)for(const entry of leaf.entries){const enrollment=entry.bundle&&enrollments.get(providerKey(entry.provider)+'|'+entry.bundle);if(enrollment&&enrollment.sectionIds.length>1){entry.crossSectionBundle=true;entry.crossSubsectionBundle=true;entry.sharedSource=copy(enrollment);}}
    const clean=node=>{delete node._owned;delete node._references;node.children.forEach(clean);};roots.forEach(clean);
    return {sections:roots,issues};
  }
  function build(draft, courseCatalog = {}) {
    const creditView = creditProjection(draft); draft = creditView.draft;
    const groups = {transfer:[],universityRequired:[],universityReserved:[],unmapped:[],completed:[]};
    const rows = list(draft?.plan?.rows), program = draft?.program || {}, records = list(draft?.state?.learning), match = list(draft?.match?.completed);
    const merged = new Map(), allocations = [];
    for (const row of rows) {
      if (creditView.inactive.has(row.requirementId)) continue;
      const requirement = list(program.requirements).find(req => req.id === row.requirementId);
      const group = groupFor(row,requirement,program), option = row.option || {};
      const record = recordFor(row,option,program,records,match,group);
      const provider = group === 'unmapped' ? '' : text(record?.provider) || text(option.provider) || 'Original coursework';
      const title = group === 'unmapped' ? text(requirement?.categoryLabel) || text(row.title) : text(record?.title) || text(option.title) || text(row.title);
      const bundle = text(option.bundleId) || null, source = sourceRecords(row,option,program);
      const original = option.sourceCreditStatus === 'unknown' ? originalQuantity(option,record) : null;
      const sourceCredits = original ? original.credits : group === 'completed' && record ? (known(record.credits) ? record.credits : null) : known(option.bundleCredits) ? option.bundleCredits : known(option.sourceCredits) ? option.sourceCredits : known(option.credits) ? option.credits : null;
      const entry = {
        id:row.requirementId, requirementId:row.requirementId, requirementIds:[row.requirementId],
        kind:group,category:text(requirement?.category),
        requirements:[{id:row.requirementId,code:text(row.code),title:text(requirement?.categoryLabel) || text(row.title),category:text(requirement?.category),credits:known(row.credits) ? row.credits : 0}],
        title,provider,credits:known(row.credits) ? row.credits : 0,sourceCredits,code:text(record?.code) || text(option.code),
        ...(creditView.balance && typeof row.nativeRequirementCredits === 'number' ? {nativeRequirementCredits:row.nativeRequirementCredits,creditBalanceDerived:creditView.balance.balanceRequirementIds.includes(row.requirementId)} : {}),
        ...(group === 'unmapped' ? {courseUrl:null,providerUrl:null,providerLinkLabel:''} : links(record || option,provider,courseCatalog)),
        evidenceUrl:source.map(item => safeURL(item.url)).find(Boolean) || (group === 'unmapped' ? null : safeURL(option.url)),
        evidenceLabel:(group!=='completed'&&!['confirmed','reported'].includes(row.status)&&(group!=='unmapped'||reviewKind(requirement,option,null)==='choose')&&reviewLabel(requirement,option,reviewMap(program)))||mappingEvidence(row,option,source,group),
        conditions:unique([...list(row.conditions),...list(option.conditions),text(row.notes),text(row.prerequisiteNotes),text(requirement?.prerequisiteNotes)]),
        status:group === 'completed' ? row.status : progressState(row,option,program,record,group) === 'in-progress' ? 'in-progress' : row.status,
        progressState:progressState(row,option,program,record,group),
        bundle,placementReason:text(row.placementReason),statuses:[row.status],sourceIds:source.map(item => item.id)
      };
      allocations.push(copy(entry));
      // Only explicit reviewed bundle metadata authorizes merging enrollments.
      // Similar titles or repeated course codes do not establish a bundle.
      const mergeKey = bundle ? group+'|'+providerKey(provider)+'|'+bundle : null;
      const existing = mergeKey && merged.get(mergeKey);
      if (existing) {
        mergeEnrollment(existing,entry);
      } else {
        groups[group].push(entry);
        if (mergeKey) merged.set(mergeKey,entry);
      }
    }
    const totals = Object.fromEntries(Object.entries(groups).map(([name,entries]) => [name,entries.reduce((sum,entry) => sum+entry.credits,0)]));
    totals.accounted = Object.values(totals).reduce((sum,amount) => sum+amount,0);
    const curriculum=curriculumHierarchy(draft,sections(draft,allocations),allocations);
    return {groups,totals,progress:progressLedger(draft),sections:curriculum.sections,curriculumIssues:curriculum.issues};
  }
  return Object.freeze({build,progress,visibleRows,reviewKind,reviewLabel,reviewMap,courseLinks:(course,catalog)=>links(course,course?.provider,catalog)});
}));
