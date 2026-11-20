/* Selected-course planning ranges. No credit awards, saved-state writes or network access. */
(function(root,factory){
 'use strict';
 const common=typeof module==='object'&&module.exports;
 const api=factory(common?require('./planner.js'):root.DegreePlanner,common?require('./cost-engine.js'):root.DegreeCostComparison);
 if(common)module.exports=api;else root.DegreePlanEstimate=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(Planner,Cost){
 'use strict';
 const list=value=>Array.isArray(value)?value:[],finite=value=>typeof value==='number'&&Number.isFinite(value),near=(a,b)=>Math.abs(a-b)<.000001;
 const text=value=>typeof value==='string'?value.trim():'',money=value=>Math.round((value+Number.EPSILON)*100)/100;
 const mode=value=>/^(residential|on campus|campus)$/i.test(text(value))?'campus':/^online$/i.test(text(value))?'online':null;
 const catalog=value=>text(value).replace(/[–—]/g,'-');
 const range=values=>({min:Math.min(...values),max:Math.max(...values)});
 const add=(left,right)=>({min:money(left.min+right.min),max:money(left.max+right.max)});
 const unique=values=>[...new Set(values)];
 const https=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
 function validDate(value){if(!/^20\d{2}-\d{2}-\d{2}$/.test(value||''))return false;const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;}
 function assertRates(rates){
  if(rates?.schemaRevision!=='plan-estimate-rates-v1'||!validDate(rates.checkedOn)||!Array.isArray(rates.entries)||!Array.isArray(rates.providers)||!Array.isArray(rates.sources))throw Error('A reviewed estimate-rate file is required.');
  const sources=new Map();for(const source of rates.sources){if(!text(source.id)||sources.has(source.id)||!text(source.title)||!https(source.url)||!validDate(source.checkedOn))throw Error('Every rate source needs a unique identity, HTTPS address and review date.');sources.set(source.id,source);}
  const bound=value=>Array.isArray(value.sourceIds)&&value.sourceIds.length>0&&value.sourceIds.every(id=>sources.has(id));
  const models=new Set(),providers=new Set();
  for(const entry of rates.entries){
   if(!text(entry.id)||!text(entry.school)||!['semester','competency-unit'].includes(entry.creditSystem)||!['online','campus'].includes(entry.modality)||!finite(entry.degreeUnits)||entry.degreeUnits<=0||!Array.isArray(entry.modelIds)||!entry.modelIds.length||!list(entry.catalogs).length||!bound(entry)||!entry.tuition||!finite(entry.feesPerTerm)||entry.feesPerTerm<0||!finite(entry.oneTimeFees)||entry.oneTimeFees<0)throw Error('An estimate entry needs exact degree identities and nonnegative sourced fees.');
   for(const id of entry.modelIds){if(!text(id)||models.has(id))throw Error('A degree can have only one reviewed estimate entry.');models.add(id);}
   if(!Number.isInteger(entry.pace?.min)||!Number.isInteger(entry.pace?.max)||entry.pace.min<1||entry.pace.max<entry.pace.min||entry.pace.max>60||!Number.isInteger(entry.pace.defaultMin)||!Number.isInteger(entry.pace.defaultMax)||entry.pace.defaultMin<entry.pace.min||entry.pace.defaultMax>entry.pace.max||entry.pace.defaultMin>entry.pace.defaultMax||!text(entry.termLabel))throw Error('University pace needs bounded whole-unit assumptions.');
   if(entry.termMonths!==null&&(!finite(entry.termMonths)||entry.termMonths<=0||entry.termMonths>12))throw Error('A term duration needs its own bounded billing unit.');
   const fees=list(entry.feeBreakdown);if(!fees.length||fees.some(fee=>!text(fee.label)||!finite(fee.amount)||fee.amount<0||!['per-term','one-time'].includes(fee.frequency))||!near(fees.filter(fee=>fee.frequency==='per-term').reduce((sum,fee)=>sum+fee.amount,0),entry.feesPerTerm)||!near(fees.filter(fee=>fee.frequency==='one-time').reduce((sum,fee)=>sum+fee.amount,0),entry.oneTimeFees))throw Error('Reviewed university fees must reconcile with their named components.');
   const price=entry.tuition,keys=price.type==='banded-term'?['termRate','partTimeRate']:price.type==='threshold-credit'?['fullTimeRate','partTimeRate']:price.type==='paid-term'?['termRate']:price.type==='per-credit'?['rate']:null;
   if(!keys||keys.some(key=>!finite(price[key])||price[key]<=0)||price.type==='banded-term'&&(!Number.isInteger(price.bandMin)||!Number.isInteger(price.bandMax)||price.bandMin<1||price.bandMax<price.bandMin||entry.pace.max>price.bandMax)||price.type==='threshold-credit'&&(!Number.isInteger(price.fullTimeMin)||price.fullTimeMin<1))throw Error('A reviewed university rate must have a supported, positive billing basis.');
  }
  for(const provider of rates.providers){
   if(!text(provider.provider)||providers.has(provider.provider)||!['subscription','exam'].includes(provider.type)||!finite(provider.amount)||provider.amount<0||!bound(provider))throw Error('Every provider price needs one nonnegative sourced price.');
   if(provider.packages!==undefined&&(!Array.isArray(provider.packages)||!provider.packages.length||provider.type!=='subscription'||provider.packages.some(item=>!Number.isInteger(item.months)||item.months<1||item.months>24||!finite(item.amount)||item.amount<=0)))throw Error('Prepaid memberships need positive sourced month and price quantities.');
   providers.add(provider.provider);
  }
  return rates;
 }
 function unavailable(reason,code){return{available:false,status:'unavailable',reason,reasonCode:code,costs:null,timing:null,counts:null,sources:[],notes:[]};}
 function pace(value,defaultValue,label,{integer=false,min=1,max=60}={}){
  const result=value===undefined?defaultValue:value;
  if(!finite(result)||result<min||result>max||integer&&!Number.isInteger(result))throw Error('Choose a valid '+label+'.');
  return result;
 }
 function subscriptionCost(price,months){
  if(!price.packages)return money(months*price.amount);
  const packages=price.packages,limit=months+Math.max(...packages.map(item=>item.months))-1,prices=Array(limit+1).fill(Infinity);prices[0]=0;
  for(let paid=1;paid<=limit;paid++)for(const item of packages)if(paid>=item.months)prices[paid]=Math.min(prices[paid],prices[paid-item.months]+item.amount);
  // Buying a prepaid package can cost less even when some included months are unused.
  return money(Math.min(...prices.slice(months)));
 }
 function calculate(input){
  try{
   const {program,plan,rates}=input||{},assumptions=input?.assumptions||{};
   assertRates(rates);
   const entry=rates.entries.find(item=>item.modelIds.includes(program?.id));
   if(!entry)return unavailable('A researched cost range is not available for this exact degree yet.','degree-not-priced');
   if(!program||!plan||plan.programId!==program.id||entry.school!==program.school||entry.creditSystem!==program.creditSystem||entry.modality!==mode(program.format)||entry.degreeUnits!==program.totalCredits||!entry.catalogs.includes(catalog(program.catalogYear||program.catalog)))return unavailable('The degree edition or format does not match this rate review.','degree-rate-mismatch');
   if(!Planner?.validate||!Cost?.calculate||!Array.isArray(program.requirements)||!Array.isArray(plan.rows)||plan.rows.length!==program.requirements.length)throw Error('The complete course plan needs a fresh degree check.');
   if(Planner.validate(program,plan).academicCountsValid!==true||plan.validation?.academicCountsValid!==true)throw Error('The course plan must meet its degree-credit rules before estimating.');
   const allowedAssumptions=new Set(['outsideCoursesPerMonthMin','outsideCoursesPerMonthMax','universityUnitsPerTermMin','universityUnitsPerTermMax']);
   if(!assumptions||typeof assumptions!=='object'||Array.isArray(assumptions)||Object.keys(assumptions).some(key=>!allowedAssumptions.has(key)))throw Error('Use only the supported course-pace assumptions.');
   const outsideMin=pace(assumptions.outsideCoursesPerMonthMin,2,'outside-course pace',{min:.25,max:20}),outsideMax=pace(assumptions.outsideCoursesPerMonthMax,4,'outside-course pace',{min:.25,max:20});
   const universityMin=pace(assumptions.universityUnitsPerTermMin,entry.pace.defaultMin,'university course load',{integer:true,min:entry.pace.min,max:entry.pace.max}),universityMax=pace(assumptions.universityUnitsPerTermMax,entry.pace.defaultMax,'university course load',{integer:true,min:entry.pace.min,max:entry.pace.max});
   if(outsideMax<outsideMin||universityMax<universityMin)throw Error('The slower pace must not exceed the faster pace.');
   const requirements=new Map(program.requirements.map(item=>[item.id,item])),seen=new Set(),courses=new Map(),missing=[],sourceIds=new Set(entry.sourceIds);
   let total=0,outside=0,university=0,remainingUniversity=0,finished=0,conditionalUnits=0;
   for(const row of plan.rows){
    const requirement=requirements.get(row?.requirementId),option=list(requirement?.options).find(item=>item.id===row.option?.id&&item.provider===row.option?.provider&&item.code===row.option?.code&&near(item.credits,row.credits));
    if(!requirement||seen.has(row.requirementId)||!finite(row.credits)||row.credits<0||!near(row.credits,requirement.credits)||!['planned','reported','confirmed','unresolved'].includes(row.status)||!option||row.unknownProvenance)throw Error('A selected course or its credit source is incomplete or inconsistent.');
    seen.add(row.requirementId);total+=row.credits;
    const done=row.status==='reported'||row.status==='confirmed';if(done)finished+=row.credits;
    if(option.provider==='University'||row.institutional===true){university+=row.credits;if(!done)remainingUniversity+=row.credits;continue;}
    outside+=row.credits;if(done)continue;
    if(row.status==='unresolved')throw Error('Choose a course for every requirement before estimating the route.');
    if(option.evidence==='conditional')conditionalUnits+=row.credits;
    if(!text(option.code))throw Error('An outside course needs its exact source-course identity.');
    // A source course may cover several receiving requirements (including CUs).
    // Charge its membership/exam once, without converting receiving CUs to source credits.
    const key=option.provider+'|'+option.code;
    if(!courses.has(key))courses.set(key,{provider:option.provider,code:option.code});
   }
   if(!near(total,program.totalCredits))throw Error('Every degree unit must be accounted for once.');
   const providerBreakdown=[];let outsideMonths={min:0,max:0},outsideCosts={min:0,max:0};
   for(const provider of unique([...courses.values()].map(course=>course.provider)).sort()){
    const count=[...courses.values()].filter(course=>course.provider===provider).length,price=rates.providers.find(item=>item.provider===provider),months={min:Math.ceil(count/outsideMax),max:Math.ceil(count/outsideMin)};
    outsideMonths=add(outsideMonths,months);
    if(!price){missing.push(provider+' course prices are not included.');providerBreakdown.push({provider,courses:count,months,cost:null});continue;}
    price.sourceIds.forEach(id=>sourceIds.add(id));
    const cost=price.type==='subscription'?{min:subscriptionCost(price,months.min),max:subscriptionCost(price,months.max)}:{min:money(count*price.amount),max:money(count*price.amount)};
    outsideCosts=add(outsideCosts,cost);providerBreakdown.push({provider,courses:count,months,cost,priceLabel:price.label});
    missing.push(...list(price.missing));
   }
   const universityScenarios=[];
   for(let load=universityMin;load<=universityMax;load++){
    const terms=remainingUniversity===0?0:Math.ceil(remainingUniversity/load);
    const comparison={id:entry.id,totalUnits:program.totalCredits,scenarioTransferLimit:program.totalCredits,defaultTransferUnits:program.totalCredits-remainingUniversity,model:entry.tuition,pace:{min:entry.pace.min,max:entry.pace.max,defaultUnits:load}};
    const billed=entry.tuition.type==='paid-term'?Cost.calculate(comparison,{transferUnits:program.totalCredits-remainingUniversity,outsideBudget:0,beforeTerms:Math.max(1,Math.ceil(program.totalCredits/load)),afterTerms:Math.max(1,terms)}):Cost.calculate(comparison,{transferUnits:program.totalCredits-remainingUniversity,outsideBudget:0,unitsPerTerm:load});
    universityScenarios.push({unitsPerTerm:load,terms,tuition:terms===0?0:billed.afterTuition,fees:money(terms*entry.feesPerTerm+entry.oneTimeFees)});
   }
   const universityTuition=range(universityScenarios.map(item=>item.tuition)),universityFees=range(universityScenarios.map(item=>item.fees)),universityCombined=range(universityScenarios.map(item=>money(item.tuition+item.fees))),universityTerms=range(universityScenarios.map(item=>item.terms));
   missing.push(...list(entry.missing),...list(rates.exclusions));
   const assumptionsText=[outsideMin+'–'+outsideMax+' completed outside courses per month is a planning assumption, not a provider promise.',universityMin+'–'+universityMax+' '+(program.creditSystem==='competency-unit'?'competency units':'credits')+' per university '+entry.termLabel+' is a planning assumption.','Outside providers are studied one after another in this scenario; overlapping study can change the elapsed time.','University loads use unit totals. Prerequisites, whole-course scheduling, start dates, breaks and registration availability can add time.','One-time university fees are included once; subtract charges you have already paid.'];
   const notes=['Rates are before financial aid, military benefits, scholarships, discounts and future price changes.','Completed or reported courses are excluded from new course charges; school acceptance of reported credit remains separate.','This is a range of known tuition, required university fees and selected outside-course charges, not a complete cost of attendance or a graduation-date promise.'];
   if(providerBreakdown.some(item=>item.provider==='Study.com'))notes.push('Study.com uses the full College Saver Pro library price; an eligible lower-priced membership may reduce your cost.');
   if(providerBreakdown.some(item=>item.provider==='Sophia'))notes.push('Sophia uses the lowest published mix of monthly, four-month and annual memberships for the assumed study time. Prepaid plans require the upfront payment; promotions and tax are excluded.');
   if(conditionalUnits)notes.push(conditionalUnits+' proposed outside units retain the eligibility conditions shown on their course rows.');
   return{available:true,status:providerBreakdown.some(item=>!item.cost)?'partial-range':'planning-range',programId:program.id,rateEntryId:entry.id,checkedOn:rates.checkedOn,
    costs:{knownRange:add(universityCombined,outsideCosts),universityTuition,universityFees,outsideCourses:outsideCosts,providerBreakdown,missing:unique(missing),currency:'USD',complete:false,scope:'known-remaining-course-charges-before-aid'},
    timing:{outsideMonths,universityTerms,termLabel:entry.termLabel,universityTermMonths:entry.termMonths,totalMonths:entry.termMonths===null?null:{min:money(outsideMonths.min+universityTerms.min*entry.termMonths),max:money(outsideMonths.max+universityTerms.max*entry.termMonths)},assumptions:assumptionsText},
    counts:{totalUnits:total,outsideUnits:outside,universityUnits:university,remainingUniversityUnits:remainingUniversity,finishedUnits:finished,remainingOutsideCourses:courses.size,creditSystem:program.creditSystem},
    sources:rates.sources.filter(source=>sourceIds.has(source.id)).map(source=>({...source})),notes,assumptions:{outsideCoursesPerMonthMin:outsideMin,outsideCoursesPerMonthMax:outsideMax,universityUnitsPerTermMin:universityMin,universityUnitsPerTermMax:universityMax}};
  }catch(error){return unavailable(error?.message||'The plan estimate could not be calculated.','estimate-needs-review');}
 }
 return Object.freeze({calculate,assertRates});
}));
