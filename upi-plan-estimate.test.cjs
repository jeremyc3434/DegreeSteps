/* Price fixtures exercise the billing boundary; they are not receiving-school awards. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const Estimate=require('./dist/plan-estimate-engine.js'),Planner=require('./dist/planner.js'),View=require('./dist/plan-estimate-view.js');
const rates=require('./dist/data/plan-estimate-rates.json'),review=require('./content/estimates/upi-pricing-review-2026-11-25.json'),identities=require('./content/catalog/upi-course-identities-reviewed-2026-11-25.json');
const clone=value=>structuredClone(value),price=rates.providers.find(row=>row.provider==='UPI Study');
function fixture(codes=['UPIS-0003']){
  const university=id=>({id:'uni-'+id,provider:'University',code:'UNI-'+id,title:'Synthetic university course',credits:3,evidence:'published',sourceIds:['fixture-catalog']});
  const requirements=codes.map((code,index)=>{
    const quote=price.courseQuotes.find(row=>row.code===code),credits=quote.sourceCredits;
    return {id:'outside-'+index,title:'Synthetic outside requirement '+index,credits,category:'general',options:[{id:'upi-'+index,provider:'UPI Study',code,title:'Synthetic price-only placement',credits,sourceCredits:quote.sourceCredits,sourceCreditSystem:quote.sourceCreditSystem,courseVersion:quote.courseVersion,recommendationStart:quote.recommendationStart,recommendationEnd:quote.recommendationEnd,creditOrigin:'alternative',evidence:'conditional',sourceIds:['fixture-map'],conditions:['Synthetic billing fixture; no receiving award is established.']},{...university('outside-'+index),credits}]};
  });
  const outside=requirements.reduce((sum,row)=>sum+row.credits,0);requirements.push({id:'university',title:'Synthetic university requirement',credits:3,category:'major',institutionalOnly:true,options:[university('university')]});
  const program={id:'pricing-fixture',school:'Example College',title:'Synthetic price fixture',format:'Online',catalog:'2026',totalCredits:outside+3,creditSystem:'semester',institutionMinCredits:3,externalMaxCredits:outside,alternativeMaxCredits:outside,upperMinCredits:0,majorMinInstitutionCredits:0,sources:[{id:'fixture-catalog',url:'https://example.edu/catalog'},{id:'fixture-map',url:'https://example.edu/transfer'}],requirements};
  const plan=Planner.generate(program,{providers:['UPI Study'],allowConditional:true,priority:'transfer',completed:[]});
  assert.equal(plan.validation.academicCountsValid,true,'Synthetic billing fixture still obeys academic quantity rules.');
  const copy=clone(rates);copy.entries=[{id:'price-fixture',school:program.school,modelIds:[program.id],catalogs:['2026'],degreeUnits:program.totalCredits,creditSystem:'semester',modality:'online',sourceIds:[review.sources[0].id],tuition:{type:'per-credit',rate:100},pace:{min:3,max:3,defaultMin:3,defaultMax:3},feesPerTerm:0,oneTimeFees:0,feeBreakdown:[{label:'Synthetic zero fee',amount:0,frequency:'one-time'}],termLabel:'term',termMonths:null}];
  return {program,plan,rates:copy};
}

test('UPI price quotes bind every exact current original course to the independently reviewed ACE version',()=>{
  assert.equal(price.type,'per-course');assert.equal(price.amount,undefined);assert.equal(price.courseQuotes.length,22);assert.equal(review.courseQuoteCount,22);assert.equal(review.membershipEligibilityAssumed,false);assert.equal(review.transcriptFeeAutomaticallyCharged,false);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(review.courseIdentityPacket.path)).digest('hex'),review.courseIdentityPacket.sha256);
  for(const quote of price.courseQuotes){
    const course=identities.courses.find(row=>row.aceId===quote.code);assert(course);
    assert.equal(String(quote.courseVersion),String(course.courseVersion));assert.equal(quote.sourceCredits,course.sourceCredits);assert.equal(quote.sourceCreditSystem,course.sourceCreditSystem);
    assert.equal(quote.amount,course.currentOffering.price);assert.equal(quote.currency,'USD');assert.equal(quote.recommendationStart,course.recommendationStart);assert.equal(quote.recommendationEnd,course.recommendationEnd);
    assert.deepEqual(quote.sourceIds,course.identitySourceIds);
    for(const id of quote.sourceIds){const source=rates.sources.find(row=>row.id===id);assert(source);assert.equal(source.status,200);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(source.capture)).digest('hex'),source.sha256);}
  }
  const environmental=price.courseQuotes.find(row=>row.code==='UPIS-0025');assert.equal(environmental.sourceCredits,1,'The course-page 3-credit headline cannot overwrite the separate ACE one-credit recommendation.');
});

test('UPI general and TESU price context retains the actual captured source without applying eligibility assumptions',()=>{
  for(const source of review.sources){assert.deepEqual(rates.sources.find(row=>row.id===source.id),source);assert.equal(source.reviewBasis.httpStatus,200);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(source.reviewBasis.document)).digest('hex'),source.reviewBasis.sha256);}
  const general=fs.readFileSync(review.sources[0].reviewBasis.document,'utf8'),tesu=fs.readFileSync(review.sources[1].reviewBasis.document,'utf8');
  assert.match(general,/For US citizens, permanent residents and military/);assert.match(general,/International Student Pricing/);assert.match(general,/official transcript is \$20/i);assert.match(tesu,/\$25 once for unlimited requests/);
  assert.equal(rates.sources.find(row=>row.id==='study-pricing').checkedOn,'2026-11-19','An independent UPI price review cannot refresh Study.com.');
  assert.equal(rates.providers.find(row=>row.provider==='Study.com').amount,235);assert.equal(rates.providers.find(row=>row.provider==='Sophia').amount,99);
});

test('standalone UPI courses are purchased once each, not as exams, credits or monthly memberships',()=>{
  const f=fixture(['UPIS-0003','UPIS-0010']),before=JSON.stringify(f),result=Estimate.calculate(f);
  assert.equal(result.available,true,result.reason);assert.equal(result.status,'planning-range');assert.deepEqual(result.costs.outsideCourses,{min:500,max:500});
  assert.deepEqual(result.costs.knownRange,{min:800,max:800});assert.equal(result.costs.providerBreakdown[0].courses,2);assert.match(result.costs.providerBreakdown[0].priceLabel,/standalone course purchases/);
  assert(result.notes.some(note=>/without assuming US, military or enrolled-TESU-student/.test(note)));assert(result.costs.missing.some(note=>/UPI direct transcript charges are not included/.test(note)));
  assert.equal(JSON.stringify(f),before,'Price calculation cannot change accepted mappings or student course records.');
  const fast=Estimate.calculate({...f,assumptions:{outsideCoursesPerMonthMin:4,outsideCoursesPerMonthMax:4}}),slow=Estimate.calculate({...f,assumptions:{outsideCoursesPerMonthMin:.25,outsideCoursesPerMonthMax:.25}});
  assert.deepEqual(fast.costs.outsideCourses,slow.costs.outsideCourses,'Time assumptions cannot turn a standalone purchase into additional billed memberships.');
  assert.equal(result.costs.complete,false);
});

test('one-credit ACE coursework uses its exact course purchase, independent of a three-credit NCCRS marketing total',()=>{
  const f=fixture(['UPIS-0025']),result=Estimate.calculate(f);assert.equal(result.available,true,result.reason);assert.equal(result.counts.totalUnits,4);assert.deepEqual(result.costs.outsideCourses,{min:250,max:250});
  for(const credits of[3,4,null,undefined]){
    const changed=clone(f);changed.program.requirements[0].options[0].sourceCredits=credits;changed.plan.rows[0].option.sourceCredits=credits;
    const partial=Estimate.calculate(changed);assert.equal(partial.available,true,partial.reason);assert.equal(partial.status,'partial-range');assert.equal(partial.costs.outsideCourses,null);assert.equal(partial.costs.providerBreakdown[0].cost,null);
  }
});

test('unknown or mismatched source version, units, recommendation period and course identity stay explicitly unpriced',()=>{
  for(const patch of[{courseVersion:undefined},{courseVersion:2},{sourceCreditSystem:'quarter'},{sourceCreditSystem:null},{recommendationStart:'2025-02-01'},{recommendationEnd:undefined},{code:'UPIS-UNREVIEWED'}]){
    const f=fixture();Object.assign(f.program.requirements[0].options[0],patch);Object.assign(f.plan.rows[0].option,patch);
    const result=Estimate.calculate(f);assert.equal(result.available,true,JSON.stringify(patch)+' '+result.reason);assert.equal(result.status,'partial-range');assert.equal(result.costs.outsideCourses,null);assert.equal(result.costs.providerBreakdown[0].cost,null);assert(result.costs.missing.some(note=>/exact source-course version/.test(note)));assert.deepEqual(result.costs.knownRange,{min:300,max:300});
  }
  const f=fixture();f.plan.rows[0].option.courseVersion=String(f.plan.rows[0].option.courseVersion);f.program.requirements[0].options[0].courseVersion=f.plan.rows[0].option.courseVersion;
  assert.deepEqual(Estimate.calculate(f).costs.outsideCourses,{min:250,max:250},'Numeric and string representations of the same explicit version bind identically.');
});

test('finished or reported UPI coursework is not purchased or charged for a new transcript automatically',()=>{
  const f=fixture(),row=f.plan.rows[0];row.status='reported';const result=Estimate.calculate(f);
  assert.equal(result.available,true,result.reason);assert.equal(result.counts.remainingOutsideCourses,0);assert.equal(result.counts.finishedUnits,3);assert.deepEqual(result.costs.outsideCourses,{min:0,max:0});assert.equal(result.costs.providerBreakdown.length,0);assert.deepEqual(result.costs.knownRange,{min:300,max:300});
  assert(result.notes.some(note=>/school acceptance of reported credit remains separate/.test(note)));
});

test('a per-course provider cannot gain a generic fallback, stale recommendation or ungrounded quote',()=>{
  const future=new Date(rates.checkedOn+'T00:00:00Z');future.setUTCDate(future.getUTCDate()+1);
  for(const [label,mutate]of[
    ['generic fallback',row=>row.amount=250],
    ['missing exact quotes',row=>row.courseQuotes=[]],
    ['duplicate identity',row=>row.courseQuotes.push(clone(row.courseQuotes[0]))],
    ['unbound price source',row=>row.courseQuotes[0].sourceIds=['missing-source']],
    ['unknown version',row=>row.courseQuotes[0].courseVersion=null],
    ['unknown original credits',row=>row.courseQuotes[0].sourceCredits=null],
    ['unknown original units',row=>row.courseQuotes[0].sourceCreditSystem='unknown'],
    ['future price review',row=>row.courseQuotes[0].checkedOn=future.toISOString().slice(0,10)],
    ['expired recommendation',row=>row.courseQuotes[0].recommendationEnd='2025-01-01'],
    ['unreviewed currency',row=>row.courseQuotes[0].currency='EUR']
  ]){const copy=clone(rates);mutate(copy.providers.find(row=>row.provider==='UPI Study'));assert.throws(()=>Estimate.assertRates(copy),undefined,label);}
});

test('partial prices are visible and the ordinary qualified estimate never becomes a discount or graduation promise',()=>{
  const f=fixture(),result=Estimate.calculate(f),html=View.render(result);assert.match(html,/UPI Study/);assert.match(html,/\$250/);assert.match(html,/transcript charges are not included/);assert.equal(result.timing.totalMonths,null);assert.equal(result.costs.complete,false);
  f.program.requirements[0].options[0].courseVersion=null;f.plan.rows[0].option.courseVersion=null;
  const partial=Estimate.calculate(f),partialHTML=View.render(partial);assert.match(partialHTML,/Not included/);assert.match(partialHTML,/UPI Study/);assert.match(partialHTML,/exact source-course version/);
});
