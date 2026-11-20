/** Shared helpers for the Pathway Factory kit format. No network, no clock reads except where a caller passes one. */
import {readFile,writeFile,readdir,mkdir,stat} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const root=resolve(import.meta.dirname,'../..');
export const kitsRoot=resolve(root,'content/pathway-kits');
export const capturesRoot=resolve(root,'content/source-captures');
export const creditSystems=Object.freeze(['semester','quarter','competency-unit']);
export const levels=Object.freeze(['associate','bachelor','master','doctorate','specialist','certificate']);
/** Provider course identity fields. Everything else on an option belongs to the receiving-school equivalency. */
export const identityFields=Object.freeze(['title','codeAliases','sourceCredits','sourceCreditSystem','url','identitySourceIds','sourceCreditStatus','sourceCreditVerification','sourceCreditBasis','sourceUpper','providerCourseEffectiveDates','aceId','recommendationStart','recommendationEnd','recommendationPeriodSourceIds','providerCourseCode','identityReviewId','identityCheckedOn','courseVersion','providerCoursePassingPercent']);
/** Equivalency (receiving-award) fields copied verbatim onto compiled options. */
export const awardFields=Object.freeze(['credits','creditSystem','receivingCode','receivingTitle','sourceIds','evidence','evidenceType','creditOrigin','sourceType','conditions','conditionSourceIds','mappingChecked','mappingReviewId','universityMapRecord']);
export const publishableReview=Object.freeze(['reviewed','migrated']);

export const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
export const list=value=>Array.isArray(value)?value:[];
export const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export const slug=value=>String(value||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
export const sha256=value=>createHash('sha256').update(value).digest('hex');
export const dateOnly=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
export const today=()=>new Date().toISOString().slice(0,10);
export const sourceDate=source=>source?.checked??source?.checkedOn;

/** Key-sorted copy used for comparisons and content hashes. */
export function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
/** Whitespace-, case- and punctuation-variant-normalized text for quote grounding. */
export function normalizeText(value){
  return String(value||'').normalize('NFKC').replace(/[‘’‚′]/g,"'").replace(/[“”„″]/g,'"').replace(/[‐-―−]/g,'-').replace(/ /g,' ').replace(/\s+/g,' ').trim().toLowerCase();
}
export async function readJSON(path){return JSON.parse(await readFile(path,'utf8'));}
/**
 * Pretty JSON, except that table arrays named in rowKeys (equivalency rows, provider courses) keep one record per line,
 * so a table reads and diffs like a spreadsheet row.
 */
export function stringifyKit(value,rowKeys=[]){
  if(!value||typeof value!=='object'||Array.isArray(value))return JSON.stringify(value,null,2);
  const parts=Object.entries(value).map(([key,child])=>{
    const body=rowKeys.includes(key)&&Array.isArray(child)?(child.length?'[\n'+child.map(row=>'    '+JSON.stringify(row)).join(',\n')+'\n  ]':'[]'):JSON.stringify(child,null,2).replace(/\n/g,'\n  ');
    return '  '+JSON.stringify(key)+': '+body;
  });
  return '{\n'+parts.join(',\n')+'\n}';
}
export async function writeJSON(path,value,rowKeys){await mkdir(dirname(path),{recursive:true});await writeFile(path,stringifyKit(value,rowKeys)+'\n');}
export async function exists(path){try{await stat(path);return true;}catch{return false;}}
export const providerFile=name=>slug(name)+'.json';

/** Calls visit(array, key, path) for every source-id reference in a value. */
export function sourceRefs(value,path=''){
  const refs=[];
  const walk=(node,at)=>{
    if(Array.isArray(node)){node.forEach((item,index)=>walk(item,at+'['+index+']'));return;}
    if(!node||typeof node!=='object')return;
    for(const[key,child]of Object.entries(node)){
      if((key==='sourceIds'||/SourceIds$/.test(key))&&Array.isArray(child))child.forEach(id=>refs.push({id,path:at+'.'+key}));
      else if((key==='sourceId'||key==='originalSourceId')&&typeof child==='string')refs.push({id:child,path:at+'.'+key});
      else walk(child,at+'.'+key);
    }
  };
  walk(value,path);return refs;
}

/** Loads every provider identity file. Providers are shared by all school kits. */
export async function loadProviders(dir=resolve(kitsRoot,'providers')){
  const providers=new Map();
  if(!await exists(dir))return providers;
  for(const name of (await readdir(dir)).filter(n=>n.endsWith('.json')).sort()){
    const doc=await readJSON(join(dir,name));doc.file='providers/'+name;providers.set(doc.provider,doc);
  }
  return providers;
}
/** Loads a school kit directory: school.json, equivalencies.json, programs/*.json. */
export async function loadKit(dir,{providers}={}){
  const school=await readJSON(join(dir,'school.json'));
  const equivalencies=await exists(join(dir,'equivalencies.json'))?await readJSON(join(dir,'equivalencies.json')):{kind:'pathway-kit-equivalencies',version:1,school:school.id,equivalencies:[]};
  const programs=[];
  if(await exists(join(dir,'programs')))for(const name of (await readdir(join(dir,'programs'))).filter(n=>n.endsWith('.json')).sort()){const program=await readJSON(join(dir,'programs',name));program.file='programs/'+name;programs.push(program);}
  return {dir,school,equivalencies,programs,providers:providers||await loadProviders(resolve(dir,'..','providers'))};
}
export async function kitDirs(base=kitsRoot){
  if(!await exists(base))return [];
  const dirs=[];for(const entry of await readdir(base,{withFileTypes:true}))if(entry.isDirectory()&&entry.name!=='providers'&&await exists(join(base,entry.name,'school.json')))dirs.push(join(base,entry.name));
  return dirs.sort();
}
export function resolveKitDir(value){
  if(!value)throw Error('Pass a school kit directory or id.');
  return /[\\/]/.test(value)?resolve(value):resolve(kitsRoot,value);
}
/** Route IDs known to the directory and reviewed pathways. Missing files yield an empty set. */
export async function knownRouteIds(base=root){
  const ids=new Set();
  try{for(const p of (await readJSON(resolve(base,'dist/data/program-catalog.json'))).programs||[])ids.add(p.id);}catch{}
  try{for(const p of (await readJSON(resolve(base,'dist/data/pathways.json'))).pathways||[])ids.add(p.id);}catch{}
  return ids;
}

/** Program-level helpers shared by verify and compile. */
export const programUnits=(kit,program)=>program.creditSystem||kit.school.creditSystem;
export const programSlug=program=>program.slug;
export function inScope(row,program){
  const scope=row.scope||{};
  if(scope.all===true)return (!scope.catalogs||scope.catalogs.includes(program.catalog))&&(!scope.levels||scope.levels.includes(program.level));
  return list(scope.programs).includes(program.slug);
}
/** The receiving requirement an equivalency row joins to: an explicit placement, else exact code, else exact title. */
export function matchRequirement(row,program){
  const placed=row.placements?.[program.slug]?.requirementId;
  if(placed)return program.requirements.find(r=>r.id===placed)||null;
  if(row.receivingCode)return program.requirements.find(r=>r.code===row.receivingCode)||null;
  if(row.receivingTitle)return program.requirements.find(r=>!r.code&&normalizeText(r.title)===normalizeText(row.receivingTitle))||null;
  return null;
}
export const rowStatus=row=>row.status||'published';
export const sourceIndex=(kit,program)=>{
  const sources=new Map();
  for(const s of list(kit.school.sources))sources.set(s.id,{source:s,owner:'school.json'});
  if(program)for(const s of list(program.sources))sources.set(s.id,{source:s,owner:program.file||program.slug});
  for(const doc of kit.providers.values())for(const s of list(doc.sources))if(!sources.has(s.id))sources.set(s.id,{source:s,owner:doc.file||doc.provider});
  return sources;
};
export function parseArgs(argv){
  const args={_:[]};
  for(let i=0;i<argv.length;i++){const a=argv[i];if(a.startsWith('--')){const[key,inline]=a.slice(2).split(/=(.*)/s);if(inline!==undefined)args[key]=inline;else if(argv[i+1]&&!argv[i+1].startsWith('--'))args[key]=argv[++i];else args[key]=true;}else args._.push(a);}
  return args;
}
export const isMain=meta=>Boolean(process.argv[1])&&resolve(process.argv[1])===fileURLToPath(meta.url);
