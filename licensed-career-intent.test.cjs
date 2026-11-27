/* Help me choose keeps a licensed-career answer: researched plans for that career only, never general degrees as substitutes. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Journey=require('./dist/journey-engine.js'),Sheet=require('./dist/sheet-state.js'),Guide=require('./dist/guide-engine.js'),Catalog=require('./dist/program-catalog.js');
const library=require('./dist/data/plan-library-index.json');
const registry=require('./dist/data/curriculum-registry.json');
const catalog=Catalog.attachRegistry(Catalog.merge(require('./dist/data/pathways.json'),require('./dist/data/program-catalog.json')),registry);
const plain=value=>JSON.parse(JSON.stringify(value));
function environment(search=''){
 const elements=new Map(),events={};
 const element=id=>{if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',hidden:false,value:'',checked:false,addEventListener(){},setAttribute(){},removeAttribute(){},closest(){return null;},querySelectorAll(){return[];},querySelector(){return {outerHTML:'<legend>Filter</legend>'};},focus(){}});return elements.get(id);};
 const location={search,pathname:'/portal.html',assigned:'',assign(value){this.assigned=value;}};
 const document={getElementById:element,addEventListener(name,callback){events[name]=callback;},querySelector(){return null;},body:{},activeElement:null};
 const window={document,location,DegreeJourney:Journey,DegreeSheet:Sheet,DegreeGuide:Guide,DegreeProgramOpportunities:require('./dist/program-opportunities.js'),addEventListener(){},scrollTo(){}};
 const context={window,document,location,URLSearchParams,URL,console,Intl,Map,Set,WeakMap,CSS:{escape:value=>value},history:{replaceState(_a,_b,value){location.assigned=value;}},localStorage:{getItem(){return null;},setItem(){}},DegreeProgramCatalog:Catalog,DegreeGuide:Guide,fetch:async()=>{throw Error('No network in this test');}};
 return {context,elements,events,location};
}
function start(search=''){
 const env=environment(search),source=fs.readFileSync('dist/start.js','utf8');
 const exposed='globalThis.frontDoor={setIndex:value=>index=value,setRows:value=>rows=value,filters,answers,sorted,card,openCredits,finishQuiz,planUrl,creditsUrl,syncUrl,renderDegree,renderQuiz,quizItem,goTo:value=>quizAt=value};';
 vm.runInNewContext(source.replace('(async()=>{try{',exposed+'\n(async()=>{try{'),env.context);
 env.api=env.context.frontDoor;env.api.setIndex(library);return env;
}

const general=catalog.pathways.filter(item=>item.modelId&&!(item.goals||[]).some(goal=>['teacher','lawyer','pilot','health-professional'].includes(goal))).slice(0,6);

test('the quiz asks which licensed career instead of a subject, using the deeper questions\' names',()=>{
 const env=start('?step=quiz');env.api.setRows(general);
 env.api.answers.purpose='licensed';env.api.goTo(2);env.api.renderQuiz();
 const html=env.elements.get('start-quiz-card').innerHTML;
 assert.match(html,/Which licensed career\?/);
 for(const label of ['Become a teacher','Prepare for law','Become a pilot','Enter a health profession'])assert(html.includes(label),label);
 assert.doesNotMatch(html,/Business &amp; management|Psychology/,'no subject list for a licensed career');
 assert.equal(env.elements.get('start-quiz-count').textContent,'Question 3 of 5','still five questions');
 // Any other goal keeps the subject question.
 const other=start('?step=quiz');other.api.setRows(general);other.api.answers.purpose='grow';other.api.goTo(2);other.api.renderQuiz();
 assert.match(other.elements.get('start-quiz-card').innerHTML,/What do you want to study\?/);
 // The first question names the same careers.
 const first=start('?step=quiz');first.api.goTo(0);first.api.renderQuiz();assert.match(first.elements.get('start-quiz-card').innerHTML,/A licensed career \(teacher, law, pilot, health\)/);
});

test('a licensed-career quiz ends on that career, carried to the results and the deeper questions',()=>{
 const env=start();Object.assign(env.api.answers,{purpose:'licensed',level:'bachelor',subject:'business',career:'teacher',format:'online',sort:'cost'});env.api.finishQuiz();
 const url=new URL(env.location.assigned,'https://degreesteps.test/');
 assert.equal(url.searchParams.get('purpose'),'licensed-career');assert.equal(url.searchParams.get('career'),'teacher');
 assert.equal(url.searchParams.get('subject'),null,'a stale subject answer is not used');
 const results=start(url.search);results.api.setRows(general);results.api.renderDegree();
 const more=new URL(results.elements.get('start-quiz-more-link').href,'https://degreesteps.test/');
 assert.equal(more.searchParams.get('purpose'),'licensed-career');assert.equal(more.searchParams.get('career'),'teacher');
});

test('with no plan researched for the career, the results are an honest note and a research request only',()=>{
 const env=start('?from=quiz&purpose=licensed-career&career=teacher&level=bachelor&priority=cost');env.api.setRows(general);env.api.renderDegree();
 const html=env.elements.get('start-results').innerHTML;
 assert.match(html,/We haven’t researched a plan for becoming a teacher yet\./);
 assert.match(html,/we don’t show general degrees as a substitute/);
 assert.match(html,/href="request-plan\.html">Request research for a program</);
 assert.doesNotMatch(html,/data-plan=/,'no general degree cards');
 assert.equal(env.elements.get('start-filters').hidden,true);assert.equal(env.elements.get('start-count').hidden,true);
 assert.equal(env.elements.get('start-quiz-more').hidden,true,'no "closer picks" promise when nothing is researched');assert.match(html,/Retake the quiz/);
 // Without a career (an older link), the student is asked to choose one; still no general degrees.
 const unknown=start('?from=quiz&purpose=licensed-career&level=bachelor');unknown.api.setRows(general);unknown.api.renderDegree();
 const ask=unknown.elements.get('start-results').innerHTML;assert.match(ask,/Which licensed career are you working toward\?/);assert.match(ask,/Retake the quiz/);assert.doesNotMatch(ask,/data-plan=|purpose=licensed-career/);
});

test('plans researched for the career are shown with the licensure caveat; general degrees still are not',()=>{
 const [first,...rest]=general,teacher={...first,goals:['teacher']};
 const env=start('?from=quiz&purpose=licensed-career&career=teacher&priority=cost');env.api.setRows([teacher,...rest]);env.api.renderDegree();
 const html=env.elements.get('start-results').innerHTML;
 assert.match(html,/Plans researched for becoming a teacher\./);assert.match(html,/licensing board/);
 assert.equal((html.match(/data-plan=/g)||[]).length,1);assert(html.includes('data-plan="'+teacher.id+'"'));
 assert.equal(env.elements.get('start-filters').hidden,false);assert.equal(env.elements.get('start-quiz-more').hidden,false);
 // Without a licensed answer, the same rows are all listed as before.
 const plain=start('?from=quiz&purpose=career-growth&priority=cost');plain.api.setRows([teacher,...rest]);plain.api.renderDegree();
 assert.doesNotMatch(plain.elements.get('start-results').innerHTML,/start-licensed/);
});
