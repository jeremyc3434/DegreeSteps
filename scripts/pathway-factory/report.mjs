/**
 * "What to build next" queue. For each school kit: directory programs with no kit yet, and for kit programs the share
 * of requirement credits already covered by in-scope equivalencies (plus out-of-scope candidates awaiting evidence).
 * Usage: node scripts/pathway-factory/report.mjs [kit-dir-or-id ...] [--json]
 */
import {resolve} from 'node:path';
import {list,inScope,matchRequirement,parsePlacement,rowStatus,loadKit,kitDirs,resolveKitDir,readJSON,parseArgs,isMain,root} from './lib.mjs';
import {publishable} from './compile.mjs';

const pct=(n,d)=>d?Math.round(1000*n/d)/10:0;
export function programCoverage(kit,program){
  const rows=list(kit.equivalencies.equivalencies);
  let covered=0,candidate=0,institutional=0,reuse=0;const open=[];
  for(const r of list(program.requirements)){
    const placed=list(r.optionRows).map(entry=>rows.find(row=>row.id===parsePlacement(entry).row)).filter(Boolean);
    const matched=[...new Set([...placed,...rows.filter(row=>matchRequirement(row,program)?.id===r.id)])];
    const applied=(Array.isArray(r.optionRows)?placed:matched).filter(row=>rowStatus(row)==='published'&&inScope(row,program,kit));
    const appliedKeys=new Set(applied.map(row=>row.provider+'|'+row.code));
    reuse+=new Set(matched.filter(row=>!applied.includes(row)&&!appliedKeys.has(row.provider+'|'+row.code)).map(row=>row.provider+'|'+row.code)).size;
    if(r.institutionalOnly)institutional+=r.credits;
    else if(applied.length)covered+=r.credits;
    else if(matched.length)candidate+=r.credits;
    else open.push({id:r.id,code:r.code,title:r.title,credits:r.credits});
  }
  const total=program.totalCredits||0;
  return {slug:program.slug,title:program.title,status:program.review?.status||'missing',compiles:publishable(program),totalCredits:total,creditSystem:program.creditSystem||kit.school.creditSystem,coveredCredits:covered,coveredPercent:pct(covered,total),candidateCredits:candidate,candidatePercent:pct(candidate,total),institutionalOnlyCredits:institutional,openCredits:total-covered-candidate-institutional,reuseCandidates:reuse,openRequirements:open};
}
export function schoolReport(kit,catalog){
  const school=kit.school,kitRoutes=new Set(kit.programs.flatMap(p=>list(p.routeIds)));
  const directory=list(catalog?.programs).filter(p=>p.schoolId===school.id||p.school===school.name);
  const missing=directory.filter(p=>!kitRoutes.has(p.id)).map(p=>({id:p.id,title:p.title,level:p.level,modalities:p.modalities,url:p.url}))
    .sort((a,b)=>(a.level||'').localeCompare(b.level||'')||a.title.localeCompare(b.title));
  const programs=kit.programs.map(p=>programCoverage(kit,p)).sort((a,b)=>b.coveredPercent-a.coveredPercent||a.slug.localeCompare(b.slug));
  return {school:school.id,name:school.name,directoryPrograms:directory.length,kitPrograms:kit.programs.length,equivalencies:list(kit.equivalencies.equivalencies).length,programsWithoutKit:missing,programs};
}
export function formatReport(report){
  const lines=[`## ${report.name} (${report.school})`,`Directory programs: ${report.directoryPrograms}; kit programs: ${report.kitPrograms}; equivalency rows: ${report.equivalencies}`,'',`Kit programs (covered = in-scope equivalencies; candidate = only documented for other programs or held; reuse candidates = provider courses documented elsewhere for the same receiving course):`];
  for(const p of report.programs)lines.push(`  ${String(p.coveredPercent).padStart(5)}% covered  ${String(p.candidatePercent).padStart(5)}% candidate  ${p.slug} [${p.status}${p.compiles?'':', not compiled'}] ${p.coveredCredits}/${p.totalCredits} ${p.creditSystem}, ${p.openRequirements.length} open requirement(s), ${p.reuseCandidates} reuse candidate(s)`);
  lines.push('',`Directory programs with no kit yet (${report.programsWithoutKit.length}):`);
  for(const p of report.programsWithoutKit)lines.push(`  - [${p.level}] ${p.title}  ${p.id}  ${p.url||''}`);
  return lines.join('\n');
}
async function main(){
  const args=parseArgs(process.argv.slice(2));
  const dirs=args._.length?args._.map(resolveKitDir):await kitDirs();
  let catalog=null;try{catalog=await readJSON(resolve(root,'dist/data/program-catalog.json'));}catch{console.error('dist/data/program-catalog.json is missing; directory gaps cannot be listed.');}
  const reports=[];for(const dir of dirs)reports.push(schoolReport(await loadKit(dir),catalog));
  console.log(args.json?JSON.stringify(reports,null,2):reports.map(formatReport).join('\n\n'));
}
if(isMain(import.meta))await main();
