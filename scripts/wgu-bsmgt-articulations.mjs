/** Validate the reviewed public WGU receiving claims without generating other programs. */
import assert from 'node:assert/strict';
const id=/^(?:SOPH|SDCM)-\d{4}$/;
const endpoint='https://marketing-api-gateway.wgu.edu/partner/v1/public/';
export function validateWguBusinessReview(review){
 assert.equal(review?.version,1);assert.equal(review.checkedOn,'2026-11-17');
 const scope=review.scope;
 assert(scope?.school==='Western Governors University'&&scope.programId===240&&scope.programCode==='BSMGT'&&scope.catalog==='202605'&&scope.level==='bachelor'&&scope.modality==='online'&&scope.creditSystem==='competency-unit'&&scope.totalCredits===110,'Use the exact current online undergraduate BSMGT ledger');
 assert(review.program?.id===240&&review.program.catalogTerm==='202605'&&review.program.active===true&&review.program.approvalStatus==='Approved');
 assert.equal(review.requirements.length,36);const requirements=new Map();
 for(const row of review.requirements){assert(row.code&&!requirements.has(row.code)&&row.title&&row.creditSystem==='competency-unit'&&row.credits>0);requirements.set(row.code,row);}
 assert.equal([...requirements.values()].reduce((sum,row)=>sum+row.credits,0),110);
 const agreements=new Map();
 for(const agreement of review.agreements){
  assert(agreement.provider==='Sophia'?agreement.id===7112&&agreement.institutionId===796&&agreement.recordVersion===186:agreement.provider==='Study.com'&&agreement.id===4429&&agreement.institutionId===678&&agreement.recordVersion===114);
  assert(agreement.published===true&&agreement.status==='APPROVED'&&agreement.collegeCode==='BU');
  assert.equal(agreement.sourceUrl,endpoint+'partner-agreement/'+agreement.id);assert(!agreements.has(agreement.provider));agreements.set(agreement.provider,agreement);
 }
 assert.equal(agreements.size,2);assert.equal(review.receivingClaims.length,44);const seen=new Set();
 for(const claim of review.receivingClaims){
  const agreement=agreements.get(claim.provider),row=requirements.get(claim.receivingCode),key=claim.provider+'|'+claim.receivingCode;
  assert(!seen.has(key)&&agreement&&row);seen.add(key);
  assert(claim.programId===240&&claim.programCode==='BSMGT'&&claim.catalogTerm==='202605'&&claim.creditSystem==='competency-unit');
  assert.equal(claim.agreementId,agreement.id);assert.equal(claim.agreementRecordVersion,agreement.recordVersion);assert.equal(claim.sourceUrl,agreement.sourceUrl);assert.equal(claim.receivingTitle,row.title);assert.equal(claim.credits,row.credits);
  assert(claim.pathwayId>0&&claim.mappingId>0&&claim.approvedSourceCodes.length&&new Set(claim.approvedSourceCodes).size===claim.approvedSourceCodes.length);
  for(const code of claim.approvedSourceCodes)assert(id.test(code)&&code.startsWith(claim.provider==='Sophia'?'SOPH-':'SDCM-')&&claim.originalPartnerCourseText.replace(/\s*-\s*/g,'-').includes(code));
 }
 assert.equal(review.receivingClaims.filter(row=>row.provider==='Sophia').length,21);assert.equal(review.receivingClaims.filter(row=>row.provider==='Study.com').length,23);
 const distinct=new Set(review.receivingClaims.map(row=>row.receivingCode));assert.equal([...distinct].reduce((sum,code)=>sum+requirements.get(code).credits,0),69);
 const residency=review.residencyPrimary;assert.equal(residency.lastUpdated,'2026-09-18');assert.equal(residency.capstoneAdditional,true);assert.equal(residency.undergraduateFraction,.25);assert.equal(residency.calculation.minimumNonCapstoneInstitutionCUs,.25*110);assert.equal(residency.calculation.requiredCapstoneCUs,requirements.get('QGT1').credits);assert.equal(residency.calculation.calculatedMinimumInstitutionCUs,31.5);
 function privateFields(value){if(!value||typeof value!=='object')return;for(const [key,nested]of Object.entries(value)){assert(!['createdBy','modifiedBy','checkedOutBy','sec','builderKey','access_token','client_secret'].includes(key),'Keep staff and configuration fields out of academic research');privateFields(nested);}}
 privateFields(review);return JSON.parse(JSON.stringify(review));
}
