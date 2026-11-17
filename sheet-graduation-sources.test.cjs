/* Actual worksheet closure rendering; all scenarios are synthetic and make no network calls. */
const test=require('node:test'),assert=require('node:assert/strict');
const {worksheet}=require('./test-support/student-flow-harness.cjs'),{loadData}=require('./scripts/audit-student-confirmations.cjs'),Journey=require('./dist/journey-engine.js');
const data=loadData(),route=data.catalog.pathways.find(route=>route.id==='liberty-business-residential');
function fixture(){const state=Journey.selectRoute(Journey.initialize(null,null,data.catalog),route,data.catalog);state.journey.completed=true;return worksheet(state,data);}

test('published detail and plural source references stay visible in the actual worksheet',()=>{
 const ui=fixture(),program=ui.draft().program,grade=program.graduationRequirements.find(item=>item.id==='major-minimum-grade');
 assert(grade?.detail);assert(Array.isArray(grade.sourceIds));
 const html=ui.graduation('at least c');assert.match(html,/at least C in upper-level courses in the major/i);
 for(const id of grade.sourceIds){const source=program.sources.find(source=>source.id===id);assert(source);assert(html.includes('href="'+source.url.replaceAll('&','&amp;')+'"'));}
 assert.equal(ui.writes.length,0,'Reading the condition must not change student records');
});

test('legacy description and singular source references still render without duplicate links',()=>{
 const ui=fixture(),program=ui.draft().program;program.sources=[{id:'catalog',url:'https://catalog.synthetic.invalid/policy?x=1&y=2'}];program.graduationRequirements=[{title:'Graduation application',description:'File the graduation application.',sourceId:'catalog',sourceIds:['catalog','catalog']}];
 const html=ui.graduation('graduation application');assert.match(html,/File the graduation application\./);assert.equal((html.match(/View requirement/g)||[]).length,1);assert(html.includes('https://catalog.synthetic.invalid/policy?x=1&amp;y=2'));assert.equal(ui.graduation('', 'completed'),'');assert.equal(ui.writes.length,0);
});

test('condition text is escaped and invalid or unknown sources never become links',()=>{
 const ui=fixture(),program=ui.draft().program;program.sources=[{id:'bad',url:'javascript:alert(1)'}];program.graduationRequirements=[{title:'<img src=x onerror=alert(1)>',detail:'A <script> is text & must remain visible.',sourceIds:['bad','missing']}];
 const html=ui.graduation('script');assert.match(html,/&lt;script&gt; is text &amp; must remain visible/);assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.doesNotMatch(html,/<script>|<img|javascript:|href=/);assert.equal(ui.graduation('unmatched condition'),'');assert.equal(ui.writes.length,0);
});
