/**
 * Authors WGU kit programs from WGU's own public academic API, captured with `npm run factory:capture`:
 * the current named CU ledger (program-data), the program's transfer notes and approval record (program/college),
 * its nontransferable courses (transfer-guidelines) and the current partner agreements for its college
 * (partner-agreement, one per provider). Nothing else is read: no course title, other program or older Sophia
 * table is used to infer an award.
 *
 * Outside options are WGU's own program-scoped receiving maps. A partner course becomes an option only when it alone
 * satisfies the WGU course (combinations are held) and the shared provider file holds an independently verified
 * identity for it whose recommendation window covers the review date; every other approved code is held and listed.
 *
 * Usage: node scripts/wgu-agreement-ledgers.mjs [--check]   (writes content/pathway-kits/wgu/programs/<slug>.json and
 * the programs' rows in content/pathway-kits/wgu/equivalencies.json; --check fails when they differ)
 */
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {stringifyKit,slug,isMain,root} from './pathway-factory/lib.mjs';
import {loadStudyExpansion,applyStudyExpansion,studyIdentityMatchesReceivingLabel} from './wgu-study-expansion.mjs';

export const REVIEW={id:'wgu-current-agreement-ledgers-2026-11-23',checkedOn:'2026-11-23',reviewer:'Claude (pathway factory)'};
const API='https://marketing-api-gateway.wgu.edu/partner/v1/public/';
const SCHOOL='Western Governors University';
const PROVIDERS={
  Sophia:{prefix:'SOPH',slug:'sophia',agreements:{BU:7112,IT:7110,HE:7111}},
  'Study.com':{prefix:'SDCM',slug:'study',agreements:{BU:4429,IT:4424,HE:4426}},
  StraighterLine:{prefix:'OOSL',slug:'straighterline',agreements:{BU:550,IT:547,HE:1855}},
  Saylor:{prefix:'SAYA',slug:'saylor',agreements:{BU:668,IT:671,HE:670}}
};
/** The eleven programs: kit slug, WGU program code, public program id, current catalog term and college. */
export const PROGRAMS=[
  {slug:'health-science-bs',code:'BSHS',programId:167,catalog:'202406',college:'HE'},
  {slug:'public-health-bs',code:'BSPH',programId:168,catalog:'202409',college:'HE'},
  {slug:'healthcare-administration-bs',code:'BSHA',programId:212,catalog:'202509',college:'BU'},
  {slug:'supply-chain-and-operations-management-bs',code:'BSSCOM',programId:239,catalog:'202605',college:'BU'},
  {slug:'project-management-bs',code:'BSPM',programId:243,catalog:'202607',college:'BU'},
  {slug:'software-engineering',code:'BSSWE',programId:254,catalog:'202610',college:'IT'},
  {slug:'information-technology',code:'BSIT',programId:250,catalog:'202608',college:'IT'},
  {slug:'psychology-bs',code:'BSPSY',programId:147,catalog:'202404',college:'HE'},
  {slug:'cybersecurity-and-information-assurance',code:'BSCSIA',programId:253,catalog:'202610',college:'IT'},
  {slug:'computer-science-bs',code:'BSCS',programId:261,catalog:'202611',college:'IT'},
  {slug:'health-information-management-bs',code:'BSHIM',programId:262,catalog:'202612',college:'HE'}
];
export const urls={
  ledger:p=>API+'program-data?pamsCodes='+p.code+'%3B'+p.catalog,
  guidelines:p=>API+'transfer-guidelines/programs?programsCode='+p.programId,
  college:c=>API+'program/college/'+c,
  agreement:id=>API+'partner-agreement/'+id
};
const kitDir=resolve(root,'content/pathway-kits/wgu'),capturesDir=resolve(root,'content/source-captures');
const plain=value=>String(value||'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/[\s\u00a0\u200b]+/g,' ').trim();
const clean=value=>String(value).replace(/[\u00a0\u200b]/g,' ').replace(/\s+/g,' ').trim();
const credits=value=>{const n=Number(value);assert(Number.isFinite(n)&&n>0,'A WGU course needs positive competency units');return n;};

/** The newest capture of each URL (by sidecar fetch time). */
async function captureIndex(){
  const index=new Map();
  for(const name of (await readdir(capturesDir)).filter(n=>n.endsWith('.json'))){
    const sidecar=JSON.parse(await readFile(join(capturesDir,name),'utf8'));
    if(!sidecar.url?.startsWith(API))continue;
    const current=index.get(sidecar.url);
    if(!current||current.fetchedAt<sidecar.fetchedAt)index.set(sidecar.url,{...sidecar,capture:'content/source-captures/'+name.replace(/\.json$/,'.txt')});
  }
  return index;
}
async function captured(index,url){
  const entry=index.get(url);assert(entry,'Capture this source first: npm run factory:capture -- '+url);
  const text=await readFile(resolve(root,entry.capture),'utf8');
  assert.equal(createHash('sha256').update(text).digest('hex'),entry.sha256,'Capture changed after it was recorded: '+entry.capture);
  return {...entry,text,json:JSON.parse(text)};
}
/** The exact raw JSON text of one record, quoted from the capture (quotes must appear verbatim). */
function rawRecord(text,start,endKey){
  const i=text.indexOf(start);assert(i>=0,'Quoted record is missing from its capture: '+start);
  if(!endKey)return start;
  const j=text.indexOf(endKey,i);assert(j>i,'Quoted record end is missing: '+endKey);
  const close=text.indexOf('"',j+endKey.length+1);return text.slice(i,close+1);
}
export function ledgerHash(rows){
  const values=rows.map(r=>[r.code,r.title,r.credits,r.areaOfStudy]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}
/** One partner-course text -> approved provider codes, or a held multi-course requirement. */
export function partnerExpression(prefix,text){
  const codes=[...new Set(text.match(new RegExp('\\b'+prefix+'-\\d{4}\\b','g'))||[])].sort();
  const combination=/&|\+|\b(?:and|both|plus|combination|at least)\b/i.test(text);
  return {codes,executableAsSingleCourse:!combination};
}
/** Recency sentences from the program's published transfer notes, and the receiving courses each one names. */
export function recencyRules(notes,rows){
  const rules=[];
  for(const [field,value] of Object.entries(notes))for(const sentence of value.split(/(?<=\.)\s+/)){
    if(!/within the (?:past|last) (?:\d+|five) years/i.test(sentence))continue;
    // WGU's own sentence for every course; the shared "certifications and IT-specific courses" sentence stays a program note.
    const all=/^All certifications, degrees, and courses must have been completed/i.test(sentence);
    if(/^Certifications? must be current|^All certifications and IT-specific courses/i.test(sentence))continue;
    const subject=sentence.split(/ must /i)[0].replace(/^Courses transferring into /i,'').replace(/['‘’"]/g,'');
    const parts=subject.split(/,\s*|\s+and\s+/i).map(s=>s.trim().replace(/^and\s+/i,'')).filter(Boolean);
    const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    // A course applies when the sentence names its full title, or names one subject word that is part of its title.
    const named=all?rows:rows.filter(r=>new RegExp('(?:^|\\s)'+escape(r.title)+'(?=\\s|$)','i').test(subject)||parts.some(part=>part.toLowerCase()===r.title.toLowerCase()||!/\s/.test(part)&&new RegExp('\\b'+escape(part)+'\\b','i').test(r.title)));
    rules.push({field,sentence:clean(sentence),appliesTo:all?'all-outside-courses':'named-courses',codes:named.map(r=>r.code)});
  }
  return rules;
}

export async function buildPrograms({check=false,configs=PROGRAMS,review=REVIEW,seeds={},studyReview,captureReviews,identityOverrides={}}={}){
  const index=await captureIndex();
  const studyIdentityReview=await loadStudyExpansion();
  const studyAgreementReview=studyReview||JSON.parse(await readFile(resolve(root,'content/reuse/wgu-study-agreement-review-2026-11-25.json'),'utf8'));
  assert.equal(studyAgreementReview.agreementId,4424);assert.equal(studyAgreementReview.provider,'Study.com');assert.equal(studyAgreementReview.checkedOn,'2026-11-25');
  const providerDocs=new Map();
  for(const name of await readdir(resolve(root,'content/pathway-kits/providers'))){let doc=JSON.parse(await readFile(resolve(root,'content/pathway-kits/providers',name),'utf8'));if(doc.provider==='Study.com')doc=applyStudyExpansion(doc,studyIdentityReview);providerDocs.set(doc.provider,doc);}
  const identity=(provider,code)=>identityOverrides[provider]?.[code]||providerDocs.get(provider)?.courses.find(c=>c.code===code);
  const usable=course=>course&&course.sourceCreditStatus==='verified'&&course.sourceCredits>0&&course.sourceCreditSystem==='semester'&&(!course.recommendationEnd||course.recommendationEnd>=review.checkedOn)&&(!course.recommendationStart||course.recommendationStart<=review.checkedOn);
  const equivalencies=JSON.parse(await readFile(join(kitDir,'equivalencies.json'),'utf8'));
  const slugs=new Set(configs.map(p=>p.slug)),conditions={},rows=[],programs=[];
  const condition=(id,text)=>{assert(!conditions[id]||conditions[id]===text,'Condition id collision '+id);conditions[id]=text;return id;};
  const oneCourse=condition('wgu-one-original-source-course-may-satisfy',equivalencies.conditionLibrary['wgu-one-original-source-course-may-satisfy']);
  for(const config of configs){
    const existing=seeds[config.slug]||JSON.parse(await readFile(join(kitDir,'programs',config.slug+'.json'),'utf8'));
    const lower=config.code.toLowerCase(),prefix='wgu-'+lower,at=review.checkedOn.replace(/-/g,'');
    const ledgerCap=await captured(index,urls.ledger(config)),guideCap=await captured(index,urls.guidelines(config)),collegeCap=await captured(index,urls.college(config.college));
    if(captureReviews)for(const capture of [ledgerCap,guideCap,collegeCap])assert.equal(capture.sha256,captureReviews[capture.url],'New receiving evidence needs an explicit scoped review: '+capture.url);
    const courses=ledgerCap.json[0].courses;
    assert(courses.length&&courses.every(c=>c.programCode===config.code&&c.catalogTerm===config.catalog),config.code+': the ledger must be this exact program and catalog');
    const record=collegeCap.json.find(p=>p.id===config.programId);
    assert(record&&record.pamsProgramCode===config.code&&record.inactiveProgram===0&&record.approvalStatus==='Approved'&&record.programName.includes(config.catalog.slice(4)+'-'+config.catalog.slice(0,4)),config.code+': the program record must be the active, approved catalog');
    const nontransferable=new Set(guideCap.json.filter(g=>JSON.parse(g.programs).includes(config.programId)&&g.transferArea==='Non-Transferable').map(g=>g.PAMS_bannerCode));
    const scope={schoolName:SCHOOL,programId:config.programId,programCode:config.code,catalogYear:config.catalog,level:'bachelor',modality:'online',creditSystem:'competency-unit'};
    const src={
      ledger:{id:`${prefix}-${config.catalog}-curriculum-${at}`,url:ledgerCap.url,title:`${clean(courses[0].programName)} ${config.catalog} complete named CU ledger`,kind:'university',checked:review.checkedOn,scope,retrieval:'Unauthenticated public program-data API GET, captured; every receiving requirement reviewed.',capture:ledgerCap.capture},
      metadata:{id:`${prefix}-${config.catalog}-metadata-${at}`,url:collegeCap.url,title:`${record.programName} current public academic record and transfer notes`,kind:'university',roles:['policy'],checked:review.checkedOn,scope,publicRecordId:config.programId,publicRecordVersion:record.recordVersion,inactiveProgram:0,approvalStatus:'Approved',retrieval:'Unauthenticated public academic API GET, captured.',capture:collegeCap.capture},
      guidelines:{id:`${prefix}-transfer-guidelines-${at}`,url:guideCap.url,title:`${config.code} ${config.catalog} transfer guidelines: transfer areas and nontransferable courses`,kind:'university',roles:['policy'],checked:review.checkedOn,scope,capture:guideCap.capture}
    };
    const requirements=[],areaRows=[];
    for(const c of courses){
      const code=c.courseCode,title=clean(c.courseName),area=clean(c.areaOfStudy),cu=credits(c.competencyUnits);
      areaRows.push({code,title,credits:cu,areaOfStudy:area});
    }
    const hash=ledgerHash(areaRows);
    const capstones=courses.filter(c=>/capstone/i.test(c.courseName)&&nontransferable.has(c.courseCode));
    for(const c of courses){
      const code=c.courseCode,title=clean(c.courseName),area=clean(c.areaOfStudy),cu=credits(c.competencyUnits),fixed=nontransferable.has(code),capstone=capstones.length===1&&capstones[0].courseCode===code;
      const req={id:`${lower}-${slug(title)}`,code,title,credits:cu,category:capstone?'capstone':area==='General Education'?'general':'core',sourceIds:[src.ledger.id,...(fixed?[src.guidelines.id]:[])],institutionalOnly:fixed,group:slug(area),curriculumAreaEvidence:{areaOfStudy:area,sourceIds:[src.ledger.id],programId:config.programId,catalogTerm:config.catalog,ledgerSha256:hash},quotes:[{sourceId:src.ledger.id,text:rawRecord(ledgerCap.text,`"courseCode":"${code}","courseName":`,'"areaOfStudy":')}]};
      if(fixed)req.quotes.push({sourceId:src.guidelines.id,text:rawRecord(guideCap.text,`"PAMS_bannerCode":"${code}","transferArea":"Non-Transferable"`)});
      requirements.push(req);
    }
    assert.equal(new Set(requirements.map(r=>r.id)).size,requirements.length,config.code+': requirement ids must be unique');
    const total=areaRows.reduce((n,r)=>n+r.credits,0);
    const notes=Object.fromEntries(Object.entries(record).filter(([k,v])=>k.startsWith('notes')&&typeof v==='string'&&plain(v)).map(([k,v])=>[k,plain(v)]));
    src.metadata.notes=notes;
    const recency=recencyRules(notes,requirements);
    for(const rule of recency)if(rule.appliesTo==='named-courses')for(const code of rule.codes){const r=requirements.find(x=>x.code===code);r.transferRecencyYears=5;r.transferRecencySourceIds=[src.metadata.id];}
    // Agreements: one source per provider, program-scoped rows for single-course awards with verified identities.
    const agreementSources={},coverage={},placed=[];
    const exact=condition(`wgu-current-exact-match-${lower}-${config.catalog}`,`This exact published match applies to WGU ${config.code} catalog${config.catalog}/program${config.programId}. Complete coursework and send original issuer records before starting at WGU.`);
    const recencyIds=recency.map((rule,i)=>({rule,id:condition(`wgu-${lower}-transfer-recency-${i+1}`,rule.sentence)}));
    for(const [provider,info] of Object.entries(PROVIDERS)){
      const agreementId=info.agreements[config.college],cap=await captured(index,urls.agreement(agreementId)),ag=cap.json;
      if(captureReviews)assert.equal(cap.sha256,captureReviews[cap.url],'New agreement evidence needs an explicit scoped review: '+cap.url);
      assert(ag.id===agreementId&&ag.published===true&&ag.status==='APPROVED'&&ag.college.code===config.college&&JSON.parse(ag.agreementPrograms).includes(config.programId),`${config.code}: ${provider} agreement ${agreementId} must be published, approved and list the program`);
      let agreementChecked=review.checkedOn,agreementReviewId=review.id;
      if(provider==='Study.com'&&agreementId===studyAgreementReview.agreementId){
        assert.equal(cap.sha256,studyAgreementReview.sourceSha256,'New Study agreement content requires an explicit receiving review');assert.equal(ag.recordVersion,studyAgreementReview.agreementRecordVersion);
        assert(studyAgreementReview.scope.programs.some(p=>p.programId===config.programId&&p.programCode===config.code&&p.catalog===config.catalog),'Receiving review must cover this exact program/catalog');
        agreementChecked=studyAgreementReview.checkedOn;agreementReviewId=studyAgreementReview.id;
      }
      const sid=`${prefix}-${info.slug}-${agreementId}-v${ag.recordVersion}`;
      agreementSources[provider]={id:sid,url:cap.url,title:`WGU approved ${provider} receiving map for ${config.code} ${config.catalog}`,kind:'university',roles:['receiving-map'],scope:{schoolName:SCHOOL,programName:existing.title,level:'bachelor',modality:'online',catalogYear:config.catalog},provider,checked:agreementChecked,evidenceType:'official-receiving-school-equivalency',programId:config.programId,catalogTerm:config.catalog,agreementId,agreementRecordVersion:ag.recordVersion,published:true,approvalStatus:'APPROVED',capture:cap.capture};
      const cov={officialReceivingClaimsReviewed:0,approvedSourceCodes:new Set(),selectable:new Set(),selectableReceivingPlacements:0,held:new Set(),sourceIdentityConflictsHeld:[],multiSourceRequirementsHeld:[],agreementId,agreementRecordVersion:ag.recordVersion,sourceUrl:cap.url};
      for(const pathway of ag.agreementPathways)for(const mapping of pathway.pathwayMappings){
        if(mapping.program.id!==config.programId)continue;
        const receiving=requirements.find(r=>r.code===pathway.pamsBannerCode);
        assert(receiving,`${config.code}: ${provider} maps ${pathway.pamsBannerCode}, which is not in the current ledger`);
        assert(!receiving.institutionalOnly,`${config.code}: ${pathway.pamsBannerCode} is nontransferable but has a partner map`);
        const expression=partnerExpression(info.prefix,mapping.partnerCourse);
        if(!expression.codes.length)continue;
        cov.officialReceivingClaimsReviewed++;expression.codes.forEach(c=>cov.approvedSourceCodes.add(c));
        if(!expression.executableAsSingleCourse){cov.multiSourceRequirementsHeld.push({receivingCode:receiving.code,partnerCourse:clean(mapping.partnerCourse),reason:'The award requires several original source courses; no single course can satisfy the complete receiving requirement.'});continue;}
        for(const code of expression.codes){
          if(!usable(identity(provider,code))){cov.held.add(code);continue;}
          if(provider==='Study.com'&&!studyIdentityMatchesReceivingLabel(identity(provider,code),mapping.partnerCourse,code)){
            cov.held.add(code);cov.sourceIdentityConflictsHeld.push({receivingCode:receiving.code,sourceCode:code,partnerCourse:clean(mapping.partnerCourse),independentProviderCourse:identity(provider,code).providerCourseCode||identity(provider,code).title,reason:'The university row names a different provider course than the independently verified identifier. No correction or equivalency is inferred.'});continue;
          }
          cov.selectable.add(code);cov.selectableReceivingPlacements++;
          const conditionIds=[exact,oneCourse,...recencyIds.filter(({rule})=>rule.appliesTo==='all-outside-courses'||rule.codes.includes(receiving.code)).map(({id})=>id)];
          const identityReview=identityOverrides[provider]?.[code];
          const identityFields=identityReview?Object.fromEntries(Object.entries(identityReview).filter(([key])=>!['provider','code','creditOrigin','sourceType'].includes(key))):null;
          placed.push({id:`${info.slug}-${code.toLowerCase()}-to-${receiving.code.toLowerCase()}-${config.slug}`,provider,code,...(identityFields?{identity:identityFields}:{}),status:'published',credits:receiving.credits,creditSystem:'competency-unit',receivingCode:receiving.code,receivingTitle:receiving.title,sourceIds:[sid],evidence:'published',evidenceType:'official-receiving-school-equivalency',creditOrigin:'alternative',sourceType:'alternative',conditionSourceIds:[src.metadata.id],mappingChecked:agreementChecked,mappingReviewId:agreementReviewId,universityMapRecord:{programId:config.programId,catalogTerm:config.catalog,agreementId,agreementRecordVersion:ag.recordVersion,pathwayId:pathway.id,pathwayRecordVersion:pathway.recordVersion,mappingId:mapping.id,mappingRecordVersion:mapping.recordVersion},conditionIds,quotes:[{sourceId:sid,text:rawRecord(cap.text,`{"id":${mapping.id},"program":{"id":${config.programId},"pamsProgramCode":"${config.code}"},"partnerCourse":`,'"partnerCourse":')}],scope:{programs:[config.slug]},placements:{[config.slug]:{optionId:`${prefix}-${code.toLowerCase()}-${receiving.code.toLowerCase()}`}}});
        }
      }
      coverage[provider]={officialReceivingClaimsReviewed:cov.officialReceivingClaimsReviewed,approvedSourceCodeCount:cov.approvedSourceCodes.size,independentlyVerifiedSelectableSourceCodes:[...cov.selectable].sort(),selectableReceivingPlacements:cov.selectableReceivingPlacements,unknownSourceIdentityCodesHeld:[...cov.held].filter(c=>!cov.selectable.has(c)).sort(),sourceIdentityConflictsHeld:cov.sourceIdentityConflictsHeld,multiSourceRequirementsHeld:cov.multiSourceRequirementsHeld,agreementId,agreementRecordVersion:ag.recordVersion,sourceUrl:cap.url};
    }
    // A provider course may be approved for several WGU courses; the program's single-award rule keeps one use.
    placed.sort((a,b)=>a.receivingCode.localeCompare(b.receivingCode)||a.provider.localeCompare(b.provider)||a.code.localeCompare(b.code));
    rows.push(...placed);
    const ceiling=total*0.75,capstone=capstones.length===1?requirements.find(r=>r.code===capstones[0].courseCode):null;
    const sections=[];for(const r of requirements){const parent=r.category,area=r.curriculumAreaEvidence.areaOfStudy,id=`${prefix}-${parent}-${slug(area)}`;let s=sections.find(x=>x.id===id);if(!s)sections.push(s={id,parentId:parent,title:area,credits:0,requirementIds:[],sourceId:src.ledger.id});s.credits+=r.credits;s.requirementIds.push(r.id);}
    const usedAgreementIds=[...new Set(placed.map(r=>r.sourceIds[0]))];
    const mappingDate=Object.values(agreementSources).map(source=>source.checked).sort().at(-1)||review.checkedOn;
    const identityDate=placed.map(row=>identity(row.provider,row.code)?.identityCheckedOn||review.checkedOn).sort().at(-1)||review.checkedOn;
    const programReviewDate=[review.checkedOn,mappingDate,identityDate].sort().at(-1);
    const summaryReviewId=programReviewDate>review.checkedOn?'wgu-source-and-agreement-expansion-2026-11-25':review.id;
    const modelFields={
      unresolved:['These are the complete named standard-path courses in the cited WGU guide. Current individual transfer approval and receiving level remain unresolved on each outside option.','University courses without an outside option are not proof that no transfer exists. Additional approved provider matches require further current program-specific research.',...(existing.additionalResearchNotices||[])],
      rulesNotes:['The standard-path course values are WGU competency units. Source semester credits, where published, remain separately attached to outside-course options.',`Outside options come only from WGU's published partner agreements for ${config.code} catalog ${config.catalog} (program ${config.programId}). Each cited agreement retains its own capture and review date. Approved courses without an independent provider identity, contradictory course labels, and awards needing several source courses together are held out of the plan.`,'General education is labeled only where WGU’s current program record names the area of study General Education. Remaining named courses stay in core requirements.',...Object.values(notes)],
      mappingCheckedOn:mappingDate,
      pricing:existing.modelFields.pricing,
      externalMaxCredits:ceiling,
      policySourceIds:['wgu-undergraduate-institutional-catalog-202611',...(capstone?['wgu-undergraduate-residency-policy-23797-20260918']:[]),src.metadata.id,src.ledger.id],
      policyEvidence:{externalMaxCredits:{value:ceiling,fraction:0.75,basisCredits:total,creditSystem:'competency-unit',sourceIds:['wgu-undergraduate-institutional-catalog-202611'],note:'Overall university ceiling. Exact receiving-course approval and required WGU coursework may allow fewer outside CUs.'},alternativeMaxCredits:{value:ceiling,creditSystem:'competency-unit',sourceIds:['wgu-undergraduate-institutional-catalog-202611'],note:'Alternative credit shares the overall ceiling; this is not approval of any provider or outside course.'}},
      policyReview:[{field:'upperMinCredits',status:'resolved',resolution:'covered-by-complete-named-curriculum',sourceIds:['wgu-undergraduate-institutional-catalog-202611',src.ledger.id],sourcePages:{'wgu-undergraduate-institutional-catalog-202611':[65]},message:`The complete ${requirements.length}-course, ${total}-CU ${config.code} ${config.catalog} curriculum is enforced through its current named receiving requirements. A separate semester upper-level aggregate is not assumed; outside-course approvals and required institutional work remain separate checks.`}],
      ...(capstone?{residencyPolicy:{type:'institution-fraction-with-capstone-exclusion',creditScope:'active-program',creditSystem:'competency-unit',fraction:0.25,capstoneRequirementIds:[capstone.id],capstoneCredits:capstone.credits,sourceIds:['wgu-undergraduate-residency-policy-23797-20260918',src.ledger.id,src.guidelines.id],interpretationStatus:'verified-additional-capstone',calculatedMinimumInstitutionCUs:total*0.25+capstone.credits,primaryPolicySections:['IV.2','IV.3.a','IV.3.b.i'],conservativeSufficientCondition:{minimumNonCapstoneInstitutionCUs:total*0.25,basisCredits:total,derivation:'25% of active undergraduate degree CUs earned directly in that WGU program, in addition to required capstone CUs.'},capstoneEvidence:`${capstone.code} ${capstone.title} is the program's only course named as a capstone in the current ledger and is listed as Non-Transferable in the program's transfer guidelines.`,notes:['Only passed CUs earned within the active WGU program count toward this rule. Prior WGU or other outside credit is not automatically counted as active-program residency.']}}:{}),
      policyCheckedOn:review.checkedOn,
      curriculumReview:{status:'current-complete-named-ledger',programId:config.programId,programCode:config.code,catalog:config.catalog,recordVersion:record.recordVersion,ledgerSha256:hash,sourceIds:[src.metadata.id,src.ledger.id],checkedOn:review.checkedOn,outsideEquivalenciesReviewed:true},
      curriculumSections:sections,
      transferRules:{courseSpecificRecencyYears:Object.fromEntries(requirements.filter(r=>r.transferRecencyYears).map(r=>[r.code,r.transferRecencyYears])),recencySourceIds:[src.metadata.id],publishedNotes:notes,...(recency.some(r=>r.appliesTo==='all-outside-courses')?{allOutsideCoursesRecencyYears:5}:{})},
      transferEvidenceReview:{id:summaryReviewId,checkedOn:programReviewDate,programId:config.programId,catalog:config.catalog,receivingClaimsReviewed:Object.values(coverage).reduce((n,c)=>n+c.officialReceivingClaimsReviewed,0),sourceIdentitiesReusedByExactProviderCode:placed.length,sourceIds:Object.values(agreementSources).map(s=>s.id),studentCreditsAwarded:0,scope:'exact-program-receiving-awards-with-independent-shared-provider-identities',providerCoverage:coverage,allPossibleSourcesGloballyReviewed:false}
    };
    if(!capstone)modelFields.unresolved.push(`WGU's current ${config.code} ledger names no capstone course, so the institutional residency floor (25% of active-program CUs plus any required capstone) cannot be computed from published sources. Confirm the minimum WGU coursework for this program with WGU.`);
    const program={kind:'pathway-kit-program',version:1,slug:config.slug,modelId:existing.modelId,routeIds:existing.routeIds,title:existing.title,level:'bachelor',catalog:config.catalog,totalCredits:total,
      review:{status:'reviewed',reviewer:programReviewDate>review.checkedOn?'Codex (independent Study.com identity and receiving-map review)':review.reviewer,reviewedOn:programReviewDate},
      sources:[src.ledger,src.metadata,src.guidelines,...Object.values(agreementSources),...(existing.supplementalSources||[])],
      quotes:[{sourceId:src.metadata.id,text:`"id":${config.programId},"pamsProgramCode":"${config.code}","programName":"${record.programName}"`}],
      policies:{alternativeMaxCredits:{value:ceiling,creditSystem:'competency-unit',sourceIds:['wgu-undergraduate-institutional-catalog-202611']},oneAwardPerSourceCourse:{value:true,basis:'WGU publishes that transfer courses may not be used to fulfill more than one course of study; every option placed in more than one requirement carries the single-award condition.',sourceIds:[src.metadata.id,...usedAgreementIds]}},
      modelFields,
      modelSourceIds:null,
      requirements};
    programs.push({config,program,sharedSourceIds:['wgu-undergraduate-institutional-catalog-202611',...(capstone?['wgu-undergraduate-residency-policy-23797-20260918']:[]),...existing.modelFields.pricing.sourceIds]});
  }
  // The rows replace every earlier row scoped to these programs; rows of other programs are untouched.
  const kept=equivalencies.equivalencies.filter(r=>!(r.scope?.programs||[]).some(s=>slugs.has(s)));
  assert(kept.every(r=>!(r.scope?.programs||[]).some(s=>slugs.has(s))));
  const conditionLibrary={...equivalencies.conditionLibrary};
  for(const [id,text] of Object.entries(conditions)){assert(!conditionLibrary[id]||conditionLibrary[id]===text,'Condition '+id+' would change');conditionLibrary[id]=text;}
  const usedConditions=new Set([...kept,...rows].flatMap(r=>r.conditionIds||[]));
  for(const id of Object.keys(conditionLibrary))if(!usedConditions.has(id))delete conditionLibrary[id];
  // Retain other batches in place. Appending every replacement after all kept
  // rows makes two independently reviewed batches continually reorder one
  // another, even though none of their receiving awards changed.
  const merged=[];let replaced=false;
  for(const row of equivalencies.equivalencies){
    if((row.scope?.programs||[]).some(s=>slugs.has(s))){if(!replaced){merged.push(...rows);replaced=true;}}
    else merged.push(row);
  }
  if(!replaced)merged.push(...rows);
  const nextEquivalencies={...equivalencies,conditionLibrary,equivalencies:merged};
  // Each model carries exactly its own sources: its ledger, record, guidelines and agreements, the shared WGU policies
  // and tuition it cites, and the provider identity sources of the courses placed in it.
  for(const {program,sharedSourceIds} of programs){
    const own=program.sources.map(s=>s.id),identityIds=[];
    for(const row of rows.filter(r=>r.scope.programs.includes(program.slug))){const course=identity(row.provider,row.code);for(const key of Object.keys(course))if(/SourceIds$/.test(key))identityIds.push(...course[key]);for(const id of course.sourceCreditVerification?.sourceIds||[])identityIds.push(id);}
    program.modelSourceIds=[...new Set([...own,...sharedSourceIds,...identityIds])];
  }
  const outputs=new Map([[join(kitDir,'equivalencies.json'),stringifyKit(nextEquivalencies,['equivalencies'])+'\n'],...programs.map(({program})=>[join(kitDir,'programs',program.slug+'.json'),stringifyKit(program,['requirements'])+'\n'])]);
  let stale=[];
  for(const [path,text] of outputs){
    if(check){let current='';try{current=await readFile(path,'utf8');}catch{}if(current!==text)stale.push(path.replace(root+'/',''));}
    else await writeFile(path,text);
  }
  return {programs:programs.map(({program})=>({slug:program.slug,catalog:program.catalog,totalCredits:program.totalCredits,requirements:program.requirements.length,outsideRows:rows.filter(r=>r.scope.programs.includes(program.slug)).length,capstone:program.modelFields.residencyPolicy?.capstoneRequirementIds?.[0]||null})),rows:rows.length,stale};
}

if(isMain(import.meta)){
  const check=process.argv.includes('--check'),result=await buildPrograms({check});
  console.log(JSON.stringify({...result,check},null,1));
  if(check&&result.stale.length){console.error('WGU agreement ledgers are stale: '+result.stale.join(', '));process.exitCode=1;}
}
