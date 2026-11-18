/** Apply reviewed same-university prerequisite definitions to the named GM baseline. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(import.meta.dirname,'..');
const codes=['ACC-1020','FIN-3010','BUS-2100','STA-2010','MAN-3720'];
const copy=value=>JSON.parse(JSON.stringify(value));
export function applyTESUPrerequisites(input,facts){
 assert(input?.id==='tesu-general-management'&&input.school==='Thomas Edison State University'&&input.totalCredits===120&&input.creditSystem==='semester','Use the exact reviewed TESU General Management baseline');
 assert(facts?.version===1&&facts.checkedOn==='2026-11-18','Use the dated reviewed TESU course definitions');
 const model=copy(input),byCode=new Map(model.requirements.map(row=>[row.code,row])),sources=new Map(model.sources.map(source=>[source.id,source]));
 for(const code of codes){
  const row=byCode.get(code),fact=facts.courses[code],original=facts.sources.find(source=>source.id==='tesu-finance-'+code.toLowerCase().replace('-','')+'-2026-11-18');
  assert(row&&fact&&Array.isArray(fact.prerequisites)&&fact.prerequisites.length&&original,'A reviewed course or prerequisite source is missing');
  const url=new URL(original.url);assert(url.protocol==='https:'&&url.hostname==='tesu.smartcatalogiq.com'&&url.pathname.endsWith('/'+code.toLowerCase())&&!url.username&&!url.password,'Use the exact official TESU course page');
  const sourceId='tesu-common-'+code.toLowerCase().replace('-','')+'-prerequisites-2026-11-18';
  sources.set(sourceId,{...copy(original),id:sourceId,scope:'Published course prerequisite identity, not an outside-credit equivalency or degree transfer approval.'});
  row.prerequisites=fact.prerequisites.map(prerequisite=>{assert(byCode.has(prerequisite),'The named baseline must include its selected prerequisite');return byCode.get(prerequisite).id;});
  row.prerequisiteSourceIds=[sourceId];
  if(fact.note)row.prerequisiteNotes=fact.note.replace('This Finance baseline','This modeled named-course baseline');
 }
 const byId=new Map(model.requirements.map(row=>[row.id,row])),active=new Set(),done=new Set();
 function visit(id){if(done.has(id))return;assert(!active.has(id),'Course prerequisites must not contain a cycle');active.add(id);const row=byId.get(id);assert(row,'A prerequisite requirement is absent');for(const prerequisite of row.prerequisites||[])visit(prerequisite);active.delete(id);done.add(id);}
 for(const row of model.requirements)visit(row.id);
 model.sources=[...sources.values()];
 model.commonPrerequisiteReview={checkedOn:facts.checkedOn,courseCodes:[...codes],sourceIds:codes.map(code=>'tesu-common-'+code.toLowerCase().replace('-','')+'-prerequisites-2026-11-18'),scope:'Selected current same-school course sequence; provider awards and their review dates are unchanged.'};
 return model;
}
export async function run({check=false}={}){
 const path=resolve(root,'dist/data/tesu.json'),original=JSON.parse(await readFile(path,'utf8'));
 const facts=JSON.parse(await readFile(resolve(root,'content/curricula/snapshots/tesu/finance-current-2026-11-18-reviewed.json'),'utf8'));
 const model=applyTESUPrerequisites(original,facts);
 if(check)assert.deepEqual(original,model,'Regenerate the reviewed TESU prerequisite supplement');else await writeFile(path,JSON.stringify(model,null,2)+'\n');
 return{model:model.id,reviewedCoursePrerequisites:codes.length,newTransferAwards:0,check};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))run({check:process.argv.includes('--check')}).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});
