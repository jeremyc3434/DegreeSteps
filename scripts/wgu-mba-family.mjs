/** Reproducible all-university MBA baselines from the current institutional catalog. No outside awards. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {root,isMain,slug,stringifyKit,normalizeText} from './pathway-factory/lib.mjs';

export const REVIEW_PATH='content/pathway-kits/wgu/reviews/mba-family-2026-11-26.json';
export const CATALOG_URL='https://www.wgu.edu/content/dam/wgu-65-assets/western-governors/documents/institutional-catalog/2026/WGU%20Institutional%20Catalog%20-%20November%202026.pdf';
export const POLICY_URL='https://cm.wgu.edu/t5/WGU-Student-Policy-Handbook/2-1-11-Residency-Requirements-and-Credentialing/ta-p/23797';
const common={C200:'Managing Organizations and Leading People',C202:'Managing Human Capital',C204:'Management Communication',C212:'Marketing',C213:'Accounting for Decision Makers',C206:'Ethical Leadership',C214:'Financial Management',C207:'Data-Driven Decision Making',C215:'Operations Management',C211:'Global Economics for Managers'};
// These exact IDs already belong to the university discovery catalog. Course
// models reference them; publishing a second variant would duplicate a route.
const EXISTING_CATALOG_ROUTE_IDS=new Set(['wgu-catalog-b2a8a37d4fbedabd','wgu-catalog-b83ee97289a0732a','wgu-catalog-c4a7efe739d67a5c']);
export const MBA_PROGRAMS=[
  {slug:'master-of-business-administration',prefix:'mba',modelId:'curriculum-wgu-catalog-b2a8a37d4fbedabd',routeId:'wgu-catalog-b2a8a37d4fbedabd',title:'Master of Business Administration (MBA)',code:'MBA',catalog:'201404',total:34,page:89,url:'https://www.wgu.edu/online-business-degrees/mba-masters-business-administration-program.html',rows:[['C200',3,1],['C202',3,1],['C204',3,1],['C212',3,2],['C213',3,2],['C206',3,2],['C214',3,3],['C207',3,3],['C215',3,3],['C211',3,4],['C216',4,4,'MBA Capstone']]},
  {slug:'mba-information-technology-management',prefix:'mbaitm',modelId:'curriculum-wgu-catalog-b83ee97289a0732a',routeId:'wgu-catalog-b83ee97289a0732a',title:'MBA Information Technology Management',code:'MBAITM',catalog:'201408',total:35,page:90,url:'https://www.wgu.edu/online-business-degrees/mba-masters-business-administration-it-management-program.html',rows:[['C200',3,1],['MGT2',3,1,'IT Project Management'],['C202',3,1],['C212',3,2],['MMT2',4,2,'IT Strategic Solutions'],['C213',3,2],['C206',3,3],['C214',3,3],['C207',3,3],['C211',3,4],['C218',4,4,'MBA, Information Technology Management Capstone']]},
  {slug:'mba-healthcare-administration',prefix:'mbaha',modelId:'curriculum-wgu-catalog-c4a7efe739d67a5c',routeId:'wgu-catalog-c4a7efe739d67a5c',title:'MBA Healthcare Administration',code:'MBAHA',catalog:'202507',total:36,page:91,url:'https://www.wgu.edu/online-business-degrees/mba-masters-business-administration-healthcare-administration-program.html',rows:[['C200',3,1],['C215',3,1],['AFT2',4,1,'Accreditation Audit'],['C213',3,2],['C214',3,2],['C206',3,2],['C207',3,3],['C212',3,3],['AMT2',4,3,'Service Line Development'],['C211',3,4],['C219',4,4,'MBA, Healthcare Management Capstone']]}
];
const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const hash=value=>createHash('sha256').update(value).digest('hex');
const compact=value=>String(value).normalize('NFKC').replace(/[‐-―−]/g,'-').replace(/\s+/g,' ').trim();
const sid=role=>'wgu-mba-family-'+role+'-20261126';
const sameUrl=(a,b)=>new URL(a).href===new URL(b).href;

/** Parse actual printed rows, including the C218 title wrapped after its CU/term cells. */
export function parseMBACatalog(body){
  const lines=body.split(/\r?\n/).map(line=>compact(line)),result=[];let start=0;
  for(const definition of MBA_PROGRAMS){
    const footer=definition.code+' '+definition.catalog+' Total CUs: '+definition.total,end=lines.indexOf(footer,start);
    assert(end>=start,'The exact published '+definition.code+' catalog/total footer is required');
    const rows=[];
    for(let index=start;index<end;index++){
      const match=lines[index].match(/^([A-Z]{2,5} \d{4}) ([A-Z]\d{3}|[A-Z]{3}\d) (.+?) (\d+) (\d+)$/);
      if(!match)continue;
      const continuation=lines[index+1]==='Capstone'?' Capstone':'';
      rows.push({ccn:match[1],code:match[2],title:match[3]+continuation,credits:Number(match[4]),term:Number(match[5]),quote:lines[index]+continuation});
    }
    assert.equal(rows.length,11,definition.code+' has eleven exact named requirements');
    assert.deepEqual(rows.map(row=>[row.code,row.credits,row.term,row.title]),definition.rows.map(([code,credits,term,title])=>[code,credits,term,title||common[code]]),definition.code+' must retain its own published course identities, quantities and standard-path terms');
    assert.equal(rows.reduce((sum,row)=>sum+row.credits,0),definition.total);
    result.push({...definition,rows,footer});start=end+1;
  }
  return result;
}

export async function loadMBAFamilyEvidence(review=undefined){
  review??=await read(REVIEW_PATH);
  assert.equal(review.version,1);assert.equal(review.id,'wgu-mba-family-review-2026-11-26');assert.equal(review.checkedOn,'2026-11-26');
  assert.deepEqual(review.programs,MBA_PROGRAMS.map(({code,catalog,total,page})=>({code,catalog,totalCredits:total,page})));
  assert.equal(review.captures.length,6);assert.equal(new Set(review.captures.map(source=>source.role+(source.programCode||''))).size,6);
  const texts=new Map();
  for(const source of review.captures){
    assert(/^content\/source-captures\/[a-f0-9]{16}\.txt$/.test(source.capture),'Retain captured primary evidence');
    const body=await readFile(resolve(root,source.capture),'utf8'),meta=await read(source.capture.replace(/\.txt$/,'.json'));
    assert.equal(hash(body),source.sha256);assert.equal(meta.sha256,source.sha256);assert([200,206].includes(meta.status));
    assert(sameUrl(meta.finalUrl||meta.url,source.url));assert(meta.fetchedAt.slice(0,10)<=review.checkedOn);
    assert.equal(source.fetchedAt,meta.fetchedAt,'Retain the actual original retrieval timestamp');
    if(source.role==='residency')assert.equal(source.retrieval,'retained-primary-source-rereview','A retained policy is not presented as a fresh fetch');
    if(['catalog','capstone-descriptions'].includes(source.role)){
      assert(sameUrl(source.url,CATALOG_URL));assert.equal(source.documentSha256,meta.documentSha256);assert.equal(source.pages,meta.pages);
      assert(/^[a-f0-9]{64}$/.test(source.documentSha256));assert.equal(source.columns,meta.columns);assert([1,2].includes(meta.columns));
    }
    if(source.role==='catalog'){assert.equal(source.pages,'89-91');assert.equal(source.columns,1);}
    if(source.role==='capstone-descriptions')assert.equal(source.pages,'269-270');
    if(source.role==='residency')assert(sameUrl(source.url,POLICY_URL));
    if(source.role==='program-page')assert(MBA_PROGRAMS.some(program=>program.code===source.programCode&&sameUrl(program.url,source.url)));
    texts.set(source.role+(source.programCode||''),body);
  }
  for(const role of ['catalog','capstone-descriptions','residency'])assert(texts.has(role));
  const programs=parseMBACatalog(texts.get('catalog')),policy=normalizeText(texts.get('residency')),descriptions=normalizeText(texts.get('capstone-descriptions'));
  assert(policy.includes('for graduate degree programs, students must earn at least 50% of the required degree competency units directly from the program the student is actively pursuing at wgu.'));
  assert(policy.includes('in addition to any required capstone course(s) or clinical(s).'));
  for(const program of programs){
    const page=normalizeText(texts.get('program-page'+program.code));
    assert(page.includes('tuition per six-month term is $4,850'),program.code+' needs its actual tuition');
    assert(/e-books (?:and|&) resources fee (?:\+ )?\$ ?200/.test(page),program.code+' needs the separate mandatory resource fee');
    assert(page.includes('recognized, accredited institution')&&page.includes('bachelor')&&page.includes('do not need to take the gre or gmat'));
    assert(page.includes('competency-based')&&page.includes('11 courses')&&page.includes('100% online'));
    const capstone=program.rows.at(-1);assert(descriptions.includes(normalizeText(capstone.code+' - '+capstone.title+' - ')));
    assert(descriptions.includes(program.code==='MBA'?'the final course in your degree program':'the culminating course in the '+(program.code==='MBAITM'?'mba itm':'mba hcm')+' program'));
  }
  return {review,programs,texts};
}

export function authorMBAProgram(definition,evidence,{legacy}={}){
  const {review}=evidence,ledgerId=sid('catalog'),capstoneId=sid('capstones'),policyId=sid('residency'),pageId=sid(definition.code.toLowerCase()+'-program');
  const capture=role=>review.captures.find(source=>source.role===role&&(role!=='program-page'||source.programCode===definition.code));
  const source=(id,role,title,roles)=>{const proof=capture(role);return {id,title,url:proof.url,kind:'university',roles,checked:review.checkedOn,capture:proof.capture,sha256:proof.sha256,sourceContentHash:'sha256:'+proof.sha256,originalRetrievedAt:proof.fetchedAt,...(proof.documentSha256?{documentSha256:proof.documentSha256,pages:proof.pages}:{}),...(role==='residency'?{reviewMethod:'Retained primary policy reread for its graduate scope; original November 25 retrieval timestamp retained.'}:{}),scope:{schoolName:'Western Governors University',level:'master',modality:'online',programs:role==='program-page'?[{programCode:definition.code,catalog:definition.catalog}]:MBA_PROGRAMS.map(program=>({programCode:program.code,catalog:program.catalog}))}};};
  const sources=[source(ledgerId,'catalog','WGU November 2026 catalog: exact MBA family course ledgers',['curriculum']),source(capstoneId,'capstone-descriptions','WGU November 2026 catalog: C216, C218 and C219 capstone descriptions',['curriculum','residency']),source(policyId,'residency','WGU Residency Requirements and Credentialing: active-program graduate residency',['policy']),source(pageId,'program-page',definition.title+': current tuition, resources, CBE and admission',['pricing','admissions','pace'])];
  const requirements=definition.rows.map(row=>{
    const old=legacy?.requirements.find(requirement=>normalizeText(requirement.title)===normalizeText(row.title));
    return {id:old?.id||definition.prefix+'-'+slug(row.title),code:row.code,title:row.title,credits:row.credits,category:row.code===definition.rows.at(-1).code?'capstone':'core',sourceIds:row.code===definition.rows.at(-1).code?[ledgerId,capstoneId]:[ledgerId],institutionalOnly:row.code===definition.rows.at(-1).code,standardPathTerm:row.term,publishedCommonCourseNumber:row.ccn,quotes:[{sourceId:ledgerId,text:row.quote}]};
  });
  const capstone=requirements.at(-1),minimum=definition.total*0.5+capstone.credits;
  return {kind:'pathway-kit-program',version:1,slug:definition.slug,modelId:definition.modelId,routeIds:[definition.routeId],title:definition.title,level:'master',catalog:definition.catalog,totalCredits:definition.total,review:{status:'reviewed',reviewer:'DegreeSteps exact institutional-catalog graduate review',reviewedOn:review.checkedOn},sources,
    quotes:[{sourceId:ledgerId,text:definition.footer},{sourceId:policyId,text:'For graduate degree programs, students must earn at least 50% of the required Degree Competency Units directly from the program the student is actively pursuing at WGU.'},{sourceId:policyId,text:'Residency requires students to complete some portion of the Degree Competency Units (CUs) earned directly within the WGU program the student is actively pursuing, in addition to any required capstone course(s) or clinical(s).'}],
    modelFields:{coverage:'complete',completeExecutablePathway:true,paceSourceUrl:definition.url,institutionMinCredits:minimum,externalMaxCredits:definition.total*0.5,policySourceIds:[ledgerId,capstoneId,policyId],
      policyEvidence:{institutionMinCredits:{value:minimum,creditSystem:'competency-unit',sourceIds:[policyId,ledgerId,capstoneId],derived:true,calculation:'0.5 * totalCredits + capstoneCredits',basis:'Conservative policy-derived minimum: 50% of active graduate degree CUs in addition to the named four-CU required capstone. The numeric result is calculated from the two policy clauses and program ledger; it is not a university-printed program minimum.'},externalMaxCredits:{value:definition.total*0.5,creditSystem:'competency-unit',sourceIds:[policyId],note:'Necessary ceiling implied by the graduate residency fraction, not a claim that any outside course is accepted. Additional capstone residency is enforced separately.'}},
      residencyPolicy:{type:'institution-fraction-with-capstone-exclusion',creditScope:'active-program',creditSystem:'competency-unit',fraction:0.5,capstoneRequirementIds:[capstone.id],capstoneCredits:capstone.credits,sourceIds:[policyId,ledgerId,capstoneId],interpretationStatus:'verified-additional-capstone',calculatedMinimumInstitutionCUs:minimum,primaryPolicySections:['IV.2','IV.3.a','IV.3.b.ii'],conservativeSufficientCondition:{minimumNonCapstoneInstitutionCUs:definition.total*0.5,basisCredits:definition.total,derivation:'50% of required graduate degree CUs earned directly in the active program in addition to required capstone CUs.'},capstoneEvidence:capstone.code+' is explicitly named as this program\'s capstone in the current institutional ledger and capstone course description.'},
      curriculumReview:{id:review.id,checkedOn:review.checkedOn,programCode:definition.code,catalogTerm:definition.catalog,sourceIds:[ledgerId,capstoneId],requirementsComplete:true,outsideAwardsProposed:0},
      policyReview:[{field:'upperMinCredits',status:'resolved',resolution:'covered-by-complete-named-curriculum',sourceIds:[ledgerId],message:'The complete named graduate CU ledger is enforced directly; no undergraduate upper-division credit rule is imported.'}],
      pricing:{model:'subscription',amount:5050,tuitionPerTerm:4850,resourceFeePerTerm:200,includesResourceFee:true,period:'6 months',currency:'USD',sourceUrl:definition.url,sourceIds:[pageId],checkedOn:review.checkedOn,notes:['Published tuition and mandatory resources per six-month term. Actual term count and other applicable personal charges are separate; the older one-year promotional amount is not used.']},
      admissionRequirements:[{message:'Submit official transcripts establishing a bachelor\'s degree from a recognized, accredited institution. The program does not require the GRE or GMAT.',sourceIds:[pageId]}],
      pacePolicy:{sourceIds:[pageId],basis:'Fully online competency-based progress; work through courses as mastery is demonstrated with the assigned program mentor. No fixed completion duration is promised.'},
      rulesNotes:['All '+definition.total+' planned CUs are taken in the active WGU graduate program. No undergraduate ACE, alternative-provider or outside graduate-course award is proposed.','The applicable program catalog '+definition.catalog+' and all eleven course codes are printed in the current November 2026 institutional catalog; the program catalog is not relabeled as 202611.','Graduate transfer eligibility varies by program. The residency ceiling is a necessary academic constraint and does not establish a particular incoming award.','The printed standard-path terms describe WGU\'s standard plan, not a guaranteed completion schedule or a formal prerequisite matrix.'],
      unresolved:[{owner:'student',status:'personal-task',message:'Submit the graduate application and official bachelor\'s transcripts and meet WGU\'s individual admission requirements.',sourceIds:[pageId]}],mappingCheckedOn:review.checkedOn},
    modelSourceIds:[ledgerId,capstoneId,policyId,pageId],requirements};
}

export async function buildMBAFamily({check=false}={}){
  const evidence=await loadMBAFamilyEvidence(),base='content/pathway-kits/wgu/',school=await read(base+'school.json'),legacy=await read(base+'programs/master-of-business-administration.json');
  const programs=evidence.programs.map(program=>authorMBAProgram(program,evidence,{legacy:program.code==='MBA'?legacy:undefined}));
  const commonSources=programs[0].sources.slice(0,3),commonIds=new Set(commonSources.map(source=>source.id));
  for(const source of commonSources){
    const existing=school.sources.find(candidate=>candidate.id===source.id);
    if(existing)assert.deepEqual(existing,source,'A shared primary source must not be silently replaced');else school.sources.push(source);
  }
  for(const program of programs)program.sources=program.sources.filter(source=>!commonIds.has(source.id));
  const update=async(path,value,stringify=stringifyKit)=>{const result=stringify(value)+'\n';if(check)assert.equal(await readFile(resolve(root,path),'utf8'),result,'Regenerate '+path+' from reviewed MBA evidence');else await writeFile(resolve(root,path),result);};
  // Remove only the two duplicate declarations introduced by this expansion.
  // The legacy MBA's existing manifest entry and every other route stay put.
  const duplicateIds=new Set(MBA_PROGRAMS.filter(program=>program.slug!=='master-of-business-administration'&&EXISTING_CATALOG_ROUTE_IDS.has(program.routeId)).map(program=>program.routeId));
  school.routes=school.routes.filter(route=>!duplicateIds.has(route.id));
  for(const document of school.publish.documents)if(document.routes)document.routes=document.routes.filter(route=>!duplicateIds.has(route.id));
  for(const program of programs){
    await update(base+'programs/'+program.slug+'.json',program);
    if(!school.programOrder.includes(program.slug))school.programOrder.push(program.slug);
    const definition=MBA_PROGRAMS.find(item=>item.slug===program.slug),route={id:definition.routeId,school:'Western Governors University',title:definition.title,level:'master',modalities:['online'],url:definition.url};
    if(!EXISTING_CATALOG_ROUTE_IDS.has(route.id)&&!school.routes.some(item=>item.id===route.id))school.routes.push(route);
    if(program.slug!=='master-of-business-administration'){
      const publication=school.publish.documents.find(document=>document.path==='content/curricula/wgu-pathway-kit.json');
      if(!publication.programs.includes(program.slug))publication.programs.push(program.slug);
      if(!EXISTING_CATALOG_ROUTE_IDS.has(route.id)&&!publication.routes.some(item=>item.id===route.id))publication.routes.push(route);
    }
  }
  // Only the legacy document's new local university facts are pinned here.
  for(const id of programs[0].modelSourceIds)if(!school.publish.sourceOrder.includes(id))school.publish.sourceOrder.push(id);
  await update(base+'school.json',school);
  return {programs:programs.map(program=>({modelId:program.modelId,catalog:program.catalog,totalCredits:program.totalCredits,requirements:program.requirements.length,universityCredits:program.totalCredits,institutionMinCredits:program.modelFields.institutionMinCredits})),receivingAwardsCreated:0,check};
}
if(isMain(import.meta))console.log(JSON.stringify(await buildMBAFamily({check:process.argv.includes('--check')})));
