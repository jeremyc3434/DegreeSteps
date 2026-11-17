/** Copy pinned, local-only file reader runtimes; never use a runtime CDN. */
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'),check=process.argv.includes('--check');
const packages={'pdfjs-dist':'6.5.438',xlsx:'0.20.3',fflate:'0.8.3'};
for(const [name,version]of Object.entries(packages)){const p=JSON.parse(await readFile(resolve(root,'node_modules',name,'package.json'),'utf8'));assert.equal(p.version,version,'Use the reviewed exact '+name+' version');}
const files=[
 ['pdfjs-dist/legacy/build/pdf.min.mjs','vendor/pdfjs/pdf.mjs','pdfjs-dist'],
 ['pdfjs-dist/legacy/build/pdf.worker.min.mjs','vendor/pdfjs/pdf.worker.mjs','pdfjs-dist'],
 ['pdfjs-dist/LICENSE','vendor/pdfjs/LICENSE.txt','pdfjs-dist'],
 ['xlsx/dist/xlsx.mini.min.js','vendor/xlsx/xlsx.min.js','xlsx'],
 ['xlsx/LICENSE','vendor/xlsx/LICENSE.txt','xlsx'],
 ['fflate/umd/index.js','vendor/fflate/fflate.js','fflate'],
 ['fflate/LICENSE','vendor/fflate/LICENSE.txt','fflate']
],manifest=[];
for(const [source,target,dependency]of files){
 const bytes=await readFile(resolve(root,'node_modules',source)),path=resolve(root,'dist',target);
 if(check)assert.deepEqual(await readFile(path),bytes,target+' differs from its pinned dependency');
 else{await mkdir(dirname(path),{recursive:true});await copyFile(resolve(root,'node_modules',source),path);}
 manifest.push({path:target,package:dependency,version:packages[dependency],bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
const result=JSON.stringify({version:1,scope:'Pinned browser-local PDF and XLSX readers. Uploaded file contents are not sent to a CDN.',dependencies:packages,files:manifest},null,2)+'\n';
const path=resolve(root,'dist/vendor/record-readers.json');
if(check)assert.equal(await readFile(path,'utf8'),result,'The record-reader vendor manifest is stale');else await writeFile(path,result);
console.log(JSON.stringify({check,files:files.length,dependencies:packages}));
