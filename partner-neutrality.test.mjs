/** Partner settings may change how a provider link is rendered, never which plans, schools or courses are shown, or their order. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {loadPublicPlans,renderPublicPlan,renderPublicPlanHub} from './scripts/public-plan-pages.mjs';

const require=createRequire(import.meta.url),Outbound=require('./dist/outbound.js');
const shipped=JSON.parse(readFileSync('content/monetization/partners.json','utf8'));
const allAffiliate={providers:Object.fromEntries(Outbound.PROVIDERS.map(name=>[name,{status:'affiliate',params:{ref:'fixture-'+name.toLowerCase().replace(/[^a-z]/g,'')},disclosure:true}]))};
const partnerReference=/partners\.json|monetization|DegreeOutbound|outbound\.js|data-outbound-provider/i;
// School contact requests and Plan review (server/leads.mjs, dist/leads.js): the allowlist, offer and request tables.
const leadReference=/lead-settings|schools\.json|plan-review\.json|DegreeLeads|leads\.(?:js|mjs)|school_inquir|plan_review_request|\/api\/(?:leads|school-inquiries|plan-review)/i;

test('planning, ranking, the finder, the credits page and the plan index never reference partner settings or the outbound layer',()=>{
 const files=[
  // Plan generation, estimates and ranking.
  'dist/planner.js','dist/plan-estimate-engine.js','dist/guide-engine.js','dist/journey-engine.js','dist/course-plan-view.js','dist/plan-comparison-engine.js','dist/comparison-runner.js','dist/degree-comparison-worker.js','dist/program-catalog.js','dist/program-opportunities.js',
  // Credits-worth engine and its page, and the finder pages.
  'dist/credits-worth-engine.js','dist/credits-worth-worker.js','dist/credits-worth.js','dist/programs.js','dist/plan-library.js','dist/portal.js',
  // The plan index, baselines and course index builders.
  'scripts/build-plan-library-index.mjs','scripts/build-pathway-quality-report.mjs','scripts/build-plan-course-index.mjs','scripts/pathway-quality.mjs'
 ];
 for(const file of files)assert.doesNotMatch(readFileSync(file,'utf8'),partnerReference,file);
 // The worksheet (sheet.js) and guided planner (portal.js) render lead actions next to a plan already chosen; every
 // other planning, ranking and index file never reads lead settings or lead modules.
 for(const file of files.filter(file=>file!=='dist/portal.js'))assert.doesNotMatch(readFileSync(file,'utf8'),leadReference,file);
 // The generators load the helper only where links are rendered, after plans are built.
 const pages=readFileSync('scripts/public-plan-pages.mjs','utf8');
 assert.equal((pages.match(/outbound\(\)\./g)||[]).length,1);assert(pages.indexOf('outbound().link(')>pages.indexOf('function entryRow('));
});

test('with every provider set to affiliate, the plan index and reviewed baselines are unchanged and partner settings are never read',()=>{
 const dir=mkdtempSync(join(tmpdir(),'degreesteps-partners-')),log=join(dir,'reads.json'),fixture=join(dir,'partners.json'),hook=join(dir,'hook.mjs');
 try{
  writeFileSync(fixture,JSON.stringify(allAffiliate));
  // A preload that serves the all-affiliate fixture to any read of partners.json and records any attempt,
  // including a load of the outbound helper, so the check proves the builders are independent of it.
  writeFileSync(hook,`import fs from 'node:fs';import {registerHooks} from 'node:module';
const seen=[],note=value=>{const text=String(value&&value.href||value);if(/partners\\.json|monetization|outbound\\.js|lead-settings|leads\\.(?:js|mjs)/i.test(text))seen.push(text);return text;};
const swap=value=>/partners\\.json$/.test(note(value))?${JSON.stringify(fixture)}:value;
const readFile=fs.promises.readFile,readFileSync=fs.readFileSync,callbackRead=fs.readFile;
fs.promises.readFile=(path,...rest)=>readFile(swap(path),...rest);fs.readFileSync=(path,...rest)=>readFileSync(swap(path),...rest);fs.readFile=(path,...rest)=>callbackRead(swap(path),...rest);
registerHooks({resolve(specifier,context,next){const result=next(specifier,context);note(result.url);return result;}});
process.on('exit',()=>fs.writeFileSync(${JSON.stringify(log)},JSON.stringify(seen)));`);
  for(const script of['scripts/build-plan-library-index.mjs','scripts/build-pathway-quality-report.mjs']){
   const run=spawnSync(process.execPath,['--import',hook,script,'--check'],{encoding:'utf8',timeout:240000});
   assert.equal(run.status,0,script+' --check: '+run.stderr.slice(-2000));
   const seen=JSON.parse(readFileSync(log,"utf8"));assert.deepEqual(seen,[],script+" must not read partner settings: "+JSON.stringify(seen));
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('switching every provider to affiliate changes only provider link markup on public plan pages, never plans, courses or order',async()=>{
 const plans=await loadPublicPlans(),visible=html=>html.replace(/ <small class="outbound-partner-note">[\s\S]*?<\/small>/g,'').replace(/<a [^>]*>/g,'<a>');
 const rowsOf=html=>[...html.matchAll(/data-requirement-ids="([^"]+)"[\s\S]*?<td data-label="Proposed course">([\s\S]*?)<\/td>/g)].map(match=>[match[1],match[2].replace(/ <small class="outbound-partner-note">[\s\S]*?<\/small>/g,'').replace(/<[^>]+>/g,'').trim()]);
 try{
  Outbound.configure(shipped);const plain=plans.map(plan=>renderPublicPlan(plan,plans)),hub=renderPublicPlanHub(plans);
  Outbound.configure(allAffiliate);const partnered=plans.map(plan=>renderPublicPlan(plan,plans)),partneredHub=renderPublicPlanHub(plans);
  assert.equal(partneredHub,hub,'The plan library hub and its order do not depend on partners');
  for(let i=0;i<plans.length;i++){
   assert.notEqual(partnered[i],plain[i],'An affiliate setting is visible on '+plans[i].id);
   assert.deepEqual(rowsOf(partnered[i]),rowsOf(plain[i]),plans[i].id);assert(rowsOf(plain[i]).length>10);
   assert.equal(visible(partnered[i]),visible(plain[i]),plans[i].id);
   assert.equal((partnered[i].match(/rel="sponsored noopener"/g)||[]).length,(partnered[i].match(/class="outbound-partner-note"/g)||[]).length,'Every partner link is labelled');
  }
 }finally{Outbound.configure(shipped);}
});

test('school contact requests and Plan review never choose, filter or order plans, schools or courses',async()=>{
 const leads=readFileSync('dist/leads.js','utf8'),server=readFileSync('server/leads.mjs','utf8'),sheet=readFileSync('dist/sheet.js','utf8'),portal=readFileSync('dist/portal.js','utf8');
 // The client only adds action markup; it never touches plan lists, saved plans or ordering.
 for(const pattern of[/\.sort\(/,/pathways/,/localStorage|sessionStorage|degreepath-guide/,/partners\.json|outbound/i])assert.doesNotMatch(leads,pattern,String(pattern));
 // The server reads only its own tables and community_users (owner check); it never reads plans, accounts or rankings.
 const tables=[...server.matchAll(/\b(?:FROM|INTO|UPDATE)\s+([a-z_]+)/g)].map(match=>match[1]).filter(name=>name!=='SELECT');
 assert.deepEqual([...new Set(tables)].sort(),['community_users','lead_rate_limits','plan_review_requests','school_inquiries'].sort());
 assert.match(server,/'SELECT \* FROM '\+table\+' WHERE created_at>=\?/);
 assert.doesNotMatch(server,/portal_|community_posts|growth_daily_counts|partners\.json/);
 // Each planner page calls leads.js once, only to append its actions after the plan's existing content.
 assert.equal((sheet.match(/DegreeLeads/g)||[]).length,1);assert.equal((portal.match(/DegreeLeads/g)||[]).length,1);
 assert.match(portal,/schoolCheckHTML\(route,target\.route\)\+\(mapped\?leadActionsHTML\(route\):''\)\+formatNote/);
 // With every school allowlisted and Plan review on, the markup added is the same small block for any plan and contains no plan data beyond the one shown.
 const require2=createRequire(import.meta.url),schools=[...new Set(Object.values(JSON.parse(readFileSync('dist/data/coach-index.json','utf8')).plans).map(plan=>plan.school))];
 const saved=globalThis.fetch;globalThis.fetch=async()=>Response.json({enabled:true,schoolInquiries:{enabled:true,schools,consentVersion:'school-inquiry-v1'},planReview:{enabled:true,consentVersion:'plan-review-v1'}});
 try{
  const path=require2.resolve('./dist/leads.js');delete require2.cache[path];const Leads=require2(path);await Leads.load();
  const html=Leads.actionsHTML({planId:'wgu-catalog-ecceaa488637ac83',school:'Western Governors University',title:'Business Management – B.S.'});
  assert.equal((html.match(/<button/g)||[]).length,1);assert.equal((html.match(/<a /g)||[]).length,1);assert.doesNotMatch(html,/liberty|tesu|excelsior|phoenix|gcu/i,'No other plan or school is suggested');
 }finally{globalThis.fetch=saved;}
 // The public plan pages and the plan library hub do not include lead actions at all.
 const plans=await loadPublicPlans();assert.doesNotMatch(renderPublicPlanHub(plans)+plans.slice(0,5).map(plan=>renderPublicPlan(plan,plans)).join(''),leadReference);
});
