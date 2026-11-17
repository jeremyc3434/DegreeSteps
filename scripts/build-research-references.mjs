/** Validate and package source-backed research facts without making degree plans available. */
import { readdir,readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { validateResearchReferences } from '../server/research-references.mjs';
const root=resolve(import.meta.dirname,'..'),directory=resolve(root,'content/research-references'),output=resolve(root,'dist/data/research-references.json');
assert(process.argv.slice(2).every(argument=>argument==='--check'),'Use no arguments to build or --check to verify research references');
const check=process.argv.includes('--check'),files=(await readdir(directory)).filter(name=>name.endsWith('.json')).sort();
assert(files.length,'Add an official-source research reference packet before building');
const packets=[];
for(const file of files){const data=validateResearchReferences(JSON.parse(await readFile(resolve(directory,file),'utf8')));packets.push(...data.packets);}
packets.sort((left,right)=>left.id.localeCompare(right.id));
const data=validateResearchReferences({version:1,checkedOn:packets.map(packet=>packet.checkedOn).sort().at(-1),packets}),serialized=JSON.stringify(data)+'\n';
if(check)assert.equal(await readFile(output,'utf8'),serialized,'Research references changed. Run node scripts/build-research-references.mjs before building the site.');
else{await mkdir(resolve(root,'dist/data'),{recursive:true});await writeFile(output,serialized);}
process.stdout.write(JSON.stringify({output:'dist/data/research-references.json',packets:packets.length,sources:packets.reduce((total,packet)=>total+packet.sources.length,0),facts:packets.reduce((total,packet)=>total+packet.facts.length,0),check})+'\n');
