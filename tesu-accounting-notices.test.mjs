import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {loadKit,root} from './scripts/pathway-factory/lib.mjs';
import {compileProgram} from './scripts/pathway-factory/compile.mjs';
import {applyTESUAccountingNotices,writeTESUAccountingNotices,tesuAccountingNotices} from './scripts/tesu-accounting-notices.mjs';
import {assessPathwayQuality} from './scripts/pathway-quality.mjs';
import {groundedSource} from './scripts/tesu-course-eligibility.mjs';
const require=createRequire(import.meta.url),Planner=require('./dist/planner.js'),read=async path=>JSON.parse(await readFile(root+'/'+path,'utf8')),copy=structuredClone;
const kit=await loadKit(root+'/content/pathway-kits/tesu'),program=kit.programs.find(p=>p.modelId==='curriculum-tesu-bsba-accounting'),canonical=compileProgram(kit,program);
const registry=await read('dist/data/curriculum-registry.json'),entry=registry.models.find(m=>m.id===canonical.id),pack=await read('dist/'+entry.path),normalized=copy((pack.models||[pack]).find(m=>m.id===canonical.id));
normalized.unresolved=copy(canonical.unresolved);normalized.pricingNotes=copy(canonical.pricingNotes);
const input={providers:[...new Set(normalized.requirements.flatMap(r=>r.options.map(o=>o.provider)))].filter(p=>p!=='University'),allowConditional:false,priority:'transfer',completed:[],optimizationNodeBudget:12000};

test('Accounting execution notices cite university sources and preserve all reviewed academic facts',async()=>{
 assert.equal(canonical.unresolved.filter(note=>note.status==='personal-task'&&note.owner==='student').length,2);assert.equal(canonical.unresolved.filter(note=>note.status==='resolved').length,1);assert.equal(canonical.pricingNotes.length,1);assert(/books.+fees/.test(canonical.pricingNotes[0]));assert.equal(canonical.requirements.length,40);assert.equal(canonical.requirements.reduce((n,r)=>n+r.credits,0),120);
 const sources=new Map(canonical.sources.map(s=>[s.id,s]));for(const note of canonical.unresolved){assert.deepEqual(note,Object.values(tesuAccountingNotices).find(expected=>expected.id===note.id));for(const id of note.sourceIds){const source=sources.get(id);assert(source);assert(/tesu\.edu|tesu\.smartcatalogiq\.com/.test(new URL(source.url).hostname));}}
 const review=await read('content/pathway-kits/tesu/accounting-execution-notices-review-2026-11-26.json'),source=sources.get(review.primaryEvidence.sourceId),evidence=await groundedSource(source);assert.equal(evidence.source.sha256,review.primaryEvidence.sha256);assert(evidence.body.includes(review.primaryEvidence.quote));assert.equal(review.academicFactsChanged,false);assert.equal(review.receivingAwardsAdded,0);
 const rereviewed=applyTESUAccountingNotices(canonical);assert.deepEqual({...rereviewed,unresolved:null,pricingNotes:null},{...canonical,unresolved:null,pricingNotes:null});assert.deepEqual(rereviewed.catalogIdentity,canonical.catalogIdentity);
});

test('the real Accounting planner stays ready while personal conditions remain student execution tasks',()=>{
 const plan=Planner.generate(normalized,input);assert.equal(plan.validation.academicCountsValid,true);assert.equal(plan.validation.policyChecksComplete,true);assert.equal(plan.validation.valid,true);assert.equal(plan.validation.errors.filter(issue=>issue.code==='program_research').length,0);assert.equal(plan.personalTasks.length,2);assert.equal(plan.resolvedNotes.length,1);assert(plan.totals.external>=60);assert.equal(plan.rows.length,40);
 const quality=assessPathwayQuality({model:normalized,plan,route:{id:'tesu-bsba-accounting',modelId:normalized.id,school:normalized.school,title:normalized.title,level:'bachelor',modalities:['online']},asOf:'2026-11-26'});assert.equal(quality.publication.ready,true,JSON.stringify(quality.publication));assert.equal(quality.execution.personalTasks.length,2);
});

test('unknown Accounting research, missing task sources and unknown academic policies still block the planner',()=>{
 const unknown=copy(normalized);unknown.unresolved.push('The transfer cap for this exact degree still requires research.');const transformed=applyTESUAccountingNotices(unknown);assert.equal(transformed.unresolved.at(-1),unknown.unresolved.at(-1));const research=Planner.generate(transformed,input);assert(research.validation.errors.some(issue=>issue.code==='program_research'));assert.equal(research.validation.valid,false);
 const missing=copy(normalized);missing.unresolved[0].sourceIds=['missing-source'];const unbound=Planner.generate(missing,input);assert(unbound.validation.errors.some(issue=>issue.code==='program_research'));
 const policy=copy(normalized);policy.policyReview=[{field:'alternativeMaxCredits',message:'The current exact alternative-credit maximum is unknown.'}];const reviewed=applyTESUAccountingNotices(policy);assert.deepEqual(reviewed.policyReview,policy.policyReview);const pending=Planner.generate(reviewed,input);assert.equal(pending.validation.policyChecksComplete,false);assert.equal(pending.validation.valid,false);
 const other=copy(normalized);other.id='another-accounting-model';assert.deepEqual(applyTESUAccountingNotices(other),other);
});

test('Accounting notice authoring is idempotent and check mode preserves concurrent catalog metadata',async()=>{
 const paths=['content/pathway-kits/tesu/programs/bsba-accounting.json','content/pathway-kits/tesu/accounting-execution-notices-review-2026-11-26.json'],before=await Promise.all(paths.map(p=>readFile(root+'/'+p,'utf8')));const result=await writeTESUAccountingNotices({check:true});assert.equal(result.personalTasks,2);assert.equal(result.academicFactsChanged,false);assert.deepEqual(await Promise.all(paths.map(p=>readFile(root+'/'+p,'utf8'))),before);
});
