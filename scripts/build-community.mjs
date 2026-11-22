import { readFile, writeFile, mkdir, readdir, cp, rm } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { buildCreditSourceDiscovery } from '../server/credit-source-discovery.mjs';
const root = resolve(import.meta.dirname,'..');
const output = resolve(root,'outputs/site');
const types = {html:'text/html; charset=utf-8',js:'application/javascript; charset=utf-8',mjs:'application/javascript; charset=utf-8',css:'text/css; charset=utf-8',json:'application/json; charset=utf-8',svg:'image/svg+xml',csv:'text/csv; charset=utf-8',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',txt:'text/plain; charset=utf-8',xml:'application/xml; charset=utf-8',webp:'image/webp',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png'};
execFileSync(process.execPath,[resolve(root,'scripts/reviewed-course-identities.mjs'),'--check'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[resolve(root,'scripts/liberty-current-evidence.mjs'),'--check'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[resolve(root,'scripts/build-plan-estimate-rates.mjs'),'--check'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[resolve(root,'scripts/build-liberty-shared-awards.mjs'),'--check'],{cwd:root,stdio:'inherit'});
buildCreditSourceDiscovery(JSON.parse(await readFile(resolve(root,'dist/data/credit-sources.json'),'utf8')));
execFileSync(process.execPath,[resolve(root,'scripts/add-liberty-official-mappings.mjs'),'--check'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[resolve(root,'scripts/add-tesu-official-mappings.mjs'),'--check'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[resolve(root,'scripts/add-tesu-prerequisites.mjs'),'--check'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[resolve(root,'scripts/add-liberty-cli-awards.mjs'),'--check'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[resolve(root,'scripts/add-snhu-transfer-evidence.mjs'),'--check'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[resolve(root,'scripts/build-liberty-named-awards.mjs'),'--check'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[resolve(root,'scripts/import-tesu-accounting.mjs'),'--check'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[resolve(root,'scripts/import-tesu-finance.mjs'),'--check'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[resolve(root,'scripts/import-tesu-psychology.mjs'),'--check'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[resolve(root,'scripts/import-tesu-english.mjs'),'--check'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[resolve(root,'scripts/import-tesu-liberal-studies.mjs'),'--check'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[resolve(root,'scripts/import-gcu-curriculum.mjs'),'--check'],{cwd:root,stdio:'inherit'});
// Pathway Factory: published school kits (content/pathway-kits/*/school.json "publish") are the source of their content/curricula documents.
execFileSync(process.execPath,[resolve(root,'scripts/pathway-factory/compile.mjs'),'--publish','--check'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[resolve(root,'scripts/build-curriculum-registry.mjs'),'--check'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[resolve(root,'scripts/build-research-references.mjs'),'--check'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[resolve(root,'scripts/build-academic-registry.mjs'),'--check'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[resolve(root,'scripts/build-pathway-quality-report.mjs'),'--check'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[resolve(root,'scripts/build-plan-library-index.mjs'),'--check'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[resolve(root,'scripts/build-plan-course-index.mjs'),'--check'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[resolve(root,'scripts/provider-directory-discovery.mjs'),'--check'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[resolve(root,'scripts/build-research-priorities.mjs'),'--check'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[resolve(root,'scripts/build-school-research-batch.mjs'),'--check'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[resolve(root,'scripts/build-coach-index.mjs'),'--check'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[resolve(root,'scripts/build-public-site.mjs')],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[resolve(root,'scripts/apply-brand-system.mjs')],{cwd:root,stdio:'inherit'});
const assets = {};
async function walk(path) {
  for (const entry of await readdir(path,{withFileTypes:true})) {
    const full=resolve(path,entry.name);
    if (entry.isDirectory()) {await walk(full);continue;}
    const ext=entry.name.split('.').pop();assert(types[ext],`Unsupported static asset: ${entry.name}`);
    const bytes=await readFile(full),binary=['webp','jpg','jpeg','png','xlsx'].includes(ext),key='/'+relative(resolve(root,'dist'),full).replaceAll('\\','/');
    const gzip=ext==='json'&&bytes.length>1024,compressed=gzip?gzipSync(bytes,{level:9}):null;
    assets[key]={body:gzip?compressed.toString('base64'):bytes.toString(binary?'base64':'utf8'),...(gzip?{encoding:'gzip-base64'}:binary?{encoding:'base64'}:{}),type:types[ext],etag:(gzip?'W/':'')+'"'+createHash('sha256').update(bytes).digest('hex').slice(0,24)+'"'};
  }
}
await walk(resolve(root,'dist'));
const api=(await readFile(resolve(root,'server/community.mjs'),'utf8')).replace('export async function handleCommunity','async function handleCommunity');
assert(!/^import\s/m.test(api),'Bundle new API imports explicitly before building');
const postgresPortal=(await readFile(resolve(root,'server/portal-postgres.mjs'),'utf8')).replace(/^export\s+(?=(?:async\s+)?function)/gm,'');
const portal=(await readFile(resolve(root,'server/portal.mjs'),'utf8')).replace(/^import .*;\n/gm,'').replace(/^export\s+(?=(?:async\s+)?function)/gm,'');
const transcriptImport=(await readFile(resolve(root,'server/transcript-import.mjs'),'utf8')).replace(/^export\s+(?=(?:async\s+)?function)/gm,'');
assert(!/^import\s/m.test(transcriptImport),'Bundle transcript imports explicitly before building');
const auth=(await readFile(resolve(root,'server/auth.mjs'),'utf8')).replace(/^export\s+(?=(?:async\s+)?function)/gm,'');
assert(!/^import\s/m.test(portal+auth),'Bundle new auth and portal imports explicitly before building');
const catalogApi=(await readFile(resolve(root,'server/catalog.mjs'),'utf8')).replace(/^export\s+(?=function)/gm,'');
const curriculumApi=(await readFile(resolve(root,'server/curriculum-discovery.mjs'),'utf8')).replace(/^export\s+(?=(?:async\s+)?function)/gm,'');
assert(!/^import\s/m.test(curriculumApi),'Bundle curriculum imports explicitly before building');
const curriculumBundle='const {handleCurriculumDiscovery}=(()=>{\n'+curriculumApi+'\nreturn {handleCurriculumDiscovery};\n})();\n';
const collegeApi=(await readFile(resolve(root,'server/college-access.mjs'),'utf8')).replace(/^export\s+(?=(?:async\s+)?function)/gm,'');
const degreeIdentityApi=(await readFile(resolve(root,'server/degree-identity.mjs'),'utf8')).replace(/^export\s+(?=(?:async\s+)?function)/gm,'');
const researchReferencesApi=(await readFile(resolve(root,'server/research-references.mjs'),'utf8')).replace(/^export\s+(?=(?:async\s+)?function)/gm,'');
assert(!/^import\s/m.test(researchReferencesApi),'Bundle research reference imports explicitly before building');
const creditSourceDiscoveryApi=(await readFile(resolve(root,'server/credit-source-discovery.mjs'),'utf8')).replace(/^export\s+(?=(?:async\s+)?function)/gm,'');
assert(!/^import\s/m.test(creditSourceDiscoveryApi),'Bundle credit source discovery imports explicitly before building');
const academicPlannerSource=await readFile(resolve(root,'dist/planner.js'),'utf8');
const academicPlannerBundle='const TemplateAcademicPlanner=(()=>{const module={exports:{}};const exports=module.exports;\n'+academicPlannerSource+'\nreturn module.exports;})();\n';
const programCatalogSource=await readFile(resolve(root,'dist/program-catalog.js'),'utf8');
const programCatalogBundle='const TemplateProgramCatalog=(()=>{const module={exports:{}};const exports=module.exports;const require=name=>{if(name==="./planner.js")return TemplateAcademicPlanner;throw new Error("Unsupported catalog dependency.");};\n'+programCatalogSource+'\nreturn module.exports;})();\n';
const academicApi=(await readFile(resolve(root,'server/template-academic.mjs'),'utf8')).replace(/^export\s+(?=(?:async\s+)?function)/gm,'');
assert(!/^import\s/m.test(academicApi),'Bundle academic validator imports explicitly before building');
const aiConnectionsApiSource=(await readFile(resolve(root,'server/ai-connections.mjs'),'utf8')).replace(/^export\s+(?=(?:async\s+)?function)/gm,'');
assert(!/^import\s/m.test(aiConnectionsApiSource),'Bundle AI connection imports explicitly before building');
const coverageApi=(await readFile(resolve(root,'server/academic-coverage.mjs'),'utf8')).replace(/^export\s+(?=(?:async\s+)?function)/gm,'');
assert(!/^import\s/m.test(coverageApi),'Bundle academic coverage imports explicitly before building');
const growthApi=(await readFile(resolve(root,'server/growth-metrics.mjs'),'utf8')).replace(/^export\s+(?=(?:async\s+)?function)/gm,'');
assert(!/^import\s/m.test(growthApi),'Bundle growth metrics imports explicitly before building');
const coachApiSource=(await readFile(resolve(root,'server/coach.mjs'),'utf8')).replace(/^export\s+(?=(?:async\s+)?function)/gm,'');
assert(!/^import\s/m.test(coachApiSource),'Bundle coach imports explicitly before building');
const coachBundle='const {handleCoach,pruneCoach}=(()=>{\n'+coachApiSource+'\nreturn {handleCoach,pruneCoach};\n})();\n';
const growthBundle='const {handleGrowthMetrics,pruneGrowthMetrics,recordGrowthEvent}=(()=>{\n'+growthApi+'\nreturn {handleGrowthMetrics,pruneGrowthMetrics,recordGrowthEvent};\n})();\n';
const emailApi=(await readFile(resolve(root,'server/email.mjs'),'utf8')).replace(/^export\s+(?=(?:async\s+)?function)/gm,'');
assert(!/^import\s/m.test(emailApi),'Bundle email imports explicitly before building');
const emailBundle='const {sendEmail,emailSettings,validEmailAddress}=(()=>{\n'+emailApi+'\nreturn {sendEmail,emailSettings,validEmailAddress};\n})();\n';
const alertsApi=(await readFile(resolve(root,'server/plan-alerts.mjs'),'utf8')).replace(/^import \{ sendEmail, emailSettings, validEmailAddress \} from '\.\/email\.mjs';\n/m,'').replace(/^export\s+(?=(?:async\s+)?function)/gm,'');
assert(!/^import\s/m.test(alertsApi),'Bundle plan alert imports explicitly before building');
const alertsBundle='const {handlePlanAlerts,runPlanAlerts,removePlanAlerts}=(()=>{\n'+alertsApi+'\nreturn {handlePlanAlerts,runPlanAlerts,removePlanAlerts};\n})();\n';
const researchJobs=(await readFile(resolve(root,'server/research-jobs.mjs'),'utf8')).replace(/^export\s+(?=(?:async\s+)?function)/gm,'');
const templateApi=(await readFile(resolve(root,'server/template-research.mjs'),'utf8')).replace(/^import .*;\n/gm,'').replace(/^export\s+(?=(?:async\s+)?function)/gm,'');
assert(!/^import\s/m.test(collegeApi+templateApi),'Bundle college and template imports explicitly before building');
const publicCacheApi=(await readFile(resolve(root,'server/public-community-cache.mjs'),'utf8')).replace(/^export\s+(?=(?:async\s+)?function)/gm,'');
assert(!/^import\s/m.test(publicCacheApi),'Bundle public cache imports explicitly before building');
const publicCacheBundle='const {publicCommunityCache}=(()=>{'+publicCacheApi+'\nreturn {publicCommunityCache};})();\n';
const snapshotRegistry=(await readFile(resolve(root,'db/d1-snapshot-registry.mjs'),'utf8')).replace(/^export\s+(?=const)/gm,'');
const snapshotApi=(await readFile(resolve(root,'server/operator-snapshot.mjs'),'utf8')).replace(/^import .*;\n/gm,'').replace(/^export\s+(?=(?:async\s+)?function)/gm,'');
assert(!/^import\s/m.test(snapshotRegistry+snapshotApi),'Bundle operator snapshot imports explicitly before building');
const handler=(await readFile(resolve(root,'worker/index.mjs'),'utf8')).replace(/^import .*;\n/gm,'');
const core=api+'\n'+postgresPortal+'\n'+portal+'\n'+transcriptImport+'\n'+auth+'\n'+catalogApi+'\n'+curriculumBundle+'\n'+collegeApi+'\n'+degreeIdentityApi+'\n'+researchReferencesApi+'\n'+creditSourceDiscoveryApi+'\n'+academicPlannerBundle+programCatalogBundle+academicApi+'\n'+aiConnectionsApiSource+'\n'+researchJobs+'\n'+templateApi+'\n'+publicCacheBundle+'\n'+snapshotRegistry+'\n'+snapshotApi+'\n'+coverageApi+'\n'+growthBundle+'\n'+coachBundle+'\n'+emailBundle+'\n'+alertsBundle;
const source=core+'const assets='+JSON.stringify(assets)+';\n'+handler;
await rm(output,{recursive:true,force:true});
await mkdir(resolve(output,'dist/server'),{recursive:true});await mkdir(resolve(output,'.openai'),{recursive:true});
await writeFile(resolve(output,'dist/server/index.js'),source);
await cp(resolve(root,'.openai/hosting.json'),resolve(output,'.openai/hosting.json'));
await cp(resolve(root,'drizzle'),resolve(output,'drizzle'),{recursive:true});
// Owner-controlled Cloudflare deployment uses native asset storage instead of
// embedding the entire public website in every Worker module.
const cloudflareOutput=resolve(root,'outputs/cloudflare');
await rm(cloudflareOutput,{recursive:true,force:true});await mkdir(cloudflareOutput,{recursive:true});
const nativeAssets=Object.fromEntries(Object.entries(assets).map(([path,asset])=>[path,{path,type:asset.type,etag:asset.etag,external:true}]));
const nativeSource=core+'const assets='+JSON.stringify(nativeAssets)+';\n'+handler;
await writeFile(resolve(cloudflareOutput,'worker.mjs'),nativeSource);
await cp(resolve(root,'dist'),resolve(cloudflareOutput,'public'),{recursive:true});
const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
assert.equal(typeof module.default?.fetch,'function');
for (const path of ['/','/portal.html','/account.html','/degree-audit.html','/resources/','/blog/','/sitemap.xml','/robots.txt','/community.html','/school.html','/request-plan.html','/admin.html','/coverage.html','/data/school-insights.json','/data/community-templates.json','/data/curriculum-registry.json']) {
  const response=await module.default.fetch(new Request('https://degreepath.test'+path),{},{});assert.equal(response.status,200,path);
}
const authStatus=await module.default.fetch(new Request('https://degreepath.test/api/auth/status'),{},{});assert.equal(authStatus.status,200);assert.equal((await authStatus.json()).configured,false);
for(const path of ['/api/coach/status','/api/coach/ask','/api/coach/feedback']){const coachOff=await module.default.fetch(new Request('https://degreepath.test'+path,{method:path.endsWith('status')?'GET':'POST'}),{},{});assert.equal(coachOff.status,404,'The coach must not exist unless COACH_ENABLED is 1: '+path);}
for(const [path,method]of [['/api/alerts/subscriptions','GET'],['/api/alerts/subscriptions','POST'],['/api/alerts/unsubscribe?token=x','GET'],['/api/alerts/unsubscribe?token=x','POST']]){const alertsOff=await module.default.fetch(new Request('https://degreepath.test'+path,{method}),{},{});assert.equal(alertsOff.status,404,'Email alerts must not exist unless EMAIL_ALERTS_ENABLED is 1: '+method+' '+path);}
const missingDb=await module.default.fetch(new Request('https://degreepath.test/api/community/session'),{},{});assert.equal(missingDb.status,503);
const unknownCurriculum=await module.default.fetch(new Request('https://degreepath.test/api/curriculum?program=unknown'),{},{});assert.equal(unknownCurriculum.status,404);
console.log(JSON.stringify({output,assets:Object.keys(assets).length,workerBytes:Buffer.byteLength(source),nativeWorkerBytes:Buffer.byteLength(nativeSource),checks:'ESM, asset routes, API binding boundary passed'}));
