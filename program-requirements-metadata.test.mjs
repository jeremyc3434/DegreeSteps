import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateProgramRequirementPacket,assembleProgramRequirements,loadProgramRequirementReviews} from './scripts/program-requirements-metadata.mjs';
import {buildProgramFit} from './scripts/program-fit-metadata.mjs';
import {buildIndex} from './scripts/build-plan-library-index.mjs';

const clone=value=>structuredClone(value);
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const edition=value=>String(value||'').replace(/[–—]/g,'-').trim();
const code=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const model={id:'fixture-program',school:'Example College',title:'Example degree',catalogYear:'2026-2027',format:'Online',
  sources:[{id:'degree-source',url:'https://college.example.edu/degrees/example/'}],
  requirements:[{id:'capstone',code:'EXAM 400',title:'Capstone',credits:3,options:[]}],privateNote:'Never copy this private fixture note'};
const packet={schemaVersion:1,sources:[
  {id:'entry-source',url:'https://college.example.edu/admissions/',title:'Official entry routes',checkedOn:'2026-11-24',quote:'A diploma and one approved entry route are required.'},
  {id:'course-source',url:'https://college.example.edu/courses/exam-400/',title:'Official capstone requirements',checkedOn:'2026-11-24',quote:'The capstone includes live seminars.'}
],reviews:[{id:'fixture-program-review',modelIds:[model.id],catalogYear:'2026-2027',modality:'online',
  programBindings:[{modelId:model.id,degreeUrl:model.sources[0].url}],facts:[
    {id:'entry-routes',kind:'admission',scope:'school-policy',label:'Entry routes',detail:'A diploma and one approved route are required; entry decisions remain with the school.',sourceIds:['entry-source'],prominent:false},
    {id:'live-capstone',kind:'attendance',scope:'course',type:'live-seminars',label:'Live capstone seminars',detail:'This capstone includes live seminars.',courseCodes:['EXAM 400'],sourceIds:['course-source'],prominent:true}
  ]}]};

test('exact program reviews become compact sourced facts without changing their academic inputs',()=>{
  const academic=clone(model),review=clone(packet),before=JSON.stringify({academic,review});
  assert.doesNotThrow(()=>validateProgramRequirementPacket(review));
  const facts=assembleProgramRequirements(academic,[review]);
  assert.equal(facts.length,2);
  const entry=facts.find(fact=>fact.id==='entry-routes'),live=facts.find(fact=>fact.id==='live-capstone');
  assert.equal(entry.scope,'school-policy');assert.equal(entry.kind,'admission');assert.equal(entry.prominent,false);
  assert.equal(live.scope,'course');assert.equal(live.type,'live-seminars');assert.equal(live.prominent,true);
  assert.deepEqual(live.courseCodes,['EXAM 400']);assert.deepEqual(live.sourceIds,['course-source']);
  for(const fact of facts){
    assert(fact.label&&fact.detail);
    assert(fact.sourceIds.every(id=>fact.sources.some(source=>source.id===id)));
    for(const source of fact.sources)assert.deepEqual(Object.keys(source).sort(),['checkedOn','id','title','url']);
    for(const key of ['profile','learning','model','program','requirements','privateNote','rows','quote'])assert.equal(Object.hasOwn(fact,key),false);
  }
  assert.equal(JSON.stringify({academic,review}),before);
});

test('catalog punctuation normalizes while model, edition, modality and degree identity remain exact',()=>{
  assert.equal(assembleProgramRequirements({...clone(model),catalogYear:'2026–2027'},[packet]).length,2);
  for(const patch of [{id:'another-program'},{catalogYear:'2027-2028'},{format:'Residential'},{sources:[{id:'different-degree',url:'https://college.example.edu/degrees/another/'}]}]){
    assert.deepEqual(assembleProgramRequirements({...clone(model),...patch},[packet]),[],JSON.stringify(patch));
  }
  const altered=clone(packet);altered.reviews[0].programBindings[0].degreeUrl='https://college.example.edu/degrees/another/';
  assert.deepEqual(assembleProgramRequirements(model,[altered]),[],'A real source URL for a different degree is not a valid binding');
  assert.deepEqual(assembleProgramRequirements({...clone(model),format:''},[packet]),[],'Unknown format is not online');
});

test('course obligations require the actual course codes in the exact degree ledger',()=>{
  const removed={...clone(model),requirements:[]};
  const facts=assembleProgramRequirements(removed,[packet]);
  assert.deepEqual(facts.map(fact=>fact.id),['entry-routes'],'Removing a course does not erase separately sourced school entry policy');
  assert.equal(assembleProgramRequirements({...clone(model),requirements:[{code:'exam400'}]},[packet]).length,2,'Spacing in the same exact course code is normalized');
  const changed=clone(packet);changed.reviews[0].facts[1].courseCodes=['EXAM 499'];
  assert.deepEqual(assembleProgramRequirements(model,[changed]).map(fact=>fact.id),['entry-routes']);
  const multiple=clone(packet);multiple.reviews[0].facts[1].courseCodes=['EXAM 400','EXAM 499'];
  assert.deepEqual(assembleProgramRequirements(model,[multiple]).map(fact=>fact.id),['entry-routes'],'Every cited course must be present');
});

test('malformed, undated, credential-bearing and unbound sources fail validation and cannot yield facts',()=>{
  const invalidators=[
    p=>p.schemaVersion=2,
    p=>p.sources[0].url='http://college.example.edu/admissions/',
    p=>p.sources[0].url='https://student:secret@college.example.edu/admissions/',
    p=>p.sources[0].checkedOn='2026-02-30',
    p=>p.sources[0].checkedOn='2026-13-01',
    p=>delete p.sources[0].checkedOn,
    p=>p.sources.push(clone(p.sources[0])),
    p=>p.reviews[0].facts[0].sourceIds=['missing-source'],
    p=>p.reviews[0].facts[0].sourceIds=[],
    p=>p.reviews[0].facts[0].scope='assumed',
    p=>p.reviews[0].facts[0].kind='eligibility-approved',
    p=>p.reviews[0].catalogYear='2026-2025',
    p=>p.reviews[0].catalogYear='Current unreviewed academic map',
    p=>p.reviews[0].facts[1].courseCodes=[],
    p=>p.sources[0].quote=Array(26).fill('word').join(' ')
  ];
  for(const invalidate of invalidators){
    const value=clone(packet);invalidate(value);
    assert.throws(()=>validateProgramRequirementPacket(value));
    assert.deepEqual(assembleProgramRequirements(model,[value]),[],'An invalid packet cannot create a student-facing claim');
  }
});

test('distinct excerpts from one source share one total quotation budget',()=>{
  const value=clone(packet);value.sources[0].quote=Array(15).fill('entry').join(' ');
  value.sources.push({...clone(value.sources[0]),id:'entry-second-excerpt',quote:Array(15).fill('alternative').join(' ')});
  assert.throws(()=>validateProgramRequirementPacket(value),'Overlapping vocabulary must not hide 30 quoted words from one page');
  assert.deepEqual(assembleProgramRequirements(model,[value]),[]);
});

test('a school policy cannot acquire a strict program prominence flag',()=>{
  const value=clone(packet);value.reviews[0].facts[0].prominent=true;
  const facts=assembleProgramRequirements(model,[value]);
  assert.equal(facts.find(fact=>fact.id==='entry-routes').scope,'school-policy');
  assert.equal(facts.find(fact=>fact.id==='entry-routes').prominent,false);
  assert.equal(facts.find(fact=>fact.id==='live-capstone').prominent,true);
});

test('missing or unrelated research never becomes an absence-of-exams, attendance or licensing claim',()=>{
  assert.deepEqual(assembleProgramRequirements(model),[]);
  assert.deepEqual(assembleProgramRequirements(model,[]),[]);
  const withoutAttendance=clone(packet);withoutAttendance.reviews[0].facts=withoutAttendance.reviews[0].facts.filter(fact=>fact.kind!=='attendance');
  const facts=assembleProgramRequirements(model,[withoutAttendance]);
  assert.equal(facts.length,1);assert(!facts.some(fact=>/no exams|unproctored|no attendance|no licen/i.test(fact.label+' '+fact.detail)));
  assert.equal(Object.hasOwn(facts,'eligible'),false);
});

test('MAOL current-map requirements bind captured graduate evidence and reject changed identity, hash, URL, date or catalog',()=>{
  const reviewed=read('content/discovery/umpi-program-requirements.json'),registry=read('dist/data/curriculum-registry.json'),entry=registry.models.find(entry=>entry.id==='curriculum-umpi-maol-yourpace');
  const actual=read('dist/'+entry.path).models.find(model=>model.id===entry.id),before=JSON.stringify({reviewed,actual});
  assert.doesNotThrow(()=>validateProgramRequirementPacket(reviewed));
  const facts=assembleProgramRequirements(actual,[reviewed]);
  assert.deepEqual(facts.map(fact=>fact.id),['umpi-maol-graduate-admission','umpi-maol-final-assessment-threshold']);
  assert(facts.every(fact=>fact.scope==='program'&&!fact.prominent));assert(!facts.some(fact=>['attendance','professional'].includes(fact.kind)));
  assert.match(facts[0].detail,/bachelor’s degree/);assert.match(facts[1].detail,/at least 80/);assert.match(facts[1].detail,/does not establish.*whether an assessment is monitored/);
  for(const source of reviewed.sources){
    const body=readFileSync(new URL(source.capture,import.meta.url),'utf8');
    assert.equal(createHash('sha256').update(body).digest('hex'),source.sha256);assert.equal(source.checkedOn,'2026-11-25');assert.equal(source.kind,'university');
    assert(body.replace(/\s+/g,' ').includes(source.quote.replace(/\s+/g,' ')),source.id+' retains its actual primary quotation');
  }
  for(const change of [
    packet=>packet.reviews[0].catalogIdentity.sourceSha256='0'.repeat(64),
    packet=>packet.reviews[0].catalogIdentity.sourceUrl='https://www.umpi.edu/unrelated-map/',
    packet=>packet.reviews[0].catalogIdentity.checkedOn='2026-11-24',
    packet=>packet.reviews[0].catalogYear='2026-2027'
  ]){const altered=clone(reviewed);change(altered);assert.throws(()=>validateProgramRequirementPacket(altered));assert.deepEqual(assembleProgramRequirements(actual,[altered]),[]);}
  const changedLabel=clone(reviewed);changedLabel.reviews[0].catalogIdentity.label='Current unreviewed academic map';assert.deepEqual(assembleProgramRequirements(actual,[changedLabel]),[]);
  for(const change of [
    model=>model.catalogIdentity.label='Current unreviewed academic map',
    model=>model.catalogIdentity.sourceUrl='https://www.umpi.edu/unrelated-map/',
    model=>model.catalogIdentity.checkedOn='2026-11-24',
    model=>model.catalogYear='2026-2027',
    model=>model.sources.find(source=>source.id===reviewed.reviews[0].catalogIdentity.sourceId).sha256='0'.repeat(64),
    model=>model.sources.find(source=>source.id===reviewed.reviews[0].catalogIdentity.sourceId).kind='provider',
    model=>model.sources.find(source=>source.id===reviewed.reviews[0].catalogIdentity.sourceId).capture='content/source-captures/unrelated.txt'
  ]){const altered=clone(actual);change(altered);assert.deepEqual(assembleProgramRequirements(altered,[reviewed]),[]);}
  assert.equal(JSON.stringify({reviewed,actual}),before);
});

test('the research loader and actual published program bindings remain source-bound and read-only',async()=>{
  const root=new URL('./',import.meta.url).pathname,packets=await loadProgramRequirementReviews(root);
  assert(Array.isArray(packets)&&packets.length>0);
  assert(packets.some(packet=>packet.reviews.some(review=>review.id==='umpi-maol-graduate-requirements-2026-11-25')));
  packets.forEach(packet=>assert.doesNotThrow(()=>validateProgramRequirementPacket(packet)));
  const registry=read('dist/data/curriculum-registry.json'),publication=read('dist/data/publication-index.json');
  const published=new Set(publication.plans.map(plan=>plan.modelId)),files=new Map(),models=new Map();
  for(const entry of registry.models.filter(entry=>published.has(entry.id))){
    if(!files.has(entry.path))files.set(entry.path,readFileSync(new URL('dist/'+entry.path,import.meta.url)));
    const document=JSON.parse(files.get(entry.path)),actual=(Array.isArray(document)?document:document.models||[document]).find(model=>model.id===entry.id);
    assert(actual,entry.id);models.set(entry.id,actual);
  }
  const before=JSON.stringify({registry,publication,packets,models:[...models]}),fits={};let factCount=0;
  for(const packet of packets)for(const review of packet.reviews){
    for(const id of review.modelIds){
      assert(published.has(id),id+' is a published program rather than an unreviewed directory listing');
      const model=models.get(id);assert.equal(edition(model.catalogYear||model.catalog),edition(review.catalogIdentity?.label||review.catalogYear));
      assert.equal(/^online$/i.test(model.format)?'online':/^(residential|campus|on campus)$/i.test(model.format)?'campus':null,review.modality);
      const binding=review.programBindings.find(binding=>binding.modelId===id);assert(binding&&model.sources.some(source=>source.url===binding.degreeUrl),id+' has its exact degree source');
      for(const fact of review.facts)if(fact.scope==='course')assert(fact.courseCodes.every(value=>model.requirements.some(req=>code(req.code)===code(value))),id+' has every named required course');
    }
  }
  for(const model of models.values()){
    const facts=assembleProgramRequirements(model,packets);assert(facts.length>0,model.id+' has researched facts');factCount+=facts.length;
    assert(!facts.some(fact=>fact.eligible===true||fact.admitted===true||fact.awardsCredit===true));
    const fit=buildProgramFit({model,requirementReviews:packets});assert.deepEqual(fit.programRequirements,facts,'The shared fit metadata emits the reviewed requirements');
    for(const routeId of publication.plans.find(plan=>plan.modelId===model.id).routeIds)fits[routeId]=fit;
  }
  assert(factCount>=models.size);
  const index=buildIndex({registry,quality:read('dist/data/pathway-quality-report.json'),fits});
  for(const plan of publication.plans)for(const routeId of plan.routeIds)assert.deepEqual(index.plans[routeId].fit.programRequirements,fits[routeId].programRequirements,'The public discovery index carries the exact reviewed facts');
  assert.deepEqual([...new Set(Object.values(index.plans).filter(plan=>plan.published).map(plan=>plan.modelId))].sort(),[...published].sort(),'Requirements annotations cannot expand publication eligibility');
  assert.equal(JSON.stringify({registry,publication,packets,models:[...models]}),before);
  for(const [path,bytes]of files){const current=readFileSync(new URL('dist/'+path,import.meta.url));assert.equal(createHash('sha256').update(current).digest('hex'),createHash('sha256').update(bytes).digest('hex'));}
  assert.deepEqual(read('dist/data/publication-index.json'),publication,'Research annotations cannot promote any program');
});
