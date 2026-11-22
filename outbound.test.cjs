'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Outbound=require('./dist/outbound.js');
const shipped=JSON.parse(fs.readFileSync('content/monetization/partners.json','utf8'));
const affiliate=name=>({providers:{[name]:{status:'affiliate',params:{ref:'degreesteps',utm_source:'degreesteps'},disclosure:true}}});

test('shipped partner settings keep every provider at none, and the built copy matches them',()=>{
 assert.deepEqual(Object.keys(shipped.providers).sort(),[...Outbound.PROVIDERS].sort());
 for(const [name,value] of Object.entries(shipped.providers))assert.equal(value.status,'none',name);
 assert.deepEqual(JSON.parse(fs.readFileSync('dist/data/partners.json','utf8')),Outbound.normalize(shipped));
});

test('with status none, links keep their exact href, target, rel and text; only the provider name is tagged for counting',()=>{
 const settings=Outbound.normalize(shipped),href='https://www.sophia.org/online-courses/english-composition-i?x=1&y=2';
 // Public plan pages and transfer pages.
 assert.equal(Outbound.link({href,html:'English Composition I',provider:'Sophia',rel:'noopener noreferrer',settings}),'<a href="https://www.sophia.org/online-courses/english-composition-i?x=1&amp;y=2" target="_blank" rel="noopener noreferrer" data-outbound-provider="Sophia">English Composition I</a>');
 // Worksheet "Open course at …".
 assert.equal(Outbound.link({href,html:'Open course at Sophia',provider:'Sophia',className:'course-plan-provider-link',settings}),'<a class="course-plan-provider-link" href="https://www.sophia.org/online-courses/english-composition-i?x=1&amp;y=2" target="_blank" rel="noopener" data-outbound-provider="Sophia">Open course at Sophia</a>');
 // A school's own course page is not a provider link.
 assert.equal(Outbound.link({href:'https://www.liberty.edu/x',html:'Open course at Liberty University',provider:'University',settings}),'<a href="https://www.liberty.edu/x" target="_blank" rel="noopener">Open course at Liberty University</a>');
 assert.equal(Outbound.link({href:'https://asu.example/course',html:'Course',provider:'ASU Universal Learner',settings}),'<a href="https://asu.example/course" target="_blank" rel="noopener" data-outbound-provider="other">Course</a>');
});

test('provider names map to the fixed allowlist by label or host, otherwise "other"',()=>{
 for(const [label,href,name] of [['Study.com','',"Study.com"],['study.com','','Study.com'],['Saylor Academy','','Saylor'],['','https://learn.saylor.org/course/view.php?id=1','Saylor'],['','https://clep.collegeboard.org/clep-exams/x','CLEP'],['','https://getcollegecredit.com/exam/x','DSST'],['Christian Leaders Institute','','Christian Leaders Institute'],['StraighterLine','','StraighterLine'],['','https://www.collegeboard.org/','other'],['Unknown Co','https://unknown.example','other']])assert.equal(Outbound.providerName(label,href),name,label+href);
});

test('an affiliate provider adds its params, is marked sponsored and always shows a Partner link note to the disclosure page',()=>{
 const settings=Outbound.normalize(affiliate('Study.com'));
 const out=Outbound.link({href:'https://study.com/academy/course/x.html?a=1',html:'Course page at Study.com',provider:'Study.com',rel:'noopener noreferrer',settings});
 assert.equal(out,'<a href="https://study.com/academy/course/x.html?a=1&amp;ref=degreesteps&amp;utm_source=degreesteps" target="_blank" rel="sponsored noopener" data-outbound-provider="Study.com">Course page at Study.com</a> <small class="outbound-partner-note">Partner link · <a href="/why-its-free/">Why DegreeSteps is free</a></small>');
 // Other providers are untouched by one provider's partnership.
 assert.doesNotMatch(Outbound.link({href:'https://www.sophia.org/x',html:'x',provider:'Sophia',settings}),/sponsored|Partner link|[?&]ref=/);
});

test('partner settings refuse unknown providers, undisclosed affiliates, unsafe params and unknown fields',()=>{
 for(const bad of[
  null,[],{},{providers:[]},
  {providers:{'Made Up':{status:'none'}}},
  {providers:{Sophia:{status:'paid'}}},
  {providers:{Sophia:{status:'affiliate',params:{ref:'x'},disclosure:false}}},
  {providers:{Sophia:{status:'affiliate',params:{ref:'x'}}}},
  {providers:{Sophia:{status:'affiliate',params:{},disclosure:true}}},
  {providers:{Sophia:{status:'affiliate',params:{'bad key':'x'},disclosure:true}}},
  {providers:{Sophia:{status:'affiliate',params:{ref:'\nx'},disclosure:true}}},
  {providers:{Sophia:{status:'none',rank:1}}}
 ])assert.throws(()=>Outbound.normalize(bad),undefined,JSON.stringify(bad));
 // configure() changes the browser/generator default, and the default starts at none.
 const before=Outbound.settings();assert(Object.values(before.providers).every(value=>value.status==='none'));
 Outbound.configure(affiliate('Sophia'));assert.match(Outbound.link({href:'https://sophia.org/x',html:'x',provider:'Sophia'}),/sponsored noopener/);
 Outbound.configure(shipped);assert.doesNotMatch(Outbound.link({href:'https://sophia.org/x',html:'x',provider:'Sophia'}),/sponsored/);
});

test('every course-provider link in the app and the generated pages goes through the outbound helper',()=>{
 const sheet=fs.readFileSync('dist/sheet.js','utf8'),courses=fs.readFileSync('dist/courses.js','utf8');
 assert.doesNotMatch(sheet,/link\((?:entry|previewEntry)\.(?:courseUrl|providerUrl)/);assert.match(sheet,/DegreeOutbound\.link/);assert.match(courses,/DegreeOutbound\.link/);
 assert.doesNotMatch(courses,/href="'\+esc\(destination\.(?:courseUrl|providerUrl)\)/);
 for(const page of['dist/plan.html','dist/courses.html'])assert.match(fs.readFileSync(page,'utf8'),/<script src="outbound\.js" defer><\/script>/);
 assert.match(fs.readFileSync('scripts/public-plan-pages.mjs','utf8'),/outbound\(\)\.link\(/);assert.match(fs.readFileSync('scripts/transfer-pages.mjs','utf8'),/outbound\(\)\.link\(/);
 // Proposed-course cells link to providers; the cited sources list stays plain evidence and is not a partner link.
 const planPage=fs.readFileSync('dist/degree-plans/liberty-business-residential/index.html','utf8'),cells=(planPage.match(/<td data-label="Proposed course">[\s\S]*?<\/td>/g)||[]).join('');
 assert(cells.length>1000);
 for(const anchor of cells.match(/<a [^>]*href="https:\/\/(?:www\.)?(?:sophia\.org|study\.com|straighterline\.com|learn\.saylor\.org|clep\.collegeboard\.org)\/(?:online-courses|academy|online-college-courses|course|clep-exams)[^>]*>/g)||[])assert.match(anchor,/data-outbound-provider="/,anchor);
});

test('the disclosure page says plainly why DegreeSteps is free and is linked from every public footer',()=>{
 const page=fs.readFileSync('dist/why-its-free/index.html','utf8'),text=page.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
 assert.match(text,/DegreeSteps is free\./);
 assert.match(text,/may earn a referral fee from some course providers or schools/);assert.match(text,/labelled “Partner link”/);
 assert.match(text,/never changes which plans, schools or courses you see, or the order they appear in/);
 assert.match(text,/Plans are built from schools’ published sources/);
 assert.match(text,/We do not have any referral partners today\./,'The page states the shipped (all none) settings');
 assert.match(fs.readFileSync('dist/sitemap.xml','utf8'),/\/why-its-free\//);
 for(const file of['dist/index.html','dist/about/index.html','dist/degree-plans/index.html','dist/why-its-free/index.html'])assert.match(fs.readFileSync(file,'utf8'),/<footer class="public-footer">[\s\S]*<a href="\/why-its-free\/">Why DegreeSteps is free<\/a>/,file);
});
