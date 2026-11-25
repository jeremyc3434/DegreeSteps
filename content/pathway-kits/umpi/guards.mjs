import assert from 'node:assert/strict';

const id='curriculum-umpi-maol-yourpace';
const mapId='umpi-maol-current-academic-map-2026-11-25';
const creditId='umpi-maol-board-proposal-2019-reviewed-2026-11-25';
const programId='umpi-maol-current-program-2026-11-25';
const faqId='umpi-yourpace-current-faq-2026-11-25';
const codes=['500','510','520','530','540','550','600','610','620','630','640','650'].map(n=>'OLS '+n);
const models=doc=>doc.models.filter(model=>model.id===id);

function maolLedger(doc){
  assert.equal(models(doc).length,1,'The reviewed MAOL program must be present exactly once');
  for(const model of models(doc)){
    assert.equal(model.level,'master');assert.equal(model.creditSystem,'semester');
    assert.equal(model.totalCredits,36);assert.equal(model.requirements.length,12);
    assert.deepEqual(model.requirements.map(row=>row.code),codes,'The twelve published OLS identities must remain distinct');
    assert.equal(model.requirements.reduce((sum,row)=>sum+row.credits,0),36);
    for(const row of model.requirements){
      assert.equal(row.credits,3,'The dated official proposal assigns three credits per competency');
      assert.deepEqual(row.sourceIds,[mapId,creditId],'Current identities and historical explicit quantities must both remain cited');
    }
    for(const domain of ['domain-1','domain-2','domain-3'])assert.equal(model.requirements.filter(row=>row.group===domain).reduce((sum,row)=>sum+row.credits,0),12);
    assert.deepEqual(model.requirements.filter(row=>row.category==='capstone').map(row=>row.code),['OLS 650']);
  }
}

function graduatePolicyScope(doc){
  for(const model of models(doc)){
    assert.equal(model.externalMaxCredits,6,'The current MAOL graduate transfer ceiling is six credits');
    assert.equal(model.institutionMinCredits,30,'The graduate floor is 36 less six; it is not the undergraduate 30/12/9 rule');
    assert.equal(model.majorMinInstitutionCredits,undefined,'Do not import undergraduate major residency into this master’s');
    assert.equal(model.majorUpperMinInstitutionCredits,undefined,'Do not import undergraduate upper-major residency into this master’s');
    assert.equal(model.alternativeMaxCredits,undefined,'No ACE maximum or graduate alternative-credit award was established');
    assert.deepEqual(model.policyEvidence.externalMaxCredits.sourceIds,[programId]);
    assert.equal(model.policyEvidence.assessmentPassingPercent.value,80);
    assert.deepEqual(model.policyEvidence.assessmentPassingPercent.sourceIds,[faqId]);
    const sources=new Map((model.sources||doc.sources||[]).map(source=>[source.id,source]));
    assert.equal(sources.get(creditId)?.documentPeriod,'2019','The original Board proposal must retain its historical period');
    assert.equal(sources.get(creditId)?.location,'Section IV.A, printed page 9 / PDF page 129');
  }
}

function namedInstitutionalBaseline(doc){
  for(const model of models(doc))for(const row of model.requirements){
    assert.equal(row.options.length,1,'The MAOL template proposes only its named UMPI course');
    const option=row.options[0];
    assert.equal(option.provider,'University','Undergraduate provider partnerships are not graduate receiving awards');
    assert.equal(option.code,row.code);assert.equal(option.title,row.title);assert.equal(option.credits,3);
    assert.equal(option.creditOrigin,'institutional');assert.equal(option.evidence,'published');
    assert.deepEqual(option.sourceIds,[mapId,creditId]);
  }
}

function currentIdentityAndPricing(doc){
  for(const model of models(doc)){
    assert.equal(model.catalogIdentity?.kind,'reviewed-current-catalog');
    assert.equal(model.catalogIdentity?.label,model.catalog);
    assert.equal(model.catalogIdentity?.sourceUrl,'https://www.umpi.edu/academics/academic-maps/maol/');
    assert.equal(model.paceModel,'competency-subscription');assert.equal(model.learningFormat,'YourPace');
    assert.equal(model.pricing.amount,2450);assert.equal(model.pricing.period,'8 weeks');
    assert.deepEqual(model.pricing.sourceIds,[programId]);
    assert.equal(model.pricing.total,undefined,'A session rate is not an all-in degree quote');
    assert.equal(model.pacePolicy.sessionWeeks,8);
  }
}

export const checks=[maolLedger,graduatePolicyScope,namedInstitutionalBaseline,currentIdentityAndPricing];
