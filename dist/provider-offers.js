/* Public provider offers, separate from commissions, academic choices and plan estimates.
 * Loading sends no student information. An advertised offer is a link, not applied savings. */
(function(root,factory){
  'use strict';
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DegreeProviderOffers=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const DATA_PATH='/data/student-offers.json';
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  const keys=(value,allowed)=>Object.keys(value).every(key=>allowed.includes(key));
  const text=value=>typeof value==='string'&&value.length>0&&value.length<=1000&&!/[\u0000-\u001f]/.test(value);
  const day=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return '';const time=Date.parse(value+'T00:00:00Z');return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value?value:'';};
  const time=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)||!day(value.slice(0,10)))return NaN;return Date.parse(value);};
  const now=value=>value instanceof Date?value.getTime():value===undefined?Date.now():typeof value==='string'&&day(value)?Date.parse(value+'T12:00:00Z'):typeof value==='string'?time(value):NaN;
  const strings=value=>Array.isArray(value)&&value.length>0&&value.every(text)&&new Set(value).size===value.length;
  const empty=()=>({version:1,checkedOn:null,providers:{},offers:[]});
  let registry=empty(),loading=null;

  function safeURL(value,hosts){
    try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&hosts.includes(url.hostname.toLowerCase())?url.href:'';}catch{return '';}
  }
  function normalize(raw){
    if(!object(raw)||!keys(raw,['version','checkedOn','providers','offers'])||raw.version!==1||!day(raw.checkedOn)||!object(raw.providers)||!Array.isArray(raw.offers))throw Error('Student offers need a reviewed version-one registry.');
    const result={version:1,checkedOn:raw.checkedOn,providers:{},offers:[]};
    for(const [name,provider]of Object.entries(raw.providers)){
      if(!text(name)||['__proto__','prototype','constructor'].includes(name)||!object(provider)||!keys(provider,['id','hosts'])||!text(provider.id)||!strings(provider.hosts)||provider.hosts.some(host=>!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(host)))throw Error('Student offer providers need explicit approved HTTPS hosts.');
      result.providers[name]={id:provider.id,hosts:[...provider.hosts]};
    }
    const ids=new Set();
    for(const rawOffer of raw.offers){
      if(!object(rawOffer)||!keys(rawOffer,['id','provider','status','authority','title','summary','offerUrl','code','sourceUrl','checkedOn','reviewUntil','startsAt','expiresAt','productIds','terms','notes'])||!text(rawOffer.id)||ids.has(rawOffer.id)||!result.providers[rawOffer.provider]||!['advertised','active','paused'].includes(rawOffer.status)||!['provider-public','provider-authorized'].includes(rawOffer.authority)||!text(rawOffer.title)||!text(rawOffer.summary)||!strings(rawOffer.productIds)||rawOffer.notes!==undefined&&!text(rawOffer.notes)||rawOffer.code!==null&&rawOffer.code!==undefined&&(typeof rawOffer.code!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(rawOffer.code)))throw Error('Student offers need unique IDs and explicit reviewed provider/product scope.');
      const hosts=result.providers[rawOffer.provider].hosts;
      if(!safeURL(rawOffer.sourceUrl,hosts)||!safeURL(rawOffer.offerUrl,hosts)||!day(rawOffer.checkedOn)||!day(rawOffer.reviewUntil)||rawOffer.reviewUntil<rawOffer.checkedOn||rawOffer.checkedOn>raw.checkedOn)throw Error('Student offers need provider-owned URLs and consistent review dates.');
      if(rawOffer.startsAt!==null&&!Number.isFinite(time(rawOffer.startsAt))||rawOffer.expiresAt!==null&&!Number.isFinite(time(rawOffer.expiresAt))||rawOffer.startsAt&&rawOffer.expiresAt&&time(rawOffer.startsAt)>=time(rawOffer.expiresAt))throw Error('Student offer timestamps must describe a valid window.');
      const terms=rawOffer.terms;
      if(!object(terms)||!keys(terms,['complete','discountPercent','discountPeriods','billingPeriod','customerTypes','countries','schools','stackable','renewalPrice','currency','feesVerified'])||typeof terms.complete!=='boolean'||!Number.isFinite(terms.discountPercent)||terms.discountPercent<=0||terms.discountPercent>100||!['month','year'].includes(terms.billingPeriod)||terms.currency!=='USD')throw Error('Student offers need explicit discount and billing terms.');
      if(terms.complete){
        if(!['active','paused'].includes(rawOffer.status)||!rawOffer.startsAt||!rawOffer.expiresAt||!Number.isSafeInteger(terms.discountPeriods)||terms.discountPeriods<1||!strings(terms.customerTypes)||terms.customerTypes.some(value=>!['new','existing'].includes(value))||!strings(terms.countries)||!strings(terms.schools)||typeof terms.stackable!=='boolean'||terms.feesVerified!==true||!object(terms.renewalPrice)||!keys(terms.renewalPrice,['cents','currency','billingPeriod'])||!Number.isSafeInteger(terms.renewalPrice.cents)||terms.renewalPrice.cents<0||terms.renewalPrice.currency!=='USD'||terms.renewalPrice.billingPeriod!==terms.billingPeriod)throw Error('Automatic offer calculations need complete eligibility, duration, renewal and fee terms.');
      }
      ids.add(rawOffer.id);
      result.offers.push({...rawOffer,offerUrl:safeURL(rawOffer.offerUrl,hosts),sourceUrl:safeURL(rawOffer.sourceUrl,hosts),productIds:[...rawOffer.productIds],terms:JSON.parse(JSON.stringify(terms))});
    }
    return result;
  }
  function configure(raw){registry=normalize(raw);return snapshot();}
  function snapshot(){return JSON.parse(JSON.stringify(registry));}
  function offerState(offer,{asOf}={}){
    const timestamp=now(asOf),today=Number.isFinite(timestamp)?new Date(timestamp).toISOString().slice(0,10):'';
    if(!today)return 'invalid-date';
    if(!object(offer)||!['advertised','active'].includes(offer.status)||!object(offer.terms)||typeof offer.terms.complete!=='boolean'||!day(offer.checkedOn)||!day(offer.reviewUntil)||offer.reviewUntil<offer.checkedOn||offer.startsAt&&!Number.isFinite(time(offer.startsAt))||offer.expiresAt&&!Number.isFinite(time(offer.expiresAt)))return 'unavailable';
    if(offer.checkedOn>today)return 'not-reviewed';
    if(today>offer.reviewUntil)return 'review-expired';
    if(offer.startsAt&&timestamp<time(offer.startsAt))return 'not-started';
    if(offer.expiresAt&&timestamp>=time(offer.expiresAt))return 'expired';
    return offer.terms.complete?'active':'advertised';
  }
  function offersFor(provider,{product,asOf,registry:input}={}){
    const current=input?normalize(input):registry;
    return current.offers.filter(offer=>offer.provider===provider&&(!product||offer.productIds.includes(product))&&['active','advertised'].includes(offerState(offer,{asOf}))).map(offer=>JSON.parse(JSON.stringify(offer)));
  }
  function html({provider,product,asOf,compact=false,registry:input}={}){
    return offersFor(provider,{product,asOf,registry:input}).map(offer=>{
      const link='<a href="'+esc(offer.offerUrl)+'" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">View provider offer</a>';
      const note=offer.terms.complete?'Eligibility and renewal terms apply.':'Not included in your plan estimate.';
      if(compact)return '<span class="provider-offer-inline" data-provider-offer="'+esc(offer.id)+'">'+link+'<span class="provider-offer-note">'+esc(note)+'</span></span>';
      return '<aside class="provider-offer" data-provider-offer="'+esc(offer.id)+'" aria-label="'+esc(provider)+' offer"><div class="provider-offer-header"><strong>'+esc(offer.title)+'</strong>'+link+'</div><p>'+esc(offer.summary)+'</p>'+(offer.code?'<p class="provider-offer-code">Code: <strong>'+esc(offer.code)+'</strong></p>':'')+'<p class="provider-offer-note">'+esc(offer.notes||note)+'</p></aside>';
    }).join('');
  }

  /** Optional future membership-only illustration. Never called by plan estimates/ranking.
   * The user must explicitly apply an active, fully reviewed offer to a matching product.
   * Input prices use integer cents and exclude course/exam/transcript/other charges. */
  function estimateDiscount({offerId,provider,product,applied=false,customerType,country,schoolId,otherDiscount=false,billingPeriod,periodPriceCents,periods,currency='USD',asOf,registry:input}={}){
    const none=reason=>({available:false,reason,savingsCents:0,scope:'membership-only',changesPlanEstimate:false});
    if(applied!==true)return none('not-applied');
    const offer=offersFor(provider,{product,asOf,registry:input}).find(value=>value.id===offerId);
    if(!offer)return none('offer-unavailable');
    if(offer.status!=='active'||offer.terms.complete!==true)return none('terms-incomplete');
    const terms=offer.terms,includes=(values,value)=>values.includes('*')||typeof value==='string'&&values.includes(value);
    if(!product||!offer.productIds.includes(product)||!terms.customerTypes.includes(customerType)||!includes(terms.countries,country)||!includes(terms.schools,schoolId))return none('eligibility-not-established');
    if(otherDiscount&&terms.stackable!==true)return none('cannot-stack');
    if(currency!==terms.currency||billingPeriod!==terms.billingPeriod||!Number.isSafeInteger(periodPriceCents)||periodPriceCents<0||!Number.isSafeInteger(periods)||periods<1||!Number.isSafeInteger(periodPriceCents*periods)||periodPriceCents!==terms.renewalPrice.cents)return none('price-scope-mismatch');
    const discountedPeriods=Math.min(periods,terms.discountPeriods),savingPerPeriod=Math.round(periodPriceCents*terms.discountPercent/100),beforeCents=periodPriceCents*periods,savingsCents=savingPerPeriod*discountedPeriods;
    return {available:true,offerId:offer.id,provider:offer.provider,product,scope:'membership-only',currency,billingPeriod,periods,discountedPeriods,beforeCents,savingsCents,afterCents:beforeCents-savingsCents,renewalPriceCents:terms.renewalPrice.cents,changesPlanEstimate:false};
  }
  function load(){
    if(loading)return loading;
    if(typeof root.fetch!=='function')return Promise.resolve(snapshot());
    loading=Promise.resolve().then(()=>root.fetch(DATA_PATH,{credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'})).then(response=>{
      if(!response||!response.ok)throw Error('Offer data unavailable.');return response.json();
    }).then(configure).catch(()=>{registry=empty();return snapshot();});
    return loading;
  }
  return Object.freeze({DATA_PATH,normalize,configure,snapshot,offerState,offersFor,html,estimateDiscount,load});
}));
