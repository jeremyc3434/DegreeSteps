/* Shared display of remaining-course assessment evidence. This module never changes a plan. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DegreeCourseAssessmentView=api;}(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const statuses=['unmonitored','monitored','restricted','unknown'];
 const statusLabel={unmonitored:'No monitored exams',monitored:'Monitored exams',restricted:'Screen sharing or browser restrictions',unknown:'Monitoring not classified'};
 const list=value=>Array.isArray(value)?value:[];
 const date=value=>typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
 const text=value=>typeof value==='string'?value.trim():'';
 const https=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}};
 function sourcesFor(value){
  const seen=new Set();return list(value).flatMap(source=>{const url=https(source?.url);if(!url||!text(source?.title)||!date(source?.checkedOn)||seen.has(url))return [];seen.add(url);return [{id:text(source.id),url,title:text(source.title),checkedOn:source.checkedOn}];});
 }
 function coursesFor(summary){
  const seen=new Set();return list(summary?.courses).slice(0,1000).flatMap(course=>{
   if(!course||!text(course.key)||seen.has(course.key)||!text(course.provider)||!text(course.title))return [];
   seen.add(course.key);const sources=sourcesFor(course.sources),supplied=statuses.includes(course.status)?course.status:'unknown',status=supplied!=='unknown'&&!sources.length?'unknown':supplied;
   return [{key:course.key,provider:text(course.provider),code:text(course.code),title:text(course.title),university:course.university===true,status,label:sources.length?text(course.label):'',detail:sources.length?text(course.detail):'',sources}];
  });
 }
 function counts(courses){return courses.reduce((value,course)=>{value.total++;value[course.status]++;return value;},{total:0,unmonitored:0,monitored:0,restricted:0,unknown:0});}
 function countText(value){
  if(!value.total)return 'No outside courses remaining';
  const parts=[];if(value.unmonitored)parts.push(value.unmonitored+' without monitored exams');if(value.monitored)parts.push(value.monitored+' monitored');if(value.restricted)parts.push(value.restricted+' with screen or browser restrictions');if(value.unknown)parts.push(value.unknown+' not classified');return parts.join(' · ');
 }
 function sourceHTML(source){return '<a href="'+esc(source.url)+'" target="_blank" rel="noopener noreferrer" data-assessment-source="'+esc(source.id)+'" data-source-checked="'+esc(source.checkedOn)+'">'+esc(source.title)+'</a><span class="course-assessment-reviewed">Reviewed '+esc(source.checkedOn)+'</span>';}
 function factHTML(fact){
  if(!fact||typeof fact!=='object')return '';
  const sources=sourcesFor(fact.sources),status=statuses.includes(fact.status)&&fact.status!=='unknown'&&sources.length?fact.status:'unknown';
  const label=sources.length&&text(fact.label)?text(fact.label):statusLabel[status],detail=sources.length?text(fact.detail):'';
  if(status==='unknown'&&!sources.length)return '<p class="course-assessment-fact" data-course-assessment="unknown">Assessment format not classified in DegreeSteps.</p>';
  return '<div class="course-assessment-fact" data-course-assessment="'+status+'"><strong>'+esc(label)+'</strong>'+(status==='unknown'?'<span class="course-assessment-status">'+statusLabel.unknown+'</span>':'')+(detail?'<p>'+esc(detail)+'</p>':'')+'<ul class="course-assessment-sources">'+sources.map(source=>'<li>'+sourceHTML(source)+'</li>').join('')+'</ul></div>';
 }
 function groupedHTML(courses){
  const groups=new Map();for(const course of courses){const key=JSON.stringify([course.provider,course.status,course.label,course.detail,course.sources.map(source=>source.url)]);if(!groups.has(key))groups.set(key,{...course,courses:[]});groups.get(key).courses.push(course);}
  return '<ul class="course-assessment-groups">'+[...groups.values()].map(group=>'<li data-assessment-group="'+esc(group.status)+'"><div class="course-assessment-group-heading"><strong>'+esc(group.provider)+'</strong><span>'+group.courses.length+' course'+(group.courses.length===1?'':'s')+'</span></div><p class="course-assessment-status">'+esc(statusLabel[group.status])+'</p>'+(group.detail?'<p>'+esc(group.detail)+'</p>':group.label&&group.status==='unknown'?'<p>'+esc(group.label)+'</p>':'')+'<details class="course-assessment-course-list"><summary>See '+group.courses.length+' course'+(group.courses.length===1?'':'s')+'</summary><ul>'+group.courses.map(course=>'<li>'+esc([course.code,course.title].filter(Boolean).join(' · '))+'</li>').join('')+'</ul></details>'+(group.sources.length?'<ul class="course-assessment-sources">'+group.sources.map(source=>'<li>'+sourceHTML(source)+'</li>').join('')+'</ul>':'')+'</li>').join('')+'</ul>';
 }
 function render(summary,options={}){
  const courses=coursesFor(summary);if(!courses.length)return '';
  const outside=courses.filter(course=>!course.university),university=courses.filter(course=>course.university),outsideCounts=counts(outside),universityCounts=counts(university);
  const universityKnown=university.filter(course=>course.status!=='unknown'||course.sources.length);
  return '<details class="course-assessments'+(options.compact?' course-assessments-compact':'')+'" data-course-assessments><summary><span class="course-assessment-title">Exam formats</span><span class="course-assessment-headline" data-assessment-outside-summary>'+esc(countText(outsideCounts))+'</span></summary><div class="course-assessment-content"><section aria-label="Outside-course assessment formats"><h3>Outside courses</h3><p>'+esc(outside.length?'Current policies for the remaining outside courses in this plan.':'No outside courses remain in this plan.')+'</p>'+groupedHTML(outside)+'</section>'+(university.length?'<section aria-label="University assessment formats"><h3>At the university</h3><p data-assessment-university-summary>'+universityCounts.total+' remaining course requirement'+(universityCounts.total===1?'':'s')+'. Outside-course labels do not describe university assessments.</p>'+(universityCounts.unknown?'<p>'+universityCounts.unknown+' university assessment format'+(universityCounts.unknown===1?' is':'s are')+' not classified in DegreeSteps.</p>':'')+(universityKnown.length?groupedHTML(universityKnown):'')+'</section>':'')+'</div></details>';
 }
 return Object.freeze({render,factHTML,coursesFor,counts});
}));
