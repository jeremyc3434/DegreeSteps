import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DIRECTORY_SOURCES,parseHfccMatrix,parseStraighterlineDirectory,normalizeSnapshot,schoolIdentity,buildProviderDiscovery,assertProviderDiscovery,mergeSourceSnapshot,fetchDirectorySource,refreshDirectorySnapshot,buildProviderDirectoryFiles} from './provider-directory-discovery.mjs';

const checkedOn='2026-11-19';
const definition=id=>DIRECTORY_SOURCES.find(source=>source.id===id);
function source(id,extra={}){return {...definition(id),checkedOn,lastAttemptOn:checkedOn,lastGoodOn:checkedOn,status:'limited',note:'A research lead only.',sourceDate:null,httpStatus:200,...extra};}
function observation(name,extra={}){return {sourceId:'hfcc-provider-directory',provider:'Sophia',name,relation:'matrix-listed',url:definition('hfcc-provider-directory').url,observedOn:checkedOn,sourceDate:'2021-04-20',...extra};}
function snapshot(observations=[observation('Example University')]){return {version:1,sources:[source('hfcc-provider-directory',{sourceDate:'2021-04-20'})],observations};}
const matrix=(rows,head=['College','Study.com > 200','Sophia.org > 40','Saylor.org > 20','Straighterline.com > 50'])=>'<figure><table><thead><tr>'+head.map(value=>'<th>'+value+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(value=>'<td>'+value+'</td>').join('')+'</tr>').join('')+'</tbody></table><figcaption>04/20/2021</figcaption></figure>';

test('HFCC matrix preserves exact provider columns and historical date while deduplicating repeated rows',()=>{
 const html=matrix([['Nichols College','X','X','',''],['Nichols College','X','X','',''],['No Relationship College','','','',''],['Brandman University','','','X','X']]);
 const rows=parseHfccMatrix(html,{checkedOn});assert.equal(rows.length,4);
 assert.deepEqual(rows.filter(row=>row.name==='Nichols College').map(row=>row.provider).sort(),['Sophia','Study.com']);
 assert(rows.every(row=>row.sourceDate==='2021-04-20'&&row.relation==='matrix-listed'));
 assert(!rows.some(row=>row.name==='No Relationship College'));
 const report=buildProviderDiscovery(snapshot(rows));assert(report.candidates.every(row=>row.reviewFlags.includes('historical-source-needs-current-policy')));
 assert(report.candidates.find(row=>row.name==='Brandman University').reviewFlags.includes('historical-name-or-status-review'));
});

test('changed or empty provider matrices fail without silently shifting providers or deleting prior leads',()=>{
 assert.throws(()=>parseHfccMatrix(matrix([['Example University','X','','','']],['College','Sophia.org','Study.com','Saylor.org','Straighterline.com']),{checkedOn}),/columns changed/);
 assert.throws(()=>parseHfccMatrix(matrix([['Example University','Yes','','','']]),{checkedOn}),/Unknown.*marker/);
 assert.throws(()=>parseHfccMatrix(matrix([['Example University','','','','']]),{checkedOn}),/no observations/);
 assert.throws(()=>parseHfccMatrix(matrix([['Example University','X','','']]),{checkedOn}),/row structure/);
 assert.throws(()=>parseHfccMatrix(matrix([['Example University','X','','','']]),{checkedOn:'2026-99-99'}),/actual.*date/);
});

test('StraighterLine extracts named college-page links only, never logo alt text, slugs or generic buttons',()=>{
 const html='<a href="/colleges/example-university/">Example University</a><a href="/colleges/example-university/?campaign=1">Example University</a><a href="/colleges/placeholder-university/">Learn more</a><a href="/colleges/logo-university/"><img alt="Logo University"></a><a href="/colleges/academy/">Academy</a><a href="https://bad.example/colleges/wrong/">Wrong University</a><script><a href="/colleges/hidden-university/">Hidden University</a></script>';
 const rows=parseStraighterlineDirectory(html,{checkedOn});assert.equal(rows.length,1);assert.equal(rows[0].name,'Example University');assert.equal(rows[0].relation,'directory-listed');assert.equal(rows[0].url,'https://www.straighterline.com/colleges/example-university/');
 assert.throws(()=>parseStraighterlineDirectory('<a href="/colleges/not-a-school/">Learn more</a>',{checkedOn}),/No named/);
});

test('normalization refuses academic claims, wrong providers, foreign hosts and malformed dates',()=>{
 for(const patch of [{studentEligible:true},{maximumCredits:90},{accreditation:'regional'}])assert.throws(()=>normalizeSnapshot(snapshot([observation('Example University',patch)])),/discovery facts only/);
 assert.throws(()=>normalizeSnapshot(snapshot([observation('Example University',{url:'https://example.edu/map'})])),/known directory host/);
 assert.throws(()=>normalizeSnapshot(snapshot([observation('Example University',{observedOn:'2026-02-30'})])),/actual review date/);
 const sl={version:1,sources:[source('straighterline-colleges')],observations:[observation('Example University',{sourceId:'straighterline-colleges',url:definition('straighterline-colleges').url})]};assert.throws(()=>normalizeSnapshot(sl),/wrong provider/);
});

test('exact names and safe acronym variants deduplicate without merging divisions, renamed institutions or campuses',()=>{
 const input=snapshot([observation('Western Governors University'),observation('Western Governors University (WGU)'),observation('Example University'),observation('Example University Online'),observation('Example University - South Campus'),observation('Brandman University'),observation('University of Massachusetts Global')]);
 const known=[{id:'wgu',name:'Western Governors University'},{id:'umass',name:'University of Massachusetts Global'}];
 const report=buildProviderDiscovery(input,known);assert.equal(report.summary.candidates,6);
 const wgu=report.candidates.find(row=>row.knownSchoolId==='wgu');assert.equal(wgu.observedNames.length,2);
 assert.equal(report.candidates.find(row=>row.name==='Brandman University').knownSchoolId,null);
 assert.notEqual(schoolIdentity('Example University'),schoolIdentity('Example University Online'));
 assert.notEqual(schoolIdentity('Example University - South Campus'),schoolIdentity('Example University - North Campus'));
 assert.equal(report.candidates.find(row=>row.name==='University of Massachusetts Global').knownSchoolId,'umass');
});

test('every directory lead remains unreviewed and non-eligible; provider identity stays bound to provenance',()=>{
 const report=buildProviderDiscovery(snapshot([observation('Example University'),observation('Example University',{provider:'Study.com'}),observation('Transcript University',{relation:'transcript-recipient'})]),[{id:'example',name:'Example University'}]);
 assert.equal(report.summary.providerRelationships,3);assert.equal(report.summary.eligibleStudentPlans,0);
 for(const row of report.candidates){assert.equal(row.studentEligible,false);assert.equal(row.publicationAllowed,false);assert.deepEqual(row.accreditation,{status:'unreviewed',body:null});assert.deepEqual(row.policyReview,{totalTransferMaximum:null,alternativeCreditMaximum:null,actualMappedCredits:null,unit:null});assert.equal(row.campusScope,'unreviewed');assert(row.nextActions.some(action=>action.id==='verify-institution'));}
 assert.deepEqual(report.candidates.find(row=>row.knownSchoolId==='example').sourceEvidence.map(row=>row.provider).sort(),['Sophia','Study.com']);
 assert(report.candidates.find(row=>row.name==='Transcript University').reviewFlags.includes('transcript-receipt-is-not-acceptance'));
 assert.equal(report.methodology.preferredAlternativeCreditFraction,0.5);assert.equal(report.methodology.lowerTransferReviewFraction,0.25);assert.match(report.methodology.thresholdMeaning,/Research priorities only/);
});

test('a mutated discovery report cannot be promoted into the internal queue as verified coverage',()=>{
 const report=buildProviderDiscovery(snapshot());for(const edit of [row=>row.studentEligible=true,row=>row.accreditation.status='verified',row=>row.policyReview.alternativeCreditMaximum=90]){const changed=structuredClone(report);edit(changed.candidates[0]);assert.throws(()=>assertProviderDiscovery(changed),/cannot assert/);}
});

test('blocked source imports retain last-good observations and do not replace another directory',()=>{
 const original=snapshot(),update={version:1,sources:[source('hfcc-provider-directory',{lastAttemptOn:'2026-11-20',status:'blocked',lastGoodOn:null,httpStatus:403,note:'Blocked.'})],observations:[]};
 const before=structuredClone(original),merged=mergeSourceSnapshot(original,update);assert.deepEqual(original,before);assert.equal(merged.observations.length,1);assert.equal(merged.observations[0].observedOn,checkedOn);assert.equal(merged.sources[0].lastGoodOn,checkedOn);assert.equal(merged.sources[0].lastAttemptOn,'2026-11-20');assert.match(merged.sources[0].note,/Last-good/);
 assert(buildProviderDiscovery(merged).candidates[0].reviewFlags.includes('source-currently-unavailable'));
 assert.throws(()=>mergeSourceSnapshot(original,{version:1,sources:[source('hfcc-provider-directory'),source('straighterline-colleges')],observations:[]}),/exactly one/);
});

test('older duplicate imports cannot overwrite a later source observation',()=>{
 const current=snapshot([observation('Example University',{observedOn:'2026-11-20'})]),older=snapshot();
 assert.equal(mergeSourceSnapshot(current,older).observations[0].observedOn,'2026-11-20');
 const input=snapshot([observation('Example University'),observation('Another University')]),before=structuredClone(input);
 const first=buildProviderDiscovery(input),second=buildProviderDiscovery({...input,observations:[...input.observations].reverse()});assert.deepEqual(first,second);assert.deepEqual(input,before);
});

test('explicit refresh preserves all prior facts through HTTP failures and dynamic shells',async()=>{
 let requests=0;const result=await refreshDirectorySnapshot(snapshot(),{asOf:'2026-11-20',fetcher:async()=>{requests++;return new Response('Denied',{status:403});}});
 assert.equal(requests,5);assert.equal(result.observations.length,1);assert.equal(result.sources.length,5);assert(result.sources.every(source=>source.status==='blocked'));assert.equal(result.observations[0].observedOn,checkedOn);
 const shell=await refreshDirectorySnapshot(snapshot(),{asOf:'2026-11-20',fetcher:async()=>new Response('<html><div id="app"></div></html>',{status:200,headers:{'Content-Type':'text/html'}})});
 assert.equal(shell.observations.length,1);assert.equal(shell.sources.find(row=>row.id==='sophia-school-directory').status,'dynamic');assert.equal(shell.sources.find(row=>row.id==='hfcc-provider-directory').status,'unavailable');
});

test('refresh rejects unregistered sources, redirects off the HTTPS allowlist and oversized responses',async()=>{
 let requests=0;const fetcher=async()=>{requests++;return new Response('',{status:302,headers:{location:'http://127.0.0.1/private'}});};
 await assert.rejects(fetchDirectorySource({id:'made-up',url:'https://study.com/'},{fetcher}),/registered/);assert.equal(requests,0);
 await assert.rejects(fetchDirectorySource(definition('study-school-directory'),{fetcher}),/approved HTTPS/);assert.equal(requests,1);
 await assert.rejects(fetchDirectorySource(definition('study-school-directory'),{fetcher:async()=>new Response('x'.repeat(3*1024*1024+1),{headers:{'Content-Type':'text/html'}})}),/exceeded 3 MiB/);
});

test('committed snapshots and reports are reproducible without network; source limitations are not hidden',async()=>{
 const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Offline build attempted network.');};
 try{
  const result=await buildProviderDirectoryFiles({check:true});assert.equal(result.summary.eligibleStudentPlans,0);assert.equal(result.summary.sources,5);assert.equal(result.summary.candidates,242);
  const report=JSON.parse(await readFile(new URL('../dist/data/provider-directory-candidates.json',import.meta.url),'utf8'));
  assert.equal(report.sources.find(row=>row.id==='study-school-directory').status,'blocked');assert.equal(report.sources.find(row=>row.id==='sophia-school-directory').observations,0);assert.match(report.sources.find(row=>row.id==='sophia-school-directory').note,/115\+.*2,900\+/);assert.equal(report.sources.find(row=>row.id==='saylor-credit-directory').status,'dynamic');assert.equal(report.sources.find(row=>row.id==='hfcc-provider-directory').sourceDate,'2021-04-20');assert.equal(report.sources.find(row=>row.id==='hfcc-provider-directory').nextReviewOn,'2026-12-19');
 }finally{globalThis.fetch=originalFetch;}
});
