/** Sophia partner-page importer: parsing, row classification, units, skips, merge and idempotence. Saved HTML fixtures; no network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {writeJSON,readJSON,loadKit} from './scripts/pathway-factory/lib.mjs';
import {verifyKit} from './scripts/pathway-factory/verify.mjs';
import {importPartner,classifyReceiving,parseRows,headerUnits,rowUnits,IMPORT_EVIDENCE_TYPE,reviewIdFor} from './scripts/pathway-factory/import-sophia-partner.mjs';

const fixture=name=>readFile(new URL('./test-support/fixtures/sophia-partner/'+name+'.html',import.meta.url),'utf8');
const sophia={kind:'pathway-kit-provider',version:1,provider:'Sophia',sources:[],courses:[
  ['SOPH-0010',3,['BUSI1010']],['SOPH-0014',3],['SOPH-0015',3],['SOPH-0021',1],['SOPH-0059',3],['SOPH-0060',4],['SOPH-0067',1],['SOPH-0083',3,['BUSI2015']],['SOPH-0086',3]
].map(([code,credits,aliases])=>({code,title:code,sourceCredits:credits,sourceCreditSystem:'semester',...(aliases?{codeAliases:aliases}:{})}))};// SOPH-0007 is deliberately absent

async function setup(){
  const base=await mkdtemp(join(tmpdir(),'sophia-partner-')),kits=join(base,'kits');
  await writeJSON(join(kits,'providers','sophia.json'),sophia,['courses']);
  return {base,kits,captures:join(base,'captures'),cleanup:()=>rm(base,{recursive:true,force:true})};
}
const served=html=>async url=>({ok:true,status:200,url,headers:{get:()=>'text/html; charset=utf-8'},text:async()=>html});
async function run(f,{school,partner,page,name,creditSystem,now='2026-11-23T10:00:00Z',check=false}){
  return importPartner({school,partner,name,creditSystem,check,kitDir:join(f.kits,school),capturesDir:f.captures,providersDir:join(f.kits,'providers'),base:f.base,fetchImpl:served(page),now:()=>new Date(now)});
}
const rowsOf=async(f,school)=>(await readJSON(join(f.kits,school,'equivalencies.json'))).equivalencies;

test('receiving text yields a course only when it names exactly one receiving course code',()=>{
  const course=(text,code,title)=>{const v=classifyReceiving(text);assert.equal(v.kind,'course',text);assert.equal(v.code,code);assert.equal(v.title,title);};
  course('ENG130 - Foundations of Written Communication','ENG130','Foundations of Written Communication');
  course('ACC-250 Financial Accounting','ACC-250','Financial Accounting');
  course('CMIT-200','CMIT-200',null);
  course('Data Analytics I (CIS 362)','CIS 362','Data Analytics I');
  course('COM 2301 Professional Communication','COM 2301','Professional Communication');
  course('AC114—Accounting I','AC114','Accounting I');
  course('SCI 201 (Unlocking the Secrets of Science & Innovation)','SCI 201','Unlocking the Secrets of Science & Innovation');
  const kept=classifyReceiving('BMGT 382 Business Ethics (Lower Level Credit Only)');assert.equal(kept.kind,'course');assert.deepEqual(kept.qualifiers,['Lower Level Credit Only']);
  const candidate=(text,reason,aliases)=>{const v=classifyReceiving(text,{aliases});assert.equal(v.kind,'candidate',text);assert.equal(v.reason,reason,text);};
  candidate('MGT 455- Production/Operations Management OR Elective Transfer','choice-or-multiple');
  candidate('CM107 - College Composition I OR CM220 - College Composition II','choice-or-multiple');
  candidate('Students starting before Fall 2026: SOC1500 Social Science // afterwards: HIS1150 U.S. History','choice-or-multiple');
  candidate('BUS 215/FIN 215 Personal Financial Management','choice-or-multiple');
  candidate('ACCT 2010 (*ACCT 2005 requisite)','choice-or-multiple');
  candidate('OL1ELE - Organizational Leadership Elective','elective-or-category');
  candidate('Elective Only','elective-or-category');
  candidate('Global Awareness Transfer - LD','elective-or-category');
  candidate('SOC1500 Social Science (General Transfer)','elective-or-category');
  candidate('PSU 106ZZ AREA A-G TRANSFER','elective-or-category');
  candidate('CM115 Communication - Concepts and Skills (5 Qtr Credits)','quantity-qualifier');
  candidate('HRMN 100-300','code-range');
  candidate('Humanities B','no-course-code');
  candidate('COMM-1XX','no-course-code');
  candidate('BUSI2015','sophia-own-course-code',['BUSI2015']);
  candidate('','no-receiving-course');
});

test('credit units come from the column header, or from the ratio to Sophia\'s own semester credits under a plain header',()=>{
  assert.equal(headerUnits('Qtr Credits'),'quarter');assert.equal(headerUnits('Sem Credits'),'semester');assert.equal(headerUnits('Semester Credits'),'semester');assert.equal(headerUnits('Sem'),'semester');assert.equal(headerUnits('Credits'),null);
  assert.equal(rowUnits({creditHeader:'Credits',credits:4.5},3),'quarter');
  assert.equal(rowUnits({creditHeader:'Credits',credits:3},3),'semester');
  assert.equal(rowUnits({creditHeader:'Credits',credits:3},null),null);
  assert.equal(rowUnits({creditHeader:'Credits',credits:2},3),null);
});

test('a semester partner page becomes a verified kit: named courses publish, electives stay candidates, unknown Sophia courses are skipped',async()=>{
  const f=await setup();
  try{
    const page=await fixture('snhu');
    const result=await run(f,{school:'snhu',partner:'snhu',page,name:'Southern New Hampshire University',creditSystem:'semester'});
    assert.equal(result.schoolCreated,true);assert.equal(result.changed,true);
    assert.deepEqual(result.report.skipped.map(s=>s.code),['SOPH-0007']);
    assert.equal(result.report.noReceiving,0);
    const rows=await rowsOf(f,'snhu'),byCode=new Map(rows.map(r=>[r.code,r]));
    const eng=byCode.get('SOPH-0015');
    assert.equal(eng.status,'published');assert.equal(eng.receivingCode,'ENG130');assert.equal(eng.receivingTitle,'Foundations of Written Communication');
    assert.equal(eng.credits,3);assert.equal(eng.creditSystem,'semester');assert.deepEqual(eng.scope,{all:true});
    assert.equal(eng.evidence,'conditional');assert.equal(eng.evidenceType,IMPORT_EVIDENCE_TYPE);assert.equal(eng.mappingReviewId,reviewIdFor('snhu'));
    assert.equal(eng.quotes[0].text,'English Composition I ENG130 - Foundations of Written Communication SOPH-0015 3');
    assert.equal(byCode.get('SOPH-0010').receivingCode,'ACC-201');
    for(const code of ['SOPH-0021','SOPH-0083']){const row=byCode.get(code);assert.equal(row.status,'candidate');assert.equal(row.extra.candidateReason,'elective-or-category');assert.equal(row.receivingCode,undefined);}
    assert.equal(byCode.get('SOPH-0060').status,'candidate','"(3 credits)" disagrees with the listed 4 credits');
    const school=await readJSON(join(f.kits,'snhu','school.json'));
    assert.equal(school.name,'Southern New Hampshire University');assert.equal(school.creditSystem,'semester');
    const source=school.sources.find(s=>s.id==='snhu-sophia-partner-page');assert.equal(source.url,'https://snhu.sophia.org/');assert.equal(source.checked,'2026-11-23');assert.equal(source.evidenceType,IMPORT_EVIDENCE_TYPE);
    assert.equal((await readdir(f.captures)).length,2,'one capture and its sidecar');
    const equivalencies=await readJSON(join(f.kits,'snhu','equivalencies.json'));assert.match(equivalencies.conditionLibrary['sophia-partner-provider-published'],/Southern New Hampshire University partner page/);
    const verdict=await verifyKit(await loadKit(join(f.kits,'snhu')),{asOf:'2026-11-23',base:f.base,routeIds:new Set()});
    assert.deepEqual(verdict.errors,[]);
  }finally{await f.cleanup();}
});

test('a quarter partner page keeps quarter awards and turns quantity qualifiers and OR choices into candidates',async()=>{
  const f=await setup();
  try{
    const page=await fixture('purdueglobal');
    await assert.rejects(run(f,{school:'purdue-global',partner:'purdueglobal',page,name:'Purdue Global',creditSystem:'semester'}).then(async()=>{const rows=await rowsOf(f,'purdue-global');if(rows.some(r=>r.status==='published'))throw Error('published a quarter award in a semester kit');throw Error('no published rows');}),/no published rows/);
    await rm(join(f.kits,'purdue-global'),{recursive:true,force:true});
    assert.equal(parseRows(page).filter(r=>!r.receiving).length,1,'the "without transfer equivalency" row has no receiving course');
    const imported=await run(f,{school:'purdue-global',partner:'purdueglobal',page,name:'Purdue Global',creditSystem:'quarter'});
    assert.equal(imported.report.noReceiving,1);
    const rows=new Map((await rowsOf(f,'purdue-global')).map(r=>[r.code,r]));
    const ac=rows.get('SOPH-0010');assert.equal(ac.status,'published');assert.equal(ac.receivingCode,'AC114');assert.equal(ac.credits,4.5);assert.equal(ac.creditSystem,'quarter');
    assert.equal(rows.get('SOPH-0059').extra.candidateReason,'quantity-qualifier');
    assert.equal(rows.get('SOPH-0067').extra.candidateReason,'quantity-qualifier');
    assert.equal(rows.get('SOPH-0015').extra.candidateReason,'choice-or-multiple');
    const verdict=await verifyKit(await loadKit(join(f.kits,'purdue-global')),{asOf:'2026-11-23',base:f.base,routeIds:new Set()});assert.deepEqual(verdict.errors,[]);
    await assert.rejects(run(f,{school:'purdue-global',partner:'purdueglobal',page,creditSystem:'semester'}),/quarter kit/);
  }finally{await f.cleanup();}
});

test('Sophia\'s own course codes and OR choices on a partner page are never published',async()=>{
  const f=await setup();
  try{
    await run(f,{school:'gcu',partner:'gcu',page:await fixture('gcu'),name:'Grand Canyon University'});
    const rows=new Map((await rowsOf(f,'gcu')).map(r=>[r.code,r]));
    assert.equal(rows.get('SOPH-0083').extra.candidateReason,'sophia-own-course-code');
    assert.equal(rows.get('SOPH-0086').extra.candidateReason,'choice-or-multiple');
    assert.equal(rows.get('SOPH-0014').extra.candidateReason,'elective-or-category');
    assert.equal(rows.get('SOPH-0010').receivingCode,'ACC-250');
    assert.equal((await readJSON(join(f.kits,'gcu','school.json'))).creditSystem,'semester','inferred from the "Sem Credits" header');
  }finally{await f.cleanup();}
});

test('re-running an unchanged page is a no-op, --check writes nothing, and rows from other sources are kept',async()=>{
  const f=await setup();
  try{
    const page=await fixture('snhu');
    await run(f,{school:'snhu',partner:'snhu',page,name:'Southern New Hampshire University',creditSystem:'semester'});
    const eqPath=join(f.kits,'snhu','equivalencies.json'),schoolPath=join(f.kits,'snhu','school.json');
    const doc=await readJSON(eqPath);
    doc.equivalencies.unshift({id:'other-source-row',provider:'Sophia',code:'SOPH-0010',status:'published',receivingCode:'ACC-201',receivingTitle:'Financial Accounting',credits:3,creditSystem:'semester',sourceIds:['snhu-sophia-partner-page'],scope:{all:true}});
    await writeJSON(eqPath,doc,['equivalencies']);
    const before=[await readFile(eqPath,'utf8'),await readFile(schoolPath,'utf8')];
    const again=await run(f,{school:'snhu',partner:'snhu',page,now:'2026-12-01T10:00:00Z'});
    assert.deepEqual(again.overlaps,['sophia-soph-0010-to-acc-201'],'an existing row for the same award is kept, not duplicated');
    const after=await readJSON(eqPath);
    assert.equal(after.equivalencies[0].id,'other-source-row');
    assert.equal(after.equivalencies.filter(r=>r.code==='SOPH-0010').length,1);
    assert(page.includes('>49238<'),'fixture carries a live review count');
    const third=await run(f,{school:'snhu',partner:'snhu',page:page.replace('>49238<','>49301<'),now:'2026-12-02T10:00:00Z'});
    assert.equal(third.changed,false);
    const settled=[await readFile(eqPath,'utf8'),await readFile(schoolPath,'utf8')];
    assert.equal(settled[1],before[1],'school.json keeps the original checked date for an unchanged capture');
    const changedPage=page.replace('ENG130 - Foundations of Written Communication','ENG131 - Foundations of Written Communication');
    const check=await run(f,{school:'snhu',partner:'snhu',page:changedPage,check:true,now:'2026-12-03T10:00:00Z'});
    assert.equal(check.changed,true);
    assert.deepEqual([await readFile(eqPath,'utf8'),await readFile(schoolPath,'utf8')],settled,'--check writes nothing');
    assert.equal((await readdir(f.captures)).length,2,'--check stores no capture');
  }finally{await f.cleanup();}
});

test('identity evidence defined in another kit is copied with its provenance; evidence no kit defines demotes the row',async()=>{
  const f=await setup();
  try{
    const provider=JSON.parse(JSON.stringify(sophia));
    provider.courses.find(c=>c.code==='SOPH-0015').identitySourceIds=['other-identity-src'];
    provider.courses.find(c=>c.code==='SOPH-0010').identitySourceIds=['nowhere-defined'];
    await writeJSON(join(f.kits,'providers','sophia.json'),provider,['courses']);
    await writeJSON(join(f.kits,'other','school.json'),{kind:'pathway-kit-school',version:1,id:'other',name:'Other University',creditSystem:'semester',checkedOn:'2026-11-01',sources:[{id:'other-identity-src',url:'https://www.sophia.org/online-courses/english-composition-i/',checked:'2026-11-01'}]});
    const result=await run(f,{school:'snhu',partner:'snhu',page:await fixture('snhu'),name:'Southern New Hampshire University',creditSystem:'semester'});
    assert.deepEqual(result.report.copiedSources,['other-identity-src']);
    assert.equal(result.report.reasons['provider-identity-unverifiable'],1);
    const school=await readJSON(join(f.kits,'snhu','school.json')),copied=school.sources.find(s=>s.id==='other-identity-src');
    assert.equal(copied.copiedFrom,'other/school.json');assert.equal(copied.copiedFor,'sophia-partner-import-snhu:provider-identity');
    const rows=new Map((await rowsOf(f,'snhu')).map(r=>[r.code,r]));
    assert.equal(rows.get('SOPH-0015').status,'published');
    assert.equal(rows.get('SOPH-0010').status,'candidate');assert.equal(rows.get('SOPH-0010').extra.candidateReason,'provider-identity-unverifiable');
    const verdict=await verifyKit(await loadKit(join(f.kits,'snhu')),{asOf:'2026-11-23',base:f.base,routeIds:new Set()});assert.deepEqual(verdict.errors,[]);
  }finally{await f.cleanup();}
});

test('a page with no receiving-school column or a redirect away from the partner host is refused',async()=>{
  const f=await setup();
  try{
    await assert.rejects(run(f,{school:'tesu',partner:'tesu',page:'<table><tr><td data-title=\'Sophia Course\'>X</td><td data-title=\'Category\'>Business</td><td data-title=\'ACE® ID\'>SOPH-0010</td><td data-title=\'Credits\'>3</td></tr></table>',name:'Thomas Edison State University'}),/no receiving-school course column/);
    await assert.rejects(importPartner({school:'x-school',partner:'x',name:'X',kitDir:join(f.kits,'x-school'),capturesDir:f.captures,providersDir:join(f.kits,'providers'),base:f.base,fetchImpl:async()=>({ok:true,status:200,url:'https://www.sophia.org/',headers:{get:()=>'text/html'},text:async()=>''})}),/redirected/);
    await assert.rejects(run(f,{school:'snhu',partner:'snhu',page:await fixture('snhu')}),/--name/);
  }finally{await f.cleanup();}
});

test('the weekly freshness check treats a Sophia partner page as changed only when its course table changes, not its live review counts',async()=>{
  const {checkFreshness}=await import('./scripts/pathway-factory/freshness.mjs');
  const {tableSignature}=await import('./scripts/pathway-factory/import-sophia-partner.mjs');
  const {capture}=await import('./scripts/pathway-factory/capture.mjs');
  const base=await mkdtemp(join(tmpdir(),'sophia-freshness-')),kits=join(base,'content/pathway-kits'),captures=join(base,'content/source-captures');
  const url='https://snhu.sophia.org/',original=await fixture('snhu');
  const respond=body=>({ok:true,status:200,url,headers:{get:()=>'text/html'},text:async()=>body});
  try{
    const stored=await capture(url,{dir:captures,fetchImpl:async()=>respond(original),now:()=>new Date('2026-11-23T00:00:00Z')});
    await writeJSON(join(kits,'demo','school.json'),{kind:'pathway-kit-school',version:1,id:'demo',name:'Demo',creditSystem:'semester',checkedOn:'2026-11-23',sources:[
      {id:'demo-sophia-partner-page',title:'Sophia partner page',url,checked:'2026-11-23',capture:stored.path.slice(base.length+1),tableSha256:tableSignature(parseRows(original))}]});
    await writeJSON(join(kits,'providers','sophia.json'),sophia,['courses']);
    const run=body=>checkFreshness({base,asOf:'2026-11-30',fetchImpl:async()=>respond(body),write:false,delayMs:0,log:()=>{}});
    // Review counts are bare digit cells after the credits; change every 5-digit number on the page.
    const recounted=original.replace(/>(\d{4,6})</g,(m,n)=>'>'+(Number(n)+7)+'<');
    assert.notEqual(recounted,original,'the fixture contains review counts to change');
    assert.equal((await run(recounted)).summary.changed,0,'review counts alone are not a change');
    const retabled=original.replace('ENG130','ENG131');
    assert.notEqual(retabled,original);
    assert.equal((await run(retabled)).summary.changed,1,'a changed course match is a change');
  }finally{await rm(base,{recursive:true,force:true});}
});
