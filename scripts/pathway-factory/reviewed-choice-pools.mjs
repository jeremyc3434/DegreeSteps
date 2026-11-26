/** Adopt an explicitly reviewed, source-pinned university-choice packet.
 * This does not research, approve transfer awards, change policy, or publish.
 * The retained body must prove every eligible course within the exact degree's
 * own category; a pool label alone is never a placement rule.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,relative,sep} from 'node:path';
import {clone,list,canonical,sha256,dateOnly,sourceDate,normalizeText,courseCodeKey,programUnits,inScope,loadKit,root,isMain,parseArgs} from './lib.mjs';
import {validateConnectedWebCapture} from './connected-web.mjs';
import {compileProgram} from './compile.mjs';
import {verifyKit} from './verify.mjs';

export const champlainChoicePacketPath='content/pathway-kits/champlain/named-choice-source-review-2026-11-26.json';
const unique=values=>[...new Set(values)];
const stableHash=value=>sha256(JSON.stringify(canonical(value)));
const tuple=value=>JSON.stringify([value.program,value.catalog,value.level,value.modalities,value.requirementId]);
const readJSON=async path=>JSON.parse(await readFile(path,'utf8'));

/** Opt-in IDs are a derived application of this review, not new curriculum. */
export function reviewedChoiceRequirementHash(requirement){
  const value=clone(requirement);if(value.slot)delete value.slot.institutionChoicePoolIds;
  return stableHash(value);
}
function inside(base,path){
  assert(typeof path==='string'&&path,'A retained capture path is required');
  const full=resolve(base,path),rel=relative(base,full);
  assert(rel&&!rel.startsWith('..'+sep)&&rel!=='..'&&!rel.startsWith(sep),'A capture must stay inside the repository');
  return full;
}
async function retainedSource(source,{base,asOf,allowedUniversityHosts}){
  assert(source.kind==='university'&&source.id&&source.capture,'Only captured receiving-university sources are eligible');
  const url=new URL(source.url);
  assert(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&allowedUniversityHosts.includes(url.hostname),'Only explicitly allowed primary university hosts are eligible');
  assert(dateOnly(sourceDate(source))&&sourceDate(source)<=asOf,'A source needs an honest nonfuture checked date');
  const body=await readFile(inside(base,source.capture),'utf8'),meta=await readJSON(inside(base,source.capture.replace(/\.txt$/,'.json'))),hash=sha256(body);
  assert.equal(source.sha256,hash,'The source review must independently pin the body hash');
  assert.equal(source.sourceContentHash,hash,'The source content hash must agree');
  assert.equal(meta.sha256,hash,'The retained source body must agree with its immutable sidecar');
  assert.equal(meta.url,source.url,'The exact reviewed primary URL must agree');
  assert(dateOnly(String(meta.fetchedAt).slice(0,10))&&String(meta.fetchedAt).slice(0,10)<=sourceDate(source),'A review cannot predate retrieval');
  if(meta.captureFormat==='connected-web-rendered-extract'){
    assert.equal(meta.status,null,'Native rendered evidence must not invent HTTP success');
    assert.deepEqual(meta.toolResponseReceipt,source.toolResponseReceipt,'The review independently pins the native tool receipt');
    await validateConnectedWebCapture({...meta,text:body},{base});
  }else{
    assert(Number.isInteger(meta.status)&&meta.status>=200&&meta.status<300,'A retained origin capture must be a successful HTTP response');
    assert(source.capture.includes(hash.slice(0,16)),'Origin captures must be immutable and content addressed');
  }
  return body;
}

/** Pure with respect to canonical files: validates the packet against retained
 * sources and exact current kit tuples, then returns a separate adopted kit.
 * Capturing a newer body never updates this packet or its review automatically.
 */
export async function adoptReviewedChoicePools(kit,packet,{base=root,asOf,allowedUniversityHosts}={}){
  assert(dateOnly(asOf),'Pass an explicit review as-of date');
  assert(list(allowedUniversityHosts).length,'The caller must supply reviewed primary university hosts');
  assert(packet.kind==='reviewed-institution-choice-pools'&&packet.version===1,'Unsupported named-choice review packet');
  assert.equal(packet.schoolId,kit.school.id,'The review belongs to this exact receiving school');
  assert.equal(packet.creditSystem,kit.school.creditSystem,'Original university units cannot be converted implicitly');
  assert(packet.review?.status==='reviewed'&&packet.review.reviewer&&dateOnly(packet.review.checkedOn)&&packet.review.checkedOn<=asOf,'An explicit, dated source review is required');
  assert(list(packet.pools).length&&list(packet.placements).length,'A review must adopt actual scoped choices');
  const out={...clone({...kit,providers:undefined}),providers:kit.providers};
  const sourceIndex=new Map(),bodies=new Map();
  for(const source of list(packet.sources)){
    assert(!sourceIndex.has(source.id),'The source review repeats an ID');sourceIndex.set(source.id,source);
    assert(sourceDate(source)<=packet.review.checkedOn,'A reviewed packet cannot cite later evidence');
    bodies.set(source.id,await retainedSource(source,{base,asOf,allowedUniversityHosts}));
    const existing=list(out.school.sources).find(row=>row.id===source.id);
    if(existing)assert.deepEqual(existing,source,'A source ID cannot silently replace existing evidence');
    else out.school.sources.push(clone(source));
  }
  const originalOptions=new Map(kit.programs.map(program=>[program.slug,compileProgram(kit,program)]));
  const grounded=claim=>{
    assert(list(claim.sourceIds).length&&list(claim.quotes).length,'Every adopted claim needs retained primary source IDs and quotes');
    for(const id of claim.sourceIds)assert(sourceIndex.has(id),'Only independently pinned review sources can ground a new pool claim');
    for(const quote of claim.quotes){
      assert(claim.sourceIds.includes(quote.sourceId)&&normalizeText(quote.text),'A quote must be bound to its own claim’s source');
      assert(normalizeText(bodies.get(quote.sourceId)).includes(normalizeText(quote.text)),'Every adopted quote must exist in its independently pinned primary body');
    }
  };
  const pools=new Map();
  for(const pool of packet.pools){
    assert(pool.id&&!pools.has(pool.id),'Pool IDs must be unique');pools.set(pool.id,pool);
    assert.deepEqual(pool.review,packet.review,'Every pool needs the same explicit packet review');
    assert(pool.scope?.all!==true&&['programs','catalogs','levels','modalities'].every(key=>list(pool.scope?.[key]).length),'A pool must enumerate its exact program, catalog, level and format scope');
    // This first adoption is deliberately bounded to lower-level GEd choices.
    assert.deepEqual(pool.slotKinds,['gen-ed'],'This adoption supports reviewed general-education choices only');
    assert(list(pool.courses).length&&list(pool.courses).every(course=>course.provider==='University'&&course.creditOrigin==='institutional'&&course.credits===3&&course.creditSystem===packet.creditSystem&&course.upper===false),'No outside, oversized, unit-changing or upper-level choice can enter this packet');
    grounded(pool);for(const course of pool.courses){grounded(course);assert(list(course.quotes).some(quote=>normalizeText(quote.text)===normalizeText(course.code+'\n'+course.title+'\n'+course.credits+' Credits')),'A course needs its exact original university identity and quantity quote');}
    assert.equal(unique(pool.courses.map(course=>courseCodeKey(course.code))).length,pool.courses.length,'A course may occur once in a pool');
    const placements=packet.placements.filter(row=>row.poolId===pool.id);
    assert.deepEqual(new Set(pool.scope.programs),new Set(placements.map(row=>row.program)),'Every scoped program needs its own exact eligibility review');
    assert.deepEqual(new Set(pool.scope.catalogs),new Set(placements.map(row=>row.catalog)),'Every catalog needs its own exact eligibility review');
    assert.deepEqual(new Set(pool.scope.levels),new Set(placements.map(row=>row.level)),'Every degree level needs its own exact eligibility review');
    assert.deepEqual(new Set(pool.scope.modalities),new Set(placements.flatMap(row=>row.modalities)),'Every format needs its own exact eligibility review');
    assert.deepEqual(new Set(pool.requirementIds),new Set(placements.map(row=>row.requirementId)),'Every eligible requirement needs its own exact review');
    assert.deepEqual(new Set(pool.sourceIds),new Set(placements.map(row=>row.sourceId)),'Each exact degree must independently prove category eligibility');
  }
  const placed=new Set();
  for(const placement of packet.placements){
    const pool=pools.get(placement.poolId),program=out.programs.find(row=>row.slug===placement.program);
    assert(pool&&program,'A placement must reference a reviewed pool and an existing program');
    assert(program.review?.status==='reviewed','Draft or merely migrated programs need their own curriculum review');
    assert.equal(placement.catalog,program.catalog,'Catalog drift invalidates reuse');
    assert.equal(placement.level,program.level,'Degree level drift invalidates reuse');
    assert.deepEqual(placement.modalities,program.modalities||out.school.programDefaults?.modalities,'Delivery format drift invalidates reuse');
    assert(inScope(pool,program,out),'The exact current tuple must be inside the reviewed pool');
    assert.equal(programUnits(out,program),packet.creditSystem,'Program units must remain explicit');
    const req=program.requirements.find(row=>row.id===placement.requirementId);
    assert(req&&req.slot?.kind==='gen-ed'&&!req.code&&req.institutionalOnly===false&&!req.upper&&!req.upperOnly&&!req.optionRows&&!list(req.institutionOptions).length&&!/capstone|final program|institution.required/i.test(req.title),'A pool cannot replace a fixed, institutional-only, upper-only, capstone or non-GEd requirement');
    assert.equal(req.credits%3,0,'The exact course-sized choices must retain original university quantities');
    assert.equal(reviewedChoiceRequirementHash(req),placement.requirementSha256,'Requirement drift invalidates the reviewed placement');
    const placementKey=placement.poolId+'|'+tuple(placement);assert(!placed.has(placementKey),'The same exact tuple cannot be applied twice');placed.add(placementKey);
    const source=sourceIndex.get(placement.sourceId),oldSource=list(program.sources).find(row=>row.id===placement.programSourceId),body=bodies.get(placement.sourceId);
    assert(source&&oldSource&&body&&list(req.sourceIds).includes(oldSource.id)&&oldSource.url===source.url&&oldSource.capture===source.capture,'Eligibility must be the requirement’s own retained primary degree body');
    const section=placement.section;
    assert(section?.heading&&section.endHeading&&section.eligibilityQuote,'Category boundaries and its actual instruction are required');
    const start=body.indexOf('\n'+section.heading+'\n')+1;
    assert(start>0&&body.indexOf('\n'+section.heading+'\n',start)===-1,'The exact degree needs one unambiguous category heading');
    const end=body.indexOf('\n'+section.endHeading+'\n',start+1);assert(end>start,'The reviewed category needs its exact following boundary');
    const text=body.slice(start,end);
    assert.equal(sha256(text),section.sha256,'Category body drift invalidates the reviewed choices');
    assert(text.startsWith(section.eligibilityQuote+'\nClick to Open\n'),'The review must retain the category instruction before its course list');
    const fixed=new Set(program.requirements.filter(row=>row.id!==req.id).flatMap(row=>[row.code,...list(row.allowedCourseCodes)]).map(courseCodeKey).filter(Boolean));
    const listed=[...text.matchAll(/Click to Open\n([A-Z]+ \d+)\n([^\n]+)\n([\d.]+) Credits\n/g)];
    if(/\bunless\b/i.test(section.eligibilityQuote))assert(!listed.some(match=>fixed.has(courseCodeKey(match[1]))),'An explicit program-specific exception with a fixed listed course needs separate counting review');
    assert.deepEqual(new Set(placement.courseQuotes.map(row=>courseCodeKey(row.code))),new Set(pool.courses.map(row=>courseCodeKey(row.code))),'Each reused identity must be printed in this exact category');
    for(const course of pool.courses){
      const claim=placement.courseQuotes.find(row=>courseCodeKey(row.code)===courseCodeKey(course.code));
      assert(text.includes(claim.text),'The course identity and original credits must occur within this exact category');
      assert.equal(normalizeText(claim.text),normalizeText(course.code+'\n'+course.title+'\n'+course.credits+' Credits'),'The category must independently prove code, title and original quantity');
      const match=listed.find(row=>courseCodeKey(row[1])===courseCodeKey(course.code));assert(match,'The named identity needs an actual course heading');
      const index=listed.indexOf(match),courseBody=text.slice(match.index,index+1<listed.length?listed[index+1].index:text.length);
      assert(!courseBody.includes('\nPrerequisites\n'),'A newly discovered prerequisite needs its own review before fallback adoption');
      assert(Number(course.code.match(/\d+/)?.[0])<300,'This lower-level pool cannot infer an upper-level classification');
    }
    assert(pool.quotes.some(quote=>quote.sourceId===source.id&&quote.text===section.eligibilityQuote),'The pool must retain this exact source-bound eligibility instruction');
    req.slot.institutionChoicePoolIds=unique([...list(req.slot.institutionChoicePoolIds),pool.id]);
  }
  out.school.institutionChoicePools??=[];
  for(const pool of packet.pools){const existing=out.school.institutionChoicePools.find(row=>row.id===pool.id);if(existing)assert.deepEqual(existing,pool,'A pool ID cannot silently change review scope');else out.school.institutionChoicePools.push(clone(pool));}
  // Existing receiving awards, their IDs, quantity, evidence and order remain
  // byte-for-byte equal. Only new institutional alternatives may be appended.
  let addedUniversityOptions=0,namedChoices=0;
  for(const program of out.programs){
    const before=originalOptions.get(program.slug),after=compileProgram(out,program);
    assert.equal(after.requirements.length,before.requirements.length,'Adoption cannot add or remove degree requirements');
    for(const previous of before.requirements){
      const current=after.requirements.find(row=>row.id===previous.id);assert(current&&current.credits===previous.credits,'Adoption must preserve requirement IDs and quantities');
      for(const option of list(previous.options))assert.deepEqual(current.options.find(row=>row.id===option.id),option,'Existing option identity and evidence must remain unchanged');
      const additions=current.options.filter(row=>!list(previous.options).some(old=>old.id===row.id));
      assert(additions.every(row=>row.provider==='University'&&row.creditOrigin==='institutional'&&row.evidence==='published'&&!row.mappingEvidence&&!row.receivingCode&&!row.sourceCredits),'Adoption may add receiving-school choices only, never transfer awards');
      addedUniversityOptions+=additions.length;if(current.namedInstitutionChoicesReviewed&&!previous.namedInstitutionChoicesReviewed)namedChoices++;
    }
  }
  return {kit:out,report:{schoolId:kit.school.id,pools:packet.pools.length,programs:unique(packet.placements.map(row=>row.program)).length,reviewedPlacements:packet.placements.length,namedChoices,addedUniversityOptions,publicationPromotionAllowed:false}};
}

/** Explicit canonical writer; --check validates without modifying the kit. It
 * never compiles generated production artifacts or changes publication state. */
export async function runReviewedChoicePoolAdoption({base=root,check=false,asOf='2026-11-26'}={}){
  const dir=resolve(base,'content/pathway-kits/champlain'),kit=await loadKit(dir),packet=await readJSON(resolve(base,champlainChoicePacketPath));
  const adopted=await adoptReviewedChoicePools(kit,packet,{base,asOf,allowedUniversityHosts:['online.champlain.edu']});
  const verified=await verifyKit(adopted.kit,{base,asOf});
  assert.deepEqual(verified.errors,[],'The complete adopted kit must pass the existing verification gate');
  if(check){
    assert.deepEqual(kit.school,adopted.kit.school,'Canonical school choices differ from the reviewed adoption; run the explicit writer after source review');
    assert.deepEqual(kit.programs,adopted.kit.programs,'Canonical program opt-ins differ from the exact reviewed placements');
  }else{
    await writeFile(resolve(dir,'school.json'),JSON.stringify(adopted.kit.school,null,2)+'\n');
    for(const program of adopted.kit.programs){const {file,...value}=program;await writeFile(resolve(dir,file),JSON.stringify(value,null,2)+'\n');}
  }
  return adopted.report;
}
if(isMain(import.meta)){
  const args=parseArgs(process.argv.slice(2));
  assert(args._.length===0&&Object.keys(args).every(key=>['_','check','as-of'].includes(key)),'Use --check and optional --as-of YYYY-MM-DD only');
  assert(args.check===undefined||args.check===true,'--check does not accept a value');
  console.log(JSON.stringify(await runReviewedChoicePoolAdoption({check:args.check===true,asOf:args['as-of']||'2026-11-26'}),null,2));
}
