import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {clone,loadKit,root,courseCodeKey} from './pathway-factory/lib.mjs';
import {verifyKit} from './pathway-factory/verify.mjs';
import {compileProgram} from './pathway-factory/compile.mjs';
import {adoptReviewedChoicePools,champlainChoicePacketPath} from './pathway-factory/reviewed-choice-pools.mjs';

const packet=JSON.parse(await readFile(resolve(root,champlainChoicePacketPath),'utf8'));
const actual=await loadKit(resolve(root,'content/pathway-kits/champlain'));
const options={base:root,asOf:'2026-11-26',allowedUniversityHosts:['online.champlain.edu']};
function beforeAdoption(){
  const kit={...clone({...actual,providers:undefined}),providers:actual.providers};
  const pools=new Set(packet.pools.map(row=>row.id)),sources=new Set(packet.sources.map(row=>row.id));
  kit.school.institutionChoicePools=(kit.school.institutionChoicePools||[]).filter(row=>!pools.has(row.id));
  kit.school.sources=kit.school.sources.filter(row=>!sources.has(row.id));
  for(const program of kit.programs)for(const req of program.requirements)if(req.slot?.institutionChoicePoolIds){
    req.slot.institutionChoicePoolIds=req.slot.institutionChoicePoolIds.filter(id=>!pools.has(id));
    if(!req.slot.institutionChoicePoolIds.length)delete req.slot.institutionChoicePoolIds;
  }
  return kit;
}
const copyPacket=()=>clone(packet);

test('actual retained degree bodies safely resolve 96 choices through five reused GEd pools',async()=>{
  const before=beforeAdoption(),original=JSON.stringify(before.programs);
  const result=await adoptReviewedChoicePools(before,packet,options),after=result.kit;
  assert.deepEqual(result.report,{schoolId:'champlain',pools:5,programs:20,reviewedPlacements:85,namedChoices:96,addedUniversityOptions:329,publicationPromotionAllowed:false});
  assert.equal(JSON.stringify(before.programs),original,'validation does not mutate its input');
  assert.deepEqual((await verifyKit(after,{base:root,asOf:options.asOf})).errors,[]);
  assert.deepEqual(after.equivalencies,before.equivalencies,'outside awards, evidence and placement rules remain exactly unchanged');
  assert.deepEqual(after.school.policies,before.school.policies,'named choices cannot create transfer or residency policy');
  const toPairs=program=>compileProgram(after,program).requirements.flatMap(req=>req.options.filter(o=>o.provider==='University').map(o=>[req,o]));
  let added=0;
  for(const program of after.programs){
    const old=before.programs.find(p=>p.slug===program.slug),prior=compileProgram(before,old),next=compileProgram(after,program);
    assert.equal(next.requirements.reduce((n,r)=>n+r.credits,0),program.totalCredits);
    assert.deepEqual(next.requirements.map(r=>[r.id,r.credits]),prior.requirements.map(r=>[r.id,r.credits]));
    for(const req of prior.requirements){
      const current=next.requirements.find(r=>r.id===req.id);
      for(const option of req.options)assert.deepEqual(current.options.find(o=>o.id===option.id),option);
    }
    const named=toPairs(program).filter(([req])=>req.namedInstitutionChoicesReviewed);
    const codes=named.map(([,option])=>courseCodeKey(option.code));assert.equal(new Set(codes).size,codes.length,'pool assignment does not reuse one university course in multiple slots');
    for(const [req,option]of named){assert.equal(req.institutionalOnly,false);assert.equal(option.credits,3);assert.equal(option.creditSystem,'semester');assert.equal(option.upper,false);assert.equal(option.evidence,'published');assert.equal(option.creditOrigin,'institutional');assert.equal(option.mappingEvidence,undefined);added++;}
  }
  assert.equal(added,329);
  assert.deepEqual(after.programs.find(p=>p.review.status==='draft'),before.programs.find(p=>p.review.status==='draft'),'Information Technology draft is not promoted or altered');
  assert.equal(packet.excludedPlacements.length,4,'program-specific counting exceptions remain explicit holds');
  const repeated=await adoptReviewedChoicePools(after,packet,options);
  assert.deepEqual(repeated.kit,after,'reapplying the same reviewed packet is idempotent');
  assert.equal(repeated.report.addedUniversityOptions,0);
});

test('scope drift, source substitution and unsupported identity/quantities fail closed',async()=>{
  const cases=[
    ['wrong receiving school',(_,p)=>p.schoolId='tesu',/exact receiving school/],
    ['unreviewed',(_,p)=>p.review.status='draft',/explicit, dated/],
    ['future review',(_,p)=>p.review.checkedOn='2026-11-27',/explicit, dated/],
    ['source body hash',(_,p)=>p.sources[0].sha256='0'.repeat(64),/independently pin/],
    ['primary host',(_,p)=>p.sources[0].url='https://study.com/college/example',/primary university hosts/],
    ['provider source',(_,p)=>p.sources[0].kind='provider',/receiving-university sources/],
    ['missing capture',(_,p)=>delete p.sources[0].capture,/captured receiving/],
    ['outside course',(_,p)=>p.pools[0].courses[0].provider='Sophia',/No outside/],
    ['quantity',(_,p)=>p.pools[0].courses[0].credits=4,/No outside/],
    ['credit unit',(_,p)=>p.pools[0].courses[0].creditSystem='quarter',/No outside/],
    ['upper level',(_,p)=>p.pools[0].courses[0].upper=true,/No outside/],
    ['global scope',(_,p)=>p.pools[0].scope.all=true,/enumerate its exact/],
    ['catalog drift',k=>k.programs.find(p=>p.slug===packet.placements[0].program).catalog='2027-2028',/Catalog drift/],
    ['level drift',k=>k.programs.find(p=>p.slug===packet.placements[0].program).level='master',/Degree level drift/],
    ['format drift',k=>k.programs.find(p=>p.slug===packet.placements[0].program).modalities=['residential'],/format drift/],
    ['requirement drift',k=>k.programs.find(p=>p.slug===packet.placements[0].program).requirements.find(r=>r.id===packet.placements[0].requirementId).credits=6,/Requirement drift/],
    ['invented original quantity quote',(_,p)=>p.placements[0].courseQuotes[0].text=p.placements[0].courseQuotes[0].text.replace('3 Credits','4 Credits'),/within this exact category/],
    ['wrong category',(_,p)=>p.placements[0].section.sha256='0'.repeat(64),/Category body drift/],
    ['institution-required',k=>k.programs.find(p=>p.slug===packet.placements[0].program).requirements.find(r=>r.id===packet.placements[0].requirementId).institutionalOnly=true,/cannot replace a fixed/]
  ];
  for(const [label,mutate,expected]of cases){const kit=beforeAdoption(),review=copyPacket();mutate(kit,review);await assert.rejects(()=>adoptReviewedChoicePools(kit,review,options),expected,label);}
});

test('each catalog/requirement tuple needs independent placement proof and every course its own category quote',async()=>{
  const missing=copyPacket();missing.placements.shift();
  await assert.rejects(()=>adoptReviewedChoicePools(beforeAdoption(),missing,options),/own exact eligibility review|own exact review|independently prove/);
  const wrong=copyPacket();wrong.placements[0].courseQuotes[0]={code:'COMM 130',text:'CMIT 130\nNetworking Fundamentals\n3 Credits'};
  await assert.rejects(()=>adoptReviewedChoicePools(beforeAdoption(),wrong,options),/within this exact category|independently prove/);
  const duplicate=copyPacket();duplicate.placements.push(clone(duplicate.placements[0]));
  await assert.rejects(()=>adoptReviewedChoicePools(beforeAdoption(),duplicate,options),/same exact tuple/);
});
