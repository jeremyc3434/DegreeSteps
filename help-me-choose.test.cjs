/* Help me choose is one flow from every entry point: the 1-minute quiz, then the portal questions as an optional continuation. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=path=>fs.readFileSync(path,'utf8');
test('every Help me choose entry opens the same quiz, with the same three-path wording',()=>{
 const start=read('dist/start.html'),portal=read('dist/portal.js'),programs=read('dist/programs.html');
 assert.match(start,/id="start-quiz-link" href="start\.html\?step=quiz"/);
 assert.match(start,/<strong>Help me choose<\/strong><small>Answer 5 quick questions\.<\/small>/);
 assert.match(portal,/\['explore','Help me choose','Answer 5 quick questions\.'\]/);
 assert.match(portal,/const HELP_ME_CHOOSE='start\.html\?step=quiz'/);
 assert.match(portal,/if\(id==='start'&&value==='explore'\)\{location\.assign\(HELP_ME_CHOOSE\);return;\}/);
 assert.match(programs,/href="start\.html\?step=quiz"[^>]*>Help me choose</);
 for(const label of ['Find a degree','Use my courses','Help me choose']){assert(start.includes('<strong>'+label+'</strong>'),label);assert(portal.includes("'"+label+"'"),'portal: '+label);}
});
test('the quiz results offer the deeper questions as an optional next step that carries the quiz answers',()=>{
 const start=read('dist/start.html'),js=read('dist/start.js'),portal=read('dist/portal.js');
 assert.match(start,/<section id="start-quiz-more"[^>]*hidden>/,'hidden unless the page came from the quiz');
 assert.match(start,/is optional/);
 assert.match(js,/new URLSearchParams\(\{view:'preferences',from:'quiz'\}\)/);
 for(const key of ['subject','level','format'])assert(js.includes("'"+key+"'"));
 assert.match(js,/more\.set\('purpose',quizIntent\.purpose\)/);assert.match(js,/more\.set\('priority',quizIntent\.priority\)/);
 assert.match(portal,/params\.get\('view'\)==='preferences'&&params\.get\('from'\)==='quiz'/);
 // Every portal question stays in the continuation.
 assert.match(portal,/const profileStepIds=\['purpose','prior','format','priority'\]/);
});
test('opening the quiz counts guided_quiz_started; starting the deeper questions keeps guided_started',()=>{
 const js=read('dist/start.js'),portal=read('dist/portal.js'),admin=read('dist/admin-growth.js');
 assert.match(js,/if\(step==='quiz'\)\{try\{window\.dispatchEvent\(new CustomEvent\('DegreeSteps:growth',\{detail:\{event:'guided_quiz_started',context:'workspace'\}\}\)\);/);
 assert.match(portal,/function startQuizContinuation[\s\S]*?trackGrowth\('guided_started'\)/);
 assert.doesNotMatch(portal,/location\.assign\(HELP_ME_CHOOSE\)[^\n]*trackGrowth|trackGrowth\([^)]*\);location\.assign\(HELP_ME_CHOOSE\)/,'the portal click is not double-counted');
 assert.match(admin,/\['guided_quiz_started','Help me choose quiz opened'\]/);assert.match(admin,/\['guided_started','Guided planner started'\]/);
});
