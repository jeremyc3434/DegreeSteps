/** Reviewed editorial material, not fabricated student accounts or engagement. */
import {readFile,writeFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const SOURCES=['starters-schools.json','starters-courses.json','starters-student-life.json'];
const EXPECTED=[80,60,60];
const GUIDE_IDS=['planning','transfers','courses','campus','military','careers','money','momentum'].map(id=>'ds-guide-'+id);
const CONTEXT=/^(school|program|course|template):[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const own=(value,keys)=>{assert(value&&typeof value==='object'&&!Array.isArray(value));assert(Object.keys(value).every(key=>keys.includes(key)),'Unexpected editorial field');};
const text=(value,min,max,label)=>{assert(typeof value==='string'&&value.trim()===value&&value.length>=min&&value.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),label);return value;};
const words=value=>value.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu)?.length||0;
const q=value=>value===null?'NULL':"'"+String(value).replaceAll("'","''")+"'";
const stamp="CAST(strftime('%s','now') AS INTEGER)*1000";
export const publishedId=id=>'ds-starter-'+createHash('sha256').update(id).digest('hex').slice(0,20);
export async function loadCommunityStarters(root=ROOT){
 const directory=resolve(root,'content/community'),profiles=JSON.parse(await readFile(resolve(directory,'starter-profiles.json'),'utf8'));
 assert.equal(profiles.version,1);assert.equal(profiles.profiles.length,8);assert.deepEqual(profiles.profiles.map(p=>p.id),GUIDE_IDS);assert.match(profiles.disclosure,/fictional/);
 const aliases=new Set();for(const profile of profiles.profiles){own(profile,['id','alias','focus']);text(profile.alias,2,40,'Guide alias');assert(profile.alias.startsWith('DegreeSteps '));assert(!aliases.has(profile.alias));aliases.add(profile.alias);text(profile.focus,5,120,'Guide focus');}
 const ids=new Set(),titles=new Set(),bodies=new Set(),threads=[];
 const catalog=JSON.parse(await readFile(resolve(root,'dist/data/course-catalog.json'),'utf8')),mapped=JSON.parse(await readFile(resolve(root,'dist/data/curriculum-course-index.json'),'utf8')),courseIds=new Set([...catalog.courses,...mapped.courses].map(c=>c.id));
 for(let index=0;index<SOURCES.length;index++){
  const packet=JSON.parse(await readFile(resolve(directory,SOURCES[index]),'utf8'));own(packet,['version','threads']);assert.equal(packet.version,1);assert.equal(packet.threads.length,EXPECTED[index],SOURCES[index]+' count');
  for(const thread of packet.threads){
   own(thread,['id','authorId','context','topic','title','body','url','replies']);assert(/^ds-starter-[a-z0-9-]{5,100}$/.test(thread.id)&&!ids.has(thread.id),'Unique starter ID');ids.add(thread.id);assert(GUIDE_IDS.includes(thread.authorId),'Only prepared guide authors');assert(CONTEXT.test(thread.context),'Public discussion context');
   if(thread.context.startsWith('course:'))assert(courseIds.has(thread.context.slice(7)),'Exact indexed course context: '+thread.context);
   text(thread.topic,3,80,'Editorial topic');text(thread.title,3,160,'Starter title');assert(!titles.has(thread.title.toLowerCase()),'Distinct question titles');titles.add(thread.title.toLowerCase());
   text(thread.body,80,6000,'Starter question');assert(/^Example (?:student )?situation:/i.test(thread.body),'Every fictional situation is explicitly identified: '+thread.id);assert(words(thread.body)>=45&&words(thread.body)<=130,'Readable, substantial scenario: '+thread.id);assert(!bodies.has(thread.body),'Repeated starter body');bodies.add(thread.body);
   const url=new URL(thread.url);assert(url.protocol==='https:'&&!url.username&&!url.password&&!url.hash,'Safe public next-step URL');
   if(url.hostname==='degreesteps.com'){
    let local=resolve(root,'dist','.'+url.pathname);if(url.pathname.endsWith('/'))local=resolve(local,'index.html');assert(local.startsWith(resolve(root,'dist')+'/'),'Local destination');assert((await stat(local)).isFile(),'Existing student destination: '+thread.url);
   }
   assert(Array.isArray(thread.replies)&&thread.replies.length===2,'Two prepared guide answers');
   for(const answer of thread.replies){own(answer,['authorId','body']);assert(GUIDE_IDS.includes(answer.authorId));text(answer.body,100,3000,'Prepared guide answer');assert(words(answer.body)>=45&&words(answer.body)<=140,'Concrete, readable guide answer: '+thread.id);assert(!bodies.has(answer.body),'Repeated guide answer: '+thread.id);bodies.add(answer.body);assert(!/\b(?:ACE[- ]accredited|guaranteed (?:acceptance|transfer|graduation)|I (?:graduated|earned my degree|saved \$)|we(?:'ve| have) helped \d)/i.test(answer.body),'Unsupported institutional or testimonial claim: '+thread.id);}
   threads.push({...thread,publishedId:publishedId(thread.id)});
  }
 }
 assert.equal(threads.length,200);assert.equal(new Set(threads.map(t=>t.publishedId)).size,200);
 return {profiles,threads:threads.sort((a,b)=>a.publishedId.localeCompare(b.publishedId))};
}
export function communityStarterSQL({profiles,threads}){
 const statements=['-- DegreeSteps prepared starter library. Examples are fictional and visibly labeled.', '-- Branded guide profiles cannot sign in. No reactions, outcomes, or student identities are manufactured.', '-- Repeated publication preserves student content, creation dates, and moderation removals.'];
 for(const p of profiles.profiles)statements.push('INSERT INTO community_users (id,alias,role,created_at,updated_at) VALUES ('+[q(p.id),q(p.alias),q('member'),stamp,stamp].join(',')+') ON CONFLICT(id) DO NOTHING;');
 for(const t of threads){
  const values=[q(t.publishedId),q(t.authorId),q(t.context),q('question'),q(t.title),q(t.body),q(t.url),'NULL',stamp,stamp];
  statements.push('INSERT INTO community_posts (id,user_id,context,kind,title,body,url,plan_json,created_at,updated_at) VALUES ('+values.join(',')+') ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,url=excluded.url,updated_at=excluded.updated_at WHERE community_posts.user_id=excluded.user_id AND community_posts.context=excluded.context AND community_posts.kind=\'question\' AND community_posts.plan_json IS NULL AND community_posts.deleted_at IS NULL AND (community_posts.title IS NOT excluded.title OR community_posts.body IS NOT excluded.body OR community_posts.url IS NOT excluded.url);');
  for(const[index,answer]of t.replies.entries()){
   const values=[q(t.publishedId+'-guide-'+(index+1)),q(answer.authorId),q('post:'+t.publishedId),'NULL',q(answer.body),stamp,stamp];
   statements.push('INSERT INTO community_comments (id,user_id,context,parent_id,body,created_at,updated_at) SELECT '+values.join(',')+' FROM community_posts p WHERE p.id='+q(t.publishedId)+' AND p.user_id='+q(t.authorId)+' AND p.deleted_at IS NULL ON CONFLICT(id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at WHERE community_comments.user_id=excluded.user_id AND community_comments.context=excluded.context AND community_comments.parent_id IS NULL AND community_comments.deleted_at IS NULL AND community_comments.body IS NOT excluded.body;');
  }
 }
 return statements.join('\n\n')+'\n';
}
export function communityStarterReport(data){
 return {version:1,preparedOn:data.profiles.preparedOn,revision:'community-starters-v1:'+createHash('sha256').update(JSON.stringify(data)).digest('hex'),guideProfiles:8,starterQuestions:200,preparedGuideAnswers:400,simulatedReactions:0,simulatedOutcomeReports:0,signInAccountsCreated:0,topics:[...new Set(data.threads.map(t=>t.topic))].sort(),schoolContexts:[...new Set(data.threads.map(t=>t.context).filter(c=>c.startsWith('school:')))].sort(),mapping:data.threads.map(t=>({sourceId:t.id,postId:t.publishedId,context:t.context}))};
}
async function main(){const data=await loadCommunityStarters(),outputs=[['starter-library.sql',communityStarterSQL(data)],['starter-library-report.json',JSON.stringify(communityStarterReport(data),null,2)+'\n']],check=process.argv.includes('--check');for(const[name,body]of outputs){const path=resolve(ROOT,'content/community',name);if(check)assert.equal(await readFile(path,'utf8'),body,'Regenerate '+name);else await writeFile(path,body);}console.log(JSON.stringify({check,starterQuestions:200,guideAnswers:400,guideProfiles:8,simulatedReactions:0,signInAccountsCreated:0}));}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
