import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {root} from './scripts/pathway-factory/lib.mjs';
import {UMPI_RECEIVING_REVIEW,readUMPIPublicReceiving,parseUMPIPublicReceiving,umpiPublicReceivingHtml,buildUMPIPublicReceivingReview} from './scripts/umpi-public-receiving.mjs';

const retained=await readUMPIPublicReceiving();

test('all 858 public receiving rows are bound to the actual anonymous POST and exact rendered source',async()=>{
  const {source,counts}=retained;
  assert.equal(source.requestMethod,'POST');
  assert.equal(source.rawResponseSha256,'67cf757876cf439acd41c7d98aae76670d04f3311fe6e330137b2e79e73b46b8');
  assert.equal(source.sha256,'6689be0ee8b9602e9a7d47251067476cc72dd0449fb8ac6c4fdf37f3b73d2a46');
  assert.equal(source.sourceReplay.freshAnonymousCookiesOnly,true);
  assert(source.sourceReplay.actions.some(step=>step.expectedLabel==='Credly/ACE'));
  assert.equal(counts.displayedRows,858);
  assert.equal(counts.sophiaRows,93);
  assert.equal(counts.studyComRows,237);
  assert(!retained.pageText.includes('var oWin=window'),'Script CDATA is not rendered source prose');
  const packet=JSON.parse(await readFile(resolve(root,UMPI_RECEIVING_REVIEW),'utf8'));
  assert.deepEqual(packet.rows,retained.rows);
  assert.deepEqual(packet.counts,counts);
});

test('receiving-reported Source Units never become independent issuer quantities or individual awards',()=>{
  for(const row of retained.rows){
    assert.equal(row.originalCreditQuantity,null);
    assert.equal(row.originalCreditSystem,null);
    assert.equal(row.originalIdentityIndependentlyReviewed,false);
    assert.equal(row.targetUnitsMayBeMaximum,true);
  }
  const zero=retained.html.replace(/(id='UM_TRNS_EXT_VW_EXT_UNITS\$650'[^>]*>)3\.00/,'$10.00');
  assert.notEqual(zero,retained.html);
  const changed=parseUMPIPublicReceiving(zero).rows[650];
  assert.equal(changed.receiverReportedSourceUnits,0);
  assert.equal(changed.originalCreditQuantity,null);
  assert.equal(changed.targetUnits,3);
});

test('More, Not Accepted and incomplete source rows remain explicit separate holds',async()=>{
  assert.equal(retained.rows.filter(row=>row.disposition==='detail-required').length,27);
  assert.equal(retained.rows.filter(row=>row.disposition==='not-accepted').length,9);
  assert.equal(retained.rows.filter(row=>row.disposition==='incomplete-receiving-row').length,9);
  const micro=retained.rows[661];
  assert.equal(micro.sourceCourse,'SOPH 0011');
  assert.equal(micro.detailAction,'EDIT_PB$661');
  assert.equal(micro.targetCourse,'More...');
  assert.equal(micro.targetUnits,null);
  const unnamed=retained.rows[11];
  assert.equal(unnamed.sourceTitle,'');
  assert.equal(unnamed.receiverReportedSourceUnits,null);
  assert.equal(unnamed.targetUnits,null);
  const packet=JSON.parse(await readFile(resolve(root,UMPI_RECEIVING_REVIEW),'utf8'));
  assert.equal(packet.heldRows.detailRequired.length,27);
  assert.equal(packet.heldRows.notAccepted.length,9);
  assert.equal(packet.heldRows.incomplete.length,9);
});

test('printed GLO labels and blank restrictions do not establish new GEC, catalog, version or dates',()=>{
  assert(retained.rows.some(row=>row.requirementAttributeRaw==='GLO 7'));
  assert(retained.rows.some(row=>row.requirementAttributeRaw==='GLO3:LOA,B'));
  for(const row of retained.rows){
    assert.equal(row.dateRestrictions,null);
    assert.equal(row.current2026GecPlacement,null);
    assert.equal(row.degreeCatalog,null);
    assert.equal(row.courseRecommendationVersion,null);
    assert.equal(row.effectiveDate,null);
    assert.equal(row.completionDate,null);
  }
  assert.equal(retained.reviewScope.publicationAllowed,false);
  assert.equal(retained.reviewScope.studentCreditAwards,0);
  assert.equal(retained.reviewScope.new2026GecAlignmentEstablished,false);
});

test('a changed source school, column schema, missing row or reassigned detail action is rejected',()=>{
  assert.throws(()=>parseUMPIPublicReceiving(retained.html.replace(/Credly\/ACE/g,'Different source')),/source institution/);
  assert.throws(()=>parseUMPIPublicReceiving(retained.html.replace('University of Maine Presque Isle','University of Maine Augusta')),/receiving institution/);
  assert.throws(()=>parseUMPIPublicReceiving(retained.html.replace('Source Units</a>','Course Level</a>')),/column meanings/);
  assert.throws(()=>parseUMPIPublicReceiving(retained.html.replace(/<tr\b[^>]*id='trUM_TRNS_EXT_VW\$0_row651'[^>]*>[\s\S]*?<\/tr>/,' ')),/lose or reorder/);
  assert.throws(()=>parseUMPIPublicReceiving(retained.html.replace("document.win0,'EDIT_PB$661'","document.win0,'EDIT_PB$662'")),/same exact row/);
});

test('XML extraction retains only the rendered public page and the internal writer is reproducible',async()=>{
  const wrapped="<?xml version='1.0'?><PAGE><GENSCRIPT><![CDATA[private-looking-script]]></GENSCRIPT><FIELD id='win0divPAGECONTAINER'><![CDATA["+retained.html+"]]></FIELD></PAGE>";
  assert.equal(umpiPublicReceivingHtml(wrapped),retained.html);
  assert.throws(()=>umpiPublicReceivingHtml("<?xml version='1.0'?><PAGE/>"),/exactly one/);
  const checked=await buildUMPIPublicReceivingReview({check:true});
  assert.equal(checked.publicationAllowed,false);
  assert.equal(checked.newDegreePlansCreated,0);
});
