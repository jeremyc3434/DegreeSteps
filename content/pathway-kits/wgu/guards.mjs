/* WGU academic invariants, ported from scripts/import-wgu-curricula.py when the kit became the source of truth.
 * Each check receives the compiled curriculum document and throws on a violation. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const list=v=>Array.isArray(v)?v:[];
const BSMGT='curriculum-wgu-catalog-ecceaa488637ac83';
const MBA_FAMILY=new Map([
  ['curriculum-wgu-catalog-b2a8a37d4fbedabd',{catalog:'201404',credits:34,capstone:'C216'}],
  ['curriculum-wgu-catalog-b83ee97289a0732a',{catalog:'201408',credits:35,capstone:'C218'}],
  ['curriculum-wgu-catalog-c4a7efe739d67a5c',{catalog:'202507',credits:36,capstone:'C219'}]
]);
const CURRENT_LEDGER_FLOORS=new Map([
  ['curriculum-wgu-catalog-358f1e10651bf3d8',['BSACC','202503',121,40]],
  ['curriculum-wgu-catalog-bf14bd14e87ae7aa',['BSITM','202609',112,37]],
  ['curriculum-wgu-bs-computer-science-reviewed',['BSCS','202611',121,39]],
  ['curriculum-wgu-catalog-3a9fedcacbfcccae',['BSSWE','202610',120,39]],
  ['curriculum-wgu-catalog-d734fb4b04eded7c',['BSIT','202608',110,35]]
]);
const normalizedTitle=value=>String(value).normalize('NFKC').replace(/[\u200b\u00ad]/g,'').replace(/[–—]/g,'-').replace(/\s+/g,' ').trim().toLowerCase();
const tupleHash=rows=>createHash('sha256').update(JSON.stringify(rows.map(row=>[row.code,normalizedTitle(row.title),row.credits]).sort((a,b)=>a[0].localeCompare(b[0])))).digest('hex');

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

/** Degree-level ceilings derive from the program's own CU total, never an old 120-credit cap. */
function ceilingsFromProgramTotal(doc){
  for(const m of doc.models)for(const field of ['externalMaxCredits','alternativeMaxCredits'])
    if(m[field]!==undefined){
      if(m.level==='master')assert(m[field]>=0&&m[field]<=m.totalCredits*0.5,`${m.title}: ${field} must not exceed the 50% graduate ceiling`);
      else assert.equal(m[field],m.totalCredits*0.75,`${m.title}: ${field} must be 75% of the ${m.totalCredits}-CU undergraduate program`);
    }
}

/** Capstone-exclusion residency: one named, institution-only capstone whose CUs match the policy. */
function capstoneResidency(doc){
  const sources=new Set(doc.sources.map(s=>s.id));
  for(const m of doc.models){
    const p=m.residencyPolicy;if(!p)continue;
    assert.equal(p.type,'institution-fraction-with-capstone-exclusion',`${m.title}: unexpected residency rule type`);
    assert.equal(p.fraction,m.level==='master'?0.5:0.25,`${m.title}: preserve the source-bound degree-level residency rule`);
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
  // Graduate CBE routes have their own published ledger and policy. They do
  // not inherit undergraduate ACE transfer ceilings or course awards.
  for(const m of doc.models){
    const expected=MBA_FAMILY.get(m.id);if(!expected||m.completeExecutablePathway!==true)continue;
    assert.equal(m.level,'master',`${m.title}: the reviewed MBA family is graduate coursework`);
    assert.equal(m.catalog,expected.catalog);assert.equal(m.totalCredits,expected.credits);
    assert.equal(m.requirements.length,11,`${m.title}: preserve every named current requirement`);
    assert(m.requirements.every(r=>r.code&&list(r.options).length===0),`${m.title}: no outside course award is asserted`);
    assert.equal(m.alternativeMaxCredits,undefined,`${m.title}: do not invent an MBA ACE allowance`);
    assert.equal(m.externalMaxCredits,m.totalCredits*0.5,`${m.title}: a necessary ceiling does not approve any outside course`);
    assert(m.residencyPolicy,`${m.title}: graduate residency must remain explicit`);
    assert.equal(m.institutionMinCredits,m.totalCredits*0.5+4,`${m.title}: preserve graduate residency plus the four-CU capstone`);
    const cap=m.requirements.filter(r=>list(m.residencyPolicy.capstoneRequirementIds).includes(r.id));
    assert.equal(cap.length,1);assert.equal(cap[0].code,expected.capstone);assert.equal(cap[0].credits,4);assert.equal(cap[0].institutionalOnly,true);
    const primary=(m.sources||doc.sources).find(source=>list(m.residencyPolicy.sourceIds).includes(source.id)&&source.url?.includes('/23797'));
    assert(primary?.kind==='university'&&primary.capture&&/^[a-f0-9]{64}$/.test(String(primary.sourceContentHash||primary.sha256||'').replace(/^sha256:/,'')),`${m.title}: graduate residency cites the retained university policy`);
    const price=m.pricing;
    assert(price?.amount===5050&&price.tuitionPerTerm===4850&&price.resourceFeePerTerm===200&&price.includesResourceFee===true&&price.period==='6 months',`${m.title}: retain the current six-month tuition and mandatory resource basket`);
  }
  for(const m of doc.models){
    const expected=CURRENT_LEDGER_FLOORS.get(m.id);if(!expected||m.completeExecutablePathway!==true)continue;
    const p=m.currentLedgerResidencyReview;
    assert(p&&p.status==='reviewed-complete-current-ledger'&&p.universalityClaim===false,`${m.title}: the current bounded course-set review must remain explicit`);
    assert.equal(m.level,'bachelor');assert.equal(m.catalog,expected[1]);assert.equal(m.totalCredits,expected[2]);assert.equal(m.requirements.length,expected[3]);
    assert.equal(p.programCode,expected[0]);assert.equal(p.catalog,m.catalog);assert.equal(p.totalCredits,m.totalCredits);assert.equal(p.requirementCount,m.requirements.length);assert.equal(p.modelId,m.id);
    assert.deepEqual(p.declaredCapstoneCodes,[]);assert.equal(m.residencyPolicy,undefined,`${m.title}: do not disguise an empty set as a capstone exclusion rule`);
    assert.equal(p.courseTupleSha256,tupleHash(m.requirements),`${m.title}: all current required codes, titles and CUs must stay bound to the review`);
    assert.equal(m.institutionMinCredits,m.totalCredits*0.25);
    assert.equal(m.policyEvidence?.institutionMinCredits?.value,m.institutionMinCredits);
    assert(m.requirements.every(row=>row.category!=='capstone'),`${m.title}: a newly declared capstone needs its own policy review`);
    const sources=new Map((m.sources||doc.sources).map(source=>[source.id,source]));
    for(const kind of ['ledger','catalogue','guidelines','descriptions','policy']){
      const evidence=p[kind],source=sources.get(evidence?.sourceId);
      assert(source?.kind==='university'&&source.capture===evidence.capture&&source.url===evidence.url&&String(source.sourceContentHash||source.sha256).replace(/^sha256:/,'')===evidence.sha256,`${m.title}: ${kind} must retain its exact primary source and body hash`);
      assert.equal(source.scope?.programCode,p.programCode);assert.equal(source.scope?.catalogYear,p.catalog);
      assert(m.policyEvidence.institutionMinCredits.sourceIds.includes(source.id));
    }
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
