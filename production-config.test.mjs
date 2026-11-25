import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inspectProduction} from './scripts/check-production-config.mjs';
const config=JSON.parse((await readFile(new URL('./wrangler.jsonc',import.meta.url),'utf8')).replace(/^\s*\/\/.*$/gm,''));
test('unprovisioned account and unverified data cannot pass deployment readiness',()=>{const unprovisioned={...structuredClone(config),account_id:'REPLACE_WITH_ACCOUNT',d1_databases:[{binding:'DB',database_id:'REPLACE_WITH_DATABASE',migrations_dir:'drizzle'}]};const issues=inspectProduction(unprovisioned);assert(issues.some(x=>x.includes('account_id')));assert(issues.some(x=>x.includes('database_id')));assert(issues.some(x=>x.includes('MIGRATION_VERIFIED')));});
test('the configured production destination still cannot deploy before migration verification',()=>{assert(inspectProduction(config).some(issue=>issue.includes('MIGRATION_VERIFIED')));});
const provisioned=()=>({...structuredClone(config),account_id:'a'.repeat(32),d1_databases:[{...config.d1_databases[0],database_id:'11111111-1111-4111-8111-111111111111'}]});
test('an explicit account configuration still requires operator migration verification',()=>{const ready=provisioned();assert.equal(inspectProduction(ready).length,1);assert.deepEqual(inspectProduction(ready,{migrationVerified:true}),[]);});
test('private route bypass and unsafe queue batch settings fail validation',()=>{const bad=structuredClone(config);bad.assets.run_worker_first=false;bad.queues.consumers[0].max_batch_size=10;const issues=inspectProduction(bad);assert(issues.some(x=>x.includes('exact-route')));assert(issues.some(x=>x.includes('one-job')));});
test('dead job notifications and automatic dead letters must reach the same separate queue',()=>{
  for(const change of [
    value=>{value.queues.producers=value.queues.producers.filter(item=>item.binding!=='RESEARCH_DEAD_LETTER_QUEUE');},
    value=>{value.queues.producers[1].queue='other-dead-letters';},
    value=>{value.queues.producers[1].queue=value.queues.producers[0].queue;value.queues.consumers[0].dead_letter_queue=value.queues.producers[0].queue;},
    value=>{value.queues.producers.push({...value.queues.producers[1]});}
  ]){const bad=provisioned();change(bad);assert(inspectProduction(bad,{migrationVerified:true}).some(issue=>issue.includes('RESEARCH_DEAD_LETTER_QUEUE')));}
});
test('duplicate research producers and additional consumers cannot silently change delivery',()=>{
  for(const change of [
    value=>{value.queues.producers.push({...value.queues.producers[0]});},
    value=>{value.queues.consumers.push({...value.queues.consumers[0],queue:value.queues.producers[1].queue});},
    value=>{value.queues.producers[0].queue='';}
  ]){const bad=provisioned();change(bad);assert(inspectProduction(bad,{migrationVerified:true}).some(issue=>issue.includes('one-job')));}
});
test('research retry settings must stay explicit and bounded',()=>{
  for(const [field,values]of Object.entries({max_retries:[undefined,0,4,1.5],retry_delay:[undefined,0,3601,'120'],max_concurrency:[undefined,0,6,1.5]}))for(const value of values){const bad=provisioned();bad.queues.consumers[0][field]=value;assert(inspectProduction(bad,{migrationVerified:true}).some(issue=>issue.includes(field==='max_concurrency'?'concurrency':'retries')),field+': '+value);}
});
test('committed outbox work retains its reviewed replay schedule',()=>{
  for(const triggers of [undefined,{crons:[]},{crons:['0 * * * *']},{crons:['*/2 * * * *','* * * * *']}]){const bad=provisioned();bad.triggers=triggers;assert(inspectProduction(bad,{migrationVerified:true}).some(issue=>issue.includes('outbox replay')));}
});
test('the DB binding cannot be duplicated or use an unrelated migration directory',()=>{
  const duplicate=provisioned();duplicate.d1_databases.push({...duplicate.d1_databases[0]});assert(inspectProduction(duplicate,{migrationVerified:true}).some(issue=>issue.includes('one DB binding')));
  const unrelated=provisioned();unrelated.d1_databases[0].migrations_dir='another-app';assert(inspectProduction(unrelated,{migrationVerified:true}).some(issue=>issue.includes('migration directory')));
});

// Auth configuration must fail closed before a business deployment.
test('business console keeps explicit owner binding and private lazy module rules',()=>{
  for(const change of [value=>{delete value.vars.OWNER_CONSOLE_SUBJECT_SHA256;},value=>{value.find_additional_modules=false;},value=>{value.rules=[];},value=>{value.base_dir='outputs/cloudflare/public';}]){const bad=provisioned();change(bad);assert(inspectProduction(bad,{migrationVerified:true}).some(issue=>/owner subject|business module/.test(issue)));}
});
