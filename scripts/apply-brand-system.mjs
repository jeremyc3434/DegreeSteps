/** Deterministic shared design wiring for public pages and student workspaces. */
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';

const dist=resolve(import.meta.dirname,'../dist');
const workspacePages=new Set(['account.html','admin.html','audit.html','community.html','compare-plans.html','courses.html','coverage.html','degree-audit.html','guided.html','import-courses.html','library.html','plan.html','portal.html','programs.html','request-plan.html','school.html']);
const families=new Map([
  ...['portal.html','programs.html','request-plan.html','guided.html','audit.html','degree-audit.html','school.html'].map(name=>[name,'discovery']),
  ...['courses.html','import-courses.html'].map(name=>[name,'collection']),
  ['compare-plans.html','comparison'],['community.html','community'],
  ...['account.html','admin.html','coverage.html'].map(name=>[name,'settings'])
]);
const managedStyles=new Set(['brand.css','experience.css','workspace-design.css','discovery-design.css','collection-design.css','comparison-design.css','community-design.css','settings-design.css','public-design.css','plan-design.css']);
const managedClasses=new Set(['ds-experience','ds-public-page','ds-workspace-page','ds-discovery-page','ds-collection-page','ds-comparison-page','ds-community-page','ds-settings-page']);

export function pageExperience(name,source){
  const publicPage=/<body\b[^>]*\bclass=["'][^"']*\bpublic-page\b/i.test(source);
  const workspace=!publicPage&&(workspacePages.has(name)||/<script\b[^>]*\bsrc=["'][^"']*app-shell\.js["']/i.test(source));
  const family=publicPage?'public':families.get(name)||null;
  const styles=['brand.css','experience.css'];
  const classes=['ds-experience'];
  if(publicPage)classes.push('ds-public-page');
  if(workspace){classes.push('ds-workspace-page');styles.push('workspace-design.css');}
  if(family){classes.push('ds-'+family+'-page');styles.push(family+'-design.css');}
  if(name==='plan.html')styles.push('plan-design.css');
  return {publicPage,workspace,family,styles,classes:[...new Set(classes)]};
}

export function applyExperience(source,name){
  const selected=pageExperience(name,source);
  if(!/<\/head>/i.test(source)||!/<body\b/i.test(source))throw Error('A complete HTML document is required: '+name);
  let next=source.replace(/<head\b[\s\S]*?<\/head>/i,head=>head.replace(/<link\b[^>]*>/gi,tag=>{
    if(!/\brel=["']stylesheet["']/i.test(tag))return tag;
    const href=tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    return href&&managedStyles.has(href.replace(/^\//,'').split('?')[0])?'':tag;
  }));
  next=next.replace(/<\/head>/i,selected.styles.map(name=>'<link rel="stylesheet" href="/'+name+'">').join('')+'</head>');
  next=next.replace(/<body\b([^>]*)>/i,(tag,attributes)=>{
    const match=attributes.match(/\bclass=(["'])(.*?)\1/i);
    const existing=match?match[2].split(/\s+/).filter(value=>value&&!managedClasses.has(value)):[];
    const value=[...new Set([...existing,...selected.classes])].join(' ');
    return '<body'+(match?attributes.replace(match[0],'class="'+value+'"'):attributes+' class="'+value+'"')+'>';
  });
  next=next.replace(/(<meta\b[^>]*name=["']theme-color["'][^>]*content=)["'][^"']*["']/gi,'$1"#4054f4"');
  return {html:next,...selected};
}

export async function applyBrandSystem(directory=dist){
  let pages=0,publicPages=0,workspaceCount=0;const counts={};
  async function walk(folder){
    for(const entry of await readdir(folder,{withFileTypes:true})){
      const path=resolve(folder,entry.name);
      if(entry.isDirectory()){if(entry.name!=='vendor')await walk(path);continue;}
      if(!entry.name.endsWith('.html'))continue;
      const source=await readFile(path,'utf8'),name=relative(directory,path).replaceAll('\\','/'),result=applyExperience(source,name);
      for(const style of result.styles)await readFile(resolve(directory,style));
      if(result.html!==source)await writeFile(path,result.html);
      pages++;if(result.publicPage)publicPages++;if(result.workspace)workspaceCount++;
      if(result.family)counts[result.family]=(counts[result.family]||0)+1;
    }
  }
  await walk(directory);
  return {brand:'DegreeSteps',sharedBrandPages:pages,experiencePages:pages,publicPages,workspacePages:workspaceCount,designFamilies:counts,canonicalHostChanged:false,storageContractsChanged:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(await applyBrandSystem()));
