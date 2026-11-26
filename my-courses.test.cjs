/* The one shared course list (dist/my-courses.js): read-only access, honest progress counts, original units kept,
   and the same upload-first / manual-fallback destinations from every page. Synthetic records only. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const M=require('./dist/my-courses.js');
const store=value=>({getItem:key=>key===M.KEY?value:null,setItem(){throw Error('my-courses.js must never write storage');}});
const draft=learning=>JSON.stringify({version:3,profile:{},learning});
const records=[
 {id:'a',provider:'Sophia',code:'MATH1001',codeAliases:['SOPH-0001'],title:'College Algebra',credits:3,creditSystem:'semester',status:'earned'},
 {id:'b',provider:'WGU',code:'C123',title:'Statistics',credits:3,creditSystem:'competency-unit',status:'earned'},
 {id:'c',provider:'Riverside CC',code:'ENG 101',title:'English Composition',credits:4.5,creditSystem:'quarter',status:'earned'},
 {id:'d',provider:'Study.com',code:'SDCM-0013',title:'Math 101',credits:null,creditSystem:null,status:'earned'},
 {id:'e',provider:'Sophia',code:'SOPH-0048',title:'Introduction to Psychology',credits:3,creditSystem:'semester',status:'in-progress'},
 {id:'f',provider:'Sophia',code:'SOPH-0002',title:'Human Biology',credits:3,creditSystem:'semester',status:'saved'},
 {id:'g',provider:'StraighterLine',code:'OOSL-0041',title:'Business Ethics',credits:3,creditSystem:'semester',status:'planned'}
];

test('reads the shared device draft without writing, and reports unreadable or unavailable storage honestly',()=>{
 assert.deepEqual(M.read(store(null)),{available:true,readable:true,learning:[]});
 assert.equal(M.read(store(draft(records))).learning.length,7);
 assert.deepEqual(M.read(store('{not json')),{available:true,readable:false,learning:[]});
 assert.deepEqual(M.read(store(JSON.stringify({version:2,learning:[]}))),{available:true,readable:false,learning:[]});
 assert.deepEqual(M.read({getItem(){throw Error('blocked');}}),{available:false,readable:false,learning:[]});
});

test('course progress is counted separately from credits, and credits keep their original units',()=>{
 const s=M.summary(records);
 assert.equal(s.total,7);assert.equal(s.finished,4);assert.equal(s.taking,1);assert.equal(s.notStarted,2);
 assert.deepEqual(s.finishedCredits,{semester:3,quarter:4.5,'competency-unit':3});
 assert.equal(s.finishedToConfirm,1,'a finished course without known credits or units is never counted as credit');
 assert.equal(M.progressText(s),'4 finished · 1 taking · 2 not started');
 const credits=M.creditsText(s);
 assert.match(credits,/3 semester credits/);assert.match(credits,/4\.5 quarter credits/);assert.match(credits,/3 competency units \(CUs\)/);
 assert.match(credits,/1 finished course with credits to confirm/);
 assert.doesNotMatch(credits,/10\.5|total/i,'units are never summed across semester, quarter and competency units');
});

test('the panel leads with upload, keeps manual entry as the fallback, and never claims a school accepted anything',()=>{
 const empty=M.panelHTML(M.read(store(null)),{from:'degrees'});
 assert.match(empty,/href="\/import-courses\.html\?from=degrees"[^>]*>Upload transcript or spreadsheet/);
 assert.match(empty,/href="\/plan\.html\?task=credits&amp;manual=1&amp;from=degrees"[^>]*>Enter a course by hand/);
 assert(empty.indexOf('Upload transcript')<empty.indexOf('Enter a course by hand'),'upload comes first');
 const full=M.panelHTML(M.read(store(draft(records))),{from:'credits-worth'});
 assert.match(full,/My courses <span class="ds-my-courses-count">7<\/span>/);
 assert.match(full,/Each school decides what it accepts/);
 assert.doesNotMatch(full,/Accepted|approved|confidence|%/i);
 assert.match(full,/from=credits-worth/);
 assert.doesNotMatch(M.panelHTML(M.read(store(draft(records))),{actions:false}),/ds-my-courses-actions/);
 // Unknown origins fall back to My courses rather than an open redirect.
 assert.match(M.panelHTML(M.read(store(null)),{from:'https://evil.example'}),/from=courses/);
 assert.match(M.panelHTML(M.read(store('{')),{}),/couldn’t be read\. They have not been changed/);
});

test('a transfer page recognises its course in My courses by provider and code, including catalog aliases',()=>{
 const learning=M.read(store(draft(records))).learning;
 assert.equal(M.findRecord(learning,'Sophia','SOPH-0001')?.id,'a','alias match');
 assert.equal(M.findRecord(learning,'Sophia Learning','soph 0001')?.id,'a','provider and code are normalised');
 assert.equal(M.findRecord(learning,'Study.com','SOPH-0001'),null,'another provider never matches');
 assert.equal(M.findRecord(learning,'Sophia',''),null);
 const html=M.transferHTML({available:true,readable:true,learning},'Sophia','SOPH-0048');
 assert.match(html,/In My courses · Taking/);assert.match(html,/record=e/);
 assert.equal(M.transferHTML({available:true,readable:true,learning},'Sophia','SOPH-9999'),'');
});

test('the shared entry points are wired the same way on every page that collects courses',()=>{
 const read=path=>fs.readFileSync(path,'utf8');
 // Credits-worth no longer keeps a separate unsaved list or its own manual form.
 const cw=read('dist/credits-worth.html'),cwjs=read('dist/credits-worth.js');
 assert.doesNotMatch(cw,/cw-manual-form|cw-save-bar|cw-build-dialog|Save to My courses/);
 assert.match(cw,/href="plan\.html\?task=credits&amp;manual=1&amp;from=credits-worth"/);
 assert.doesNotMatch(cwjs,/\bquick\b/);
 assert.match(cwjs,/localStorage\.setItem\(KEY/,'a course added here is saved to My courses');
 // The builder offers the three starting paths, and step 2 reuses collected courses.
 const start=read('dist/start.html');
 for(const label of ['Find a degree','Use my courses','Help me choose'])assert.match(start,new RegExp('<strong>'+label+'</strong>'));
 assert.match(start,/id="start-prior-have"/);assert.match(start,/my-courses\.js/);
 // One save model: the same account save action on every page that changes the draft.
 const shell=read('dist/app-shell.js'),save=read('dist/plan-save.js'),brand=read('scripts/apply-brand-system.mjs');
 for(const page of ['plan.html','portal.html','courses.html','compare-plans.html','import-courses.html','credits-worth.html','degree-audit.html']){
  assert(shell.includes("'"+page+"'"),page+' shows the shared save action');assert(brand.includes("'"+page+"'"),page+' loads plan-save.js');
 }
 for(const page of ['credits-worth.html','degree-audit.html'])assert(save.includes("'/"+page+"'"),page+' can open the save dialog');
 assert.match(read('dist/degree-audit.js'),/data-open-plan-save/);
 // The manual form returns students to the page they came from.
 const sheet=read('dist/sheet.js');
 for(const [from,page] of [['credits-worth','credits-worth.html'],['degrees','start.html'],['programs','programs.html'],['courses','courses.html']])assert(sheet.includes(JSON.stringify(from).replace(/"/g,"'")+":['"+page+"'")||sheet.includes(from+":['"+page+"'"),from+' returns to '+page);
});
