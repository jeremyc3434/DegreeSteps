/** Retained primary-source monthly maintenance for the existing residential baseline. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const reviewPath='content/reviews/liberty-business-source-freshness-2026-11-27.json';
export const modelPath='dist/data/liberty.json';
const hash=value=>createHash('sha256').update(value).digest('hex');
const readJSON=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
export function academicDigest(model){return hash(JSON.stringify({...model,sources:model.sources.filter(source=>!['degree','sophia'].includes(source.id))}));}
export function reviewedDescriptor(source,review){
 return {...source.previousDescriptor,title:source.reviewedTitle,checked:review.checkedOn,retrievedOn:source.fetchedAt.slice(0,10),capture:source.capture,captureSha256:source.sha256,sourceContentHash:'sha256:'+source.sha256,sourceHashBasis:'normalized-captured-text',originalCapturedAt:source.originalCapturedAt,latestRetrievedAt:source.fetchedAt,sourceReviewId:review.id,...(source.retrievalReceipt?{retrievalReceipt:source.retrievalReceipt,retrievalReceiptSha256:source.retrievalReceiptSha256}:{})};
}
export async function reviewLibertyBusinessSources(input,{packet,readText}={}){
 const review=packet||await readJSON(reviewPath),load=readText||(path=>readFile(resolve(root,path),'utf8'));
 assert.equal(review.id,'liberty-business-source-freshness-2026-11-27');assert.equal(review.checkedOn,'2026-11-27');
 for(const key of ['modelId','catalog','format','creditSystem','totalCredits'])assert.equal(key==='modelId'?input.id:input[key],review[key]);
 assert.equal(academicDigest(input),review.academicModelSha256,'Source maintenance must preserve every academic value, option and other source.');
 assert.deepEqual(review.sources.map(source=>source.sourceId).sort(),['degree','sophia']);
 assert.equal(review.individualAwardsCreated,0);assert.equal(review.academicValuesChanged,false);assert.equal(review.optionIdsChanged,false);
 const bodies=new Map();
 for(const source of review.sources){
  const body=await load(source.capture),metadata=JSON.parse(await load(source.capture.replace(/\.txt$/,'.json')));
  assert.equal(hash(body),source.sha256);assert.equal(metadata.sha256,source.sha256);assert.equal(metadata.url,source.url);assert.equal(metadata.status,200);assert.equal(metadata.fetchedAt,source.originalCapturedAt);
  assert.equal(source.status,200);assert.equal(source.finalUrl,source.url);assert.equal(source.fetchedAt.slice(0,10),review.checkedOn);
  if(source.retrievalReceipt){
   const raw=await load(source.retrievalReceipt),receipt=JSON.parse(raw);assert.equal(hash(raw),source.retrievalReceiptSha256);assert(source.retrievalReceipt.endsWith('/'+hash(raw)+'.json'));
   assert.equal(receipt.kind,'source-retrieval');assert.equal(receipt.capture,source.capture);assert.equal(receipt.sha256,source.sha256);assert.equal(receipt.status,200);assert.equal(receipt.url,source.url);assert.equal(receipt.finalUrl,source.finalUrl);assert.equal(receipt.fetchedAt,source.fetchedAt);
  }else{assert.equal(metadata.fetchedAt,source.fetchedAt);assert.equal(metadata.finalUrl,source.finalUrl);}
  for(const quote of source.quotes)assert(body.includes(quote),'Reviewed primary evidence is missing: '+quote);
  const before=input.sources.find(value=>value.id===source.sourceId);assert(before);assert([JSON.stringify(source.previousDescriptor),JSON.stringify(reviewedDescriptor(source,review))].includes(JSON.stringify(before)),'Do not replace a different source version.');
  bodies.set(source.sourceId,body);
 }
 const degree=bodies.get('degree'),majorRows=input.requirements.filter(row=>row.category==='major');
 assert.equal(majorRows.reduce((sum,row)=>sum+row.credits,0),66);assert.equal(input.majorResidencyBasisCredits,66);assert.equal(input.institutionMinCredits,30);assert.equal(input.upperMinCredits,30);assert.equal(input.majorInstitutionFraction,0.25);
 for(const code of review.majorFixedCourses){const row=majorRows.find(value=>value.code===code);assert(row&&row.credits===3);assert(new RegExp(code+' [^\\n]+ 3').test(degree),code+' is still a printed major requirement');}
 const active=[];
 for(const row of input.requirements)for(const option of row.options||[])if(option.sourceIds?.includes('sophia'))active.push({sourceCode:option.code,optionId:option.id,receivingCode:option.receivingCode,credits:row.credits,sourceCredits:option.sourceCredits});
 assert.deepEqual(active,review.sophiaMappings);assert.equal(active.length,7);
 for(const award of active){assert.equal(award.credits,award.sourceCredits);const line=bodies.get('sophia').split('\n').find(value=>value.startsWith(award.sourceCode+' '));assert(line);assert(new RegExp(' '+award.credits+' '+award.receivingCode+' [^\\n]+ '+award.credits+'$').test(line),'Exact current receiving code and credit quantity must match '+award.optionId);}
 const next=structuredClone(input);next.sources=next.sources.map(source=>{const change=review.sources.find(value=>value.sourceId===source.id);return change?reviewedDescriptor(change,review):source;});
 assert.equal(academicDigest(next),academicDigest(input));return next;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);assert(args.every(arg=>arg==='--check'),'Use --check to validate the retained review without writing.');
 const input=await readJSON(modelPath),next=await reviewLibertyBusinessSources(input);
 if(args.includes('--check'))assert.deepEqual(input,next,'Apply the exact receipt-bound source review before publishing.');
 else await writeFile(resolve(root,modelPath),JSON.stringify(next,null,2)+'\n');
 console.log(JSON.stringify({primarySources:2,exactSophiaMappings:7,academicModelChanged:false,check:args.includes('--check')}));
}
