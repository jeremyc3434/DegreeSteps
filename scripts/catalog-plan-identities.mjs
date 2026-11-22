/* Plan course identities in the course catalog (dist/data/course-catalog.json), for the credits-worth picker and
 * course library. Every outside course a finder plan proposes is published in that plan's curriculum with its
 * provider, source-course code and source links. A student who picks that course must get a record carrying the same
 * identity, or "What are my credits worth?" cannot match it (Sophia "Public Speaking" had no SOPH-0024 key).
 *
 * Nothing here is invented. For each plan option:
 *  - an existing catalog listing for the same course gains the option's code as an alias. "Same course" means the same
 *    provider and the same course page URL and title, or the same provider and an exact title that only one code uses;
 *  - otherwise a listing is added from the option itself (provider, code, title, source link, and source-course credits
 *    only where the curriculum records them), marked as a plan course identity that still requires review.
 * Listings with an independently reviewed identity (identityReviewId) are left exactly as their review set them.
 * Use --check to verify the catalog is current. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=resolve(import.meta.dirname,'..'),catalogPath=resolve(root,'dist/data/course-catalog.json');
const list=value=>Array.isArray(value)?value:[],text=value=>typeof value==='string'?value.trim():'';
const key=value=>text(value).normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const providerKey=value=>({sophialearning:'sophia',studycom:'studycom',collegelevelexaminationprogram:'clep'}[key(value)]||key(value));
const url=value=>{try{const parsed=new URL(text(value));return parsed.protocol==='https:'?parsed.href.toLowerCase().replace(/\/$/,''):'';}catch{return '';}};
export const SOURCE_ID='plan-course-identities';

/** Outside-provider options from the finder's plans (one entry per option occurrence). */
export function planOptions(models){
 const out=[];
 for(const model of models)for(const requirement of list(model?.requirements))for(const option of list(requirement.options)){
  if(!text(option.provider)||option.provider==='University'||!text(option.code)||!text(option.title))continue;
  out.push({modelId:model.id,option});
 }
 return out;
}
const identities=course=>new Set([course.code,course.mappingCode,...list(course.codeAliases)].map(key).filter(Boolean));
const optionCode=option=>key(option.code)&&key(option.code)!==key(option.title)?option.code:null;

export function applyPlanCourseIdentities(input,models){
 const catalog=JSON.parse(JSON.stringify(input)),options=planOptions(models),courses=catalog.courses;
 // Exact-title uniqueness per provider: a title shared by two different codes is not an identity.
 const titleCodes=new Map();
 for(const {option} of options){const code=optionCode(option);if(!code)continue;const id=providerKey(option.provider)+'|'+key(option.title);if(!titleCodes.has(id))titleCodes.set(id,new Set());titleCodes.get(id).add(key(code));}
 const catalogTitles=new Map();for(const course of courses){const id=providerKey(course.provider)+'|'+key(course.title);catalogTitles.set(id,(catalogTitles.get(id)||0)+1);}
 const covered=option=>courses.some(course=>providerKey(course.provider)===providerKey(option.provider)&&[option.code,...list(option.codeAliases)].some(code=>identities(course).has(key(code))));
 const sameCourse=option=>{
  const provider=providerKey(option.provider),title=key(option.title),page=url(option.url);
  const byPage=page&&courses.filter(course=>providerKey(course.provider)===provider&&url(course.url)===page&&key(course.title)===title);
  if(byPage?.length===1)return byPage[0];
  const id=provider+'|'+title;
  if(titleCodes.get(id)?.size===1&&catalogTitles.get(id)===1)return courses.find(course=>providerKey(course.provider)===provider&&key(course.title)===title);
  return null;
 };
 const added=new Map();
 for(const {option} of options){
  const code=optionCode(option);if(!code||covered(option))continue;
  const existing=sameCourse(option);
  if(existing&&!existing.identityReviewId){
   existing.codeAliases=[...new Set([...list(existing.codeAliases),code])];
   existing.planIdentitySourceIds=[...new Set([...list(existing.planIdentitySourceIds),...list(option.identitySourceIds),...list(option.sourceIds)])].sort();
   continue;
  }
  if(existing)continue;
  const id=providerKey(option.provider)+'-plan-'+key(code);
  if(!added.has(id))added.set(id,{id,options:[]});
  added.get(id).options.push(option);
 }
 for(const {id,options:group} of [...added.values()].sort((a,b)=>a.id.localeCompare(b.id))){
  const count=values=>{const tally=new Map();for(const value of values.filter(Boolean))tally.set(value,(tally.get(value)||0)+1);return [...tally].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0])))[0]?.[0]??null;};
  const first=group[0],credits=new Set(group.map(option=>typeof option.sourceCredits==='number'&&['semester','quarter'].includes(option.sourceCreditSystem)?option.sourceCredits+'|'+option.sourceCreditSystem:'unknown'));
  const [amount,system]=credits.size===1&&!credits.has('unknown')?[...credits][0].split('|'):[null,null];
  const aliases=[...new Set(group.flatMap(option=>list(option.codeAliases)).filter(alias=>key(alias)&&key(alias)!==key(first.code)))].sort();
  courses.push({id,provider:first.provider,providerId:providerKey(first.provider),title:count(group.map(option=>text(option.title))),url:count(group.map(option=>url(option.url)?text(option.url):'')),code:first.code,mappingCode:first.code,codeAliases:aliases.length<=6?aliases:[],
   credits:amount===null?null:Number(amount),creditSystem:system,creditBasis:'plan-course-identity',subject:null,assessment:null,price:null,priceNote:'Membership and/or course fees apply; check the provider’s current terms.',sourceId:SOURCE_ID,checkedAt:null,recommendationStatus:'requires-review',mappingStatus:'plan-course-identity',mappedCourseIds:[],
   planIdentitySourceIds:[...new Set(group.flatMap(option=>[...list(option.identitySourceIds),...list(option.sourceIds)]))].sort()});
 }
 const count=courses.filter(course=>course.sourceId===SOURCE_ID).length,sources=list(catalog.sources).filter(source=>source.id!==SOURCE_ID);
 if(count)sources.push({id:SOURCE_ID,provider:'Several providers',url:'https://degreesteps.com/degree-plans/',minimum:0,checkedAt:null,count,status:'plan-identities',scope:'Outside courses named in DegreeSteps degree plans, with the provider, course code and source links each plan publishes. Credit recommendations and school acceptance require review.'});
 catalog.sources=sources;
 return catalog;
}

export async function finderModels(){
 const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
 // The plans "What are my credits worth?" checks: the same entries as dist/data/plan-course-index.json.
 const [library,registry]=await Promise.all([read('dist/data/plan-library-index.json'),read('dist/data/curriculum-registry.json')]);
 const byModel=new Map(registry.models.map(entry=>[entry.id,entry])),docs=new Map(),models=[];
 for(const entry of Object.values(library.plans).filter(entry=>entry.tier==='confirmation'||entry.tier==='reviewed'&&entry.published===true)){
  const path=byModel.get(entry.modelId)?.path;assert(path,'Plan '+entry.modelId+' needs its curriculum path.');
  if(!docs.has(path))docs.set(path,await read('dist/'+path));
  const doc=docs.get(path),model=(doc.models||[doc]).find(item=>item.id===entry.modelId);assert(model,'Plan '+entry.modelId+' needs its curriculum.');
  if(!models.includes(model))models.push(model);
 }
 return models;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const original=JSON.parse(await readFile(catalogPath,'utf8')),result=applyPlanCourseIdentities(original,await finderModels());
 if(process.argv.includes('--check'))assert.deepEqual(original,result,'dist/data/course-catalog.json needs plan course identities; run node scripts/catalog-plan-identities.mjs');
 else await writeFile(catalogPath,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({catalog:'dist/data/course-catalog.json',courses:result.courses.length,planIdentityListings:result.courses.filter(course=>course.sourceId===SOURCE_ID).length,mergedAliases:result.courses.filter(course=>course.planIdentitySourceIds&&course.sourceId!==SOURCE_ID).length,check:process.argv.includes('--check')}));
}
