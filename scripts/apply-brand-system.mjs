/** Give generated public pages and retained workspace routes the same brand foundation. */
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const dist=resolve(import.meta.dirname,'../dist');
let pages=0;
async function walk(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const path=resolve(directory,entry.name);if(entry.isDirectory()){if(entry.name!=='vendor')await walk(path);continue;}if(!entry.name.endsWith('.html'))continue;const source=await readFile(path,'utf8');let next=source;if(!/<link\b[^>]*href=["'][^"']*brand\.css["']/i.test(next))next=next.replace(/<\/head>/i,'<link rel="stylesheet" href="/brand.css"></head>');next=next.replace(/(<meta\b[^>]*name=["']theme-color["'][^>]*content=)["'][^"']*["']/gi,'$1"#4054f4"');if(next!==source)await writeFile(path,next);pages++;}}
await walk(dist);
console.log(JSON.stringify({brand:'DegreeSteps',sharedBrandPages:pages,canonicalHostChanged:false,storageContractsChanged:false}));
