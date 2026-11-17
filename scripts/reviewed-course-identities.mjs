/* Reviewed source identities and provider quantities; receiving awards are untouched. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dirname,'..'),list=x=>Array.isArray(x)?x:[],clone=x=>JSON.parse(JSON.stringify(x));
export const reviewPath='content/catalog/clep-exact-listing-identities-reviewed-2026-11-17.json';
export const identityReview=JSON.parse(await readFile(resolve(root,reviewPath),'utf8'));
const sophiaBase=JSON.parse(await readFile(resolve(root,'content/curricula/snapshots/wgu/bsmgt-202611-sophia-provider-identities.json'),'utf8'));
const sophiaLaw=JSON.parse(await readFile(resolve(root,'content/catalog/sophia-business-law-reviewed-2026-11-17.json'),'utf8'));
const sophiaReview={...sophiaBase,courses:[...sophiaBase.courses,...sophiaLaw.courses],sources:[...sophiaBase.sources,...sophiaLaw.sources]};
const retainedCatalog=JSON.parse(await readFile(resolve(root,'dist/data/course-catalog.json'),'utf8'));
const sophiaBindings=sophiaReview.courses.map(course=>{
 const listings=retainedCatalog.courses.filter(item=>item.provider==='Sophia'&&item.url===course.courseUrl);
 assert(listings.length===1&&course.activeOffering===true&&course.aceId===course.expectedAceId&&/^SOPH-\d{4}$/.test(course.aceId)&&course.identityVerificationStatus==='verified-from-current-linked-provider-syllabus-and-current-offering'&&course.sourceCreditStatus==='verified-from-current-linked-provider-syllabus'&&course.sourceCredits===3&&course.sourceCreditSystem==='semester','Use exact provider URL and reviewed current syllabus identity');
 assert(course.sourceIds.every(id=>sophiaReview.sources.some(source=>source.id===id)),'Retain the provider identity sources');
 return {...course,primaryListingId:listings[0].id};
});
function validate(review){
 assert(review.version===1&&review.provider==='CLEP'&&review.bridges.length===4,'Use the exact reviewed CLEP identity packet');
 const ids=new Set(),codes=new Set(),sources=new Map(review.sources.map(source=>[source.id,source]));
 for(const bridge of review.bridges){assert(bridge.status==='reviewed-identity-only'&&bridge.provider==='CLEP'&&/^CLEP-\d{4}$/.test(bridge.canonicalCode)&&!ids.has(bridge.primaryListingId)&&!codes.has(bridge.canonicalCode),'Identity bridges need unique exact listing IDs and codes');ids.add(bridge.primaryListingId);codes.add(bridge.canonicalCode);assert(bridge.originalSourceCredits===null&&bridge.originalSourceCreditSystem===null&&bridge.creditQuantityAction==='preserve-existing-values'&&bridge.schoolAwardAction==='unchanged','An identity bridge cannot award credit');assert(bridge.sourceIds.length>=3&&bridge.sourceIds.every(id=>sources.has(id)),'Identity sources must be retained');for(const id of bridge.sourceIds){const u=new URL(sources.get(id).url);assert(u.protocol==='https:'&&!u.username&&!u.password&&['clep.collegeboard.org','www.acenet.edu','www.liberty.edu'].includes(u.hostname),'Use reviewed official identity sources');}}
 return review;
}
export function applyCourseListingIdentities(input,review=identityReview){
 validate(review);const model=clone(input),used=new Set();
 for(const row of list(model.requirements))for(const option of list(row.options)){
  const bridge=option.provider==='CLEP'?review.bridges.find(bridge=>[option.code,...list(option.codeAliases)].includes(bridge.canonicalCode)):option.provider==='Sophia'?sophiaBindings.find(bridge=>[option.code,...list(option.codeAliases)].includes(bridge.aceId)):null;if(!bridge)continue;
  option.listingIdentityIds=[bridge.primaryListingId];option.listingIdentitySourceIds=[...bridge.sourceIds];bridge.sourceIds.forEach(id=>used.add(id));
 }
 if(used.size){const sources=new Map(list(model.sources).map(source=>[source.id,source]));for(const source of [...review.sources,...sophiaReview.sources])if(used.has(source.id))sources.set(source.id,clone(source));model.sources=[...sources.values()];}
 if(model.transferWaiverVariant?.requirements){const variant=applyCourseListingIdentities({requirements:model.transferWaiverVariant.requirements,sources:model.sources},review);model.transferWaiverVariant.requirements=variant.requirements;model.sources=variant.sources;}
 return model;
}
export function applyCatalogListingIdentities(input,review=identityReview){
 validate(review);const catalog=clone(input);
 for(const bridge of review.bridges){const course=catalog.courses.find(course=>course.id===bridge.primaryListingId);assert(course&&course.provider==='CLEP'&&course.url===bridge.primaryListingUrl,'The provider listing identity changed; review it before enrichment');assert(!course.mappingCode||course.mappingCode===bridge.canonicalCode,'Do not overwrite another canonical identity');course.mappingCode=bridge.canonicalCode;course.codeAliases=[...new Set([...list(course.codeAliases),bridge.canonicalCode])];course.identitySourceIds=[...bridge.sourceIds];course.identityReviewId=review.id;}
 for(const proof of sophiaBindings){const course=catalog.courses.find(course=>course.id===proof.primaryListingId);assert(course?.provider==='Sophia'&&course.url===proof.courseUrl,'The reviewed Sophia listing changed');assert(!/^SOPH-\d{4}$/.test(course.mappingCode||'')||course.mappingCode===proof.aceId,'Do not overwrite another ACE identity');assert(course.credits==null||course.credits===proof.sourceCredits,'A different source-credit quantity needs review');course.mappingCode=proof.aceId;course.codeAliases=[...new Set([proof.aceId,...proof.currentAliases])];course.credits=proof.sourceCredits;course.creditSystem=proof.sourceCreditSystem;course.creditBasis='reviewed-provider-syllabus';course.identitySourceIds=[...proof.sourceIds];course.identityReviewId='sophia-current-linked-syllabi-2026-11-17';course.recommendationWindowStatus=proof.recommendationWindowStatus;}
 const sources=new Map(list(catalog.sources).map(source=>[source.id,source]));for(const source of [...review.sources,...sophiaReview.sources])sources.set(source.id,{...clone(source),provider:review.sources.includes(source)?'CLEP':'Sophia',name:source.title,status:'identity-review',count:0,checkedAt:review.checkedOn,scope:'Reviewed source-course identity; receiving-school awards are unchanged.'});catalog.sources=[...sources.values()];return catalog;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const path=resolve(root,'dist/data/course-catalog.json'),original=JSON.parse(await readFile(path,'utf8')),result=applyCatalogListingIdentities(original);if(process.argv.includes('--check'))assert.deepEqual(original,result,'Course catalog needs reviewed listing identities');else await writeFile(path,JSON.stringify(result)+'\n');console.log(JSON.stringify({reviews:[identityReview.id,'sophia-current-linked-syllabi-2026-11-17'],clepIdentityBridges:4,sophiaProviderSyllabi:8,personalRecordsChanged:0,check:process.argv.includes('--check')}));}
