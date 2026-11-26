/** Shared current CLEP original identities. No receiving award is created. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {root,stringifyKit,isMain} from './pathway-factory/lib.mjs';
import {isIndependentProviderIdentitySource} from './pathway-quality.mjs';

export const reviewId='clep-current-independent-identities-2026-11-26';
export const packetPath='content/reuse/clep-provider-identities-reviewed-2026-11-26.json';
export const checkedOn='2026-11-26';
const orgStem='00060187b2939864',orgUrl='https://www.acenet.edu/National-Guide/Pages/Organization.aspx?k=%28NGStatusCodeOWSTEXT%3D%22Active%22%29&oid=e9089b28-9016-e811-810f-5065f38bf0e1';
// Each CID was followed from the current organization page's active record.
export const exhibits=[
 ['CLEP-0003','afcd0b092501175a','69b65d60-f98e-ee11-8179-00224805f697'],
 ['CLEP-0004','d0811abcff5dee0b','94d9f928-316f-ed11-9562-00224805f697'],
 ['CLEP-0007','89a5b2d89cd5543d','cf707f82-fb8e-ee11-8179-00224805f697'],
 ['CLEP-0008','524d5e6217c04ab0','fc6c7a29-fc8e-ee11-8179-00224805f697'],
 ['CLEP-0009','a813b7524e137a86','9eaf95a3-fc8e-ee11-8179-00224805f697'],
 ['CLEP-0011','97ebef74d4faeaec','61fa54d6-316f-ed11-9562-00224805f697'],
 ['CLEP-0013','acc850de79ce3e48','af5ab92d-326f-ed11-9562-00224805f697'],
 ['CLEP-0020','97d7def522aa347a','217562ba-ba8f-ee11-8179-00224805f697'],
 ['CLEP-0021','7b9b3c11149f65d8','5f4a3709-bb8f-ee11-8179-00224805f697'],
 ['CLEP-0025','9dc484ab81498725','d528b66d-bc8f-ee11-8179-00224805f697'],
 ['CLEP-0026','9d1ed2034a5cde52','5bbeeb4c-bd8f-ee11-8179-00224805f697'],
 ['CLEP-0027','ebb3d95dd0abeaee','ce844a19-346f-ed11-9562-00224805f697'],
 ['CLEP-0028','0a66941175c18b74','1d00c5b7-2a6f-ed11-9562-00224805f697'],
 ['CLEP-0029','97251c79ddc6d8b7','2f374655-2e6f-ed11-9562-00224805f697'],
 ['CLEP-0030','5680953568b9ae2c','c8d517e5-556b-ed11-9562-00224805fa3a'],
 ['CLEP-0038','2190a19646751161','bc65ffb8-bd8f-ee11-8179-00224805f697'],
 ['CLEP-0039','cc1a0ecd1b1c804c','4080180c-2a6f-ed11-9562-00224805f697'],
 ['CLEP-0040','d8be7bf3ab145bd3','da80a697-be8f-ee11-8179-00224805f697'],
 ['CLEP-0041','9a6c54be4f18241a','7e05044c-bf8f-ee11-8179-00224805f697']
];
const hash=text=>createHash('sha256').update(text).digest('hex');
const isoDate=value=>{const[m,d,y]=value.split('/');assert(/^\d{4}$/.test(y));return y+'-'+m.padStart(2,'0')+'-'+d.padStart(2,'0');};
const readJSON=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
async function captured(stem){
 const capture='content/source-captures/'+stem+'.txt',body=await readFile(resolve(root,capture),'utf8'),meta=await readJSON(capture.replace(/\.txt$/,'.json'));
 assert.equal(meta.status,200);assert.equal(hash(body),meta.sha256);assert.equal(meta.sha256.slice(0,16),stem);assert.equal(meta.fetchedAt.slice(0,10),checkedOn);
 return{capture,body,meta};
}
export function parseCurrentCLEPIndex(body,{asOf=checkedOn}={}){
 const rows=[...body.matchAll(/ACE ID: (CLEP-\d{4})\n(\d{2}\/\d{2}\/\d{4}) to (\d{2}\/\d{2}\/\d{4})\nRecommended credits: (\d+(?:\.\d+)?)\nRead More\nExam\n([^\n]+)\nCollege Board's College-Level Examination Program \(CLEP\)/g)];
 assert.equal(rows.length,34,'The captured current organization page must retain all 34 distinct active exams');
 const entries=new Map();
 for(const match of rows){const[,code,start,end,credits,title]=match;assert(!entries.has(code),'Duplicate active exam '+code);const recommendationStart=isoDate(start),recommendationEnd=isoDate(end);assert(recommendationStart<=asOf&&recommendationEnd>=asOf,'Current recommendation period must include review date');entries.set(code,{code,title,sourceCredits:Number(credits),recommendationStart,recommendationEnd,quote:match[0]});}
 return entries;
}
export function parseCurrentCLEPExhibit(body,expected){
 assert.match(body,/Credit Type:\nExam\nACE ID:/);
 const code=body.match(/ACE ID:\n(CLEP-\d{4})\nVersion:\n(\d+)/);assert(code,'An exact exam exhibit needs its own ACE code and version');assert.equal(code[1],expected.code);
 const quantity=body.match(/Level\nCredits \(SH\)\nSubject\nLower-Division Baccalaureate\n(\d+(?:\.\d+)?)\n([^\n]+)/);assert(quantity,'An exact original exam needs an explicit credit level and semester-hour quantity');assert.equal(Number(quantity[1]),expected.sourceCredits);
 const periods=body.split('ACE Credit Recommendation Period:')[1]?.split('Credit Recommendation & Competencies')[0];assert(periods,'Retain the recommendation-period field from this exact exhibit');
 assert([...periods.matchAll(/(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})/g)].some(match=>isoDate(match[1])===expected.recommendationStart&&isoDate(match[2])===expected.recommendationEnd),'The active index period must also occur in the exact exhibit');
 assert.match(body,/Minimum Passing Score:\n50 \(scaled cut score\)/);
 return{aceVersion:Number(code[2]),quantityQuote:quantity[0],identityQuote:code[0],sourceUpper:false};
}
export function validateCLEPExhibitURL(value,code){
 const configuration=exhibits.find(row=>row[0]===code);assert(configuration,'Only an explicitly reviewed exact CLEP exhibit is in scope');const url=new URL(value);
 assert.equal(url.origin,'https://www.acenet.edu');assert.equal(url.pathname,'/National-Guide/Pages/Course.aspx');assert.equal(url.searchParams.get('cid'),configuration[2]);assert.equal(url.searchParams.get('oid'),'e9089b28-9016-e811-810f-5065f38bf0e1');assert.equal(url.searchParams.get('org'),"College Board's College-Level Examination Program (CLEP)");
 return true;
}
export async function buildCLEPIdentityPacket(){
 const org=await captured(orgStem);assert.equal(org.meta.url,orgUrl);const active=parseCurrentCLEPIndex(org.body);
 const organizationSource={id:'shared-clep-active-organization-20261126',url:orgUrl,title:'ACE current active College Board CLEP exam recommendations',kind:'ace',provider:'CLEP',roles:['recommendation-period'],checkedOn,capture:org.capture,sha256:org.meta.sha256,scope:'Exact code, title, active recommendation period and total original-credit index. It is not an exact course exhibit and is not a receiving-school award.'};
 const sources=[organizationSource],courses=[];
 for(const[code,stem]of exhibits){
  const expected=active.get(code);assert(expected,code+' must be active in this original-issuer index');const input=await captured(stem);validateCLEPExhibitURL(input.meta.url,code);
  const proof=parseCurrentCLEPExhibit(input.body,expected),id='shared-clep-'+code.toLowerCase()+'-current-exhibit-20261126';
  const course={provider:'CLEP',code,aceId:code,providerCourseCode:expected.title,codeAliases:[expected.title],sourceCredits:expected.sourceCredits,sourceCreditStatus:'verified',sourceCreditSystem:'semester',sourceUpper:false,courseVersion:proof.aceVersion,recommendationStart:expected.recommendationStart,recommendationEnd:expected.recommendationEnd,identityCheckedOn:checkedOn,identityReviewId:reviewId,identitySourceIds:[id],recommendationPeriodSourceIds:[organizationSource.id,id],sourceCreditVerification:{credits:expected.sourceCredits,creditSystem:'semester',sourceIds:[id]},sourceCreditBasis:'The exact current ACE exam exhibit establishes original recommended semester hours and lower-division level. Its active period is separately crosschecked against the current ACE organization index. Receiving-school awards and student credit are separate.'};
  const source={id,url:input.meta.url,title:'ACE '+code+' current version '+proof.aceVersion+' original exam recommendation',kind:'ace',provider:'CLEP',roles:['provider-identity','source-credit-recommendation','recommendation-period'],courseCodes:[code],checkedOn,capture:input.capture,sha256:input.meta.sha256,observed:{aceId:code,providerCourseCode:expected.title,aceVersion:proof.aceVersion,sourceCredits:expected.sourceCredits,sourceCreditSystem:'semester',sourceUpper:false,recommendationStart:expected.recommendationStart,recommendationEnd:expected.recommendationEnd},quotes:[proof.identityQuote,proof.quantityQuote],activeOrganizationQuote:expected.quote};
  assert(isIndependentProviderIdentitySource(source,course,{asOf:checkedOn}),code+' must pass the existing independent original-issuer authority gate');
  assert(!isIndependentProviderIdentitySource(organizationSource,course,{asOf:checkedOn}),'An organization index cannot stand in for an exact original-course exhibit');
  sources.push(source);courses.push(course);
 }
 return{version:1,id:reviewId,checkedOn,provider:'CLEP',scope:'Original-provider identities and current recommendations for the nineteen existing shared CLEP courses. This creates no receiving-school award, degree placement or personal course credit.',receivingAwardsCreated:0,studentCreditsAwarded:0,sources,courses};
}
export function mergeCLEPProviderFacts(original,packet){
 assert.equal(original.provider,'CLEP');assert.equal(packet.id,reviewId);const next=structuredClone(original),codes=new Set(packet.courses.map(course=>course.code));
 for(const source of packet.sources){const existing=next.sources.find(row=>row.id===source.id);if(existing)assert.deepEqual(existing,source,'Do not silently rewrite an immutable original source');else next.sources.push(structuredClone(source));}
 for(const input of packet.courses){const{provider:_provider,...facts}=input,index=next.courses.findIndex(row=>row.code===facts.code);assert(index>=0,'Promote only an existing reviewed identity');const previous=next.courses[index];next.courses[index]={...previous,...structuredClone(facts),codeAliases:[...new Set([...(previous.codeAliases||[]),...facts.codeAliases])]};}
 for(const course of original.courses.filter(row=>!codes.has(row.code)))assert.deepEqual(next.courses.find(row=>row.code===course.code),course,'Preserve all unrelated original course facts');
 return next;
}
export async function writeCLEPProviderFacts({check=false}={}){
 const packet=await buildCLEPIdentityPacket(),path='content/pathway-kits/providers/clep.json',provider=mergeCLEPProviderFacts(await readJSON(path),packet);
 const outputs=[[packetPath,JSON.stringify(packet,null,2)+'\n'],[path,stringifyKit(provider,['sources','courses'])+'\n']];
 for(const[file,text]of outputs){if(check)assert.equal(await readFile(resolve(root,file),'utf8'),text,'Regenerate reviewed original CLEP facts: '+file);else{await mkdir(resolve(root,file,'..'),{recursive:true});await writeFile(resolve(root,file),text);}}
 return{review:reviewId,providerIdentities:packet.courses.length,receivingAwardsCreated:0,studentCreditsAwarded:0,check};
}
if(isMain(import.meta))console.log(JSON.stringify(await writeCLEPProviderFacts({check:process.argv.includes('--check')})));
