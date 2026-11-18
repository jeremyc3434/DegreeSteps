import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {buildAcademicRegistry,buildAcademicRegistryArtifacts,validateAcademicRegistry,validateAcademicRegistryArtifacts,canonicalJSON,runAcademicRegistry,academicRegistryLimits} from './build-academic-registry.mjs';

const asOf='2026-11-18';
function model(id='degree-a',changes={}){
 return {id,school:'Example University',title:'B.S. Example',catalog:'2026–2027',level:'bachelor',format:'Online',creditSystem:'semester',totalCredits:3,institutionMinCredits:0,externalMaxCredits:3,alternativeMaxCredits:3,upperMinCredits:0,policyEvidence:{institutionMinCredits:{sourceIds:['catalog']}},sources:[{id:'catalog',title:'Published curriculum',url:'https://example.edu/catalog',checked:asOf},{id:'provider',title:'Exact provider version',url:'https://example.org/course',checked:asOf}],requirements:[{id:'writing',code:'ENG101',title:'Writing',credits:3,category:'general',sourceIds:['catalog'],options:[{id:'provider-writing',provider:'Example Provider',code:'EX-001',title:'Writing I',credits:3,receivingCode:'ENG101',creditSystem:'semester',evidence:'conditional',sourceIds:['catalog'],identitySourceIds:['provider'],sourceCredits:3,sourceCreditSystem:'semester',courseVersion:2,recommendationStart:'2025-01-01',recommendationEnd:'2027-12-31',conditions:['A minimum passing grade of C is required.']}]}],...changes};
}
const build=models=>buildAcademicRegistry({models,entries:models.map(model=>({id:model.id,readyTemplate:true})),asOf});
const fact=(registry,kind)=>registry.facts.find(fact=>fact.kind===kind);

test('claims preserve original quantities, units and conditional policy instead of promoting certainty',()=>{
 const input=model();delete input.requirements[0].options[0].sourceCredits;delete input.requirements[0].options[0].sourceCreditSystem;
 const registry=build([input]),identity=fact(registry,'provider-identity'),award=fact(registry,'equivalence');
 assert.equal(identity.facts.sourceCredits,null);assert.equal(identity.facts.sourceCreditSystem,null);
 assert.equal(award.facts.receivingCredits,3);assert.equal(award.facts.receivingCreditSystem,'semester');assert.equal(award.facts.evidence,'conditional');assert.deepEqual(award.facts.conditions,['A minimum passing grade of C is required.']);
 assert(registry.findings.some(finding=>finding.category==='conditional-policy'));
});

test('a missing local reference cannot resolve to another program with the same source ID',()=>{
 const a=model('a'),b=model('b');a.sources=a.sources.filter(source=>source.id!=='catalog');
 const registry=build([a,b]);const missing=registry.sourceReferences.find(ref=>ref.modelId==='a'&&ref.localSourceId==='catalog');
 assert.equal(missing.sourceId,null);assert.equal(missing.status,'missing');
 const award=registry.facts.find(fact=>fact.kind==='equivalence'&&fact.programIds.includes('a'));assert.equal(award.sourceBinding.bound,false);
 assert(registry.findings.some(finding=>finding.code==='source-reference-missing'&&finding.programIds.includes('a')));
});

test('receiving awards stay scoped by degree, catalog, format and credit units',()=>{
 const models=[model('a'),model('b'),model('campus',{format:'Residential'}),model('later',{catalog:'2027–2028'}),model('units',{creditSystem:'competency-unit'})];
 const registry=build(models),awards=registry.facts.filter(fact=>fact.kind==='equivalence');
 assert.equal(awards.length,5);assert(awards.every(fact=>fact.programIds.length===1));
 assert(registry.reuseGroups.some(group=>group.kind==='equivalence'&&group.affectedProgramIds.includes('a')&&group.affectedProgramIds.includes('b')));
 assert(registry.reuseGroups.every(group=>group.status==='candidate-only'));
});

test('only exact dated provider identities can share across programs',()=>{
 const registry=build([model('a'),model('b')]);assert.equal(registry.facts.filter(fact=>fact.kind==='provider-identity').length,1);
 const changed=model('b');changed.requirements[0].options[0].courseVersion=3;
 assert.equal(build([model('a'),changed]).facts.filter(fact=>fact.kind==='provider-identity').length,2);
 const unknown=model('b');delete unknown.requirements[0].options[0].recommendationEnd;
 assert.equal(build([model('a'),unknown]).facts.filter(fact=>fact.kind==='provider-identity').length,2);
});

test('source metadata digests do not claim fetched-content proof',()=>{
 const input=model();input.sources[0].sha256='a'.repeat(64);const registry=build([input]);
 for(const source of registry.sources){assert.equal(source.sourceContentHash,null);assert.match(source.metadataDigest,/^[a-f0-9]{64}$/);}
 assert.equal(registry.sources.find(source=>source.url.endsWith('/catalog')).metadata.sha256,'a'.repeat(64));
});

test('value and source metadata changes invalidate fingerprints on stable policy identity',()=>{
 const first=build([model()]),changed=model();changed.institutionMinCredits=1;const second=build([changed]);
 const policy=registry=>registry.facts.find(fact=>fact.kind==='policy'&&fact.facts.field==='institutionMinCredits');
 assert.equal(policy(first).id,policy(second).id);assert.notEqual(policy(first).evidenceFingerprint,policy(second).evidenceFingerprint);
 const sourceChanged=model();sourceChanged.sources[0].checked='2026-11-17';const third=build([sourceChanged]);
 assert.equal(policy(first).id,policy(third).id);assert.notEqual(policy(first).evidenceFingerprint,policy(third).evidenceFingerprint);assert.notEqual(first.revision,third.revision);
});

test('core revisions ignore report date and input ordering without mutating inputs',()=>{
 const models=[model('b'),model('a')],snapshot=JSON.stringify(models),first=build(models),second=buildAcademicRegistry({models:[...models].reverse(),entries:models.map(model=>({id:model.id,readyTemplate:true})),asOf:'2026-11-19'});
 assert.equal(first.revision,second.revision);assert.equal(JSON.stringify(models),snapshot);
 assert.equal(canonicalJSON(first),canonicalJSON(build(models)));
});

test('source and program backlinks are validated and reject corrupted provenance',()=>{
 const registry=build([model()]);assert.equal(validateAcademicRegistry(registry),registry);
 const damaged=structuredClone(registry);fact(damaged,'equivalence').sourceBinding.bound=false;
 assert.throws(()=>validateAcademicRegistry(damaged),/source binding mismatch/);
 const escaped=structuredClone(registry);escaped.sourceReferences[0].modelId='wrong';assert.throws(()=>validateAcademicRegistry(escaped),/unknown model/);
});

test('runtime artifacts retain exact evidence in bounded content-addressed shards',()=>{
 const full=build([model()]),artifacts=buildAcademicRegistryArtifacts(full);assert.equal(validateAcademicRegistryArtifacts(artifacts),artifacts.index);
 assert.equal(artifacts.index.revision,full.revision);assert(!Object.hasOwn(fact(artifacts.index,'equivalence'),'facts'));
 for(const [path,shard]of artifacts.shards){const text=canonicalJSON(shard)+'\n';assert(Buffer.byteLength(text)<=academicRegistryLimits.evidenceBytes);assert(path.includes(createHash('sha256').update(text).digest('hex')));}
 const summary=fact(artifacts.index,'equivalence'),shard=artifacts.shards.get('dist'+summary.detailPath);assert.deepEqual(shard.facts.find(fact=>fact.id===summary.id),fact(full,'equivalence'));
});

test('CLI generation and --check cover every shard and remove obsolete evidence',async()=>{
 const base=await mkdtemp(resolve(tmpdir(),'degree-academic-'));await mkdir(resolve(base,'dist/data/curricula'),{recursive:true});
 await writeFile(resolve(base,'dist/data/curricula/test.json'),JSON.stringify(model()));await writeFile(resolve(base,'dist/data/curriculum-registry.json'),JSON.stringify({checkedOn:asOf,models:[{id:'degree-a',path:'data/curricula/test.json',readyTemplate:true}]}));
 const first=await runAcademicRegistry({base});await runAcademicRegistry({base,check:true});
 const stale='f'.repeat(64)+'.json';await writeFile(resolve(base,'dist/data/academic-evidence',stale),'{}');await assert.rejects(runAcademicRegistry({base,check:true}),/stale academic evidence/);
 await runAcademicRegistry({base});assert(!(await readdir(resolve(base,'dist/data/academic-evidence'))).includes(stale));
 const artifact=JSON.parse(await readFile(resolve(base,'dist/data/academic-registry.json'),'utf8'));assert.equal(artifact.revision,first.revision);
});

test('private student-provided models are excluded from the public catalog',()=>{
 assert.throws(()=>build([model('a',{auditProvenance:{status:'student-provided'}})]),/Private student/);
});
