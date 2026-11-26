import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildCLEPIdentityPacket,mergeCLEPProviderFacts,parseCurrentCLEPIndex,parseCurrentCLEPExhibit,validateCLEPExhibitURL,packetPath,checkedOn} from './scripts/clep-reviewed-provider-identities.mjs';
import {isIndependentProviderIdentitySource} from './scripts/pathway-quality.mjs';
const read=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const clone=value=>structuredClone(value);

test('all nineteen shared CLEP identities use exact current original ACE exhibits and active recommendation periods',async()=>{
 const packet=await buildCLEPIdentityPacket(),provider=await read('content/pathway-kits/providers/clep.json');
 assert.deepEqual(packet,await read(packetPath));assert.equal(packet.courses.length,19);assert.equal(packet.sources.length,20);assert.equal(packet.receivingAwardsCreated,0);assert.equal(packet.studentCreditsAwarded,0);
 const sources=new Map(packet.sources.map(source=>[source.id,source]));
 for(const source of packet.sources){const bytes=await readFile(new URL(source.capture,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),source.sha256);}
 for(const course of packet.courses){
  assert.equal(course.sourceCreditStatus,'verified');assert.equal(course.sourceCreditSystem,'semester');assert.equal(course.sourceUpper,false);assert(course.recommendationStart<=checkedOn&&course.recommendationEnd>=checkedOn);assert(Number.isInteger(course.courseVersion)&&course.courseVersion>0);
  assert(!['receivingCode','credits','creditSystem','evidence','mappingEvidence','school','programIds'].some(field=>Object.hasOwn(course,field)),'An original identity must not manufacture a receiving award');
  const source=sources.get(course.identitySourceIds[0]);assert(isIndependentProviderIdentitySource(source,course,{asOf:checkedOn}));assert(validateCLEPExhibitURL(source.url,course.code));
  assert.equal(source.observed.aceVersion,course.courseVersion);assert.equal(source.observed.sourceCredits,course.sourceCredits);
  const committed=provider.courses.find(row=>row.code===course.code);assert.equal(committed.sourceCredits,course.sourceCredits);assert.equal(committed.courseVersion,course.courseVersion);assert.deepEqual(committed.identitySourceIds,course.identitySourceIds);
 }
 const math=packet.courses.find(row=>row.code==='CLEP-0004');assert.equal(math.sourceCredits,3,'Original current College Mathematics recommendation is not the UMPI table\'s six-credit award');
 assert.equal(packet.courses.find(row=>row.code==='CLEP-0040').sourceCredits,6);assert.equal(packet.courses.find(row=>row.code==='CLEP-0038').sourceCredits,4);
});

test('the original-issuer gate rejects wrong organization, code, quantity, version and unreviewed source dates',async()=>{
 const packet=await buildCLEPIdentityPacket(),course=packet.courses.find(row=>row.code==='CLEP-0039'),source=packet.sources.find(row=>row.id===course.identitySourceIds[0]);
 const rejects=change=>{const value=clone(source);change(value);assert.equal(isIndependentProviderIdentitySource(value,course,{asOf:checkedOn}),false);};
 rejects(value=>{const url=new URL(value.url);url.searchParams.set('oid','76099b28-9016-e811-810f-5065f38bf0e1');value.url=url.href;});
 rejects(value=>{const url=new URL(value.url);url.searchParams.set('cid','not-a-course-uuid');value.url=url.href;});
 rejects(value=>{value.courseCodes=['CLEP-0003'];});
 rejects(value=>{value.observed.sourceCredits=6;});
 rejects(value=>{value.observed.aceVersion+=1;});
 rejects(value=>{value.checkedOn='2026-11-27';});
 rejects(value=>{value.checkedOn='2026-10-26';});
 rejects(value=>{value.provider='Sophia';});
 const index=packet.sources[0];assert.equal(isIndependentProviderIdentitySource(index,course,{asOf:checkedOn}),false,'The organization index cannot replace a course exhibit');
 const alias=clone(source),url=new URL(alias.url);url.searchParams.set('org','Sophia Learning LLC');alias.url=url.href;assert.equal(isIndependentProviderIdentitySource(alias,course,{asOf:checkedOn}),false);
});

test('capture parsing rejects changed exam identity, level, quantity and period instead of substituting an older version',async()=>{
 const packet=await buildCLEPIdentityPacket(),course=packet.courses.find(row=>row.code==='CLEP-0039'),source=packet.sources.find(row=>row.id===course.identitySourceIds[0]),body=await readFile(new URL(source.capture,import.meta.url),'utf8');
 assert.throws(()=>parseCurrentCLEPExhibit(body.replace('ACE ID:\nCLEP-0039','ACE ID:\nCLEP-0029'),course));
 assert.throws(()=>parseCurrentCLEPExhibit(body.replace('Lower-Division Baccalaureate\n3','Lower-Division Baccalaureate\n6'),course));
 assert.throws(()=>parseCurrentCLEPExhibit(body.replace('Lower-Division Baccalaureate','Upper-Division Baccalaureate'),course));
 assert.throws(()=>parseCurrentCLEPExhibit(body,{...course,recommendationStart:'2007-01-01',recommendationEnd:'2022-12-31',sourceCredits:6}));
 assert.throws(()=>parseCurrentCLEPExhibit(body,{...course,recommendationEnd:'2029-12-31'}));
 const wrongCID=new URL(source.url);wrongCID.searchParams.set('cid',new URL(packet.sources.find(row=>row.id===packet.courses[0].identitySourceIds[0]).url).searchParams.get('cid'));assert.throws(()=>validateCLEPExhibitURL(wrongCID.href,course.code),'Another real current CLEP UUID is not this exam');
 const original=await readFile(new URL(packet.sources[0].capture,import.meta.url),'utf8');assert.throws(()=>parseCurrentCLEPIndex(original,{asOf:'2030-01-01'}),'Expired recommendations cannot remain current');assert.throws(()=>parseCurrentCLEPIndex(original,{asOf:'2023-01-01'}),'Future recommendation windows cannot be promoted');
});

test('shared identity updates are idempotent and preserve every unrelated course, source and alias',async()=>{
 const packet=await buildCLEPIdentityPacket(),provider=await read('content/pathway-kits/providers/clep.json'),extra={code:'CLEP-PRIVATE-FUTURE',title:'Unrelated original course',sourceCredits:null},extraSource={id:'unrelated-source',url:'https://example.invalid/retained'};
 provider.courses.push(extra);provider.sources.push(extraSource);provider.courses[0].codeAliases.push('Existing independent alias');
 const merged=mergeCLEPProviderFacts(provider,packet);assert.deepEqual(merged.courses.at(-1),extra);assert.deepEqual(merged.sources.at(-1),extraSource);assert(merged.courses[0].codeAliases.includes('Existing independent alias'));assert.deepEqual(mergeCLEPProviderFacts(merged,packet),merged);
 const changed=clone(provider);changed.sources.find(row=>row.id===packet.sources[1].id).observed.sourceCredits=99;assert.throws(()=>mergeCLEPProviderFacts(changed,packet),'Immutable reviewed source facts cannot be silently overwritten');
});
