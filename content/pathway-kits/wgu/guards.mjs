/* WGU academic invariants, ported from scripts/import-wgu-curricula.py when the kit became the source of truth.
 * Each check receives the compiled curriculum document and throws on a violation. */
import assert from 'node:assert/strict';

const list=v=>Array.isArray(v)?v:[];
const BSMGT='curriculum-wgu-catalog-ecceaa488637ac83';

/** Every model is a competency-unit ledger whose named requirements add up to the published total. */
function competencyUnitLedgers(doc){
  for(const m of doc.models){
    assert.equal(m.creditSystem,'competency-unit',`${m.title}: WGU awards competency units, not semester credits`);
    assert.ok(m.catalog,`${m.title}: a catalog term is required`);
    const sum=m.requirements.reduce((n,r)=>n+r.credits,0);
    assert.equal(sum,m.totalCredits,`${m.title}: requirements total ${sum} CUs, not the published ${m.totalCredits}`);
  }
}

/** Institution-only (nontransferable) requirements must never carry outside options. */
function institutionOnlyStaysAtWGU(doc){
  for(const m of doc.models)for(const r of m.requirements)
    if(r.institutionalOnly)assert.equal(list(r.options).length,0,`${m.title} ${r.code}: nontransferable course must stay at WGU`);
}

/** Transfer ceilings derive from the program's own CU total (75%), never an old 120-credit cap. */
function ceilingsFromProgramTotal(doc){
  for(const m of doc.models)for(const field of ['externalMaxCredits','alternativeMaxCredits'])
    if(m[field]!==undefined)assert.equal(m[field],m.totalCredits*0.75,`${m.title}: ${field} must be 75% of the ${m.totalCredits}-CU program`);
}

/** Capstone-exclusion residency: one named, institution-only capstone whose CUs match the policy. */
function capstoneResidency(doc){
  const sources=new Set(doc.sources.map(s=>s.id));
  for(const m of doc.models){
    const p=m.residencyPolicy;if(!p)continue;
    assert.equal(p.type,'institution-fraction-with-capstone-exclusion',`${m.title}: unexpected residency rule type`);
    assert.equal(p.fraction,0.25,`${m.title}: preserve the source-bound 25% residency rule`);
    assert.equal(p.creditSystem,m.creditSystem,`${m.title}: residency must use the program's credit units`);
    const caps=m.requirements.filter(r=>list(p.capstoneRequirementIds).includes(r.id));
    assert.equal(caps.length,1,`${m.title}: exactly one named capstone`);
    assert.equal(caps[0].institutionalOnly,true,`${m.title}: the capstone must remain institution-only`);
    assert.equal(caps[0].credits,p.capstoneCredits,`${m.title}: capstone CUs must match the policy`);
    const check=p.conservativeSufficientCondition;
    if(check){
      assert.equal(check.basisCredits,m.totalCredits,`${m.title}: the sufficient condition uses total degree CUs`);
      assert.equal(check.minimumNonCapstoneInstitutionCUs,m.totalCredits*p.fraction,`${m.title}: the sufficient condition excludes the capstone`);
    }
    assert.ok(list(p.sourceIds).length&&p.sourceIds.every(id=>sources.has(id)),`${m.title}: residency needs known primary sources`);
  }
}

/** The reviewed Business Management ledger, policy basket and application fee (exact reviewed values). */
function businessManagementReview(doc){
  const m=doc.models.find(x=>x.id===BSMGT);
  assert.ok(m,'The reviewed WGU Business Management model is required');
  assert.equal(m.catalog,'202605');assert.equal(m.totalCredits,110);
  const p=m.residencyPolicy;
  assert.ok(['exact-floor-unresolved','verified-additional-capstone'].includes(p.interpretationStatus),'Preserve the source-bound residency interpretation');
  const caps=m.requirements.filter(r=>p.capstoneRequirementIds.includes(r.id));
  assert.equal(caps[0].code,'QGT1','The named 4-CU WGU capstone must remain QGT1');assert.equal(p.capstoneCredits,4);
  if(p.creditScope)assert.ok(p.creditScope==='active-program'&&p.sourceIds.includes('wgu-residency-policy-23797-20260918'),'Current-program residency needs the reviewed active-program policy scope');
  if(p.interpretationStatus==='verified-additional-capstone')
    assert.ok(p.sourceIds.includes('wgu-residency-policy-23797-20260918')&&p.calculatedMinimumInstitutionCUs===31.5,'The verified residency floor requires the current handbook and additional capstone');
  const price=m.pricing;
  assert.ok(price.model==='subscription'&&price.period==='6 months'&&price.amount===price.tuitionPerTerm+price.resourceFeePerTerm&&price.amount===4050&&price.includesResourceFee===true,'Keep tuition and mandatory resource fees in one six-month term basket');
  assert.ok(list(price.oneTimeFees).length===1&&price.oneTimeFees[0].amount===65&&price.oneTimeFees[0].frequency==='one-time','The application fee must not be charged each term');
  const reviews=list(m.policyReview);
  assert.ok(reviews.length===1&&reviews[0].field==='upperMinCredits'&&reviews[0].status==='resolved'&&reviews[0].resolution==='covered-by-complete-named-curriculum','Resolve only the aggregate upper-level check with complete named-curriculum evidence');
}

/** Subscription pricing is a per-term basket; one-time fees are never periodic. */
function termPricing(doc){
  for(const m of doc.models){
    const p=m.pricing;if(!p)continue;
    assert.equal(p.model,'subscription',`${m.title}: WGU charges per six-month term`);
    assert.ok(p.amount>0,`${m.title}: a positive term price is required`);
    for(const fee of list(p.oneTimeFees))assert.equal(fee.frequency,'one-time',`${m.title}: one-time fees must not repeat`);
  }
}

/** Every outside option keeps its original source quantity and a known receiving-school source. */
function optionEvidence(doc){
  const sources=new Set(doc.sources.map(s=>s.id));
  for(const m of doc.models)for(const r of m.requirements)for(const o of list(r.options)){
    assert.ok(list(o.sourceIds).length&&o.sourceIds.every(id=>sources.has(id)),`${m.title} ${r.code} ${o.id}: unknown receiving-school source`);
    if(o.sourceCreditStatus==='verified')assert.ok(o.sourceCredits>0&&o.sourceCreditSystem,`${m.title} ${o.id}: verified source credits need their original units`);
  }
}

export const checks=[competencyUnitLedgers,institutionOnlyStaysAtWGU,ceilingsFromProgramTotal,capstoneResidency,businessManagementReview,termPricing,optionEvidence];
