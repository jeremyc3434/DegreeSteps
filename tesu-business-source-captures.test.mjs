import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {root} from './scripts/pathway-factory/lib.mjs';
import {validateConnectedWebCapture} from './scripts/pathway-factory/connected-web.mjs';
import {reviewedTESUBusinessSource} from './scripts/tesu-business-blocks.mjs';

const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const packet=await read('content/pathway-kits/tesu/business-course-sources-2026-11-26.json');
const leads=await read('content/pathway-kits/tesu/business-expansion-review-2026-11-25.json');
const course=code=>packet.courses.find(course=>course.code===code);
const normalized=value=>value.replace(/\s+/g,' ').trim();

test('all twenty exact business-course bodies and the General Management degree retain replayable native evidence',async()=>{
 assert.equal(packet.kind,'tesu-business-course-source-review');assert.equal(packet.checkedOn,'2026-11-26');assert.equal(packet.publicationPromotionAllowed,false);
 assert.deepEqual(packet.courses.map(course=>course.code).sort(),[...Object.keys(leads.coursePages),'FIN-3310','FIN-3340'].sort());
 const records=[...packet.courses.map(course=>course.source),...Object.values(packet.degreeSources)];assert.equal(records.length,21);
 for(const source of records){
  const {body}=await reviewedTESUBusinessSource(source),meta=await read(source.capture.replace(/\.txt$/,'.json'));
  assert.equal(createHash('sha256').update(body).digest('hex'),source.sha256);assert.equal(source.sourceContentHash,source.sha256);
  assert.equal(meta.status,null);assert.equal(meta.originHttpStatus,null);assert.equal(meta.rawBodyCaptured,false);assert.equal(meta.captureFormat,'connected-web-rendered-extract');
  assert.deepEqual(meta.toolResponseReceipt,source.toolResponseReceipt);assert.equal(meta.citationRef,source.citationRef);
  await validateConnectedWebCapture({...meta,text:body});
  assert.equal(meta.extraction.noLineGaps,true);assert.equal(meta.extraction.lastLine,meta.extraction.totalPageLines-1);
 }
});

test('course credits, printed prerequisites, advisories and delivery options stay bound to the complete source body',async()=>{
 for(const record of packet.courses){
  const body=await readFile(resolve(root,record.source.capture),'utf8'),text=normalized(body);assert.equal(record.credits,3);
  assert(text.includes(normalized(record.code+' '+record.title)));assert(text.includes('Credits 3'));
  assert.equal(record.actualSectionAvailabilityConfirmed,false);assert.equal(record.transportScope.originalHttpFetchTimeClaimed,false);
  for(const quote of record.quotes)assert(text.includes(normalized(quote.text)),record.code+' '+quote.field);
  if(record.formalPrerequisiteSectionPresent)assert(text.includes(normalized('Prerequisite '+record.formalPrerequisiteText)));
  else{assert.equal(record.formalPrerequisiteText,null);assert(!body.split('\n').includes('Prerequisite'));assert.match(record.prerequisiteAbsenceScope,/not a universal waiver/);}
 }
});

test('the actual primary wording preserves the Marketing code discrepancy and the Psychology alternative',()=>{
 const marketing=course('MKT-4410');assert.equal(marketing.formalPrerequisiteText,'MAR-3060');
 assert(marketing.advisoryText.some(note=>note.includes('MKT-3060')&&note.includes('MKT-2010')));
 assert.notEqual(marketing.formalPrerequisiteText,'MKT-3060');
 const psychology=course('PSY-3630');assert.equal(psychology.formalPrerequisiteText,'PSY-1010 or SOC-1010');assert.deepEqual(psychology.deliveryMethods,['e-Pack']);
 assert.equal(course('OPM-4200').formalPrerequisiteText,'OPM-4110, OPM-4150');
 assert(!course('OPM-4200').formalPrerequisiteText.includes('APS-4020'));
 assert(course('MAN-4320').source.url.endsWith('/man-432'),'Retain the actual published URL, not the inaccessible guessed path');
 assert.deepEqual(course('FIN-3310').deliveryMethods,['Online','TECEP']);
});

test('the complete General Management body proves its actual degree title and three-discipline area rule',async()=>{
 const body=await readFile(resolve(root,packet.degreeSources.generalManagement.capture),'utf8'),text=normalized(body);
 for(const fact of ['B.S. in General Management','III. Area of Study (18 Credits)','A minimum of three of the four areas must be represented','IV. Electives (15 Credits)','Total Credit Hours: 120'])assert(text.includes(fact),fact);
 for(const code of ['MAN-3110','MAN-3310','FIN-3310','FIN-3340','MKT-4110','MKT-4790'])assert(text.includes(code),code);
 for(const code of ['MAN-3110','FIN-3310','FIN-3340','MKT-4110','MKT-4790'])assert.equal(course(code).formalPrerequisiteSectionPresent,false,code+' has no printed formal prerequisite section');
 assert.equal(course('MAN-3310').formalPrerequisiteText,'MAN-2100');
});
