/** A bounded tracked-source guard. It never prints a matching credential value. */
import {readFile,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';

const credentialRules=[
  ['private-key',/-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g],
  ['anthropic-secret',/\bsk-ant-[A-Za-z0-9_-]{24,}\b/g],
  ['github-secret',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/g],
  ['supabase-secret',/\bsb_secret_[A-Za-z0-9_-]{24,}\b/g],
  ['stripe-secret',/\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/g],
  ['aws-access-key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g]
];
const unsafePath=name=>/(?:^|\/)\.env(?:\..+)?$/.test(name)&&!/(?:^|\/)\.env\.example$/.test(name)||/(?:^|\/)\.dev\.vars(?:\..+)?$/.test(name)||/\.(?:pem|key|p12|pfx)$/.test(name)||/(?:^|\/)(?:node_modules|\.wrangler|\.local-community)\//.test(name);
const archivePath=name=>/\.(?:tar|tar\.gz|tgz|zip|bundle)$/.test(name);
const binaryPath=name=>/\.(?:png|jpe?g|webp|gif|ico|pdf|xlsx|woff2?|ttf|eot)$/.test(name);
const provenancePath=name=>name.startsWith('content/curricula/snapshots/')||name.startsWith('dist/vendor/')||name.startsWith('test-support/fixtures/');

export function inspectSource(name,source=''){
  const findings=[];
  if(unsafePath(name))findings.push({path:name,line:0,kind:'unsafe-tracked-path'});
  if(archivePath(name))findings.push({path:name,line:0,kind:'tracked-export-archive'});
  if(binaryPath(name))return findings;
  for(const[kind,pattern]of credentialRules){
    pattern.lastIndex=0;for(const match of source.matchAll(pattern)){
      // This is the documented, non-working AWS example, not a usable credential.
      if(kind==='aws-access-key'&&match[0]==='AKIAIOSFODNN7EXAMPLE')continue;
      findings.push({path:name,line:source.slice(0,match.index).split('\n').length,kind});
    }
  }
  const jwt=/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
  for(const match of source.matchAll(jwt))try{const claims=JSON.parse(Buffer.from(match[0].split('.')[1],'base64url').toString('utf8'));if(claims?.role==='service_role')findings.push({path:name,line:source.slice(0,match.index).split('\n').length,kind:'supabase-service-role-jwt'});}catch{}
  return findings;
}

async function main(){
  const root=resolve(import.meta.dirname,'..');
  let listing;try{listing=await promisify(execFile)('git',['ls-files','-z'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});}catch{throw Error('Could not list tracked source files. Run this check from a Git checkout.');}
  const files=listing.stdout.split('\0').filter(Boolean),findings=[];
  for(const name of files){const path=resolve(root,name),info=await lstat(path);if(info.isSymbolicLink()){findings.push({path:name,line:0,kind:'tracked-symlink-review-required'});continue;}if(!info.isFile())continue;if(info.size>32*1024*1024&&!binaryPath(name)&&!provenancePath(name)){findings.push({path:name,line:0,kind:'source-too-large-to-scan'});continue;}const source=binaryPath(name)?'':await readFile(path,'utf8');findings.push(...inspectSource(name,source));}
  if(findings.length){for(const finding of findings)console.error(JSON.stringify(finding));console.error('Source safety check failed. Remove the file or credential, rotate any exposed real secret, and review history before sharing.');process.exitCode=1;return;}
  console.log(JSON.stringify({trackedFiles:files.length,findings:0,scope:'Common tracked secret/path mistakes; not a complete security or Git-history audit.'}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
