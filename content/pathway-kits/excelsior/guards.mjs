/* Excelsior academic invariants, each bound to a captured Excelsior source (see school.json policies).
 * Each check receives the compiled curriculum document and throws on a violation. */
import assert from 'node:assert/strict';

const list=v=>Array.isArray(v)?v:[];
const outside=r=>list(r.options).filter(o=>o.provider!=='University');
const near=(a,b)=>Math.abs(a-b)<1e-9;

/** Semester units throughout: 120-credit bachelor's ledgers, semester requirements, awards and provider quantities. */
function semesterLedgers(doc){
  for(const m of doc.models){
    assert.equal(m.creditSystem,'semester',`${m.title}: Excelsior credits are semester credits`);
    assert.equal(m.level,'bachelor',`${m.title}: only bachelor's programs are modeled`);
    assert.equal(m.totalCredits,120,`${m.title}: Excelsior bachelor's degrees require 120 credits`);
    const sum=m.requirements.reduce((n,r)=>n+r.credits,0);
    assert.ok(near(sum,m.totalCredits),`${m.title}: requirements total ${sum}, not ${m.totalCredits}`);
    for(const r of m.requirements)for(const o of outside(r)){
      assert.equal(o.creditSystem,'semester',`${m.title} ${r.id}: ${o.provider} ${o.code} must award semester credits`);
      assert.equal(o.sourceCreditSystem,'semester',`${m.title} ${r.id}: ${o.provider} ${o.code} needs its original semester quantity`);
      assert.ok(o.sourceCredits>0,`${m.title} ${r.id}: ${o.provider} ${o.code} needs its original quantity`);
      assert.ok(o.credits<=r.credits,`${m.title} ${r.id}: ${o.provider} ${o.code} awards more than the requirement`);
    }
  }
}

/** Residency: the Excelsior-only courses stay at Excelsior, and the 7-credit floor equals 120 minus the 113-credit transfer ceiling. */
function residencyStaysAtExcelsior(doc){
  for(const m of doc.models){
    const only=m.requirements.filter(r=>r.institutionalOnly);
    for(const r of only)assert.equal(outside(r).length,0,`${m.title} ${r.code}: an Excelsior-only course cannot carry outside options`);
    const codes=only.map(r=>r.code);
    assert.ok(codes.includes('INL 102')&&codes.includes('IND 101'),`${m.title}: Information Literacy and Cornerstone are Excelsior-only`);
    assert.ok(only.some(r=>/capstone/i.test(r.title)),`${m.title}: the capstone is Excelsior-only`);
    assert.equal(m.externalMaxCredits,113,`${m.title}: the program page states transfer up to 113 credits`);
    assert.equal(m.institutionMinCredits,m.totalCredits-m.externalMaxCredits,`${m.title}: the institution floor is 120 minus the 113-credit ceiling`);
    assert.equal(only.reduce((n,r)=>n+r.credits,0),m.institutionMinCredits,`${m.title}: Excelsior-only courses must equal the residency floor`);
    assert.equal(m.policyEvidence?.institutionMinCredits?.partnershipAlternative?.value,15,`${m.title}: keep the 15-credit partnership rule visible`);
  }
}

/** Unknown stays unknown: no non-collegiate (ACE/NCCRS) ceiling is asserted without an Excelsior source. */
function alternativeCapUnknown(doc){
  for(const m of doc.models){
    assert.equal(m.alternativeMaxCredits,undefined,`${m.title}: no ACE/NCCRS ceiling was sourced; do not invent one`);
    const evidence=m.policyEvidence?.alternativeMaxCredits;
    assert.ok(evidence&&evidence.value===null&&evidence.status==='not-found',`${m.title}: the open ACE/NCCRS ceiling must stay recorded as not found`);
  }
}

/** The 30-credit upper-level minimum is covered by named upper-level requirements, and only upper-level awards fill upper-only slots. */
function upperLevelMinimum(doc){
  for(const m of doc.models){
    assert.equal(m.upperMinCredits,30,`${m.title}: Excelsior bachelor's degrees require 30 upper-level credits`);
    assert.ok(m.requirements.filter(r=>r.upper).reduce((n,r)=>n+r.credits,0)>=30,`${m.title}: upper-level requirements must cover the 30-credit minimum`);
    for(const r of m.requirements.filter(r=>r.upper&&r.bucket))for(const o of outside(r))assert.equal(o.upper,true,`${m.title} ${r.id}: ${o.provider} ${o.code} is a lower-level award`);
  }
}

/** Every outside option is an Excelsior-published guide equivalency with dated evidence and the shared conditions. */
function officialGuideEvidence(doc){
  const sources=new Map(doc.sources.map(s=>[s.id,s]));
  const guides={Sophia:'excelsior-sophia-equivalency-2025-03','Study.com':'excelsior-studycom-equivalency-2024-12',StraighterLine:'excelsior-straighterline-equivalency-2024-12'};
  for(const m of doc.models)for(const r of m.requirements)for(const o of outside(r)){
    assert.ok(guides[o.provider],`${m.title} ${r.id}: ${o.provider} has no Excelsior equivalency guide`);
    assert.deepEqual(o.sourceIds,[guides[o.provider]],`${m.title} ${r.id}: ${o.provider} ${o.code} must cite Excelsior's ${o.provider} guide`);
    assert.ok(new URL(sources.get(o.sourceIds[0]).url).hostname.endsWith('excelsior.edu'),`${m.title} ${r.id}: the receiving award must come from excelsior.edu`);
    assert.equal(o.evidenceType,'official-receiving-school-equivalency');assert.equal(o.creditOrigin,'alternative');
    assert.ok(list(o.identitySourceIds).length,`${m.title} ${r.id}: ${o.provider} ${o.code} needs provider identity evidence`);
    assert.ok(list(o.conditions).some(c=>/individually at admission/.test(c))&&list(o.conditions).some(c=>/C- or higher/.test(c)),`${m.title} ${r.id}: keep the individual-evaluation and grade conditions`);
  }
}

/** Excelsior's guide excludes Sophia English Composition II (ENG1002) from BUS degrees. */
function businessExclusions(doc){
  const bus=doc.models.find(m=>m.id==='curriculum-excelsior-bs-business-no-concentration');
  assert.ok(bus,'The BS in Business model is required');
  for(const r of bus.requirements)assert.ok(!outside(r).some(o=>o.provider==='Sophia'&&o.code==='SOPH-0030'),'Sophia ENG1002 is not applicable to BUS degrees');
}

export const checks=[semesterLedgers,residencyStaysAtExcelsior,alternativeCapUnknown,upperLevelMinimum,officialGuideEvidence,businessExclusions];
