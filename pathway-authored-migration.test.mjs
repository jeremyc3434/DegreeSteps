/** Offline migration integration: preserve source-bound authored selections
 * when registry factoring assigns another ID to an equivalent shared award. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {migrate} from './scripts/pathway-factory/migrate-liberty.mjs';
import {compileProgram,compileOption} from './scripts/pathway-factory/compile.mjs';

async function fixture({canonicalId='a-protected-canonical-award',mutateOption=()=>{},modeCollision=false}={}){
 const base=await mkdtemp(join(tmpdir(),'authored-award-migration-'));
 const source={id:'source-proof',title:'Retained original identity and receiving evidence',url:'https://example.edu/transfer',checked:'2026-11-26',sha256:'1'.repeat(64)};
 const providers=new Map([['Test Provider',{kind:'pathway-kit-provider',version:1,provider:'Test Provider',sources:[],courses:[{code:'SRC-0001',title:'Source English',sourceCredits:3,sourceCreditSystem:'semester',courseVersion:1,recommendationStart:'2026-01-01',recommendationEnd:'2028-12-31'}]}]]);
 const row={id:canonicalId,provider:'Test Provider',code:'SRC-0001',status:'published',optionId:'source-award',credits:3,creditSystem:'semester',receivingCode:'ENC-1010',receivingTitle:'English',sourceIds:[source.id],evidence:'conditional',extra:{mappingEvidence:{sourceIds:[source.id],claimOrigin:'provider-published',individualApproval:false}},scope:{programs:['authored']}};
 const mode=modeCollision?'requirement-id':'canonical-authored-mode',definition=modeCollision?{set:{evidence:'published'}}:{placementEvidence:{placementType:'exact-course',citeInOption:true}};
 const program={kind:'pathway-kit-program',version:1,slug:'authored',modelId:'curriculum-test-authored',routeIds:['test-authored'],title:'Authored program',level:'bachelor',catalog:'2026-2027',totalCredits:3,modalities:['online'],review:{status:'reviewed',reviewer:'test',reviewedOn:'2026-11-26'},modelFields:{},modelSourceIds:[source.id],requirements:[{id:'r1',code:'ENC-1010',title:'English',credits:3,category:'general',institutionalOnly:false,sourceIds:[source.id],optionRows:[{row:canonicalId,mode,optionId:'a-saved-option-id'}]}]};
 const school={kind:'pathway-kit-school',version:1,id:'test',name:'Test University',creditSystem:'semester',checkedOn:'2026-11-26',programOrder:['original','authored'],programDefaults:{format:'Online'},publish:{compiledBy:'pathway-factory',compact:true,documents:[]},sources:[source]};
 const equivalencies={kind:'pathway-kit-equivalencies',version:1,school:'test',conditionLibrary:{},placementModes:{[mode]:definition},equivalencies:[row]};
 const originalKit={dir:join(base,'content/pathway-kits/test'),school,equivalencies,providers,programs:[program]};
 const originalOption=compileOption(originalKit,program,program.requirements[0],row,program.modalities);
 const option={...structuredClone(originalOption),id:'source-award-r1'};mutateOption(option);
 const model={id:'curriculum-test-original',school:school.name,title:'Original program',level:'bachelor',catalog:'2026-2027',creditSystem:'semester',totalCredits:option.credits,format:'Online',modalities:['online'],sources:[source],requirements:[{id:'r1',code:'ENC-1010',title:'English',credits:option.credits,category:'general',institutionalOnly:false,sourceIds:[source.id],options:[option]}]};
 const put=async(path,value)=>{const file=join(base,path);await mkdir(dirname(file),{recursive:true});await writeFile(file,JSON.stringify(value,null,2)+'\n');};
 await put('dist/data/curriculum-registry.json',{models:[{id:model.id,routeIds:['test-original']}]});
 await put('dist/data/curricula/test.json',{models:[model]});await put('content/curricula/test.json',{checkedOn:'2026-11-26',routes:[{id:'test-original'}]});
 await put('content/pathway-kits/test/school.json',school);await put('content/pathway-kits/test/equivalencies.json',equivalencies);await put('content/pathway-kits/test/programs/authored.json',program);
 const config={schoolId:'test',schoolName:school.name,files:['test'],modelPrefix:'curriculum-test-',guideReviews:new Set()};
 return {base,originalKit,program,row,providers,run:()=>migrate({base,existingProviders:providers,config})};
}

test('equivalent registry factoring preserves the exact authored row, placement mode, option ID and evidence',async()=>{
 const f=await fixture();try{
  const migrated=await f.run(),rows=migrated.equivalencies.equivalencies;
  assert(rows.some(row=>row.id==='test-provider-src-0001-to-enc-1010'),'Registry factoring retains its independently used ID');
  assert.deepEqual(rows.find(row=>row.id===f.row.id),f.row,'The protected canonical record and its narrow scope are unchanged');
  const roundtrip={...migrated,dir:f.originalKit.dir,programs:[...migrated.programs,f.program]};
  assert.deepEqual(compileProgram(roundtrip,f.program),compileProgram(f.originalKit,f.program),'An unchanged authored saved selection compiles identically');
  assert.deepEqual(migrated.equivalencies.placementModes['canonical-authored-mode'],f.originalKit.equivalencies.placementModes['canonical-authored-mode']);
 }finally{await rm(f.base,{recursive:true,force:true});}
});

test('a canonical ID collision with changed quantity, source proof or version cannot replace the protected award',async()=>{
 for(const mutateOption of [option=>option.credits=6,option=>option.sourceIds=['different-unreviewed-source'],option=>option.courseVersion=2]){
  const f=await fixture({canonicalId:'test-provider-src-0001-to-enc-1010',mutateOption});try{await assert.rejects(f.run(),/cannot replace canonical award/);}finally{await rm(f.base,{recursive:true,force:true});}
 }
});

test('different original versions stay separate instead of becoming equivalent under a shared provider code',async()=>{
 const f=await fixture({mutateOption:option=>option.courseVersion=2});try{
  const migrated=await f.run(),roundtrip={...migrated,dir:f.originalKit.dir,programs:[...migrated.programs,f.program]},protectedRow=migrated.equivalencies.equivalencies.find(row=>row.id===f.row.id),other=migrated.equivalencies.equivalencies.find(row=>row.id==='test-provider-src-0001-to-enc-1010');
  assert(protectedRow&&other);assert.deepEqual(protectedRow,f.row);
  assert.equal(compileOption(roundtrip,f.program,f.program.requirements[0],protectedRow,f.program.modalities).courseVersion,1);
  assert.equal(compileOption(roundtrip,f.program,f.program.requirements[0],other,f.program.modalities).courseVersion,2);
 }finally{await rm(f.base,{recursive:true,force:true});}
});

test('an identically named reconstructed mode cannot overwrite different authored evidence or status',async()=>{
 const f=await fixture({modeCollision:true});try{await assert.rejects(f.run(),/cannot replace canonical placement mode/);}finally{await rm(f.base,{recursive:true,force:true});}
});
