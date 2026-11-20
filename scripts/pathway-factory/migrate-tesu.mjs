/**
 * Decomposes Thomas Edison State University's five registry-compiled curriculum models (dist/data/curricula/tesu-*.json,
 * what students actually get) into content/pathway-kits/tesu and proves the kit reproduces every model. It uses the same
 * registry-to-kit decomposition as Liberty (migrate-liberty.mjs): every TESU augmentation the registry applied (same-school
 * receiving-course awards copied from the legacy General Management model, elective-block placements, reviewed course
 * identities, grade notices) is joined into the kit; only the registry's generic stages remain (the generated University
 * option, generic policy-review prompts, allocation bookkeeping, scoped research notices).
 *
 * The legacy General Management model (dist/data/tesu.json) stays on its own path and is not migrated.
 *
 * Usage: node scripts/pathway-factory/migrate-tesu.mjs [--check]   (--check: compare with the committed kit, write nothing)
 */
import {join,resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {same,loadKit,parseArgs,isMain,kitsRoot,root} from './lib.mjs';
import {compileKit} from './compile.mjs';
import {migrate as migrateRegistry,writeLibertyKit as writeKit,parity,kitSize} from './migrate-liberty.mjs';

export const files=['tesu-accounting','tesu-english','tesu-finance','tesu-liberal-studies','tesu-psychology'];
/** TESU has no school-wide transfer guide among its migrated awards: only same-school awards the registry applied by format are widened. */
export const tesuConfig=Object.freeze({schoolId:'tesu',schoolName:'Thomas Edison State University',files,modelPrefix:'curriculum-tesu-',guideReviews:new Set()});
export const migrate=(options={})=>migrateRegistry({...options,config:tesuConfig});
export {parity};

async function main(){
  const args=parseArgs(process.argv.slice(2));
  const kit=await migrate();
  if(!args.check)await writeKit(kit);
  const dir=join(kitsRoot,'tesu'),loaded=await loadKit(dir),{doc}=compileKit(loaded);
  const expected=kit.documents.flatMap(d=>d.models),diffs=parity(expected,doc.models);
  const outside=expected.reduce((n,m)=>n+m.requirements.reduce((k,r)=>k+r.options.filter(o=>o.provider!=='University').length,0),0);
  const rows=kit.equivalencies.equivalencies,wide=rows.filter(r=>r.scope.all);
  let baselineBytes=0;for(const name of files)baselineBytes+=Buffer.byteLength(await readFile(resolve(root,'dist/data/curricula/'+name+'.json'),'utf8'));
  console.log(JSON.stringify({school:'tesu',programs:kit.programs.length,outsideOptions:outside,equivalencyRows:rows.length,reuseRatio:Math.round(outside/rows.length*10)/10,institutionWideRows:wide.length,placementModes:Object.keys(kit.equivalencies.placementModes).length,conditions:Object.keys(kit.equivalencies.conditionLibrary).length,parity:diffs.length?diffs.slice(0,20):'exact',check:Boolean(args.check),baselineBytes,kit:await kitSize(dir)},null,2));
  if(args.check){
    if(!same(loaded.equivalencies.equivalencies,kit.equivalencies.equivalencies)||!same(loaded.school,kit.school)||kit.programs.some(p=>{const c=loaded.programs.find(x=>x.slug===p.slug);if(!c)return true;const {file:_f,...rest}=c;return !same(rest,p);})){console.error('content/pathway-kits/tesu differs from a fresh migration');process.exitCode=1;}
  }
  if(diffs.length)process.exitCode=1;
}
if(isMain(import.meta))await main();
