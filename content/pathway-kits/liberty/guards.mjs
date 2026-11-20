/* Liberty academic invariants, ported from the retired importers (import-liberty-residential-expansion.mjs,
 * import-liberty-online-expansion.py, import-liberty-history-online.py) and from the assertions of the augmentation
 * stages the registry no longer re-applies (named and DSST awards, official guide mappings, grade policy, shared awards).
 * Each check receives the compiled curriculum document and throws on a violation. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const list=v=>Array.isArray(v)?v:[];
const sum=rows=>rows.reduce((n,r)=>n+r.credits,0);
const outside=r=>list(r.options).filter(o=>o.provider!=='University');
const ELECTIVE_BLOCK='Proposed use in this published elective block. The receiving course must meet its department and level restrictions and must not also count elsewhere in this degree; confirm your catalog and allocation.';

/** Every model is a balanced semester ledger for the 2026–27 catalog with unique requirement ids. */
function semesterLedgers(doc){
  for(const m of doc.models){
    assert.equal(m.creditSystem,'semester',`${m.title}: Liberty awards semester credits`);
    assert.equal(m.catalogYear,'2026-2027',`${m.title}: a reviewed 2026–27 catalog is required`);
    assert.equal(sum(m.requirements),m.totalCredits,`${m.title}: requirements total ${sum(m.requirements)}, not the published ${m.totalCredits}`);
    assert.equal(new Set(m.requirements.map(r=>r.id)).size,m.requirements.length,`${m.title}: requirement ids must be unique`);
    assert.equal(m.totalCredits,m.level==='associate'?60:120,`${m.title}: Liberty ${m.level} degrees publish ${m.level==='associate'?60:120} credits`);
  }
}
/** Residency and transfer ceilings follow the program total: 25% at Liberty, 75% from outside, 25% of the major. */
function residencyFromProgramTotal(doc){
  for(const m of doc.models){
    assert.equal(m.institutionMinCredits,m.totalCredits*0.25,`${m.title}: 25% of the degree must be earned at Liberty`);
    assert.equal(m.externalMaxCredits,m.totalCredits*0.75,`${m.title}: outside credit is capped at 75% of the degree`);
    assert.equal(m.majorInstitutionFraction,0.25,`${m.title}: 25% of the major must be earned at Liberty`);
    assert.equal(m.majorResidencyBasisCredits,sum(m.requirements.filter(r=>r.category==='major')),`${m.title}: the major residency basis is the major's own credits`);
    if(m.level==='bachelor')assert.equal(m.upperMinCredits,30,`${m.title}: bachelor degrees need 30 upper-level credits`);
  }
}
/** Upper-level major courses keep the catalog's C minimum, sourced. */
function upperMajorGradeMinimum(doc){
  for(const m of doc.models){
    const sources=new Set(list(m.sources).map(s=>s.id));
    for(const r of m.requirements)if(r.category==='major'&&r.upper&&r.code){
      assert.equal(r.minimumGrade,'C',`${m.title} ${r.code}: upper-level major courses need C or higher`);
      assert.ok(list(r.minimumGradeSourceIds).length&&r.minimumGradeSourceIds.every(id=>sources.has(id)),`${m.title} ${r.code}: the grade minimum must cite a model source`);
    }
  }
}
/** Institution-only requirements never carry outside options. */
function institutionOnlyStaysAtLiberty(doc){
  for(const m of doc.models)for(const r of m.requirements)if(r.institutionalOnly)assert.equal(outside(r).length,0,`${m.title} ${r.code||r.id}: Liberty-only course carries an outside option`);
}
/** Outside awards are semester awards that never exceed their requirement, and every cited source resolves. */
function awardsFitTheirRequirement(doc){
  for(const m of doc.models){
    const sources=new Set(list(m.sources).map(s=>s.id));
    for(const r of m.requirements)for(const o of outside(r)){
      assert.ok(o.credits>0&&o.credits<=r.credits,`${m.title} ${r.id}: ${o.provider} ${o.code} awards ${o.credits} credits for a ${r.credits}-credit requirement`);
      if(o.creditSystem!==undefined)assert.equal(o.creditSystem,'semester',`${m.title} ${r.id}: ${o.provider} ${o.code} must award semester credits`);
      assert.ok(list(o.sourceIds).length,`${m.title} ${r.id}: ${o.provider} ${o.code} needs receiving-school evidence`);
      for(const id of [...list(o.sourceIds),...list(o.identitySourceIds)])assert.ok(sources.has(id),`${m.title} ${r.id}: ${o.provider} ${o.code} cites ${id}, which is not a model source`);
    }
  }
}
/** Named, DSST and registrar awards apply only within their documented undergraduate levels and delivery formats. */
function awardsWithinDocumentedScope(doc){
  for(const m of doc.models)for(const r of m.requirements)for(const o of outside(r)){
    if(Array.isArray(o.degreeLevels)){
      assert.ok(o.degreeLevels.every(level=>['associate','bachelor'].includes(level)),`${o.provider} ${o.code}: no graduate alternative-credit inheritance`);
      assert.ok(o.degreeLevels.includes(m.level),`${m.title} ${r.id}: ${o.provider} ${o.code} is documented for ${o.degreeLevels.join('/')} degrees only`);
    }
    if(Array.isArray(o.modalities))assert.ok(list(m.modalities).every(mode=>o.modalities.includes(mode)),`${m.title} ${r.id}: ${o.provider} ${o.code} is documented for ${o.modalities.join('/')} delivery only`);
  }
}
/** Named receiving awards: upper-level status follows the receiving code, never the provider title. */
function upperFollowsReceivingCode(doc){
  for(const m of doc.models)for(const r of m.requirements)for(const o of outside(r))
    if(o.mappingReviewId==='liberty-named-2026-11-16'&&/^[A-Z]{2,6} \d{3}$/.test(o.receivingCode||''))assert.equal(o.upper,/ [34]\d{2}$/.test(o.receivingCode),`${m.title} ${r.id}: ${o.provider} ${o.code} upper-level status must follow ${o.receivingCode}`);
}
/** A proposed elective-block use stays conditional unless the approved shared bundle reviewed that exact placement. */
function electiveBlocksStayConditional(doc){
  for(const m of doc.models)for(const r of m.requirements)for(const o of outside(r))
    if(list(o.conditions).includes(ELECTIVE_BLOCK)){
      const reviewed=o.sharedAwardProvenance&&o.categoryPlacementReviewed===true&&o.degreePlacementEvidence?.modelId===m.id&&o.degreePlacementEvidence.requirementId===r.id;
      if(!reviewed)assert.equal(o.evidence,'conditional',`${m.title} ${r.id}: ${o.provider} ${o.code} elective-block use must stay conditional`);
      assert.equal(o.placementType,'elective',`${m.title} ${r.id}: ${o.provider} ${o.code} elective-block use must be marked as an elective placement`);
    }
}
/** Awards from the approved shared bundle stay within the bundle's programs, catalog and placement rules. */
function sharedAwardLineage(doc,kit){
  const bundle=JSON.parse(readFileSync(new URL('../../reuse/liberty-undergraduate-awards.json',import.meta.url),'utf8'));
  const awards=new Map(bundle.awards.map(a=>[a.id,a])),rules=new Map(bundle.placementRules.map(r=>[r.id,r]));
  for(const m of doc.models)for(const r of m.requirements)for(const o of outside(r)){
    const p=o.sharedAwardProvenance;if(!p)continue;
    assert.equal(p.bundleId,bundle.id,`${m.title} ${r.id}: unknown shared-award bundle`);
    const award=awards.get(p.awardId),rule=rules.get(p.placementRuleId);
    assert.ok(award&&rule,`${m.title} ${r.id}: ${o.provider} ${o.code} cites an award or rule outside the approved bundle`);
    assert.ok(award.scope.programIds.includes(m.id)&&rule.modelIds.includes(m.id),`${m.title} ${r.id}: ${award.id} is not approved for this degree`);
    assert.equal(o.receivingCode,award.receivingCode,`${m.title} ${r.id}: ${award.id} receiving course changed`);
    assert.equal(o.credits,award.credits,`${m.title} ${r.id}: ${award.id} credits changed`);
    if(rule.kind==='free-elective')assert.equal(r.freeElective,true,`${m.title} ${r.id}: ${award.id} is approved for free electives only`);
  }
}
/** Ledger totals published by the reviewed degree-completion plans the importers were built from. */
const reviewedTotals={
  'curriculum-liberty-psychology-bs-residential':{general:37,groups:{'major-foundations':12},majorCore:39},
  'curriculum-liberty-healthcare-administration-bs-online':{groups:{'major-foundations':9},majorCore:57,major:66},
  'curriculum-liberty-history-bs-online':{major:42,upper:30}
};
function reviewedLedgerTotals(doc){
  for(const[id,expected]of Object.entries(reviewedTotals)){
    const m=doc.models.find(x=>x.id===id);if(!m)continue;
    const reqs=m.requirements;
    if(expected.general!==undefined)assert.equal(sum(reqs.filter(r=>r.category==='general')),expected.general,`${m.title}: general education must total ${expected.general}`);
    for(const[group,credits]of Object.entries(expected.groups||{}))assert.equal(sum(reqs.filter(r=>r.group===group)),credits,`${m.title}: ${group} must total ${credits}`);
    if(expected.majorCore!==undefined)assert.equal(sum(reqs.filter(r=>r.category==='major'&&r.group!=='major-foundations')),expected.majorCore,`${m.title}: the major core must total ${expected.majorCore}`);
    if(expected.major!==undefined)assert.equal(sum(reqs.filter(r=>r.category==='major')),expected.major,`${m.title}: the major must total ${expected.major}`);
    if(expected.upper!==undefined)assert.equal(sum(reqs.filter(r=>r.upper)),expected.upper,`${m.title}: upper-level requirements must total ${expected.upper}`);
  }
}

export const checks=[semesterLedgers,residencyFromProgramTotal,upperMajorGradeMinimum,institutionOnlyStaysAtLiberty,awardsFitTheirRequirement,awardsWithinDocumentedScope,upperFollowsReceivingCode,electiveBlocksStayConditional,sharedAwardLineage,reviewedLedgerTotals];
