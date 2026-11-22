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
const seen=[],note=value=>{const text=String(value&&value.href||value);if(/partners\\.json|monetization|outbound\\.js/i.test(text))seen.push(text);return text;};
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
