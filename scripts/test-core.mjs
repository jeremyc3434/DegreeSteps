/** Deterministic non-browser test discovery. No preview server or paid service is started. */
import {readdir,readFile,stat} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {spawn} from 'node:child_process';

const root=resolve(import.meta.dirname,'..');
const [major]=process.versions.node.split('.').map(Number);
if(major<24)throw Error('DegreeSteps core tests require Node.js 24 or newer.');
try{await stat(resolve(root,'outputs/site/dist/server/index.js'));}catch{throw Error('Run npm run build before testing the built Worker boundary.');}
const files=[],browser=[];
for(const directory of [root,resolve(root,'server'),resolve(root,'scripts')]){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    if(!entry.isFile()||!/^.+\.test\.(?:cjs|mjs)$/.test(entry.name))continue;
    const path=resolve(directory,entry.name),name=relative(root,path).replaceAll('\\','/');
    const source=await readFile(path,'utf8');
    if(/(?:^|-)browser\.test\./.test(entry.name)||/\b(?:require\s*\(\s*['"](?:playwright|puppeteer)|from\s*['"](?:playwright|puppeteer))/.test(source)){browser.push(name);continue;}
    files.push(name);
  }
}
files.sort();browser.sort();
if(!files.length)throw Error('No core tests were discovered.');
console.log(JSON.stringify({suite:'core',testFiles:files.length,excludedBrowserFiles:browser.length,scope:'Synthetic local and mocked-provider tests; no browser or production capacity certification.'}));
// A fresh process per file keeps old browser-shaped globals and provider mocks
// from leaking into another file. Each file retains the normal Node test output.
const failed=[],concurrency=Math.min(4,Math.max(1,Number.parseInt(process.env.CORE_TEST_CONCURRENCY||'2',10)||2));
let cursor=0;
async function runner(){
  while(cursor<files.length){
    const file=files[cursor++];
    const result=await new Promise((accept,reject)=>{const child=spawn(process.execPath,['--test','--test-isolation=none',file],{cwd:root,stdio:['ignore','pipe','pipe']});let output='',bytes=0;const collect=chunk=>{bytes+=chunk.length;if(bytes>16*1024*1024){child.kill();return;}output+=chunk.toString();};child.stdout.on('data',collect);child.stderr.on('data',collect);child.once('error',()=>reject(Error('Could not start the core test process for '+file+'.')));child.once('close',(status,signal)=>accept({status,signal,output}));});
    console.log('\nCore test: '+file+'\n'+result.output);
    if(result.status!==0||result.signal){failed.push(file);process.exitCode=1;console.error('Core test failed: '+file+(result.signal?' ('+result.signal+')':'')+'.');}
  }
}
await Promise.all(Array.from({length:concurrency},runner));
console.log(JSON.stringify({suite:'core',testFiles:files.length,failedFiles:failed.sort(),excludedBrowserFiles:browser.length,concurrency}));
