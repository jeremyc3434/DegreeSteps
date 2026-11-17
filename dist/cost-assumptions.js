/* Optional student prices and pace. This form never edits academic records. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./planner.js'):root.DegreePlanner);if(typeof module==='object'&&module.exports)module.exports=api;else root.DegreeCostAssumptions=api;}(typeof globalThis!=='undefined'?globalThis:this,function(Planner){
 'use strict';
 const list=value=>Array.isArray(value)?value:[],object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{},copy=value=>JSON.parse(JSON.stringify(value));
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const futureProviders=draft=>[...new Set(list(draft?.plan?.rows).filter(row=>row.status==='planned'&&row.option?.provider&&row.option.provider!=='University').map(row=>row.option.provider))];
 const field=(name,label,value,{min=0,max=1000000,step='0.01',type='number',help=''}={})=>'<label class="sheet-field"><span>'+esc(label)+'</span><input name="'+esc(name)+'" type="'+type+'" value="'+esc(value)+'" '+(type==='number'?'min="'+min+'" max="'+max+'" step="'+step+'"':'maxlength="1500"')+'>'+(help?'<small>'+esc(help)+'</small>':'')+'</label>';
 const check=(name,label,value,marker=false)=>(marker?'<input type="hidden" name="hasFlag:'+esc(name)+'" value="1">':'')+'<label class="sheet-cost-check"><input type="checkbox" name="'+esc(name)+'"'+(value===true?' checked':'')+'><span>'+esc(label)+'</span></label>';
 const section=(title,body)=>'<fieldset class="sheet-cost-section"><legend>'+esc(title)+'</legend>'+body+'</fieldset>';
 const examProvider=provider=>['CLEP','DSST','Saylor'].includes(provider);
 const badStore=value=>value!==undefined&&(!value||typeof value!=='object'||Array.isArray(value));
 function render(draft,saved={}){
  if(!draft?.plan||!draft?.program)return '<p>Add the requirements for this degree before estimating its course costs.</p>';
  const s=object(saved),program=draft.program,providers=futureProviders(draft),pricing=program.pricing||{},subscription=['subscription','per-term','per-semester'].includes(pricing.model);
  const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
  let tuition=field('universityRate','My personal tuition rate per credit',s.universityRate??'',{min:0.01,help:'Optional: use a personal rate, such as a military discount, instead of published tuition.'});
  if(subscription)tuition='<p><strong>'+money(pricing.amount)+' per '+esc(pricing.period||'term')+'</strong> · Published university rate</p>'+field('universitySubscriptionTerms','How many university terms do you expect to need?',s.universitySubscriptionTerms??'',{min:1,max:100,step:'1',help:'Your pace determines the term count. This is an estimate, not a completion promise.'})+'<details><summary>I have a different tuition quote</summary>'+tuition+'</details>';
  else if(pricing.model==='banded-term')tuition='<p><strong>'+money(pricing.termRate)+' per semester</strong> for '+pricing.bandMin+'–'+pricing.bandMax+' credits. Below '+pricing.bandMin+': '+money(pricing.partTimeRate)+' per credit.</p><p>Published university tuition. Set your semester course load below to estimate the total.</p><details><summary>I have a different tuition quote</summary>'+tuition+'</details>';
  else if(pricing.model==='threshold-credit')tuition='<p><strong>'+money(pricing.fullTimeRate)+' per credit</strong> at '+pricing.fullTimeMin+' or more credits per semester; '+money(pricing.partTimeRate)+' per credit below that load.</p><p>Published university tuition. Set your semester course load below to estimate the total.</p><details><summary>I have a different tuition quote</summary>'+tuition+'</details>';
  let outside=badStore(s.providerQuotes)?'<p class="sheet-cost-warning">Your custom prices could not be read.</p>'+check('resetProviderQuotes','Start over with published prices. I can add my custom prices again.',false):'';
  for(const provider of providers){
   const quote=object(s.providerQuotes?.[provider]),keys=Planner.providerQuoteKeys(draft.plan.rows,provider),current=Array.isArray(quote.courseKeys)&&JSON.stringify(quote.courseKeys)===JSON.stringify(keys),hasQuote=!badStore(s.providerQuotes)&&Object.prototype.hasOwnProperty.call(s.providerQuotes||{},provider),validAmount=typeof quote.amount==='number'&&Number.isFinite(quote.amount)&&quote.amount>=0;
   if(provider==='Sophia')outside+=field('sophiaMonths','Sophia membership months',s.sophiaMonths??s.providerMonths?.Sophia??1,{min:1,max:60,step:'1'});
   if(provider==='Study.com')outside+=field('studyMonths','Study.com membership months',s.studyMonths??s.providerMonths?.['Study.com']??1,{min:1,max:60,step:'1'});
   outside+='<details class="sheet-provider-quote"'+(hasQuote||!['Sophia','Study.com','CLEP'].includes(provider)?' open':'')+'><summary>'+esc(['Sophia','Study.com','CLEP'].includes(provider)?'Use my own '+provider+' price':provider+' price')+'</summary><input type="hidden" name="quoteKeys:'+esc(provider)+'" value="'+esc(JSON.stringify(keys))+'">'+field('providerQuote:'+provider,'Total remaining '+provider+' cost',quote.amount??'',{help:'Include membership and all course or exam charges for the '+keys.length+' remaining course'+(keys.length===1?'':'s')+'. Enter 0 only if free.'})+(hasQuote&&!current?'<p class="sheet-cost-warning">Your course list changed. Review this price before using it again.</p>':'')+(hasQuote&&!validAmount?'<p class="sheet-cost-warning">Enter a valid price or choose published prices below.</p>':'')+check('quoteReviewed:'+provider,'This price covers these '+keys.length+' remaining course'+(keys.length===1?'':'s')+' in my plan.',hasQuote&&current&&validAmount)+check('quoteTaxes:'+provider,'This price includes any taxes and checkout charges.',quote.includesTaxes)+(examProvider(provider)?check('quoteExamFees:'+provider,'This price includes exam administration and proctoring charges.',quote.includesExamFees):'')+'<details><summary>Add a price reference (optional)</summary>'+field('quoteSource:'+provider,'Price or quote link',quote.sourceUrl??'',{type:'url'})+'</details>'+(hasQuote?check('resetQuote:'+provider,'Use published prices instead of this custom price.',false):'')+'</details>';
  }
  if(!outside)outside='<p>No outside courses remain in this plan.</p>';
  if(providers.includes('CLEP'))outside+='<details><summary>Modern States voucher</summary>'+check('modernStates','I plan to use a Modern States CLEP voucher.',s.modernStates,true)+check('voucherConfirmed','My voucher has been issued.',s.voucherConfirmed,true)+'<p>An expected voucher does not remove exam fees until it is issued.</p></details>';
  const sources=new Map(list(program.sources).map(source=>[source.id,source])),publishedFees=[...list(pricing.oneTimeFees),...list(program.publishedFees)].filter(fee=>typeof fee.amount==='number'&&fee.amount>=0&&list(fee.sourceIds).length&&fee.sourceIds.every(id=>{try{const url=new URL(sources.get(id)?.url);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}}));
  const knownFees=publishedFees.length?'<p>Published charges, separate from tuition:</p><ul>'+publishedFees.map(fee=>'<li>'+esc(fee.label||fee.id)+': '+money(fee.amount)+' '+esc(fee.frequency||'')+(fee.eligibility?' · '+esc(fee.eligibility):'')+'</li>').join('')+'</ul><p>Include only charges you still expect to pay in your total below.</p>':'';
  let fees=knownFees+field('fees','My remaining fees and extra charges',s.fees??'',{help:'Include the published charges that apply to you, plus personal costs. Enter 0 if none remain; exclude charges included in tuition or already paid.'})+check('feesConfirmed','This amount includes the remaining university and transcript fees for my plan.',s.feesConfirmed,true);
  if(providers.some(provider=>['Sophia','Study.com'].includes(provider)))fees+=check('taxesConfirmed','Extra taxes or checkout charges on the membership estimates are included in my fee amount.',s.taxesConfirmed,true);
  if(providers.includes('CLEP'))fees+=check('examFeesConfirmed','CLEP administration or proctoring charges outside a custom exam price are included in my fee amount.',s.examFeesConfirmed,true);
  if(program.format==='Residential')fees+=check('housingConfirmed','My fee amount also includes my remaining housing, meals and campus expenses.',s.housingConfirmed,true);
  let pace='';
  for(const provider of providers){const scalar=({'Sophia':'sophiaWeeks','Study.com':'studyWeeks','CLEP':'clepWeeks'})[provider];pace+=field(scalar||'providerWeeks:'+provider,'Weeks per '+provider+(provider==='CLEP'?' exam':' course'),scalar?s[scalar]??'':s.providerWeeks?.[provider]??'',{min:0.1,max:104,step:'0.1'});}
  pace+=field('concurrency','Outside courses studied at once',s.concurrency??1,{min:1,max:2,step:'1'})+field('termWeeks','University study period, in weeks',s.termWeeks??'',{min:1,max:52,step:'0.1'})+field('termCredits','Credits per university study period',s.termCredits??'',{min:0.1,max:subscription?Math.min(program.totalCredits,500):30,step:'0.1'});
  return '<form id="sheet-cost-form" class="sheet-cost-form"><p>Published prices are included where available. Add your expected pace and any personal costs.</p>'+section('University tuition',tuition)+section('Outside courses',outside)+section('Other costs',fees)+'<details'+(['banded-term','threshold-credit'].includes(pricing.model)?' open':'')+'><summary>My study schedule</summary>'+pace+'</details><p>Your pace and personal charges determine the final estimate.</p><button class="button primary" type="submit">Update estimates</button></form>';
 }
 function parse(data,draft,saved={}){
  if(!draft?.plan||!draft?.program)throw Error('Open a course plan before saving estimates.');
  if(badStore(saved.providerQuotes)&&!data.has('resetProviderQuotes'))throw Error('Review your custom prices or choose Start over with published prices.');
  const changes={},numbers={universityRate:[0.01,1000000,false],universitySubscriptionTerms:[1,100,true],fees:[0,1000000,false],sophiaMonths:[1,60,true],studyMonths:[1,60,true],sophiaWeeks:[0.1,104,false],studyWeeks:[0.1,104,false],clepWeeks:[0.1,104,false],concurrency:[1,2,true],termWeeks:[1,52,false],termCredits:[0.1,['subscription','per-term','per-semester'].includes(draft.program.pricing?.model)?Math.min(draft.program.totalCredits,500):30,false]};
  function numeric(raw,label,min,max,integer=false){const value=String(raw??'').trim();if(!value)return '';if(!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value))throw Error('Enter a valid '+label+'.');const n=Number(value);if(!Number.isFinite(n)||n<min||n>max||integer&&!Number.isInteger(n)||!integer&&Math.abs(n*100-Math.round(n*100))>0.000001)throw Error('Check the '+label+'.');return n;}
  for(const [name,[min,max,integer]] of Object.entries(numbers))if(data.has(name))changes[name]=numeric(data.get(name),name.replace(/([A-Z])/g,' $1').toLowerCase(),min,max,integer);
  const weeks={...object(saved.providerWeeks)};
  for(const [name,value] of data)if(name.startsWith('providerWeeks:'))weeks[name.slice(14)]=numeric(value,'course study weeks',0.1,104)||null;
  changes.providerWeeks=weeks;
  for(const flag of ['feesConfirmed','taxesConfirmed','examFeesConfirmed','housingConfirmed','modernStates','voucherConfirmed'])if(data.has('hasFlag:'+flag))changes[flag]=data.has(flag);
  const feeAmount=changes.fees??saved.fees;
  if(changes.feesConfirmed===true&&(feeAmount===undefined||feeAmount===null||String(feeAmount).trim()===''||!Number.isFinite(Number(feeAmount))))throw Error('Enter your other-fees total, including 0 if none, before confirming it.');
  if(changes.voucherConfirmed===true&&!(changes.modernStates??saved.modernStates))throw Error('Choose the Modern States voucher option before recording an issued voucher.');
  const quotes=data.has('resetProviderQuotes')?{}:copy(object(saved.providerQuotes));
  for(const provider of futureProviders(draft)){
   const name='providerQuote:'+provider;if(!data.has(name))continue;
   if(data.has('resetQuote:'+provider)){delete quotes[provider];continue;}
   const amount=numeric(data.get(name),provider+' remaining cost',0,1000000);
   if(amount===''){const previous=quotes[provider];if(previous!==undefined&&(!previous||typeof previous!=='object'||typeof previous.amount!=='number'||!Number.isFinite(previous.amount)))throw Error('Review the '+provider+' custom price or choose published prices.');delete quotes[provider];continue;}
   if(!data.has('quoteReviewed:'+provider))throw Error('Confirm the '+provider+' price covers your remaining courses.');
   const keys=Planner.providerQuoteKeys(draft.plan.rows,provider);let shown;
   try{shown=JSON.parse(data.get('quoteKeys:'+provider));}catch{throw Error('Reopen estimates to review the '+provider+' course list.');}
   if(JSON.stringify(shown)!==JSON.stringify(keys))throw Error('Your remaining courses changed. Close and reopen estimates to review the current '+provider+' course list.');
   const source=String(data.get('quoteSource:'+provider)??'').trim();
   if(source){let u;try{u=new URL(source);}catch{throw Error('Use an https price link for '+provider+'.');}if(u.protocol!=='https:'||u.username||u.password||source.length>1500)throw Error('Use an https price link without sign-in details for '+provider+'.');}
   quotes[provider]={amount,courseKeys:keys,includesTaxes:data.has('quoteTaxes:'+provider),includesExamFees:data.has('quoteExamFees:'+provider),...(source?{sourceUrl:source}:{})};
  }
  changes.providerQuotes=quotes;return changes;
 }
 function summary(cost,timing={}){
  const finite=value=>typeof value==='number'&&Number.isFinite(value),money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
  const full=cost?.complete===true&&finite(cost.total),base=cost?.estimatedBaseCost,subtotal=cost?.knownSubtotal;
  const label=full?'Remaining cost estimate':finite(base)?'Tuition + courses estimate':finite(subtotal)&&subtotal>0?'Known costs so far':'Costs need an estimate';
  const amount=full?cost.total:finite(base)?base:finite(subtotal)&&subtotal>0?subtotal:null;
  const missing=[...new Set([...list(cost?.missing),...list(timing.missing)])];
  return '<div class="sheet-baseline"><span>'+esc(label)+'</span><strong>'+(amount===null?'Set your pace below':money(amount))+'</strong><p>'+(full?'Includes the charges recorded in your estimates.':'Personal fees and charges not yet entered are excluded.')+'</p>'+(finite(timing.scenarioWeeks)?'<p>'+esc(timing.scenarioWeeks)+' estimated weeks of study. Admissions and transfer processing are separate.</p>':'')+'</div>'+(missing.length?'<details class="sheet-cost-missing"><summary>Finish my estimate · '+missing.length+'</summary><ul>'+missing.map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul></details>':'');
 }
 return Object.freeze({render,parse,summary,futureProviders});
}));
