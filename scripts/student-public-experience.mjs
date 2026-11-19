/** Student-facing examples use reviewed course plans, never invented student progress. */
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(value);

export function renderCreditMix({outside,college,total,school,unit='semester',label='Proposed course plan'}){
 if(!['semester','quarter','competency-unit'].includes(unit))throw Error('A credit visual needs its reviewed academic unit.');
 const units=unit==='competency-unit'?'competency units':unit==='quarter'?'quarter credits':'credits';
 if(![outside,college,total].every(value=>Number.isFinite(value)&&value>=0)||total<=0||Math.abs(outside+college-total)>.001)throw Error('A student credit visual needs an exact complete plan.');
 const percent=100*outside/total;
 return '<div class="student-credit-mix"><p class="student-visual-caption">'+esc(label)+'</p><div class="student-credit-track" role="img" aria-label="'+esc(number(outside)+' '+units+' from outside courses and '+number(college)+' '+units+' at '+school+'; '+number(total)+' total planned '+units+'. This is not completed coursework.')+'"><span class="student-credit-outside" style="width:'+percent+'%"></span><span class="student-credit-college" style="width:'+(100-percent)+'%"></span></div><div class="student-credit-labels"><span><i aria-hidden="true"></i><strong>'+number(outside)+'</strong> outside '+units+'</span><span><i aria-hidden="true"></i><strong>'+number(college)+'</strong> at '+esc(school)+'</span><span><strong>'+number(total)+'</strong> total</span></div></div>';
}

export function renderStudentJourney(example){
 const rows=example?.displayRows;
 if(!Array.isArray(rows)||rows.length<3||rows.some(row=>!row.code||!row.provider||!Number.isFinite(row.credits)))throw Error('The how-it-works example needs actual reviewed course rows.');
 return '<section class="site-container student-journey" aria-label="From your goal to your degree plan"><ol class="student-journey-list">'+
 '<li><div class="student-journey-copy"><h2>Tell us what you want.</h2><p>Choose your degree, or let us help you find one. Set your priorities: cost, speed and where you want to study.</p></div><div class="student-goal-example" aria-label="Example student preferences"><span class="student-visual-caption">For example</span><strong>A business degree</strong><div><span>On campus</span><span>Lower cost</span></div><p>Already have courses? Add them whenever you’re ready.</p></div></li>'+
 '<li><div class="student-journey-copy"><h2>See the courses that get you there.</h2><p>Your plan shows what to take, where to take it and how it fits your degree. Compare eligible lower-cost options in one worksheet.</p></div><div class="student-worksheet-example"><div class="student-example-heading"><strong>'+esc(example.school)+'</strong><span>Business · On campus</span></div><div class="student-example-table" tabindex="0" role="region" aria-label="Courses from the researched Liberty business example"><table><thead><tr><th scope="col">Course</th><th scope="col">Take it with</th><th scope="col">Credits</th></tr></thead><tbody>'+rows.slice(0,3).map(row=>'<tr><th scope="row">'+esc(row.code)+'</th><td>'+esc(row.provider)+'</td><td>'+number(row.credits)+'</td></tr>').join('')+'</tbody></table></div>'+renderCreditMix({outside:example.choices.sophia.outside,college:example.choices.sophia.university,total:example.total,school:example.school})+'</div></li>'+
 '<li><div class="student-journey-copy"><h2>Save your plan. Take the next step.</h2><p>Sign in to save your plan to your account. Keep your courses, progress and next steps together as your goals change.</p></div><div class="student-next-example"><span class="student-visual-caption">Your plan keeps you moving</span><ul><li><span aria-hidden="true"></span>Add any courses you already took</li><li><span aria-hidden="true"></span>Choose your next course</li><li><span aria-hidden="true"></span>Track it from started to finished</li></ul><a href="'+esc(example.planUrl)+'">Open this example plan</a></div></li></ol><p class="student-example-note">Course examples come from our researched Liberty business plan. These are planned credits; your college makes the final decisions about your own transfer awards.</p></section>';
}

export function renderSchoolPlanCards({school,entries,baselines,quality}){
 const ready=new Map((quality.programs||[]).filter(item=>item.research?.status==='research-ready').map(item=>[item.modelId,item]));
 const cards=(entries||[]).filter(entry=>entry.school===school&&entry.readyTemplate===true&&ready.has(entry.id)).flatMap(entry=>{
  const baseline=Object.values(baselines.baselines||{}).find(item=>item.modelId===entry.id&&item.validation?.academicCountsValid===true);
  if(!baseline||baseline.summary?.transferCredits+baseline.summary?.universityCredits!==baseline.summary?.totalCredits)return [];
  const s=baseline.summary,mode=baseline.modality==='campus'?'On campus':'Online',href='/portal.html?usePlan='+encodeURIComponent(baseline.pathwayId);
  return ['<article class="student-school-plan"><div><span>'+mode+'</span><h3>'+esc(entry.title)+'</h3></div>'+renderCreditMix({outside:s.transferCredits,college:s.universityCredits,total:s.totalCredits,school,unit:entry.creditUnit,label:'Course-by-course plan'})+'<a class="site-button" href="'+esc(href)+'">Build this plan</a></article>'];
 });
 return cards.length?'<section class="site-container student-school-plans" aria-labelledby="student-school-plans-title"><header><h2 id="student-school-plans-title">Start with a researched plan.</h2><p>See the courses first. Then make the plan your own.</p></header><div>'+cards.join('')+'</div></section>':'';
}

export function renderProviderFacts(source){
 return '<section class="site-container student-provider-facts" aria-label="'+esc(source.name)+' at a glance"><dl>'+[
  ['Study format',source.pace],['Pricing',source.priceNote],['Assessments',source.assessmentNote],['Credit type',source.creditBasis]
 ].filter(([,value])=>value).map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+esc(value)+'</dd></div>').join('')+'</dl></section>';
}

export function providerIntroduction(source){
 const introductions={
  sophia:'Take self-paced courses with a monthly membership. See which ones fit your degree before you enroll.',
  'study-com':'Explore self-paced general education and upper-level courses. Your degree plan shows which course options fit.',
  straighterline:'Explore self-paced courses, including business, science and lab options. Compare the course experience and pricing below.',
  clep:'Use an exam to demonstrate what you already know. Participating colleges decide which degree requirements it can cover.',
  'asu-ulc':'Take online Arizona State University courses without joining an ASU degree program. Eligible courses can become university-issued credit.',
  'military-jst':'Bring your military training into the picture. Start with your service records and see where that learning could fit.'
 };
 return introductions[source.id]||String(source.summary||'').replace(/^Current offer\.\s*/,'');
}

export function renderArticleStart(article,action,example){
 const transferExamples=new Set(['how-transfer-credit-works','compare-transfer-credit-sources','transfer-credit-for-campus-degrees','three-years-transferred-one-year-on-campus','sophia-study-com-straighterline-which-first','college-wont-accept-sophia-university-credit-options']);
 if(transferExamples.has(article.slug))return '<aside class="student-article-start"><div><h2>See what this looks like in a degree plan.</h2><p>One researched Liberty business route combines outside courses with the classes you finish at Liberty.</p>'+renderCreditMix({outside:example.choices.sophia.outside,college:example.choices.sophia.university,total:example.total,school:example.school})+'<p class="student-example-note">A proposed campus example. Other schools and degrees have different rules.</p></div><a class="site-button" href="'+esc(action.href)+'">'+esc(action.label)+'</a></aside>';
 const records=['organize-transcripts-and-credits','military-credit-jst-ccaf'].includes(article.slug);
 return '<aside class="student-article-action"><div><strong>'+(records?'Your courses can be the starting point.':'Put this guide to work.')+'</strong><p>'+esc(action.description)+'</p>'+(records?'<ol class="student-record-flow"><li>Upload records</li><li>Review your courses</li><li>See degree matches</li></ol>':'')+'</div><a class="site-button" href="'+esc(action.href)+'">'+esc(action.label)+'</a></aside>';
}
