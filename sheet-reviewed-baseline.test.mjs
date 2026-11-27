import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {compilePathwayArtifacts} from './scripts/build-pathway-quality-report.mjs';
const require=createRequire(import.meta.url),{reviewedBaselineState}=require('./dist/sheet.js'),Planner=require('./dist/planner.js'),Catalog=require('./dist/program-catalog.js'),Sheet=require('./dist/sheet-state.js'),Journey=require('./dist/journey-engine.js');
const copy=value=>JSON.parse(JSON.stringify(value)),hash=text=>createHash('sha256').update(text).digest('hex');
function fixture(){
 const sources=[{id:'degree',url:'https://example.edu/degree',checked:'2026-11-25'},{id:'award',url:'https://example.edu/awards',checked:'2026-11-25'}],university=code=>({id:'university-'+code,provider:'University',code,title:code,credits:3,evidence:'published',sourceIds:['degree']}),outside=(code,evidence='published')=>({id:'outside-'+code,provider:'Study.com',code:'SDCM-'+code,title:code,receivingCode:code,credits:3,sourceCredits:3,sourceCreditSystem:'semester',evidence,sourceIds:['award']});
 const model={id:'baseline-fixture',school:'Example University',title:'Bachelor of Arts in Example Studies',level:'bachelor',format:'Online',catalog:'2026-2027',creditSystem:'semester',totalCredits:12,institutionMinCredits:3,externalMaxCredits:9,upperMinCredits:3,policySourceIds:['degree'],sources,requirements:[
  {id:'writing',code:'ENG-101',title:'Writing',credits:3,options:[outside('ENG-101'),university('ENG-101')]},
  {id:'math',code:'MAT-101',title:'Mathematics',credits:3,options:[outside('MAT-101'),university('MAT-101')]},
  {id:'business',code:'BUS-101',title:'Business',credits:3,options:[outside('BUS-101','conditional'),university('BUS-101')]},
  {id:'capstone',code:'CAP-400',title:'Capstone',credits:3,options:[{...university('CAP-400'),upper:true}]}
 ],policyReview:[],unresolved:[]};
 const route={id:'baseline-online',modelId:model.id,school:model.school,title:model.title,level:'bachelor',modalities:['online'],url:'https://example.edu/degree'};
 const entry={id:model.id,path:'data/curricula/baseline-fixture.json',status:'reviewed',school:model.school,title:model.title,level:'bachelor',routeIds:[route.id],modalities:['online'],coverage:'complete',readyTemplate:true,unresolvedRequiredChoices:0,degreeCredits:12,creditUnit:'semester'};
 const registry={version:1,checkedOn:'2026-11-25',models:[entry]},base=Catalog.attachRegistry({pathways:[route]},registry);
 const assets={'/planner.js':readFileSync(new URL('./dist/planner.js',import.meta.url),'utf8'),'/course-assessment.js':readFileSync(new URL('./dist/course-assessment.js',import.meta.url),'utf8'),'/data/curriculum-registry.json':JSON.stringify(registry),['/'+entry.path]:JSON.stringify({models:[model]})};
 const artifacts=compilePathwayArtifacts({models:[model],entries:[entry],catalog:base,registry:{revision:'academic-v1:'+'a'.repeat(64)},references:{packets:[]},asOf:'2026-11-25',inputHashes:Object.fromEntries(Object.entries(assets).map(([path,body])=>[path,hash(body)]))});
 artifacts.publicationIndex.curriculumFingerprint=Catalog.publicationFingerprint(registry);
 const catalog=Catalog.attachPublicationIndex(base,artifacts.publicationIndex,registry),pathway=catalog.pathways[0];
 const state=Journey.initialize(Sheet.selectPathway(Sheet.initialize(null,null,catalog),pathway),null,catalog);state.profile.modality='online';
 return {state,catalog,model,pathway,index:artifacts.baselineIndex,assets,Planner,Catalog,Sheet,Journey,asOf:'2026-11-26',subtle:webcrypto.subtle};
}
async function recover(input){const reads=[];const result=await reviewedBaselineState({...input,readAsset:async path=>{reads.push(path);return input.assets[path];}});return {result,reads};}
function resign(index){const {revision,...body}=index;index.revision='baselines-v1:'+hash(JSON.stringify(body));}

test('an untouched returning draft opens the exact reviewed route with all existing notes and profile fields intact',async()=>{
 const input=fixture();input.state.sheet.notes={[input.model.id]:{writing:'My private note'}};input.state.profile.displayName='Synthetic student';
 const before=copy(input.state),unfixed=Journey.buildDraft(input.state,input.catalog,[input.model]);
 assert.equal(unfixed.plan.totals.external,9,'The unpinned legacy draft uses the conditional maximum.');
 const {result,reads}=await recover(input);
 assert(result);assert.deepEqual(input.state,before,'Recovery is pure and never writes browser/account data.');
 assert.deepEqual({...result,scenarios:before.scenarios},before,'Only the reviewed starting hints and published-course preferences are added.');
 assert.deepEqual(result.scenarios[input.model.id].optionSelections||{},{});assert.equal(result.scenarios[input.model.id].suggestedChoices.modelId,input.model.id);assert.equal(result.scenarios[input.model.id].suggestedChoices.reviewId,input.index.revision);assert.equal(result.scenarios[input.model.id].allowConditional,false);
 assert.deepEqual(result.sheet.notes,before.sheet.notes);assert.deepEqual(result.learning,[]);
 const draft=Journey.buildDraft(result,input.catalog,[input.model]);
 assert.equal(draft.plan.totals.external,6);assert.equal(draft.plan.totals.institutional,6);assert.equal(draft.plan.totals.confirmed,0);assert.equal(draft.plan.totals.reported,0);
 assert.equal(draft.plan.rows.find(row=>row.requirementId==='business').option.provider,'University');
 assert.equal(draft.plan.validation.academicCountsValid,true);assert.equal(draft.plan.validation.policyChecksComplete,true);
 assert.deepEqual(new Set(reads),new Set(['/planner.js','/course-assessment.js','/data/curriculum-registry.json','/data/curricula/baseline-fixture.json']));
 assert.equal((await recover({...input,state:result})).result,null,'Saved starter provenance makes initialization one-time only.');
});

test('an automatic starter can use a newly published course while explicit and legacy choices stay locked',async()=>{
 const input=fixture(),{result}=await recover(input);assert(result);const before=copy(result),future=copy(input.model),business=future.requirements.find(row=>row.id==='business');
 business.options.find(option=>option.provider==='Study.com').evidence='published';
 const draft=Journey.buildDraft(result,input.catalog,[future]);assert.equal(draft.plan.validation.valid,true);assert.equal(draft.plan.totals.external,9);assert.equal(draft.plan.rows.find(row=>row.requirementId==='business').option.provider,'Study.com');assert.deepEqual(result,before);assert.deepEqual(result.scenarios[future.id].optionSelections||{},{});
 const selected=copy(result);selected.scenarios[future.id].optionSelections={business:'university-BUS-101'};const selectedBefore=copy(selected),locked=Journey.buildDraft(selected,input.catalog,[future]);assert.equal(locked.plan.totals.external,6);assert.equal(locked.plan.rows.find(row=>row.requirementId==='business').option.provider,'University');assert.deepEqual(selected,selectedBefore);
 const legacy=copy(selected);delete legacy.scenarios[future.id].suggestedChoices;const legacyBefore=copy(legacy),retained=Journey.buildDraft(legacy,input.catalog,[future]);assert.equal(retained.plan.totals.external,6);assert.deepEqual(legacy,legacyBefore,'Existing scenarios without hint provenance are never unlocked');
});

test('starter hints cannot enable conditional courses, stale identities, or a disabled source',async()=>{
 const input=fixture(),{result}=await recover(input);assert(result);const first=Journey.buildDraft(result,input.catalog,[input.model]);assert.equal(first.plan.totals.external,6);assert(first.plan.rows.every(row=>row.option.evidence==='published'));
 const disabled=copy(result);disabled.scenarios[input.model.id].providers=[];const none=Journey.buildDraft(disabled,input.catalog,[input.model]);assert(none.plan.rows.every(row=>row.option.provider==='University'));assert.equal(none.plan.totals.external,0,'Hints do not override a student source preference');
 const stale=copy(result);stale.scenarios[input.model.id].suggestedChoices.modelId='different-degree';const fallback=Journey.buildDraft(stale,input.catalog,[input.model]);assert.equal(fallback.plan.validation.valid,true);assert.equal(fallback.plan.setupIssues.length,0);assert.equal(fallback.plan.totals.external,6);
});

test('student records, explicit choices, preferences, imports, versions and progress are never migrated',async()=>{
 const cases=[
  state=>state.learning.push({id:'saved',provider:'Sophia',title:'Saved course',status:'saved'}),
  state=>state.scenarios['baseline-fixture']={optionSelections:{writing:'university-ENG-101'}},
  state=>state.scenarios['baseline-fixture']={providers:['Study.com']},
  state=>state.scenarios['baseline-fixture']={allowConditional:false},
  state=>state.scenarios['other-degree']={optionSelections:{}},
  state=>state.whatIf={snapshots:[{id:'saved-version'}]},
  state=>state.baseline={title:'My earlier comparison'},
  state=>state.customCurricula=[{id:'private-import'}],
  state=>state.sourceCurricula=[{id:'private-source'}],
  state=>state.auditDrafts={version:1,drafts:[{id:'draft'}]},
  state=>state.templateOrigin={context:'post:example'},
  state=>state.courseProgress={writing:'in-progress'},
  state=>state.sheet.courseProgress={writing:'completed'},
  state=>state.sheet.slotChoices={'baseline-fixture':{writing:{code:'MY-101'}}},
  state=>state.profile.proctoringPreference='avoid',
  state=>state.profile.assessmentPreference='papers',
  state=>state.profile.priority='cost',
  state=>state.profile.modality='campus'
 ];
 for(const change of cases){const input=fixture();input.state.sheet.notes={private:'Preserve this note'};change(input.state);const before=copy(input.state),{result,reads}=await recover(input);assert.equal(result,null,change.toString());assert.deepEqual(reads,[],change.toString());assert.deepEqual(input.state,before,change.toString());}
});

test('stale, unavailable, unreviewed or mismatched publication and baseline artifacts fail closed',async()=>{
 const changes=[
  input=>input.catalog.publicationIndex.available=false,
  input=>input.catalog.publicationIndex.plans[0].modelFingerprint='content-v1:'+'0'.repeat(16),
  input=>input.index.registryRevision='academic-v1:'+'b'.repeat(64),
  input=>{input.index.asOf='2026-09-01';input.catalog.publicationIndex.asOf='2026-09-01';resign(input.index);},
  input=>{Object.values(input.index.baselines)[0].academicFingerprint='0'.repeat(64);resign(input.index);},
  input=>{Object.values(input.index.baselines)[0].researchStatus='conditional';resign(input.index);},
  input=>{Object.values(input.index.baselines)[0].baselineSelection.selected='conditional-research-candidate';resign(input.index);},
  input=>{Object.values(input.index.baselines)[0].validation.policyChecksComplete=false;resign(input.index);},
  input=>{Object.values(input.index.baselines)[0].rows[0].optionId='unknown';resign(input.index);},
  input=>{Object.values(input.index.baselines)[0].rows[0].credits=4;resign(input.index);},
  input=>{delete input.index.inputs['/planner.js'];resign(input.index);},
  input=>input.assets['/planner.js']+='\n// New implementation',
  input=>input.assets['/course-assessment.js']+='\n// New assessment rules',
  input=>input.assets['/data/curriculum-registry.json']+=' ',
  input=>input.assets['/data/curricula/baseline-fixture.json']+=' ',
  input=>{input.model.catalog='2025-2026';},
  input=>{input.index.revision='baselines-v1:'+'0'.repeat(64);}
 ];
 for(const change of changes){const input=fixture();change(input);const before=copy(input.state);assert.equal((await recover(input)).result,null,change.toString());assert.deepEqual(input.state,before);}
});

test('a failed input load or a concurrent edit keeps the original draft intact',async()=>{
 const input=fixture();assert.equal(await reviewedBaselineState({...input,readAsset:async()=>{throw Error('Unavailable');}}),null);
 const changed=fixture();let edited=false;
 const result=await reviewedBaselineState({...changed,readAsset:async path=>{if(!edited){changed.state.sheet.notes={writing:'Added while loading'};edited=true;}return changed.assets[path];}});
 assert.equal(result,null);assert.deepEqual(changed.state.sheet.notes,{writing:'Added while loading'});assert.deepEqual(changed.state.scenarios,{});
});

test('a baseline cannot seed unsupported course pins even with self-consistent receipt and artifact checksums',async()=>{
 const input=fixture(),baseline=Object.values(input.index.baselines)[0];
 for(const rows of [baseline.rows,baseline.baselineSelection.publishedOnlyCandidate.rows])rows[0].optionId='invented-course';
 resign(input.index);assert.equal((await recover(input)).result,null);
 const second=fixture(),row=Object.values(second.index.baselines)[0];
 row.summary.transferCredits=9;resign(second.index);assert.equal((await recover(second)).result,null,'Regenerated totals must equal the reviewed split.');
});
