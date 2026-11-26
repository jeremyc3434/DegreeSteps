/** Bounded residency review of complete current WGU bachelor course sets.
 * An empty declared capstone set is scoped to the exact reviewed curriculum,
 * never an assertion that every version or WGU program has no capstone.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {root,isMain,stringifyKit} from './pathway-factory/lib.mjs';

export const REVIEW_PATH='content/pathway-kits/wgu/reviews/current-ledger-residency-2026-11-26.json';
const hash=value=>createHash('sha256').update(value).digest('hex');
const list=value=>Array.isArray(value)?value:[];
const normalize=value=>String(value||'').normalize('NFKC').replace(/[\u200b\u00ad]/g,'').replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();
const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
export const courseTupleSha256=rows=>hash(JSON.stringify(rows.map(row=>[row.code,normalize(row.title).toLowerCase(),row.credits]).sort((a,b)=>a[0].localeCompare(b[0]))));
export const courseCodeSha256=rows=>hash(JSON.stringify(rows.map(row=>row.code).sort()));

/** Extract every code/title/CU row between the formal table header and footer. */
export function parseCatalogCourseTable(text,{programCode,catalog}={}){
  const rows=[];let table=false,current=null,total=null,edition=null;
  for(const raw of text.split('\n')){
    const line=normalize(raw);if(!line||/^©/.test(line))continue;
    if(line==='CCN Course Number Course Description CUs Term'){table=true;continue;}
    const end=line.match(/^([A-Z0-9]+)\s+(20\d{4})\s+Total CUs:\s+(\d+)$/);
    if(end){assert(table,'A complete current course table is required');assert.equal(end[1],programCode);edition=end[2];assert.equal(edition,catalog,'A different program catalog cannot establish the current residency review');total=Number(end[3]);table=false;current=null;continue;}
    if(!table)continue;
    const row=line.match(/^[A-Z]{2,6}\s+\d{4}\s+([A-Z]\d{3}|[A-Z]{3}\d)\s+(.+?)\s+(\d+)\s+(\d+)$/);
    if(row){current={code:row[1],title:row[2],credits:Number(row[3]),term:Number(row[4]),quote:line};rows.push(current);}
    else{assert(current,'An unparsed table row cannot become an inferred course');current.title+=' '+line;current.quote+='\n'+raw.trim();}
  }
  assert(edition&&total>0&&rows.length,'The published program/catalog/total footer is required');
  assert.equal(new Set(rows.map(row=>row.code)).size,rows.length,'Every catalog course is counted once');
  assert.equal(rows.reduce((sum,row)=>sum+row.credits,0),total,'The complete named table must balance to its published total');
  return{programCode,catalog:edition,total,rows};
}

export function catalogCourseDescriptions(text){
  const rows=new Map();let current=null;
  for(const raw of text.split('\n')){
    const line=normalize(raw);if(!line||/^©/.test(line))continue;
    const start=line.match(/^([A-Z]\d{3}|[A-Z]{3}\d)\s+-\s+/);
    if(start){assert(!rows.has(start[1]),'Course descriptions must have one authoritative section per code');current={code:start[1],text:line};rows.set(start[1],current);}
    else if(current)current.text+=' '+line;
  }
  return rows;
}

/** Newer official guides print titles/quantities without codes. Link only a
 * unique exact title to the separately published coded ledger, without treating
 * a similar title or a position as proof of a university code. */
export function parseGuideCourseTable(text,{programCode,catalog,expectedRows}={}){
  assert(normalize(text).includes('Program Code:'+programCode+' Catalog Version:'+catalog),'The guide must explicitly name the same program edition');
  const header=text.indexOf('Course Title CUs Term'),end=text.indexOf('Total CUs',header);assert(header>=0&&end>header,'A complete published standard-path table is required');
  const body=text.slice(header+'Course Title CUs Term'.length,end),quantities=[...body.matchAll(/\b(\d+)\s+(\d+)\b/g)].map(match=>({credits:Number(match[1]),term:Number(match[2])}));
  let remaining=normalize(body.replace(/\b\d+\s+\d+\b/g,' '));const rows=[];
  for(const quantity of quantities){
    const matching=expectedRows.filter(row=>remaining===normalize(row.title)||remaining.startsWith(normalize(row.title)+' '));
    assert.equal(matching.length,1,'Only one exact current course title may bind to each guide row');
    const known=matching[0],title=normalize(known.title);rows.push({code:known.code,title,credits:quantity.credits,term:quantity.term});remaining=remaining.slice(title.length).trim();
  }
  assert.equal(remaining,'','The complete source table must be consumed without inventing or skipping a course');
  const total=Number(text.slice(end).match(/^Total CUs\s+(\d+)/)?.[1]);assert(total>0);
  assert.equal(rows.length,expectedRows.length);assert.equal(new Set(rows.map(row=>row.code)).size,rows.length);assert.equal(rows.reduce((sum,row)=>sum+row.credits,0),total);
  return{programCode,catalog,total,rows};
}

async function capture(proof){
  assert(proof&&typeof proof.sourceId==='string'&&/^content\/source-captures\/[a-f0-9]{16}\.txt$/.test(proof.capture||'')&&/^[a-f0-9]{64}$/.test(proof.sha256||''));
  const body=await readFile(resolve(root,proof.capture),'utf8'),meta=await read(proof.capture.replace(/\.txt$/,'.json'));
  assert.equal(hash(body),proof.sha256,'A changed primary body requires a new review');assert.equal(meta.sha256,proof.sha256);assert.equal(meta.url,proof.url);
  assert([200,206].includes(meta.status));assert(/^https:\/\/(?:www\.|marketing-api-gateway\.|cm\.)?wgu\.edu\//.test(proof.url),'Only actual university evidence supports this residency review');
  return{body,meta};
}

export async function validateResidencyReview(program,proof){
  assert.equal(program.modelId,proof.modelId);assert.equal(program.slug,proof.slug);assert.equal(program.level,'bachelor');assert.equal(program.catalog,proof.catalog);assert.equal(program.totalCredits,proof.totalCredits);
  assert.equal(proof.reviewedOn,'2026-11-26');assert.equal(proof.status,'reviewed-complete-current-ledger');assert.equal(proof.universalityClaim,false);assert.deepEqual(proof.declaredCapstoneCodes,[]);
  assert(Number.isInteger(proof.programId)&&proof.programId>0&&proof.programCode&&proof.requirementCount>0&&['IT','BU'].includes(proof.college));
  const [ledger,table,guide,policy,descriptions]=await Promise.all([capture(proof.ledger),capture(proof.catalogue),capture(proof.guidelines),capture(proof.policy),capture(proof.descriptions)]);
  for(const evidence of [ledger,table,guide,policy,descriptions])assert(evidence.meta.fetchedAt.slice(0,10)<=proof.reviewedOn,'Do not relabel future capture evidence as an older review');
  const courses=JSON.parse(ledger.body)[0].courses;
  assert(courses.length>0&&courses.every(row=>row.programCode===proof.programCode&&row.catalogTerm===proof.catalog));
  const rows=courses.map(row=>({code:row.courseCode,title:row.courseName,credits:Number(row.competencyUnits)}));
  const published=proof.catalogue.mode==='guide-title-table'?parseGuideCourseTable(table.body,{...proof,expectedRows:rows}):parseCatalogCourseTable(table.body,proof);
  assert.equal(published.total,program.totalCredits);assert.equal(rows.length,proof.requirementCount);assert.equal(published.rows.length,rows.length);
  assert.equal(courseTupleSha256(rows),proof.courseTupleSha256);assert.equal(courseTupleSha256(published.rows),proof.courseTupleSha256,'Independent current tables must match exact course codes, names, and units');
  assert.equal(courseTupleSha256(program.requirements),proof.courseTupleSha256,'The active canonical plan must retain the entire reviewed course set');
  assert(courses.every(course=>! /capstone/i.test(course.courseName+' '+course.courseDescription+' '+JSON.stringify(course.competencies||[]))),'A declared capstone cannot enter an empty-set review');
  assert(published.rows.every(row=>! /capstone/i.test(row.title)));
  assert(!/\bcapstone\b/i.test(table.body),'Any explicit capstone declaration in the current guide must not be omitted');
  const sections=catalogCourseDescriptions(descriptions.body);
  for(const row of rows){const section=sections.get(row.code);assert(section,'The current secondary catalog must describe every required course: '+row.code);assert(normalize(section.text).toLowerCase().startsWith((row.code+' - '+normalize(row.title)+' - ').toLowerCase()),'A different course identity cannot establish role applicability: '+row.code);assert(!/\bcapstone\b/i.test(section.text),'A formal capstone declaration in the secondary course catalog must not be ignored: '+row.code);}
  assert.equal(proof.guidelines.url,'https://marketing-api-gateway.wgu.edu/partner/v1/public/transfer-guidelines/programs?programsCode='+proof.programId);
  const guidelines=JSON.parse(guide.body).filter(row=>JSON.parse(row.colleges).includes(proof.college));
  assert(guidelines.length>0,'Use the exact program college, not a different college\'s generic guideline');
  assert(guidelines.every(row=>JSON.parse(row.programs).includes(proof.programId)),'Guidelines must apply to the exact active program');
  const codes=guidelines.map(row=>({code:row.PAMS_bannerCode}));
  assert.equal(new Set(codes.map(row=>row.code)).size,codes.length);assert.equal(courseCodeSha256(codes),courseCodeSha256(rows),'The independent receiving guidelines must cover exactly the current course codes');
  assert(!/capstone/i.test(guide.body),'Any formally declared capstone requires its own policy review');
  assert(policy.body.includes('For undergraduate degree programs, students must earn at least 25% of the required Degree Competency Units directly from the program the student is actively pursuing at WGU.'));
  const awards=(await read('content/pathway-kits/wgu/equivalencies.json')).equivalencies;
  for(const row of guidelines.filter(row=>row.transferArea==='Non-Transferable')){
    const required=program.requirements.find(requirement=>requirement.code===row.PAMS_bannerCode);assert(required,'The current guide must not name an absent university requirement');assert.equal(list(required.optionRows).length,0);assert.equal(list(required.options).length,0);
    assert(!awards.some(award=>award.status==='published'&&award.receivingCode===required.code&&(award.scope?.all===true||list(award.scope?.programs).includes(program.slug))),'A contradictory published outside award must be resolved rather than silently discarded: '+required.code);
  }
  return{rows,published,ledger,table,guide,policy,descriptions};
}

function reviewedSource(proof,kind,program){
  const evidence=proof[kind],titles={catalogue:'complete current institutional-catalog course table',descriptions:'all required course descriptions in the current institutional catalog',ledger:'complete named current public academic API ledger',guidelines:'exact current program receiving guidelines',policy:'active-program undergraduate residency policy'};
  return{id:evidence.sourceId,title:'WGU '+proof.programCode+' '+proof.catalog+': '+titles[kind],url:evidence.url,kind:'university',checked:proof.reviewedOn,capture:evidence.capture,sha256:evidence.sha256,sourceContentHash:'sha256:'+evidence.sha256,roles:[kind==='policy'?'residency-policy':kind==='guidelines'?'transfer-guidelines':'curriculum'],scope:{schoolName:'Western Governors University',programId:proof.programId,programCode:proof.programCode,catalogYear:proof.catalog,level:'bachelor',modality:'online',creditSystem:'competency-unit'},reviewMethod:'Exact current code/title/CU table, full required course descriptions, complete API course set and exact program receiving-guideline code set reviewed together; empty declared capstone set applies only to this edition.',retrieval:'Retained university evidence reviewed locally; its original network retrieval timestamp remains in the immutable sidecar.'};
}

export async function applyReviewedResidency(program,{reviews}={}){
  const review=reviews||await read(REVIEW_PATH),proof=list(review.programs).find(row=>row.slug===program.slug);
  if(!proof)return program;
  const verified=await validateResidencyReview(program,proof);
  const result=structuredClone(program),field=result.modelFields||(result.modelFields={}),ids=[proof.catalogue.sourceId,proof.policy.sourceId,proof.ledger.sourceId,proof.guidelines.sourceId,proof.descriptions.sourceId];
  const sources=['ledger','catalogue','guidelines','policy','descriptions'].map(kind=>reviewedSource(proof,kind,result));
  result.sources=[...list(result.sources).filter(source=>!sources.some(next=>next.id===source.id)),...sources];
  if(result.modelSourceIds)for(const source of sources)if(!result.modelSourceIds.includes(source.id))result.modelSourceIds.push(source.id);
  const guidelines=JSON.parse(verified.guide.body).filter(row=>JSON.parse(row.colleges).includes(proof.college));
  for(const row of guidelines.filter(row=>row.transferArea==='Non-Transferable')){
    const required=result.requirements.find(requirement=>requirement.code===row.PAMS_bannerCode),quote='"PAMS_bannerCode":"'+row.PAMS_bannerCode+'","transferArea":"Non-Transferable"';
    assert(verified.guide.body.includes(quote),'University-only classification must quote its actual program guideline');
    required.institutionalOnly=true;required.sourceIds=[...new Set([...list(required.sourceIds),proof.guidelines.sourceId])];
    if(!list(required.quotes).some(item=>item.sourceId===proof.guidelines.sourceId&&item.text===quote))required.quotes=[...list(required.quotes),{sourceId:proof.guidelines.sourceId,text:quote}];
  }
  field.institutionMinCredits=program.totalCredits*0.25;
  delete field.residencyPolicy;
  field.completeExecutablePathway=true;
  field.currentLedgerResidencyReview=structuredClone(proof);
  field.policyEvidence={...field.policyEvidence,institutionMinCredits:{value:field.institutionMinCredits,fraction:0.25,basisCredits:program.totalCredits,creditSystem:'competency-unit',sourceIds:ids,note:'The exact current complete ledger and receiving-guideline course set declare no separate formal capstone. All university-required courses remain institutional; this is not a finding about other catalog editions.'}};
  field.policySourceIds=[...new Set([...list(field.policySourceIds),...ids])];
  field.unresolved=list(field.unresolved).filter(note=>typeof note!=='string'||! /^(?:These are the complete named standard-path courses in the cited WGU guide\.|University courses without an outside option are not proof|DegreeSteps must review required-capstone applicability|WGU's current \w+ ledger names no capstone course)/.test(note));
  const note='The exact '+proof.programCode+' '+proof.catalog+' required course set is reviewed against its current official catalog table and program receiving guidelines. No separately declared formal capstone occurs in this bounded course set; other editions do not inherit that finding. Any course marked non-transferable still stays at WGU.';
  if(!list(field.rulesNotes).includes(note))field.rulesNotes=[...list(field.rulesNotes),note];
  result.review={...result.review,status:'reviewed',reviewer:'Codex (source-bound complete current ledger and program-specific residency review)',reviewedOn:proof.reviewedOn};
  return result;
}

export async function writeReviewedResidency({check=false}={}){
  const reviews=await read(REVIEW_PATH),results=[];
  for(const proof of reviews.programs){const file='content/pathway-kits/wgu/programs/'+proof.slug+'.json',original=await read(file),program=await applyReviewedResidency(original,{reviews}),body=stringifyKit(program,['requirements'])+'\n';if(check)assert.equal(await readFile(resolve(root,file),'utf8'),body,'Apply the reviewed current-ledger residency proof: '+file);else await writeFile(resolve(root,file),body);results.push({slug:program.slug,institutionMinCredits:program.modelFields.institutionMinCredits});}
  const path='content/pathway-kits/wgu/school.json',school=await read(path);
  for(const document of school.publish.documents.filter(document=>document.sources==='own'))for(const proof of reviews.programs.filter(proof=>list(document.programs).includes(proof.slug)))for(const kind of ['ledger','catalogue','guidelines','policy','descriptions'])if(!school.publish.sourceOrder.includes(proof[kind].sourceId))school.publish.sourceOrder.push(proof[kind].sourceId);
  const schoolBody=stringifyKit(school)+'\n';if(check)assert.equal(await readFile(resolve(root,path),'utf8'),schoolBody,'Pin the reviewed source order without removing previous sources');else await writeFile(resolve(root,path),schoolBody);
  return results;
}
if(isMain(import.meta))console.log(JSON.stringify(await writeReviewedResidency({check:process.argv.includes('--check')})));
