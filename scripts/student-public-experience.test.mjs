import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderCreditMix,renderStudentJourney,renderSchoolPlanCards,renderArticleStart} from './student-public-experience.mjs';
import {sourceAction} from './public-editorial.mjs';
const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const registry=read('dist/data/curriculum-registry.json'),baselines=read('dist/data/baseline-index.json'),quality=read('dist/data/pathway-quality-report.json');
const model=read('dist/data/liberty.json'),baseline=Object.values(baselines.baselines).find(item=>item.modelId===model.id);
const example={school:model.school,total:model.totalCredits,planUrl:'/portal.html?usePlan='+baseline.pathwayId,choices:{sophia:{outside:baseline.summary.transferCredits,university:baseline.summary.universityCredits}},displayRows:baseline.rows.filter(row=>['engl-101','engl-102','busi-490'].includes(row.requirementId)).map(row=>({code:row.code,title:model.requirements.find(req=>req.id===row.requirementId).title,provider:row.provider==='University'?model.school:row.provider,credits:row.credits}))};

test('allocation graphics account for the whole proposed degree without reporting completion or changing academic units',()=>{
 const html=renderCreditMix({outside:83,college:37,total:120,school:'Liberty University'});
 assert.match(html,/83 credits from outside courses and 37 credits at Liberty University; 120 total planned credits/);
 assert.match(html,/role="img"/);assert.doesNotMatch(html,/role="progressbar"|aria-valuenow/);
 assert.throws(()=>renderCreditMix({outside:83,college:38,total:120,school:'Liberty'}));
 assert.throws(()=>renderCreditMix({outside:-3,college:123,total:120,school:'Liberty'}));
 assert.throws(()=>renderCreditMix({outside:83,college:37,total:120,school:'Liberty',unit:'unknown'}));
 const wguEntry=registry.models.find(entry=>entry.id==='curriculum-wgu-catalog-ecceaa488637ac83');
 const wgu=Object.values(baselines.baselines).find(item=>item.modelId===wguEntry.id).summary;
 const units=renderCreditMix({outside:wgu.transferCredits,college:wgu.universityCredits,total:wgu.totalCredits,school:wguEntry.school,unit:wguEntry.creditUnit});
 assert.match(units,/total planned competency units/);assert.doesNotMatch(units,/total planned credits/);
});

test('school previews only open complete publication-ready source plans and preserve the exact route and unit',()=>{
 const expected=quality.programs.filter(item=>item.publication?.ready===true&&item.research.status==='research-ready'&&registry.models.some(entry=>entry.id===item.modelId&&entry.readyTemplate));
 let shown=0;
 for(const school of new Set(registry.models.map(entry=>entry.school))){
  const html=renderSchoolPlanCards({school,entries:registry.models,baselines,quality});
  const links=[...html.matchAll(/href="([^\"]*usePlan=[^\"]+)"/g)];shown+=links.length;
  for(const [,href] of links){const id=new URL(href,'https://degreesteps.com').searchParams.get('usePlan');const source=Object.values(baselines.baselines).find(item=>item.pathwayId===id);assert(source?.validation.academicCountsValid);assert(expected.some(item=>item.modelId===source.modelId));}
 }
 assert.equal(shown,expected.length);
 const withoutEvidence={...quality,programs:quality.programs.map(item=>({...item,research:{...item.research,status:'needs-research'}}))};
 assert.equal(renderSchoolPlanCards({school:'Liberty University',entries:registry.models,baselines,quality:withoutEvidence}),'');
 const gcu=renderSchoolPlanCards({school:'Grand Canyon University',entries:registry.models,baselines,quality});
 assert.equal(gcu,'','A structurally complete but unpublished program does not become a student template');
 const heldPublication={...quality,programs:quality.programs.map(item=>({...item,publication:{...item.publication,ready:false}}))};
 assert.equal(renderSchoolPlanCards({school:'Liberty University',entries:registry.models,baselines,quality:heldPublication}),'','Research-ready alone must not bypass publication checks');
});

test('the visual student journey uses real course rows and leaves source records untouched',()=>{
 const before=JSON.stringify(example),html=renderStudentJourney(example);
 assert.equal((html.match(/class="student-journey-copy"/g)||[]).length,3);
 for(const row of example.displayRows){assert(html.includes(row.code));assert(html.includes(row.provider));}
 assert.match(html,/href="\/portal.html\?usePlan=liberty-business-residential"/);
 assert.match(html,/scope="col"/);assert.match(html,/scope="row"/);
 assert.doesNotMatch(html,/<input|<button|role="progressbar"/);
 assert.equal(JSON.stringify(example),before);assert.throws(()=>renderStudentJourney({...example,displayRows:[]}));
});

test('new prominent ASU and graduate actions retain the promised student context',()=>{
 const sources=read('dist/data/credit-sources.json').sources;
 const asu=sourceAction(sources.find(source=>source.id==='asu-ulc'));
 const provider=new URL(asu.href,'https://degreesteps.com').searchParams.get('provider');
 const courses=[...read('dist/data/course-catalog.json').courses,...read('dist/data/curriculum-course-index.json').courses];
 assert(courses.some(course=>course.provider===provider||course.providerId===provider));
 const graduate=read('content/public-content.json').articles.find(article=>article.slug==='graduate-acceleration-is-different');
 assert.equal(graduate.cta.href,'/request-plan.html');
 const graduatePreview=renderArticleStart(graduate,graduate.cta,example);
 assert.match(graduatePreview,/href="\/request-plan.html"/);assert.doesNotMatch(graduatePreview,/student-credit-track/);
 const military=renderArticleStart({slug:'military-credit-jst-ccaf'},{label:'Add my military learning',href:'/import-courses.html',description:'Bring your service records.'},example);
 assert.match(military,/href="\/import-courses.html"/);assert.match(military,/student-record-flow/);assert.doesNotMatch(military,/83 credits/);
});

test('generated school and provider pages never send a known context into a falsely empty course filter',()=>{
 const asu=readFileSync(new URL('../dist/credit-sources/asu-ulc/index.html',import.meta.url),'utf8');
 assert.match(asu,/courses\.html\?provider=ASU%20Universal%20Learner/);
 const noCourses=readFileSync(new URL('../dist/credit-sources/coopersmith/index.html',import.meta.url),'utf8');
 assert.doesNotMatch(noCourses,/href="\/courses\.html\?provider=Coopersmith"/);assert.match(noCourses,/href="\/portal.html"/);
 const south=readFileSync(new URL('../dist/schools/south-college/index.html',import.meta.url),'utf8');
 assert.match(south,/href="\/request-plan\.html\?school=South%20College"/);
 assert.doesNotMatch(south,/href="\/programs\.html\?school=South%20College"/);
 const liberty=readFileSync(new URL('../dist/schools/liberty-university/index.html',import.meta.url),'utf8');
 assert.match(liberty,/usePlan=liberty-business-residential/);
});

test('an unpublished school route keeps an informational next step instead of advertising a ready template',()=>{
 const html=readFileSync(new URL('../dist/schools/grand-canyon-university/index.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/usePlan=gcu-bsba-campus|Build my GCU business plan/);
 assert.match(html,/href="\/request-plan\.html\?school=Grand%20Canyon%20University"/);
 assert.match(html,/Official &amp; supporting sources|Official & supporting sources/);
});
