/* Display contracts for sourced planning ranges; no browser or student records. */
const test=require('node:test'),assert=require('node:assert/strict');
const View=require('./dist/plan-estimate-view.js'),Estimate=require('./dist/plan-estimate-engine.js'),Planner=require('./dist/planner.js');
const program=require('./dist/data/liberty.json'),rates=require('./dist/data/plan-estimate-rates.json'),Sheet=require('./dist/sheet-state.js'),catalog=require('./dist/data/pathways.json');
const plan=Planner.generate(program,{providers:['Sophia','Study.com','CLEP'],allowConditional:true,priority:'transfer',completed:[]});
const estimate=Estimate.calculate({program,plan,rates});
const clone=value=>JSON.parse(JSON.stringify(value));

test('a researched estimate displays remaining instructional charges, separate study ranges and rate evidence',()=>{
 assert.equal(estimate.available,true);const html=View.render(estimate);
 assert.match(html,/Tuition, courses &amp; listed fees/);assert.match(html,/Published-price planning range · Before aid/);
 assert.match(html,/Outside coursework/);assert.match(html,/University coursework/);assert.match(html,/semesters/);
 assert.match(html,/Rates, pace assumptions &amp; exclusions/);assert.match(html,/Selected outside courses still to take/);
 for(const source of estimate.sources)assert(html.includes(source.url.replace(/&/g,'&amp;')));
 assert.match(html,/living costs are separate/);assert.match(html,/Study pace is an assumption/);
 const changed=clone(estimate);changed.timing.totalMonths={min:12345,max:98765};assert(!View.render(changed).includes('12345'));
 assert(!html.includes('role="progressbar"'));assert(!html.includes('guaranteed finish'));
});

test('the compact fallback reuses the existing cost action and never hides omitted provider prices',()=>{
 const partial=clone(estimate);partial.status='partial-range';partial.costs.providerBreakdown.push({provider:'StraighterLine',courses:1,months:{min:1,max:1},cost:null});partial.costs.missing.push('StraighterLine course prices are not included.');
 const full=View.render(partial),compact=View.render(partial,{compact:true});
 for(const html of [full,compact]){assert.match(html,/Known charges so far/);assert.match(html,/Some selected course prices are not included/);assert.doesNotMatch(html,/Tuition, courses &amp; listed fees/);}
 assert.match(full,/StraighterLine/);assert.match(full,/Not included/);assert.match(compact,/data-action="cost-time"/);assert(!compact.includes('<details'));
});

test('personal quotes and pace settings remain distinct from untouched scenario defaults',()=>{
 const route=catalog.pathways.find(route=>route.modelId===program.id),state=Sheet.selectPathway(Sheet.initialize(null,null,catalog),route),defaults=Sheet.scenario(state,program.id);
 assert.equal(View.hasPersonalAssumptions(defaults),false);
 for(const patch of [{universityRate:100},{fees:0},{outsideBudget:0},{unitsPerTerm:15},{sophiaMonths:2},{studyWeeks:1},{termCredits:12},{providerWeeks:{StraighterLine:2}},{providerQuotes:{Sophia:{amount:0}}}])assert.equal(View.hasPersonalAssumptions({...defaults,...patch}),true,JSON.stringify(patch));
 assert.equal(View.hasPersonalAssumptions({...defaults,fees:'',providerWeeks:{Sophia:null},providerQuotes:{}}),false);
});

test('unavailable or inconsistent money ranges cannot be presented as usable cost estimates',()=>{
 for(const edit of [value=>value.available=false,value=>value.costs.currency='EUR',value=>value.costs.complete=true,value=>value.costs.scope='full-attendance-cost',value=>value.costs.knownRange.min=-1,value=>value.costs.knownRange.max=Infinity,value=>value.costs.knownRange.max=value.costs.knownRange.min-1,value=>value.timing.outsideMonths.min=null]){
  const value=clone(estimate);edit(value);assert.equal(View.available(value),false);assert.equal(View.render(value),'');assert.equal(View.render(value,{compact:true}),'');
 }
});

test('provider details, assumptions and source titles are escaped and unsafe evidence links are omitted',()=>{
 const value=clone(estimate);value.costs.providerBreakdown[0].provider='<img onerror=alert(1)>';value.costs.missing.push('<script>not executable</script>');value.timing.assumptions.push('<svg onload=alert(1)>');value.sources=[{title:'<b>Original rate</b>',url:'https://example.edu/?a=1&b=2',checkedOn:'2026-11-19'},{title:'Unsafe',url:'javascript:alert(1)'},{title:'Password',url:'https://name:password@example.edu/'}];
 const before=JSON.stringify(value),html=View.render(value);
 assert.match(html,/&lt;img/);assert.match(html,/&lt;script/);assert.match(html,/&lt;svg/);assert.match(html,/&lt;b&gt;Original rate/);
 assert(!html.includes('<img'));assert(!html.includes('<script'));assert(!html.includes('javascript:'));assert(!html.includes('name:password'));assert.equal(JSON.stringify(value),before);
});
