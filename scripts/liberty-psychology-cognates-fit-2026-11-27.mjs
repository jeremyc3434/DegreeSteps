/** Reuse the reviewed undergraduate online deadline policy for five exact new degree bindings. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const reviewFile='content/discovery/program-fit-reviews.json',reviewId='liberty-psychology-cognates-online-scheduled-reviewed-20261127';
export async function bindPsychologyLearningReviews({write=false}={}){
 const [packet,cohort]=await Promise.all([read(reviewFile),read('content/curricula/snapshots/liberty/psychology-cognates-reviewed-2026-11-27.json')]);
 const old=packet.reviews.find(review=>review.id==='liberty-online-undergraduate-scheduled-2026-27-reviewed-2026-11-24');
 assert(old&&old.paceModel==='course-term'&&old.catalogYear==='2026-2027'&&old.modality==='online');
 assert(old.source.quote.includes('deadlines specified by the professor'));assert(old.supportingSources.some(source=>source.quote.includes('assignments due weekly')));
 const bindings=[];
 for(const definition of cohort.programs){
  const program=await read('content/pathway-kits/liberty/programs/'+definition.slug+'.json');
  assert.equal(program.modelId,definition.modelId);assert.equal(program.level,'bachelor');assert.equal(program.catalog.replace(/[–—]/g,'-'),'2026-2027');assert.equal(program.format||program.modelFields.format,'Online');
  const source=program.sources.find(source=>source.roles?.includes('curriculum')&&source.capture===definition.sourceCapture);assert(source&&source.capture&&source.captureSha256);
  const body=await readFile(resolve(root,source.capture)),metadata=await read(source.capture.replace(/\.txt$/,'.json'));
  assert.equal(createHash('sha256').update(body).digest('hex'),source.captureSha256);assert.equal(metadata.sha256,source.captureSha256);assert.equal(metadata.url,source.url);assert.equal(metadata.status,200);
  assert(new URL(source.url).pathname.endsWith('/'+definition.slug.replace(/^psychology-/,'')+'/'));
  assert(body.toString('utf8').includes('2026-2027')||body.toString('utf8').includes('2026–2027')||body.toString('utf8').includes('fall 2026 through summer 2027'));
  bindings.push({modelId:program.modelId,degreeUrl:source.url,degreeCapture:source.capture,degreeSha256:source.captureSha256});
 }
 assert.equal(bindings.length,5);const ids=bindings.map(binding=>binding.modelId);
 assert(!packet.reviews.some(review=>review.id!==reviewId&&review.modelIds.some(id=>ids.includes(id))),'A new binding may not replace another scoped policy review');
 const next={...structuredClone(old),id:reviewId,modelIds:ids,reviewedOn:'2026-11-27',programBindings:bindings,notes:[...old.notes,'The November 27 date records the new exact program/catalog/format bindings. Original November 24 primary policy review dates, quoted evidence and qualifications remain unchanged; no new policy retrieval is claimed.']};
 const oldIndex=packet.reviews.findIndex(review=>review.id===reviewId);if(oldIndex>=0)packet.reviews[oldIndex]=next;else packet.reviews.push(next);
 packet.checkedOn=[packet.checkedOn,'2026-11-27'].sort().at(-1);
 if(write)await writeFile(resolve(root,reviewFile),JSON.stringify(packet,null,2)+'\n');
 return {packet,review:next};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const check=process.argv.includes('--check'),before=check?await read(reviewFile):null,result=await bindPsychologyLearningReviews({write:!check});if(check)assert.deepEqual(before,result.packet,'Stale exact Liberty psychology schedule bindings');console.log(JSON.stringify({review:result.review.id,exactBindings:result.review.modelIds.length,originalPolicyDate:result.review.source.checkedOn,check}));}
