/** Parses the ordinary anonymous MaineStreet receiving table. No student credit is awarded here. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {htmlToText} from './pathway-factory/capture.mjs';
import {root} from './pathway-factory/lib.mjs';

export const UMPI_PUBLIC_RECEIVING_COLUMNS = ['Date Restrictions','Source Course','Source Course Title','Source Units','Target Course','Course Title','Target Units','Gen Ed or Core Requirement'];
const text = html => htmlToText(html).replace(/\s+/g,' ').trim();
const amount = value => /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : null;
const hash = value => createHash('sha256').update(value).digest('hex');
export const UMPI_RECEIVING_CAPTURE='content/source-captures/6689be0ee8b9602e.txt';
export const UMPI_RECEIVING_REVIEW='content/pathway-kits/umpi/undergraduate-public-receiving-review-2026-11-26.json';

/** Only rendered PAGECONTAINER HTML is content; PeopleSoft script CDATA is not page prose. */
export function umpiPublicReceivingHtml(body){
  if(!/^\s*<\?xml\b/i.test(body))return body;
  const fields=[...body.matchAll(/<FIELD\b[^>]*\bid=['"]win0divPAGECONTAINER['"][^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/FIELD>/gi)];
  assert.equal(fields.length,1,'Retain exactly one rendered public PAGECONTAINER');
  return fields[0][1];
}

/** Replay from the retained anonymous response, not from a static GET that would show the welcome screen. */
export async function readUMPIPublicReceiving(){
  const sourceCapture=UMPI_RECEIVING_CAPTURE,meta=JSON.parse(await readFile(resolve(root,sourceCapture.replace(/\.txt$/,'.json')),'utf8'));
  assert.equal(meta.requestMethod,'POST');
  assert.equal(meta.status,200);
  assert.equal(meta.fetchedAt.slice(0,10),'2026-11-26');
  assert.equal(new URL(meta.url).origin,'https://mainestreetcs.maine.edu');
  assert.equal(new URL(meta.url).pathname,'/psc/CSPRDG/EMPLOYEE/SA/c/UM_SA.UM_TRNSFER_GUEST.GBL');
  assert.equal(meta.extractionMode,'peoplesoft-public-PAGECONTAINER-v1');
  assert.equal(meta.accountCredentialsUsed,false);
  assert.equal(meta.studentRecordsIncluded,false);
  assert.equal(meta.tlsVerificationDisabled,false);
  assert.equal(meta.sourceInstitutionId,'1118966');
  assert.equal(meta.automatedGetRefreshSupported,false);
  assert(/^[a-f0-9]{64}$/.test(meta.rawResponseSha256));
  assert.equal(meta.renderedHtml,sourceCapture.replace(/\.txt$/,'.rendered.html'));
  const html=await readFile(resolve(root,meta.renderedHtml),'utf8'),body=await readFile(resolve(root,sourceCapture),'utf8');
  assert.equal(hash(html),meta.renderedHtmlSha256,'Preserve the exact rendered response fragment');
  assert.equal(hash(body),meta.sha256,'Preserve the readable source capture');
  assert.equal(meta.sha256.slice(0,16),sourceCapture.split('/').at(-1).slice(0,16));
  assert.equal(htmlToText(html),body,'The readable capture must derive from the exact rendered response');
  assert(!/<input\b[^>]*\bname=['"]ICSID['"]/i.test(html),'Do not publish the anonymous hidden session field');
  const result=parseUMPIPublicReceiving(html);
  assert.deepEqual(result.counts,{displayedRows:858,sophiaRows:93,studyComRows:237,detailRequiredRows:27,notAcceptedRows:9,incompleteReceivingRows:9,rowsWithPrintedDateRestrictions:0},'Review changes to the actual inventory explicitly');
  return {...result,source:{id:'umpi-public-credly-receiving-2026-11-26',kind:'university',publisher:'University of Maine System / University of Maine at Presque Isle',url:meta.url,checked:'2026-11-26',capture:sourceCapture,sha256:meta.sha256,sourceContentHash:meta.sha256,renderedHtml:meta.renderedHtml,renderedHtmlSha256:meta.renderedHtmlSha256,requestMethod:meta.requestMethod,rawResponseSha256:meta.rawResponseSha256,fetchedAt:meta.fetchedAt,roles:['institution-reported-receiving-course-map','receiving-requirement-attribute-labels','receiver-reported-source-units'],sourceReplay:meta.sourceReplay,automatedGetRefreshSupported:false}};
}

export async function buildUMPIPublicReceivingReview({check=false}={}){
  const result=await readUMPIPublicReceiving(),packet={kind:'umpi-public-receiving-matrix-review',version:1,id:'umpi-undergraduate-public-receiving-review-2026-11-26',checkedOn:'2026-11-26',publicationAllowed:false,newDegreePlansCreated:0,studentRecordsIncluded:false,source:result.source,scope:result.reviewScope,columns:result.columns,counts:result.counts,limitations:['The official table explicitly includes both past and current courses. No course recommendation version, effective date, completion date or degree catalog is printed in these rows.','Blank Date Restrictions cells are retained as unknown; they do not prove a recommendation or catalog is current.','The university labels Target Units as potentially the maximum possible amount. No individual credit award is established.','Source Units are reported by the receiving university and do not independently verify original provider credit quantities, units, level or active ACE version.','Printed GLO and core labels are retained verbatim. They are not assigned to the eight-outcome 2026–2027 GEC without separate cohort evidence.','Rows labeled More... require their actual detail panel; Not Accepted and incomplete rows are preserved separately.'],attributeLabels:[...new Set(result.rows.map(row=>row.requirementAttributeRaw).filter(Boolean))].sort(),heldRows:{detailRequired:result.rows.filter(row=>row.disposition==='detail-required').map(row=>row.rowIndex),notAccepted:result.rows.filter(row=>row.disposition==='not-accepted').map(row=>row.rowIndex),incomplete:result.rows.filter(row=>row.disposition==='incomplete-receiving-row').map(row=>row.rowIndex)},rows:result.rows};
  const serialized=JSON.stringify(packet,null,2)+'\n';
  if(check)assert.equal(await readFile(resolve(root,UMPI_RECEIVING_REVIEW),'utf8'),serialized,'The reviewed public matrix is stale');
  else await writeFile(resolve(root,UMPI_RECEIVING_REVIEW),serialized);
  return {reviewId:packet.id,...packet.counts,publicationAllowed:false,newDegreePlansCreated:0,check};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(await buildUMPIPublicReceivingReview({check:process.argv.includes('--check')})));

export function parseUMPIPublicReceiving(body){
  const html=umpiPublicReceivingHtml(body),pageText=htmlToText(html),flat=text(html);
  assert(flat.includes('From Credly/ACE 1118966'),'The displayed source institution must be Credly/ACE');
  assert(flat.includes('To University of Maine Presque Isle'),'The displayed receiving institution must be UMPI');
  assert(flat.includes('This list includes both past and current courses from the source institution.'),'Preserve the mixed-history disclosure');
  assert(flat.includes('Equivalent credit (Target Unit) amounts may be displayed as a maximum credit value possible'),'Preserve the target-unit maximum disclosure');
  const headers=[...html.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(m=>text(m[1]));
  assert.deepEqual(headers,UMPI_PUBLIC_RECEIVING_COLUMNS,'Do not infer column meanings after a university table change');
  const rows=[];
  for(const match of html.matchAll(/<tr\b(?=[^>]*\bid=['"]trUM_TRNS_EXT_VW\$0_row(\d+)['"])[^>]*>([\s\S]*?)<\/tr>/gi)){
    const rowIndex=Number(match[1])-1,cells=[...match[2].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>text(m[1]));
    assert.equal(cells.length,8,'Eight published cells are required for row '+rowIndex);
    const [dateRestrictions,sourceCourse,sourceTitle,sourceUnitsRaw,targetCourse,targetTitle,targetUnitsRaw,requirementAttribute]=cells;
    assert(sourceCourse,'The published source code is required for row '+rowIndex);
    const code=sourceCourse.match(/^([A-Z]{3,8})\s+(\d{4})$/),detailAction=match[2].match(/href="javascript:submitAction_win0\(document.win0,'([^']+)'\)/)?.[1]||null;
    const disposition=targetCourse==='Not Accepted'?'not-accepted':targetCourse==='More...'?'detail-required':targetCourse&&targetTitle&&amount(targetUnitsRaw)>0?'single-receiving-course':'incomplete-receiving-row';
    if(disposition==='detail-required')assert.equal(detailAction,'EDIT_PB$'+rowIndex,'The detail action must belong to the same exact row');
    rows.push({rowIndex,cells,dateRestrictions:dateRestrictions||null,sourceCourse,normalizedAceCode:code?code[1]+'-'+code[2]:null,sourceTitle,receiverReportedSourceUnitsRaw:sourceUnitsRaw,receiverReportedSourceUnits:amount(sourceUnitsRaw),originalCreditQuantity:null,originalCreditSystem:null,originalIdentityIndependentlyReviewed:false,targetCourse,targetTitle,targetUnitsRaw,targetUnits:amount(targetUnitsRaw),targetUnitsMayBeMaximum:true,requirementAttributeRaw:requirementAttribute||null,degreeCatalog:null,courseRecommendationVersion:null,effectiveDate:null,completionDate:null,current2026GecPlacement:null,disposition,detailAction});
  }
  assert(rows.length>0,'Do not accept an empty university course matrix');
  assert.deepEqual(rows.map(row=>row.rowIndex),Array.from({length:rows.length},(_,n)=>n),'Do not silently lose or reorder public rows');
  return {html,pageText,columns:[...UMPI_PUBLIC_RECEIVING_COLUMNS],rows,reviewScope:{schoolName:'University of Maine at Presque Isle',sourceInstitution:'Credly/ACE',sourceInstitutionId:'1118966',includesPastAndCurrentCourses:true,degreeCatalogEstablished:false,new2026GecAlignmentEstablished:false,universityReportedSourceUnitsAreIndependentIssuerEvidence:false,originalCreditQuantitiesPromoted:0,studentCreditAwards:0,publicationAllowed:false},counts:{displayedRows:rows.length,sophiaRows:rows.filter(row=>row.sourceCourse.startsWith('SOPH ')).length,studyComRows:rows.filter(row=>row.sourceCourse.startsWith('SDCM ')).length,detailRequiredRows:rows.filter(row=>row.disposition==='detail-required').length,notAcceptedRows:rows.filter(row=>row.disposition==='not-accepted').length,incompleteReceivingRows:rows.filter(row=>row.disposition==='incomplete-receiving-row').length,rowsWithPrintedDateRestrictions:rows.filter(row=>row.dateRestrictions!==null).length}};
}
