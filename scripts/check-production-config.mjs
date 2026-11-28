/** Fail closed before an owner-controlled deploy. This does not provision resources. */
import {readFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dirname,'..');
export function inspectProduction(config,{migrationVerified=false}={}){
  const issues=[];
  if(!/^[a-f0-9]{32}$/i.test(config.account_id||''))issues.push('Set the real owner-controlled Cloudflare account_id.');
  const databases=Array.isArray(config.d1_databases)?config.d1_databases:[],db=databases.find(item=>item.binding==='DB');
  if(databases.filter(item=>item.binding==='DB').length!==1||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(db?.database_id||''))issues.push('Create the account-owned D1 database and set its actual database_id on one DB binding.');
  if(db?.migrations_dir!=='drizzle')issues.push('Keep the DB binding on the reviewed drizzle migration directory.');
  if(config.main!=='outputs/cloudflare/runtime/worker.mjs'||config.assets?.directory!=='./outputs/cloudflare/public')issues.push('Use the separate native Worker and public-only asset build outputs.');
  if(config.base_dir!=='outputs/cloudflare/runtime'||config.find_additional_modules!==true||!config.rules?.some(rule=>rule.type==='ESModule'&&rule.globs?.length===1&&rule.globs[0]==='owner-business.mjs'))issues.push('Keep the reviewed private business module outside the public asset directory and load it lazily.');
  if(!config.rules?.some(rule=>rule.type==='ESModule'&&rule.globs?.length===1&&rule.globs[0]==='learning-workspace.mjs'))issues.push('Keep the private learning module outside public assets and load it lazily.');
  if(!/^[a-f0-9]{64}$/.test(config.vars?.OWNER_CONSOLE_SUBJECT_SHA256||''))issues.push('Bind the business console to the explicitly verified owner subject hash.');
  if(config.assets?.binding!=='ASSETS'||config.assets?.run_worker_first!==true||config.assets?.html_handling!=='none'||config.assets?.not_found_handling!=='none')issues.push('Keep API, authentication, private-page and exact-route asset handling under the Worker policy.');
  const producers=Array.isArray(config.queues?.producers)?config.queues.producers:[],consumers=Array.isArray(config.queues?.consumers)?config.queues.consumers:[];
  const producer=producers.find(item=>item.binding==='RESEARCH_QUEUE'),deadLetter=producers.find(item=>item.binding==='RESEARCH_DEAD_LETTER_QUEUE'),consumer=consumers.find(item=>item.queue===producer?.queue);
  const queueName=value=>typeof value==='string'&&value.length>0&&value===value.trim();
  if(producers.filter(item=>item.binding==='RESEARCH_QUEUE').length!==1||!queueName(producer?.queue)||consumers.length!==1||!consumer||consumer.max_batch_size!==1||!Number.isInteger(consumer.max_concurrency)||consumer.max_concurrency<1||consumer.max_concurrency>5)issues.push('Configure one-job research batches, exactly one research consumer and bounded concurrency.');
  if(producers.filter(item=>item.binding==='RESEARCH_DEAD_LETTER_QUEUE').length!==1||!queueName(deadLetter?.queue)||deadLetter?.queue===producer?.queue||consumer?.dead_letter_queue!==deadLetter?.queue)issues.push('Match the RESEARCH_DEAD_LETTER_QUEUE producer to the separate consumer dead-letter queue.');
  // These are the reviewed operator bounds, not provider capacity guarantees.
  if(!Number.isInteger(consumer?.max_retries)||consumer.max_retries<1||consumer.max_retries>3||!Number.isInteger(consumer?.retry_delay)||consumer.retry_delay<30||consumer.retry_delay>3600)issues.push('Keep research retries bounded to 1–3 queue retries with a 30–3600 second delay.');
  if(!Array.isArray(config.triggers?.crons)||config.triggers.crons.length!==1||config.triggers.crons[0]!=='*/2 * * * *')issues.push('Keep the reviewed two-minute outbox replay cron configured.');
  if(config.vars?.PORTAL_STORAGE_BACKEND!=='supabase')issues.push('Choose the reviewed Postgres private-storage backend explicitly.');
  if(!migrationVerified)issues.push('Verify the existing D1 data and encrypted-connection migration before setting DEGREESTEPS_DATA_MIGRATION_VERIFIED=1.');
  return issues;
}
async function main(){
  // The checked-in JSONC uses whole-line comments only; do not strip URL substrings.
  const raw=await readFile(resolve(root,'wrangler.jsonc'),'utf8'),config=JSON.parse(raw.replace(/^\s*\/\/.*$/gm,''));
  const issues=inspectProduction(config,{migrationVerified:process.env.DEGREESTEPS_DATA_MIGRATION_VERIFIED==='1'});
  for(const file of ['outputs/cloudflare/runtime/worker.mjs','outputs/cloudflare/runtime/owner-business.mjs','outputs/cloudflare/runtime/learning-workspace.mjs','outputs/cloudflare/public/index.html'])try{await stat(resolve(root,file));}catch{issues.push('Run npm run build to produce '+file+'.');}
  if(issues.length){for(const issue of issues)console.error(issue);process.exitCode=1;return;}
  console.log(JSON.stringify({configuration:'ready-for-operator-deployment',capacityCertified:false,reminder:'Verify secrets, provider quotas, restores, staging load and DNS/auth cutover before production traffic.'}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
