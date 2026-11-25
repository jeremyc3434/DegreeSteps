'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Offers=require('./dist/provider-offers.js');
const shipped=JSON.parse(fs.readFileSync('content/monetization/student-offers.json','utf8'));
const clone=value=>JSON.parse(JSON.stringify(value));
const date='2026-11-25';
function active(){
  const data=clone(shipped),offer=data.offers[0];
  Object.assign(offer,{status:'active',authority:'provider-authorized',code:'FIXTURE10',startsAt:'2026-11-24T00:00:00Z',expiresAt:'2026-12-03T00:00:00Z'});
  Object.assign(offer.terms,{complete:true,discountPeriods:1,customerTypes:['new'],countries:['US'],schools:['tesu'],stackable:false,renewalPrice:{cents:10000,currency:'USD',billingPeriod:'month'},feesVerified:true});
  return data;
}
const input=()=>({registry:active(),offerId:'study-college-public',provider:'Study.com',product:'college-saver-pro',applied:true,customerType:'new',country:'US',schoolId:'tesu',billingPeriod:'month',periodPriceCents:10000,periods:3,currency:'USD',asOf:date});

test('shipped offer is an official college-plan link with incomplete terms, not an activated discount',()=>{
  const data=Offers.normalize(shipped),rows=Offers.offersFor('Study.com',{registry:data,asOf:date});
  assert.equal(rows.length,1);assert.equal(rows[0].terms.complete,false);assert.equal(rows[0].status,'advertised');
  assert.equal(rows[0].code,null);assert.equal(rows[0].terms.discountPercent,10);
  assert.equal(rows[0].offerUrl,'https://study.com/study-promo-and-coupons.html');
  assert.equal(Offers.offersFor('Study.com',{registry:data,product:'test-prep',asOf:date}).length,0);
  assert.equal(Offers.offersFor('Sophia',{registry:data,asOf:date}).length,0);
  const quote=Offers.estimateDiscount({...input(),registry:shipped});
  assert.equal(quote.available,false);assert.equal(quote.reason,'terms-incomplete');assert.equal(quote.savingsCents,0);assert.equal(quote.changesPlanEstimate,false);
});

test('rendered offer uses a clear provider CTA, public source URL and explicit estimate limitation',()=>{
  const html=Offers.html({provider:'Study.com',registry:shipped,asOf:date});
  assert.match(html,/View provider offer/);assert.match(html,/10% off College Saver and College Saver Pro/);
  assert.match(html,/not included in your plan estimate/);assert.match(html,/referrerpolicy="no-referrer"/);
  assert.doesNotMatch(html,/exclusive|20%|adkey|sponsored|data-action="apply/i);
  const compact=Offers.html({provider:'Study.com',compact:true,registry:shipped,asOf:date});
  assert.match(compact,/provider-offer-inline/);assert.doesNotMatch(compact,/<aside/);
  assert.equal(Offers.html({provider:'University',registry:shipped,asOf:date}),'');
});

test('operational review dates expire the display without inventing a provider expiration',()=>{
  assert.equal(shipped.offers[0].expiresAt,null);
  assert.equal(Offers.offersFor('Study.com',{registry:shipped,asOf:'2026-12-09'}).length,1);
  assert.equal(Offers.offersFor('Study.com',{registry:shipped,asOf:'2026-12-10'}).length,0);
  assert.equal(Offers.offersFor('Study.com',{registry:shipped,asOf:'2026-11-24'}).length,0);
  assert.equal(Offers.offersFor('Study.com',{registry:shipped,asOf:'not a date'}).length,0);
  assert.equal(Offers.offersFor('Study.com',{registry:shipped,asOf:'2026-02-31'}).length,0);
});

test('active discount needs an explicit application and the exact eligible product',()=>{
  for(const applied of[false,undefined,'true',1]){
    const quote=Offers.estimateDiscount({...input(),applied});assert.equal(quote.available,false);assert.equal(quote.reason,'not-applied');
  }
  const quote=Offers.estimateDiscount({...input(),product:'test-prep'});assert.equal(quote.available,false);assert.equal(quote.savingsCents,0);
});

test('a complete eligible offer computes only explicitly priced membership periods and renewals',()=>{
  const context=input(),before=clone(context),quote=Offers.estimateDiscount(context);
  assert.deepEqual(context,before,'Evaluation cannot rewrite student, price or offer records.');
  assert.deepEqual(quote,{available:true,offerId:'study-college-public',provider:'Study.com',product:'college-saver-pro',scope:'membership-only',currency:'USD',billingPeriod:'month',periods:3,discountedPeriods:1,beforeCents:30000,savingsCents:1000,afterCents:29000,renewalPriceCents:10000,changesPlanEstimate:false});
  const shorter=Offers.estimateDiscount({...input(),periods:1});assert.equal(shorter.afterCents,9000);assert.equal(shorter.discountedPeriods,1);
});

test('new/existing, country and school eligibility are explicit and never guessed from a degree',()=>{
  for(const patch of[{customerType:'existing'},{customerType:undefined},{country:'CA'},{country:undefined},{schoolId:'wgu'},{schoolId:undefined}]){
    const quote=Offers.estimateDiscount({...input(),...patch});assert.equal(quote.available,false);assert.equal(quote.reason,'eligibility-not-established');
  }
  const all=active();all.offers[0].terms.countries=['*'];all.offers[0].terms.schools=['*'];
  assert.equal(Offers.estimateDiscount({...input(),registry:all,country:undefined,schoolId:undefined}).available,true,'A reviewed all-country/all-school offer needs no individual location record.');
});

test('nonstackable offers cannot be combined and never alter a baseline plan price',()=>{
  const quote=Offers.estimateDiscount({...input(),otherDiscount:true});assert.equal(quote.available,false);assert.equal(quote.reason,'cannot-stack');assert.equal(quote.changesPlanEstimate,false);
  const data=active();data.offers[0].terms.stackable=true;assert.equal(Offers.estimateDiscount({...input(),registry:data,otherDiscount:true}).available,true);
});

test('wrong currency, renewal price, billing period and malformed amounts fail closed',()=>{
  for(const patch of[{currency:'EUR'},{periodPriceCents:9000},{periodPriceCents:'10000'},{periodPriceCents:1.1},{periodPriceCents:-100},{periods:0},{periods:'3'},{periods:Infinity},{periodPriceCents:Number.MAX_SAFE_INTEGER,periods:3},{billingPeriod:'year'}]){
    const quote=Offers.estimateDiscount({...input(),...patch});assert.equal(quote.available,false);assert.equal(quote.reason,'price-scope-mismatch');assert.equal(quote.savingsCents,0);
  }
});

test('expired, future and paused offers produce neither a CTA nor savings',()=>{
  const data=active();
  assert.equal(Offers.offersFor('Study.com',{registry:data,asOf:'2026-12-02T23:59:59Z'}).length,1);
  assert.equal(Offers.offersFor('Study.com',{registry:data,asOf:'2026-12-03T00:00:00Z'}).length,0);
  assert.equal(Offers.estimateDiscount({...input(),asOf:'2026-12-03T00:00:00Z'}).available,false);
  data.offers[0].startsAt='2026-11-26T00:00:00Z';assert.equal(Offers.html({provider:'Study.com',registry:data,asOf:date}),'');
  data.offers[0].status='paused';assert.equal(Offers.offersFor('Study.com',{registry:data,asOf:'2026-11-27'}).length,0);
});

test('provider-owned HTTPS URLs reject credentials, ports, foreign hosts and unsafe protocols',()=>{
  for(const url of['javascript:alert(1)','http://study.com/offer','https://study.com.evil.example/offer','https://evil.example/offer','https://u:p@study.com/offer','https://study.com:8443/offer']){
    const data=clone(shipped);data.offers[0].offerUrl=url;assert.throws(()=>Offers.normalize(data),/URLs/);
  }
  const data=clone(shipped);data.offers[0].sourceUrl='https://not-study.example/';assert.throws(()=>Offers.normalize(data),/URLs/);
  const poisoned=JSON.parse('{"version":1,"checkedOn":"2026-11-25","providers":{"__proto__":{"id":"bad","hosts":["study.com"]}},"offers":[]}');
  assert.throws(()=>Offers.normalize(poisoned),/approved HTTPS hosts/);
});

test('complete terms require valid windows, review, fees and renewal eligibility',()=>{
  for(const mutate of[
    data=>data.offers[0].terms.feesVerified=false,
    data=>data.offers[0].terms.customerTypes=null,
    data=>data.offers[0].terms.customerTypes=['anyone'],
    data=>data.offers[0].terms.discountPeriods=null,
    data=>data.offers[0].terms.renewalPrice=null,
    data=>data.offers[0].terms.schools=[],
    data=>data.offers[0].expiresAt=null,
    data=>data.offers[0].expiresAt='2026-02-31T00:00:00Z',
    data=>data.offers[0].startsAt=data.offers[0].expiresAt,
    data=>data.offers[0].reviewUntil='2026-11-24'
  ]){const data=active();mutate(data);assert.throws(()=>Offers.normalize(data));}
  assert.equal(Offers.offerState({status:'active',checkedOn:date,reviewUntil:null,terms:{complete:true}},{asOf:date}),'unavailable');
});

test('commissions, partner parameters and extra financial fields are rejected from this registry',()=>{
  for(const mutate of[
    data=>data.commission=10,
    data=>data.providers['Study.com'].affiliateParams={adkey:'fixture'},
    data=>data.offers[0].commission=10,
    data=>data.offers[0].terms.partnerRate=10,
    data=>data.offers[0].terms.renewalPrice.commission=10
  ]){const data=active();mutate(data);assert.throws(()=>Offers.normalize(data));}
  const source=fs.readFileSync('dist/provider-offers.js','utf8');
  assert.doesNotMatch(source,/partners\.json|DegreeOutbound|localStorage|sessionStorage|sendBeacon|\/api\//);
});

test('registry data is copied, duplicate IDs fail and display escapes supplied text',()=>{
  const data=clone(shipped);data.offers[0].title='<img src=x onerror=alert(1)>';
  const normalized=Offers.normalize(data);normalized.offers[0].productIds.push('test-prep');assert.equal(data.offers[0].productIds.includes('test-prep'),false);
  const html=Offers.html({provider:'Study.com',registry:data,asOf:date});assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);
  data.offers.push(clone(data.offers[0]));assert.throws(()=>Offers.normalize(data),/unique IDs/);
  const coded=active();const codeHTML=Offers.html({provider:'Study.com',registry:coded,asOf:date});assert.match(codeHTML,/Code: <strong>FIXTURE10/);
  coded.offers[0].code='"><script>';assert.throws(()=>Offers.normalize(coded));
});

test('offer loading fetches only the public registry without cookies or student details and safely holds failures',async()=>{
  const saved=globalThis.fetch,filename=require.resolve('./dist/provider-offers.js');
  try{
    let calls=0;globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'/data/student-offers.json');assert.deepEqual(options,{credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});return {ok:true,json:async()=>clone(shipped)};};
    delete require.cache[filename];const Loader=require(filename);await Promise.all([Loader.load(),Loader.load()]);assert.equal(calls,1);assert.equal(Loader.offersFor('Study.com',{asOf:date}).length,1);
    globalThis.fetch=async()=>({ok:false});delete require.cache[filename];const Failed=require(filename);assert.deepEqual((await Failed.load()).offers,[]);assert.equal(Failed.html({provider:'Study.com',asOf:date}),'');
    globalThis.fetch=async()=>({ok:true,json:async()=>({version:99})});delete require.cache[filename];const Invalid=require(filename);assert.deepEqual((await Invalid.load()).offers,[]);
  }finally{globalThis.fetch=saved;delete require.cache[filename];}
});
