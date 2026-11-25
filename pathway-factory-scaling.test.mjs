/** Scoped institutional choices and indexed factory joins. Local captures only;
 * no publication gates, provider awards or generated artifacts are changed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
import {clone,list,loadKit,kitsRoot,root,inScope,rowStatus,matchRequirement,requirementMatcher,institutionChoicesFor,reviewedInstitutionFallback,courseCodeKey} from './scripts/pathway-factory/lib.mjs';
import {compileProgram,compileSlot,rowsFor} from './scripts/pathway-factory/compile.mjs';
import {verifyKit} from './scripts/pathway-factory/verify.mjs';
import {compileScopedResearchNotices} from './scripts/pathway-quality.mjs';
const require=createRequire(import.meta.url),Planner=require('./dist/planner.js'),Catalog=require('./dist/program-catalog.js');
const asOf='2026-11-25';
const codeOf=option=>courseCodeKey(option.code);

async function fixture(){
  const base=await mkdtemp(join(tmpdir(),'factory-choice-pools-'));
  const eligibility='Arts electives: choose two courses from ART 301, HIST 310 and MUS 320. History electives: choose HIST 310.';
  const texts=['ART 301 Visual Arts 3 semester credits','HIST 310 World History 3 semester credits','MUS 320 Music History 3 semester credits','ENG 101 Composition 3 semester credits'];
  await writeFile(join(base,'catalog.txt'),[eligibility,...texts].join('\n'));
  const quote=text=>[{sourceId:'catalog',text}],sourceIds=['catalog'];
  const course=(code,title,index)=>({code,title,credits:3,creditSystem:'semester',upper:true,sourceIds,quotes:quote(texts[index])});
  const pool={id:'arts-reviewed',review:{status:'reviewed',checkedOn:asOf},scope:{programs:['arts-ba'],catalogs:['2026-2027'],levels:['bachelor'],modalities:['online']},requirementIds:['arts'],slotKinds:['major-elective'],sourceIds,quotes:quote(eligibility),courses:[course('ART 301','Visual Arts',0),course('HIST 310','World History',1),course('MUS 320','Music History',2)]};
  const school={id:'demo',name:'Demo University',creditSystem:'semester',checkedOn:asOf,sources:[{id:'catalog',kind:'university',url:'https://demo.example/catalog',checked:asOf,capture:'catalog.txt'}],institutionChoicePools:[pool],programDefaults:{coverage:'complete',institutionMinCredits:0,externalMaxCredits:9,alternativeMaxCredits:0,upperMinCredits:0,format:'Online',modalities:['online']}};
  const program={slug:'arts-ba',title:'BA Arts',level:'bachelor',catalog:'2026-2027',modalities:['online'],totalCredits:9,routeIds:['demo-arts-ba'],review:{status:'reviewed',reviewer:'Test Reviewer',reviewedOn:asOf},requirements:[{id:'composition',code:'ENG 101',title:'Composition',credits:3,category:'general',institutionalOnly:false,sourceIds},{id:'arts',title:'Arts electives',credits:6,category:'major',institutionalOnly:false,upper:true,sourceIds,quotes:quote(eligibility),slot:{kind:'major-elective',label:'Upper-level arts electives',institutionChoicePoolIds:[pool.id]}}]};
  return {base,kit:{school,programs:[program],equivalencies:{equivalencies:[]},providers:new Map()},program,pool,cleanup:()=>rm(base,{recursive:true,force:true})};
}
const verifyFixture=f=>verifyKit(f.kit,{base:f.base,asOf,routeIds:new Set(['demo-arts-ba'])});
const copyKit=kit=>({...clone({...kit,providers:undefined}),providers:kit.providers});

test('indexed matching preserves exact, ambiguous, explicit and malformed-code legacy joins',()=>{
  const malformed=[undefined,null,'',0,false,42,true,'!!!',' ','BUS 101','bus-101',{},[],['BUS101']];
  for(const first of malformed)for(const second of malformed){
    const program={slug:'demo',requirements:[{id:'first',code:first,title:'First course'},{id:'second',code:second,title:'Second course'},{id:'title',title:'Named course'}]},match=requirementMatcher(program);
    for(const receivingCode of malformed)for(const placement of [undefined,'first','missing']){
      const row={receivingCode,receivingTitle:'Named course',...(placement?{placements:{demo:{requirementId:placement}}}:{})};
      assert.equal(match(row),matchRequirement(row,program));
    }
  }
  const program={slug:'demo',requirements:[{id:'exact',code:'BUS 101'},{id:'variant',code:'BUS-101'},{id:'unique',code:'ART 301'},{id:'title',title:'A named course'}]},match=requirementMatcher(program);
  assert.equal(match({receivingCode:'BUS 101'}).id,'exact');
  assert.equal(match({receivingCode:'bus101'}),null,'ambiguous normalization never chooses a requirement');
  assert.equal(match({receivingCode:'art.301'}).id,'unique');
  assert.equal(match({receivingCode:'BUS101',placements:{demo:{requirementId:'unique'}}}).id,'unique');
  assert.equal(match({receivingTitle:'A NAMED COURSE'}).id,'title');
  program.requirements.push({id:'later',code:'NEW 101'});
  assert.equal(requirementMatcher(program)({receivingCode:'NEW101'}).id,'later','a new compilation gets a fresh index');
});

test('a captured reviewed pool supplies named university choices only after a requirement opts in',async()=>{
  const f=await fixture();try{
    assert.deepEqual((await verifyFixture(f)).errors,[]);
    const block=f.program.requirements[1],choices=institutionChoicesFor(f.kit,f.program,block,{credits:3});
    assert.equal(choices.length,3);
    const rows=compileSlot(f.kit,f.program,block,['online']);
    assert.equal(rows.length,2);assert(rows.every(row=>row.namedInstitutionChoicesReviewed===true));
    const options=rows.flatMap(row=>row.options);
    assert.equal(new Set(options.map(codeOf)).size,3,'every eligible course remains available once');
    assert(options.every(option=>option.provider==='University'&&option.creditOrigin==='institutional'&&option.evidence==='published'));
    assert.equal(options.some(option=>option.mappingEvidence||option.receivingCode||option.sourceCredits),false,'university choices never become inferred transfer awards');
    const noOptIn=clone(block);delete noOptIn.slot.institutionChoicePoolIds;noOptIn.namedInstitutionChoicesReviewed=true;
    assert.deepEqual(institutionChoicesFor(f.kit,f.program,noOptIn,{credits:3}),[]);
    assert(compileSlot(f.kit,f.program,noOptIn,['online']).every(row=>row.namedInstitutionChoicesReviewed===undefined&&row.options.length===0),'raw input cannot issue the trusted flag');
    const kit=copyKit(f.kit);delete kit.programs[0].requirements[1].slot.institutionChoicePoolIds;
    const withoutPool=copyKit(kit);delete withoutPool.school.institutionChoicePools;
    assert.equal(JSON.stringify(compileProgram(kit,kit.programs[0])),JSON.stringify(compileProgram(withoutPool,withoutPool.programs[0])),'unused pools do not alter old compiled bytes');
  }finally{await f.cleanup();}
});

test('pool verification rejects wrong scope, provider quotes, missing captures, duplicate courses and unrelated quotes',async()=>{
  const f=await fixture();try{
    const mutations=[
      ['program',kit=>kit.school.institutionChoicePools[0].scope.programs=['another-program'],'choice-pool-placement'],
      ['catalog',kit=>kit.school.institutionChoicePools[0].scope.catalogs=['2025-2026'],'choice-pool-placement'],
      ['level',kit=>kit.school.institutionChoicePools[0].scope.levels=['master'],'choice-pool-placement'],
      ['modality',kit=>kit.school.institutionChoicePools[0].scope.modalities=['campus'],'choice-pool-placement'],
      ['broad scope',kit=>kit.school.institutionChoicePools[0].scope={all:true},'choice-pool-scope'],
      ['provider evidence',kit=>kit.school.sources[0].kind='provider','choice-pool-source'],
      ['provider course',kit=>kit.school.institutionChoicePools[0].courses[0].provider='Sophia','choice-pool-course'],
      ['uncaptured evidence',kit=>delete kit.school.sources[0].capture,'choice-pool-source'],
      ['duplicate code',kit=>kit.school.institutionChoicePools[0].courses.push({...kit.school.institutionChoicePools[0].courses[0],code:'art-301'}),'choice-pool-course'],
      ['unrelated quote',kit=>kit.school.institutionChoicePools[0].courses[0].quotes=[{sourceId:'catalog',text:'ENG 101 Composition 3 semester credits'}],'choice-pool-course-quote'],
      ['fabricated quote',kit=>kit.school.institutionChoicePools[0].courses[0].quotes[0].text+=' fabricated','quote-not-found'],
      ['future review',kit=>kit.school.institutionChoicePools[0].review.checkedOn='2026-11-26','choice-pool-review'],
      ['malformed credits',kit=>kit.school.institutionChoicePools[0].courses[0].credits='3','choice-pool-course']
    ];
    for(const [label,mutate,expected]of mutations){
      const kit=copyKit(f.kit);mutate(kit);
      const result=await verifyKit(kit,{base:f.base,asOf,routeIds:new Set(['demo-arts-ba'])});
      assert(result.errors.some(error=>error.code===expected),label+': '+JSON.stringify(result.errors));
    }
  }finally{await f.cleanup();}
});

test('credit quantity, units, upper level and fixed receiving courses constrain pool eligibility',async()=>{
  const f=await fixture();try{
    const block=f.program.requirements[1],all=()=>institutionChoicesFor(f.kit,f.program,block,{credits:3}).map(codeOf);
    assert.deepEqual(all(),['ART301','HIST310','MUS320']);
    f.pool.courses[0].creditSystem='quarter';assert.deepEqual(all(),['HIST310','MUS320']);
    f.pool.courses[1].credits=4;assert.deepEqual(all(),['MUS320']);
    f.pool.courses[2].upper=false;assert.deepEqual(all(),[]);
    block.upper=false;block.slot.label='Arts electives';block.upperOnly=true;assert.deepEqual(all(),[],'an explicit upperOnly flag also excludes lower courses');
    const rows=compileSlot(f.kit,f.program,block,['online']);assert(rows.every(row=>!row.namedInstitutionChoicesReviewed));
    f.pool.courses[0].creditSystem='semester';f.pool.courses[1].credits=3;f.pool.courses[2].upper=true;
    f.program.requirements[0].code='ART-301';assert.deepEqual(all(),['HIST310','MUS320'],'a fixed course is excluded after code normalization');
    f.program.requirements[0].allowedCourseCodes=['HIST 310'];assert.deepEqual(all(),['MUS320']);
    const foreign=copyKit(f.kit);foreign.school.institutionChoicePools=[];
    assert.deepEqual(institutionChoicesFor(foreign,foreign.programs[0],foreign.programs[0].requirements[1],{credits:3}),[],'a pool owned by another school is unavailable');
  }finally{await f.cleanup();}
});

test('maximum matching preserves a distinct named fallback across overlapping broad and narrow blocks',async()=>{
  const f=await fixture();try{
    const broad=f.program.requirements[1];broad.credits=3;
    const narrow={...clone(broad),id:'history',title:'History elective',slot:{...clone(broad.slot),institutionChoicePoolIds:['history-reviewed']}};
    f.program.requirements.push(narrow);f.pool.courses=f.pool.courses.slice(0,2);
    f.kit.school.institutionChoicePools.push({...clone(f.pool),id:'history-reviewed',requirementIds:['history'],courses:[clone(f.pool.courses[1])]});
    const model=compileProgram(f.kit,f.program),broadRow=model.requirements.find(row=>row.id==='arts'),narrowRow=model.requirements.find(row=>row.id==='history');
    assert.deepEqual(broadRow.options.map(codeOf),['ART301']);assert.deepEqual(narrowRow.options.map(codeOf),['HIST310']);
    assert(broadRow.namedInstitutionChoicesReviewed&&narrowRow.namedInstitutionChoicesReviewed);
    // Reverse the broad menu to reproduce the greedy failure: the narrow
    // course must be displaced from the broad block during matching.
    f.pool.courses.reverse();
    assert.deepEqual(compileProgram(f.kit,f.program).requirements.map(row=>row.options.map(codeOf)),model.requirements.map(row=>row.options.map(codeOf)));
    f.kit.school.institutionChoicePools[1].courses=[];
    const scarce=compileProgram(f.kit,f.program);assert.equal(scarce.requirements.find(row=>row.id==='history').namedInstitutionChoicesReviewed,undefined);
  }finally{await f.cleanup();}
});

// Execute the registry's actual model compiler without its top-level global
// generator. The empty shared-award bundle is neutral for this synthetic school.
const registrySource=await readFile(join(root,'scripts/build-curriculum-registry.mjs'),'utf8');
const registryCompileSource=registrySource.slice(registrySource.indexOf('function sourceMap('),registrySource.indexOf('async function output('));
function registryCompile(raw,school){
  const dependencies={assert,clone,list,key:value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,''),slug:value=>String(value||'').toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-|-$/g,''),positive:value=>Number.isFinite(value)&&value>0,Planner,Catalog,reviewedInstitutionFallback,compileScopedResearchNotices,routes:new Map(list(raw.routeIds).map(id=>[id,{id,school:school.name,level:raw.level,modalities:list(raw.modalities).length?raw.modalities:['online']}])),sharedAwardBundle:{checkedOn:asOf},sharedAwardReports:[],composeSharedAwards:models=>({models,report:{addedOptions:0,updatedOptions:0}})};
  return new Function(...Object.keys(dependencies),registryCompileSource+'\nreturn compile;')(...Object.values(dependencies))(raw,{compiledBy:'pathway-factory',checkedOn:asOf,sources:school.sources});
}

test('the registry and planner resolve only reviewed named university fallbacks and select no duplicate courses',async()=>{
  const f=await fixture();try{
    const raw=compileProgram(f.kit,f.program),{model,entry}=registryCompile(raw,f.kit.school);
    const slots=model.requirements.filter(row=>row.allocationSlot);
    assert(slots.every(row=>row.selectionRequired===false&&reviewedInstitutionFallback(row,'semester')));
    assert.equal(entry.openCourseChoices,0);assert.equal(entry.unresolvedRequiredChoices,0);assert.equal(entry.readyTemplate,true);
    const plan=Planner.generate(model,{providers:[],completed:[],allowConditional:false,priority:'campus'});
    assert.equal(plan.validation.academicCountsValid,true,JSON.stringify(plan.validation.errors));
    assert.equal(plan.validation.errors.some(error=>error.code==='selection_required'),false);
    const selected=plan.rows.map(row=>codeOf(row.option));assert.equal(new Set(selected).size,selected.length);
    const unreviewed=clone(raw);for(const row of unreviewed.requirements)delete row.namedInstitutionChoicesReviewed;
    assert(registryCompile(unreviewed,f.kit.school).model.requirements.filter(row=>row.allocationSlot).every(row=>row.selectionRequired===true),'named options alone cannot clear a factory allocation');
    for(const row of unreviewed.requirements)row.selectionRequired=false;
    assert(registryCompile(unreviewed,f.kit.school).model.requirements.filter(row=>row.allocationSlot).every(row=>row.selectionRequired===true),'an explicit false cannot bypass the new allocation-slot pool review');
    const noPool=copyKit(f.kit);delete noPool.programs[0].requirements[1].slot.institutionChoicePoolIds;
    const open=registryCompile(compileProgram(noPool,noPool.programs[0]),noPool.school).model;
    assert(open.requirements.filter(row=>row.allocationSlot).every(row=>row.selectionRequired===true&&row.options.some(option=>option.selectionRequired===true&&!option.code)),'existing unresolved slots keep their placeholders');
    for(const mutation of [row=>row.options=[{...row.options[0],provider:'Sophia'}],row=>row.options[0].code='',row=>row.options[0].creditSystem='quarter',row=>row.options[0].upper=false]){
      const row=clone(slots[0]);row.options=row.options.slice(0,1);mutation(row);assert.equal(reviewedInstitutionFallback(row,'semester'),false);
    }
  }finally{await f.cleanup();}
});

test('the registry preserves explicit reviewed legacy named choices and their registration rules',async()=>{
  const kit=await loadKit(join(kitsRoot,'liberty'));
  for(const [slug,requirementId,expectedCode]of [['human-services-bs-online','human-services-social-work-elective','SOWK432'],['psychology-bs-residential','free-electives-11','PHED208'],['computer-science-general-residential','quantitative-math-elective','MATH221'],['computer-science-general-residential','computer-science-upper-elective-1','CSCN375'],['computer-science-general-residential','computer-science-upper-elective-2','CSCN444']]){
    const program=kit.programs.find(program=>program.slug===slug),raw=compileProgram(kit,program),original=raw.requirements.find(row=>row.id===requirementId);
    assert.equal(original.selectionRequired,false);assert.equal(original.bucket,true);assert.equal(original.allocationSlot,undefined);
    const {model}=registryCompile(raw,kit.school),compiled=model.requirements.find(row=>row.id===requirementId);
    assert.equal(compiled.selectionRequired,false,slug+' keeps its already reviewed named choice');
    assert(compiled.options.some(option=>codeOf(option)===expectedCode));
    for(const field of ['prerequisites','prerequisitePolicy','prerequisiteSourceIds','offeringPolicy'])assert.deepEqual(compiled[field],original[field],field+' is preserved');
    const plan=Planner.generate(model,{providers:[],completed:[],allowConditional:false,priority:'campus'}),selected=plan.rows.find(row=>row.requirementId===requirementId);
    assert.equal(codeOf(selected.option),expectedCode);assert.equal(selected.selectionRequired,false);
    assert.equal(plan.validation.errors.some(error=>error.code==='selection_required'&&error.requirementId===requirementId),false);
    const unresolved=clone(raw),target=unresolved.requirements.find(row=>row.id===requirementId);delete target.selectionRequired;target.options=target.options.filter(option=>option.provider==='University');
    assert.equal(registryCompile(unresolved,kit.school).model.requirements.find(row=>row.id===requirementId).selectionRequired,true,'named legacy choices still require an explicit resolved canonical selection');
  }
});

test('actual WGU joins preserve legacy order while a prebuilt index removes repeated scans',async t=>{
  const kit=await loadKit(join(kitsRoot,'wgu'));
  const orderFor=program=>(a,b)=>(a.placements?.[program.slug]?.order??Number.MAX_SAFE_INTEGER)-(b.placements?.[program.slug]?.order??Number.MAX_SAFE_INTEGER)||a.provider.localeCompare(b.provider)||a.code.localeCompare(b.code)||a.id.localeCompare(b.id);
  const linear=()=>kit.programs.map(program=>program.requirements.map(requirement=>list(kit.equivalencies.equivalencies).filter(row=>rowStatus(row)==='published'&&inScope(row,program,kit)&&matchRequirement(row,program)?.id===requirement.id).sort(orderFor(program)).map(row=>row.id)));
  const indexed=()=>kit.programs.map(program=>{
    const match=requirementMatcher(program),joined=new Map();
    for(const row of kit.equivalencies.equivalencies)if(rowStatus(row)==='published'&&inScope(row,program,kit)){const requirement=match(row);if(requirement){if(!joined.has(requirement.id))joined.set(requirement.id,[]);joined.get(requirement.id).push(row);}}
    for(const rows of joined.values())rows.sort(orderFor(program));
    return program.requirements.map(requirement=>rowsFor(kit,program,requirement,joined).map(row=>row.id));
  });
  assert.deepEqual(indexed(),linear());
  const samples={linear:[],indexed:[]};
  for(let warm=0;warm<3;warm++){linear();indexed();}
  for(let sample=0;sample<5;sample++)for(const [name,fn]of sample%2?[['indexed',indexed],['linear',linear]]:[['linear',linear],['indexed',indexed]]){const start=performance.now();for(let repeat=0;repeat<3;repeat++)fn();samples[name].push(performance.now()-start);}
  const median=values=>values.sort((a,b)=>a-b)[2],legacyMs=median(samples.linear),indexedMs=median(samples.indexed);
  t.diagnostic(JSON.stringify({programs:kit.programs.length,requirements:kit.programs.reduce((sum,program)=>sum+program.requirements.length,0),equivalencies:kit.equivalencies.equivalencies.length,passesPerSample:3,legacyMs:Math.round(legacyMs*100)/100,indexedMs:Math.round(indexedMs*100)/100,speedup:Math.round(legacyMs/indexedMs*100)/100,timingGate:false}));
});
