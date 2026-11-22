/* Owner-only Growth panel on the management page. Reads the anonymous daily counters from
   /api/admin/growth-summary and shows plain counts for the last 7 and 28 days. No chart library. */
(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.DegreeAdminGrowth=api;}(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=value=>Number.isSafeInteger(value)&&value>=0?value:0;
  const format=value=>number(value).toLocaleString('en-US');
  const FUNNEL=[['landing_view','Landing (public page views)'],['plan_previewed','Plan previewed'],['plan_built','Plan built (worksheet opened from a plan)'],['account_plan_saved','Plan saved to account']];
  const TOOLS=[['finder_used','Plan finder used'],['guided_started','Guided planner started'],['guided_results','Guided planner showed results'],['credits_worth_used','Credits-worth ranking computed'],['transfer_page_view','Transfer course pages viewed']];
  const PROVIDERS=['Sophia','Study.com','StraighterLine','Saylor','CLEP','DSST','Christian Leaders Institute','other'];
  const EMAILS=[['open','Opened in an email app'],['copy','Copied']];
  const DAY=/^\d{4}-\d{2}-\d{2}$/;
  function shift(day,days){return new Date(Date.parse(day+'T00:00:00Z')-days*86400000).toISOString().slice(0,10);}
  /** Totals for each window. `end` is the report's last UTC day; a window of N days covers end-(N-1)..end. */
  function summarize(data,windows=[7,28]){
    if(!data||!Array.isArray(data.rows)||!DAY.test(data.period?.end||''))throw Error('The growth report could not be read.');
    return windows.map(days=>{
      const start=shift(data.period.end,days-1),events=new Map(),details=new Map();
      for(const row of data.rows){
        if(!row||typeof row.event!=='string'||!DAY.test(row.day||'')||row.day<start||row.day>data.period.end)continue;
        const count=number(row.count);events.set(row.event,(events.get(row.event)||0)+count);
        if(row.detail)details.set(row.event+'|'+row.detail,(details.get(row.event+'|'+row.detail)||0)+count);
      }
      return{days,start,end:data.period.end,event:name=>events.get(name)||0,detail:(name,value)=>details.get(name+'|'+value)||0};
    });
  }
  /** Step-to-step ratio of event counts, as a whole percent. These are counts of actions, not unique people. */
  function percent(count,previous){return previous>0?Math.round(count/previous*100)+'%':'—';}
  function table(caption,head,rows){
    return '<div class="admin-growth-scroll" role="region" tabindex="0" aria-label="'+esc(caption)+'"><table class="admin-growth-table"><caption>'+esc(caption)+'</caption><thead><tr>'+head.map((cell,i)=>'<th scope="col"'+(i?' class="admin-growth-num"':'')+'>'+esc(cell)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr><th scope="row">'+esc(row[0])+'</th>'+row.slice(1).map(cell=>'<td class="admin-growth-num">'+esc(cell)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
  }
  function html(data){
    const [week,month]=summarize(data),head=['','Last 7 days','Last 28 days'],counts=(label,read)=>[label,format(read(week)),format(read(month))];
    const funnel=FUNNEL.map(([name,label],i)=>{
      const prior=i?FUNNEL[i-1][0]:null;
      return[label,format(week.event(name)),prior?percent(week.event(name),week.event(prior)):'',format(month.event(name)),prior?percent(month.event(name),month.event(prior)):''];
    });
    return '<p class="admin-growth-period">'+esc(week.start)+' to '+esc(week.end)+' and '+esc(month.start)+' to '+esc(month.end)+' (UTC).</p>'+
      '<dl class="admin-growth-visits"><div><dt>Visits, last 7 days</dt><dd>'+format(week.event('landing_view'))+'</dd></div><div><dt>Visits, last 28 days</dt><dd>'+format(month.event('landing_view'))+'</dd></div></dl>'+
      table('Funnel: each step as a share of the step before',['Step','Last 7 days','% of previous step','Last 28 days','% of previous step'],funnel)+
      table('Tool use',head,TOOLS.map(([name,label])=>counts(label,window=>window.event(name))))+
      table('Course provider link clicks',head,[...PROVIDERS.map(provider=>counts(provider==='other'?'Other providers':provider,window=>window.detail('provider_click',provider))),counts('All providers',window=>window.event('provider_click'))])+
      table('Emails to schools',head,EMAILS.map(([action,label])=>counts(label,window=>window.detail('school_email',action))))+
      '<p class="admin-growth-note">Visits are public page views. Each count is an anonymous daily total of actions, not unique people, and the same action is counted at most once per page. Percentages compare event counts between steps, so they are directional, not conversion rates. Visitors with browser privacy signals or the measurement setting turned off are not counted.</p>';
  }
  let revision=0;
  async function load(){
    const doc=root.document,section=doc?.getElementById('admin-growth'),body=doc?.getElementById('admin-growth-body'),status=doc?.getElementById('admin-growth-status');
    if(!section||!body||!status||typeof root.fetch!=='function')return false;
    const request=++revision;section.hidden=false;status.textContent='Loading growth totals…';
    try{
      const response=await root.fetch('/api/admin/growth-summary?days=28',{credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json'}});
      if(request!==revision)return false;
      if(!response.ok){if(response.status===401||response.status===403){section.hidden=true;return false;}throw Error('Growth totals are temporarily unavailable. Try again later.');}
      const data=await response.json();if(request!==revision)return false;
      body.innerHTML=html(data);status.textContent='';return true;
    }catch(error){if(request===revision){body.innerHTML='';status.textContent=error?.message&&/temporarily|could not/.test(error.message)?error.message:'Growth totals are temporarily unavailable. Try again later.';}return false;}
  }
  return Object.freeze({summarize,percent,html,load});
}));
