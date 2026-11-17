/** Reviewed named DSST awards; these do not create degree requirements. */
import assert from 'node:assert/strict';
export function validateDSSTAwards(document){
  assert(document?.version===1&&document.school==='Liberty University'&&/^20\d\d-\d\d-\d\d$/.test(document.checkedOn),'DSST awards need a dated receiving-school review');
  assert(Array.isArray(document.sources)&&Array.isArray(document.awards)&&document.awards.length===5,'Use the five reviewed exact-form DSST awards');
  const sources=new Map(document.sources.map(source=>[source.id,source]));assert.equal(sources.size,document.sources.length);
  for(const source of document.sources){const url=new URL(source.url);assert(url.protocol==='https:'&&!url.username&&!url.password&&!url.searchParams.has('token'));assert(source.checked===document.checkedOn);assert(source.kind==='university'?url.hostname==='www.liberty.edu'&&source.modality==='online'&&url.pathname.endsWith('.pdf'):source.kind==='provider'?url.hostname==='getcollegecredit.com'&&url.pathname.startsWith('/exam/'):source.kind==='accreditor'&&url.hostname==='www.acenet.edu');}
  const ids=new Set();for(const award of document.awards){
    assert(award.provider==='DSST'&&/^DANT-\d{4}$/.test(award.code)&&!ids.has(award.id));ids.add(award.id);
    assert(/^[A-Z]{2,6} \d{3}$/.test(award.receivingCode)&&award.credits===3&&award.creditSystem==='semester');
    assert(award.sourceCredits===3&&award.sourceCreditSystem==='semester'&&award.sourceCreditStatus==='verified'&&award.creditOrigin==='alternative');
    assert.deepEqual(award.modalities,['online']);assert.deepEqual(award.degreeLevels,['associate','bachelor']);
    assert(award.minScore===400&&award.evidence==='published'&&award.evidenceType==='official-receiving-school-equivalency');
    assert(award.codeAliases.length===2&&award.codeAliases.every(code=>/^[A-Z]{2}\d{3}$/.test(code))&&award.providerCourseCode===award.codeAliases[0]);
    assert(award.sourceIds.length===2&&award.sourceIds.every(id=>sources.get(id)?.kind==='university'));
    assert(award.identitySourceIds.length===2&&award.identitySourceIds.some(id=>sources.get(id)?.kind==='accreditor')&&award.identitySourceIds.some(id=>sources.get(id)?.kind==='provider'));
    assert(award.recommendation?.id===award.code&&award.recommendation.start==='2026-01-01'&&award.recommendation.end==='2031-12-31');
    assert(award.upper===/ [34]\d{2}$/.test(award.receivingCode),'Receiving course determines degree-level credit');
  }
  return JSON.parse(JSON.stringify(document));
}
