/* A read-only route overview of the existing, fully allocated degree plan. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DegreePlanRoute=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const list=value=>Array.isArray(value)?value:[];
  const quantity=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=value=>new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(value);
  function build(draft,view){
    const program=draft?.program,plan=draft?.plan,totals=view?.totals;
    if(!program||!plan||!totals||!quantity(program.totalCredits)||program.totalCredits<=0)return {available:false,phases:[]};
    const names=['completed','transfer','universityRequired','universityReserved','unmapped'];
    if(names.some(name=>!quantity(totals[name]))||!quantity(totals.accounted))return {available:false,phases:[]};
    const sum=names.reduce((total,name)=>total+totals[name],0);
    if(Math.abs(sum-totals.accounted)>.001||Math.abs(sum-program.totalCredits)>.001)return {available:false,phases:[]};
    const confirmed=view.progress?.valid&&quantity(view.progress.confirmedCredits)?view.progress.confirmedCredits:0;
    const providers=[...new Set(list(view.groups?.transfer).map(entry=>entry.provider).filter(provider=>typeof provider==='string'&&provider&&provider!=='University'))];
    const providerDetail=providers.length?providers.slice(0,2).join(' · ')+(providers.length>2?' · more':''):'Eligible outside courses';
    const school=draft.pathway?.school||program.school||'Your university';
    const unit=program.creditSystem==='competency-unit'?'competency units':program.creditSystem==='quarter'?'quarter credits':'credits';
    const phases=[
      {id:'completed',label:'Finished coursework',value:totals.completed,detail:confirmed?number(confirmed)+' school confirmed':'School awards tracked separately'},
      {id:'outside',label:'Outside courses planned',value:totals.transfer,detail:providerDetail},
      {id:'university',label:'University courses planned',value:totals.universityRequired+totals.universityReserved,detail:school},
      {id:'degree',label:'Your degree',value:program.totalCredits,detail:'Each requirement counts once'}
    ];
    return {available:true,phases,unit,needsCourseCredits:totals.unmapped,confirmedCredits:confirmed};
  }
  function render(draft,view){
    const route=build(draft,view);if(!route.available)return '';
    const markers={completed:'✓',outside:'+',university:'•',degree:'◆'};
    return '<section class="plan-route" aria-label="Your proposed degree route"><ol class="plan-route-stops">'+route.phases.map(phase=>'<li class="plan-route-stop" data-phase="'+phase.id+'"><span class="plan-route-marker" aria-hidden="true">'+markers[phase.id]+'</span><span class="plan-route-label">'+esc(phase.label)+'</span><strong class="plan-route-value">'+esc(number(phase.value))+' <small>'+esc(route.unit)+'</small></strong><span class="plan-route-detail">'+esc(phase.detail)+'</span></li>').join('')+'</ol>'+(route.needsCourseCredits?'<p class="plan-route-note">'+esc(number(route.needsCourseCredits))+' '+esc(route.unit)+' still need a course. <button type="button" data-action="checks">Review requirements</button></p>':'')+'</section>';
  }
  return Object.freeze({build,render});
}));
