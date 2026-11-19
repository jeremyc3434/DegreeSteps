/* Merge reviewed school/program evidence into discovery, never course awards. */
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const root=resolve(import.meta.dirname,'..'),researchRoot=resolve(root,'content/research');
const researchFiles=new Set(['cbe-schools.json','campus-schools-a.json','campus-schools-b.json','asu-programs.json','cbu-programs.json']);
const files=(await readdir(researchRoot)).filter(name=>researchFiles.has(name)).sort();
assert(files.length,'No reviewed opportunity research is available');
const collection='opportunity-expansion',clone=value=>JSON.parse(JSON.stringify(value)),levels=new Set(['associate','bachelor','master','doctorate','specialist']);
const future=new Set(['upcoming','approval-pending','planned','pending-approval','not-yet-available']);
const expectedSchoolCount=12,schoolIds=new Set(),programIds=new Set(),schools=[],programs=[],plannedPrograms=[],sources=[],excludedEmptySchoolIds=[];
let checkedOn='';
const validURL=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
const stable=value=>createHash('sha256').update(value).digest('hex').slice(0,18);
const id=value=>String(value||'').toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-|-$/g,'');
const unverified=(kind,school)=>({status:'not-verified',notes:`${kind} applicability to this graduate program has not been established by the reviewed evidence. Undergraduate acceptance is not a graduate credit award.`,sourceUrl:school.url});
function effectivePolicy(school,program){
 const policy=school.transferPolicy||{},specific=program.transferPolicy||{},graduate=['master','doctorate','specialist'].includes(program.level);
 const directInstitutional=specific.institutional||(['maximumCredits','minimumInstitutionalCredits','maximumPercent','status'].some(key=>Object.hasOwn(specific,key))?specific:null);
 const institutional=graduate?(directInstitutional||specific.graduate||policy.graduate||unverified('Institutional transfer',school)):(directInstitutional||policy.institutional||unverified('Institutional transfer',school));
 const graduateExcluded=graduate&&institutional.status==='not-accepted';
 const alternative=kind=>specific[kind]||(!graduate?policy[kind]:graduateExcluded?{status:'not-accepted',notes:institutional.notes,sourceUrl:institutional.sourceUrl}:null)||unverified(kind==='ace'?'ACE-recommended credit':'NCCRS-recommended credit',school);
 return {institutional:clone(institutional),ace:clone(alternative('ace')),nccrs:clone(alternative('nccrs')),...(graduate?{graduate:clone(specific.graduate||policy.graduate||institutional)}:{})};
}
for(const file of files){
 const research=JSON.parse(await readFile(resolve(researchRoot,file),'utf8'));
 assert(Array.isArray(research.schools),file+' must contain schools');checkedOn=[checkedOn,research.checkedOn||''].sort().at(-1);
 for(const rawSchool of research.schools){
  assert(rawSchool.id&&rawSchool.name&&validURL(rawSchool.url),'School identity/source missing in '+file);
  if(!(rawSchool.programs||[]).some(program=>!future.has(program.status||'listed'))){excludedEmptySchoolIds.push(rawSchool.id);continue;}
  assert(!schoolIds.has(rawSchool.id),'Duplicate school '+rawSchool.id);schoolIds.add(rawSchool.id);
  const school=clone(rawSchool),sourceMap=new Map();school.researchFile='content/research/'+file;school.catalogCollection=collection;
  if(school.id==='regent'&&school.transferPolicy?.institutional)school.transferPolicy.institutional.maximumCreditsByLevel={associate:48,bachelor:90};
  // ODU's reviewed 90-credit figure belongs to a named guaranteed-admission
  // agreement. Preserve that fact without advertising it as an unconditional
  // maximum for every program and applicant in this general directory.
  const institutional=school.transferPolicy?.institutional;
  if(school.id==='odu'&&institutional?.maximumCredits&&/agreement/i.test(institutional.applicability||'')){institutional.conditionalMaximumCredits=institutional.maximumCredits;institutional.maximumCredits=null;}
  for(const source of school.sources||[]){assert(source.id&&validURL(source.url),'Invalid primary source '+school.id);const sourceId='opportunity-'+id(school.id)+'-'+id(source.id);sourceMap.set(source.id,sourceId);sources.push({...clone(source),id:sourceId,school:school.name,schoolId:school.id,checkedAt:source.checkedOn||research.checkedOn||checkedOn,catalogCollection:collection,scope:school.coverage?.completeFor||'Reviewed program inventory and transfer-policy evidence; equivalencies are separate.'});}
  const fallbackId='opportunity-'+id(school.id)+'-directory';
  if(!sourceMap.size){sourceMap.set('directory',fallbackId);sources.push({id:fallbackId,title:'Official program directory',school:school.name,schoolId:school.id,url:school.url,checkedAt:research.checkedOn||checkedOn,catalogCollection:collection});}
  school.sources=(school.sources||[]).map(source=>({...source,id:sourceMap.get(source.id)}));
  const active=[],planned=[];
  for(const raw of [...(school.programs||[]),...(school.plannedPrograms||[])]){
   assert(raw.title&&levels.has(raw.level)&&validURL(raw.url),'Invalid program at '+school.id+': '+raw.title);
   const program=clone(raw);program.id=program.id||school.id+'-'+stable([program.url,program.title,program.level,program.paceModel||'course-term'].join('|'));
   assert(!programIds.has(program.id),'Duplicate program ID '+program.id);programIds.add(program.id);
   program.schoolId=school.id;program.school=school.name;program.status=program.status||'listed';
   program.modalities=[...new Set((program.modalities||[]).filter(mode=>['online','campus'].includes(mode)))];
   assert(!raw.sourceId||sourceMap.has(raw.sourceId),'Unknown program source '+school.id+': '+raw.sourceId);
   program.paceModel=program.paceModel||'course-term';program.sourceId=sourceMap.get(raw.sourceId)||sourceMap.values().next().value;
   // The reviewed Regent policy states separate degree-level ceilings. The
   // bachelor's 90-credit headline must not become an associate allowance.
   if(school.id==='regent'&&program.level==='associate')program.transferPolicy={...program.transferPolicy,institutional:{status:'accepted',maximumCredits:48,minimumInstitutionalCredits:null,scope:'associate degrees',notes:'Regent advertises up to 48 credits toward an associate degree. Exact requirements, institutional residency and applied credits require degree-specific evaluation.',sourceUrl:school.transferPolicy?.institutional?.sourceUrl||school.url}};
   program.coverage='official-listing';program.courseMapStatus='not-mapped';program.catalogCollection=collection;
   program.checkedOn=research.checkedOn||checkedOn;program.effectivePricing=clone(program.pricing||school.pricing||{model:'not-verified',amount:null,period:null,sourceUrl:school.url});
   program.effectiveTransferPolicy=effectivePolicy(school,program);
   if(future.has(program.status)){planned.push(program);plannedPrograms.push(program);}else{active.push(program);programs.push(program);}
  }
  school.programs=active;school.plannedPrograms=planned;schools.push(school);
 }
}
const compare=(a,b)=>(a.school||a.name).localeCompare(b.school||b.name)||String(a.title||'').localeCompare(String(b.title||''));
programs.sort(compare);plannedPrograms.sort(compare);schools.sort((a,b)=>a.name.localeCompare(b.name));
for(const source of sources)source.programCount=programs.filter(p=>p.sourceId===source.id).length;
const scope='Reviewed discovery for the requested self-paced/CBE and campus-capable schools. Coverage is explicit per school. Listings and transfer-policy evidence do not establish admission, current intake, course equivalency, individual acceptance, licensure, total price or a finish date. Upcoming and approval-pending programs are separate.';
const coverage={schoolCount:schools.length,expectedRequestedSchoolCount:expectedSchoolCount,programCount:programs.length,plannedProgramCount:plannedPrograms.length,sourceFiles:files.map(file=>'content/research/'+file),excludedEmptySchoolIds,completeRequestedSchoolSet:schools.length===expectedSchoolCount};
const reference=({id,title,level,status,url,paceModel})=>({id,title,level,status,url,paceModel});
const schoolProfiles=schools.map(({programs,plannedPrograms,...profile})=>({...profile,programCount:programs.length,plannedProgramCount:plannedPrograms.length}));
const opportunitySchools=schools.map(school=>({...school,programs:school.programs.map(reference),plannedPrograms:school.plannedPrograms.map(reference)}));
const opportunity={version:1,checkedOn,reviewCadence:'monthly',scope,coverage,schools:opportunitySchools,programs,plannedPrograms,sources};
const directoryPath=resolve(root,'dist/data/program-catalog.json'),current=JSON.parse(await readFile(directoryPath,'utf8'));
const retainedSources=current.sources.filter(s=>s.catalogCollection!==collection),legacySources=new Map(retainedSources.map(source=>[source.id,source]));
const retainedPrograms=current.programs.filter(p=>p.catalogCollection!==collection).map(program=>['wgu','umpi'].includes(program.schoolId)?{...program,paceModel:'competency-subscription',paceSourceUrl:legacySources.get(program.sourceId)?.url||program.url}:program);
const retainedIds=new Set(retainedPrograms.map(p=>p.id));assert(programs.every(p=>!retainedIds.has(p.id)),'Expanded IDs collide with retained catalog IDs');
const directory={...current,expandedCheckedOn:checkedOn,programs:[...retainedPrograms,...programs].sort(compare),sources:[...retainedSources,...sources.filter(source=>source.programCount>0)],schools:schoolProfiles,expansionCoverage:coverage};
assert(new Set(directory.programs.map(p=>p.id)).size===directory.programs.length,'Catalog contains duplicate IDs');
const md=value=>String(value??'').replace(/\|/g,'\\|').replace(/\r?\n/g,' ');
const modeCount=(schoolId,mode)=>programs.filter(p=>p.schoolId===schoolId&&(mode==='unknown'?!p.modalities.length:p.modalities.includes(mode))).length;
const schoolRows=schools.map(s=>`| ${md(s.name)} | ${s.programs.length} | ${s.plannedPrograms.length} | ${modeCount(s.id,'online')} | ${modeCount(s.id,'campus')} | ${modeCount(s.id,'unknown')} | ${md(s.coverage?.status||s.coverage?.completeFor||s.coverage?.scope||'Scoped official listing')} |`);
const detailRows=schools.flatMap(s=>{
 const info=s.coverage||{},gaps=info.gaps||[],notes=info.notes||info.completeFor||info.scope||'Scope follows the reviewed official program source.';
 return [`### ${s.name}`,'',`${s.programs.length} listed entries; ${s.plannedPrograms.length} planned. ${notes}`,'',...(gaps.length?gaps.map(gap=>'- '+gap):[]),...(gaps.length?['']:[]),`Official school/program source: ${s.url}`,''];
});
const coverageDoc=[
 '# Reviewed program discovery coverage','',
 `Evidence review date: ${checkedOn}. Generated by \`scripts/merge-opportunity-catalog.mjs\`.`,
 '',
 `${schools.length} of ${expectedSchoolCount} requested school profiles are imported, adding ${programs.length} listed program entries to the ${retainedPrograms.length} retained directory entries (${directory.programs.length} total). ${plannedPrograms.length} upcoming or approval-pending entries are separate and cannot be selected as current degrees.`,
 '',
 'These counts are discovery entries, which can include named concentrations, delivery variants and cohort variants. They are not a count of fully mapped transfer pathways or a guarantee of current admission. The existing four course-map files are unchanged. Walden intake remains unverified where the record says so.',
 '',
 '| School | Listed entries | Planned | Online listed | Campus listed | Format unknown | Inventory scope |',
 '| --- | ---: | ---: | ---: | ---: | ---: | --- |',
 ...schoolRows,'',
 'A program listed in both formats appears in both format columns. An empty format is unknown, not evidence that the program is unavailable.',
 '',
 '## School coverage and remaining work','',...detailRows,
 '## Policy and price handling','',
 '- Institutional college credit, ACE recommendations and NCCRS recommendations remain separate. A school accepting one source is not a course equivalency or an award of credit.',
 '- Graduate and specialist entries do not inherit undergraduate transfer allowances. Explicit program policies override school policies. Unknown degree-specific caps remain unknown.',
 '- Regent\'s reviewed institutional ceilings are degree-specific: 48 credits for associate degrees and 90 for bachelor\'s degrees. UMass Global\'s BBA 90-credit allowance is not applied to its associate or graduate degrees.',
 '- GCU\'s 90-credit institutional total and 30-credit ACE limit remain distinct. Program, upper-division and residency restrictions still apply.',
 '- ODU\'s agreement-specific 90-credit figure is retained as a conditional limit, not a school-wide maximum. ASU\'s 64-credit two-year/lower-division limit is separate from its unknown general maximum. CBU\'s online undergraduate 36-unit residency and 30 upper-division-unit rules do not become campus or graduate requirements.',
 '- Pricing retains its original unit and period, such as per credit, 12 weeks or 24 weeks. A subscription amount is not a projected degree total. Numeric tuition remains unknown where the reviewed current source does not establish it.',
 '',
 '## Refresh and integrity','',
 ...files.map(file=>'- `content/research/'+file+'`'),
 '',
 'Review these source snapshots monthly. Run `node scripts/merge-opportunity-catalog.mjs` after a reviewed update, and `node scripts/merge-opportunity-catalog.mjs --check` to confirm generated files match. The merger rebuilds only its own collection and preserves existing directory program IDs, sources and overrides. The legacy four-source importer preserves the expanded collection; rerun this merger after refreshing native sources to regenerate this report.',
 '',
 'New official program listings always retain `courseMapStatus: "not-mapped"` and never acquire a course-model ID through this importer. Accurate curricula and course equivalencies must be researched and reviewed separately before a program is described as a ready-to-follow transfer plan.',
 ''
].join('\n');
const outputs=[[resolve(root,'dist/data/opportunity-catalog.json'),JSON.stringify(opportunity,null,2)+'\n'],[directoryPath,JSON.stringify(directory)+'\n'],[resolve(root,'docs/opportunity-catalog-coverage.md'),coverageDoc]];
if(process.argv.includes('--check'))for(const[path,expected]of outputs)assert.equal((await readFile(path,'utf8'))===expected,true,path+' is out of date; rerun the reviewed catalog merger');
else for(const[path,value]of outputs)await writeFile(path,value);
console.log(JSON.stringify({schools:schools.length,expandedPrograms:programs.length,plannedPrograms:plannedPrograms.length,totalDirectoryPrograms:directory.programs.length,sourceFiles:files.length}));
