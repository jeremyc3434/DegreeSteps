/* Owner-only lists of school contact requests and Plan review requests, next to the Growth panel.
   Each list loads only when its feature is on (the API answers 404 otherwise, and the list stays hidden).
   The CSV download is for the owner to forward by hand; nothing here sends details to anyone. */
(function(root,factory){'use strict';const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.DegreeAdminLeads=api;}(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const SHOWN=50;
  const LISTS=Object.freeze([
    {key:'inquiries',path:'/api/admin/school-inquiries',title:'School contact requests',empty:'No school contact requests yet.',columns:['created_at','school','plan_title','first_name','email','phone','location','start_timing','prior_credit']},
    {key:'reviews',path:'/api/admin/plan-review-requests',title:'Plan review requests',empty:'No Plan review requests yet.',columns:['created_at','name','email','plan_title','note','offer_price','offer_status']}
  ]);
  /** A readable table of the newest rows, with a CSV link for the full list (up to the API's limit). */
  function html(list,data){
    const labels=new Map((Array.isArray(data?.columns)?data.columns:[]).map(column=>[column.key,column.label]));
    const items=Array.isArray(data?.items)?data.items:[],shown=items.slice(0,SHOWN);
    const head=list.columns.map(key=>'<th scope="col">'+esc(labels.get(key)||key)+'</th>').join('');
    const body=shown.map(item=>'<tr>'+list.columns.map((key,i)=>(i?'<td>':'<th scope="row">')+esc(key==='created_at'?String(item[key]||'').replace('T',' ').slice(0,16):item[key])+(i?'</td>':'</th>')).join('')+'</tr>').join('');
    return '<div class="admin-leads-head"><h3>'+esc(list.title)+'</h3><a class="tw-button tw-secondary" href="'+list.path+'?format=csv" download>Download CSV</a></div>'+
      '<p class="admin-leads-count">'+esc(items.length)+' request'+(items.length===1?'':'s')+' in the last '+esc(data?.retentionDays||365)+' days'+(items.length>SHOWN?'; newest '+SHOWN+' shown':'')+'.</p>'+
      (shown.length?'<div class="admin-growth-scroll" role="region" tabindex="0" aria-label="'+esc(list.title)+'"><table class="admin-growth-table admin-leads-table"><thead><tr>'+head+'</tr></thead><tbody>'+body+'</tbody></table></div>':'<p>'+esc(list.empty)+'</p>');
  }
  async function loadList(list,doc){
    const node=doc.getElementById('admin-leads-'+list.key);if(!node)return false;
    try{
      const response=await root.fetch(list.path,{credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json'}});
      if(!response.ok){await response.text().catch(()=>'');node.hidden=true;node.innerHTML='';return false;}
      node.innerHTML=html(list,await response.json());node.hidden=false;return true;
    }catch{node.hidden=false;node.innerHTML='<p role="status">'+esc(list.title)+' are temporarily unavailable. Try again later.</p>';return true;}
  }
  async function load(){
    const doc=root.document,section=doc?.getElementById('admin-leads');if(!section||typeof root.fetch!=='function')return false;
    const shown=await Promise.all(LISTS.map(list=>loadList(list,doc)));
    section.hidden=!shown.some(Boolean);return !section.hidden;
  }
  return Object.freeze({html,load,LISTS});
}));
