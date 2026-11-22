(function(){
 'use strict';
 const $=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const events=['landing_view','plan_previewed','course_saved','plan_started','account_plan_saved','first_task_completed'];
 const labels={landing_view:'Public page views',plan_previewed:'Degree plan previews',course_saved:'Course-save actions',plan_started:'Plans started',account_plan_saved:'Private account saves',first_task_completed:'First task completions'};
 const contexts={home:'Home',article:'Articles and resources',provider:'Credit providers',school:'Schools','degree-plan':'Public degree plans',transfer:'Transfer course pages',workspace:'Student workspace'};
 let revision=0;
 const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;
 function render(data){
  if(!data||!Array.isArray(data.events)||!Array.isArray(data.rows)||data.methodology?.uniquePeopleMeasured!==false||data.methodology?.privateRecordsIncluded!==false)throw Error('The activity report could not be read.');
  $('growth-totals').innerHTML=events.map(event=>'<article class="growth-total"><h2>'+esc(labels[event])+'</h2><strong>'+count(data.events.find(row=>row.event===event)?.count).toLocaleString('en-US')+'</strong></article>').join('');
  const daily=new Map(),category=new Map();
  for(const row of data.rows){if(!events.includes(row.event)||!Object.hasOwn(contexts,row.context)||!/^\d{4}-\d{2}-\d{2}$/.test(row.day))continue;const day=daily.get(row.day)||Object.fromEntries(events.map(event=>[event,0]));day[row.event]+=count(row.count);daily.set(row.day,day);category.set(row.context,(category.get(row.context)||0)+count(row.count));}
  $('growth-period').textContent=data.period.start+' through '+data.period.end+' (UTC).';
  $('growth-daily').innerHTML=daily.size?[...daily].sort(([a],[b])=>b.localeCompare(a)).map(([day,counts])=>'<tr><th scope="row">'+esc(day)+'</th>'+events.map(event=>'<td>'+counts[event].toLocaleString('en-US')+'</td>').join('')+'</tr>').join(''):'<tr><td colspan="7">No events were recorded in this date range.</td></tr>';
  $('growth-contexts').innerHTML=Object.entries(contexts).map(([id,label])=>'<tr><th scope="row">'+esc(label)+'</th><td>'+(category.get(id)||0).toLocaleString('en-US')+'</td></tr>').join('');
  $('growth-report').hidden=false;$('growth-gate').hidden=true;$('growth-status').textContent='Activity report updated.';
 }
 async function load(){
  const request=++revision;$('growth-status').textContent='Opening aggregate activity…';$('growth-report').hidden=true;$('growth-gate').hidden=true;
  try{const response=await fetch('/api/admin/growth-summary?days='+encodeURIComponent($('growth-days').value),{credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json'}});if(request!==revision)return;
   if(!response.ok){const error=new Error(response.status===401?'Sign in to view aggregate activity.':response.status===403?'Only a DegreeSteps owner can open this report.':'Aggregate activity is temporarily unavailable. Try refreshing.');error.status=response.status;throw error;}
   const data=await response.json();if(request!==revision)return;render(data);
  }catch(error){if(request!==revision)return;$('growth-gate').hidden=false;$('growth-gate-title').textContent=error.status===401?'Sign in to view activity.':error.status===403?'Owner access is required.':'We could not open activity.';$('growth-gate-copy').textContent=error.message;$('growth-sign-in').hidden=error.status!==401;$('growth-status').textContent='';}
 }
 $('growth-range-form').addEventListener('submit',event=>{event.preventDefault();load();});load();
}());
