const test=require('node:test'),assert=require('node:assert/strict');
const P=require('./dist/planner.js'),E=require('./dist/plan-comparison-engine.js'),J=require('./dist/journey-engine.js');
const copy=value=>JSON.parse(JSON.stringify(value));
const option=(provider,code,extra={})=>({id:provider+'-'+code,provider,code,title:code,credits:3,creditSystem:'semester',evidence:'published',sourceIds:['source'],...extra});
function model(){
 const req=(id,provider,code,extra={})=>({id,title:id,credits:3,category:'general',options:[option(provider,code)],...extra});
 return{id:'quote-test',school:'Example University',title:'Quoted degree',level:'bachelor',format:'Online',creditSystem:'semester',totalCredits:12,institutionMinCredits:3,upperMinCredits:0,externalMaxCredits:9,sources:[{id:'source',url:'https://example.edu/catalog'}],requirements:[req('writing','StraighterLine','ENG101'),req('math','StraighterLine','MAT101'),req('social','Saylor','SOC100'),req('capstone','University','CAP',{institutionalOnly:true})]};
}
const inputs=patch=>({providers:['StraighterLine','Saylor','Sophia','Study.com','CLEP','DSST'],priority:'transfer',universityRate:100,fees:50,feesConfirmed:true,taxesConfirmed:false,examFeesConfirmed:false,...patch});
function quoteFor(rows,provider,amount,patch={}){return{amount,courseKeys:P.providerQuoteKeys(rows,provider),includesTaxes:true,includesExamFees:true,sourceUrl:'https://example.edu/price',...patch};}
function priced(p=model(),patch={}){const input=inputs(patch),plan=P.generate(p,input);input.providerQuotes={StraighterLine:quoteFor(plan.rows,'StraighterLine',250),Saylor:quoteFor(plan.rows,'Saylor',10),...patch.providerQuotes};return{p,input,plan:P.generate(p,input)};}
test('remaining provider quotes finish a scoped estimate without multiplying totals by courses',()=>{
 const {p,input,plan}=priced(),before=JSON.stringify(input),cost=E.remainingCosts({program:p,plan,input},{},{});
 assert.equal(cost.universityTuition,300);assert.equal(cost.outsideCourses,260);assert.equal(cost.total,610);assert.equal(cost.complete,true);assert.deepEqual(plan.costs.providerCosts.map(row=>[row.provider,row.amount]),[['StraighterLine',250],['Saylor',10]]);
 assert.equal(plan.costs.providerCosts[0].basis,'student-quote');assert.equal(plan.costs.providerCosts[0].courseKeys.length,2);assert.equal(JSON.stringify(input),before);
});
test('a quote is bound to the remaining course basket, including after partial completion',()=>{
 const {p,input}=priced();input.completed=[{requirementId:'writing',optionId:'StraighterLine-ENG101',status:'confirmed'}];
 const partial=P.generate(p,input);assert.equal(partial.costs.providerCosts.find(row=>row.provider==='StraighterLine').amount,null);assert(partial.costs.missing.some(reason=>reason==='StraighterLine quote needs updating for the remaining course list'));
 input.completed.push({requirementId:'math',optionId:'StraighterLine-MAT101',status:'confirmed'});const done=P.generate(p,input);assert(!done.costs.providerCosts.some(row=>row.provider==='StraighterLine'));assert.equal(done.costs.total,360);
});
test('adding or changing a provider course invalidates the previous remaining-total quote',()=>{
 const {p,input}=priced();p.requirements[1].options=[option('StraighterLine','MAT102')];const changed=P.generate(p,input);assert.equal(changed.costs.providerCosts.find(row=>row.provider==='StraighterLine').amount,null);assert(changed.costs.missing.some(reason=>/StraighterLine quote needs updating/.test(reason)));
 const added=model();added.requirements.push({id:'extra',title:'Extra',credits:3,category:'general',options:[option('StraighterLine','SCI101')]});added.totalCredits=15;added.externalMaxCredits=12;assert(P.generate(added,input).costs.missing.some(reason=>/StraighterLine quote needs updating/.test(reason)));
});
test('only an explicitly entered numeric zero becomes a zero-dollar quote',()=>{
 const {p,input,plan}=priced();input.providerQuotes.StraighterLine=quoteFor(plan.rows,'StraighterLine',0);assert.equal(P.generate(p,input).costs.total,360);
 for(const amount of ['',null,undefined,'0',-1,Infinity,NaN,1.005]){input.providerQuotes.StraighterLine={...input.providerQuotes.StraighterLine,amount};const invalid=P.generate(p,input);assert.equal(invalid.costs.providerCosts.find(row=>row.provider==='StraighterLine').amount,null);assert.equal(invalid.costs.total,null);}
});
test('global checkboxes cannot approve stale quotes or charges excluded from a provider quote',()=>{
 const {p,input}=priced();input.taxesConfirmed=true;input.examFeesConfirmed=true;input.providerQuotes.StraighterLine.includesTaxes=false;input.providerQuotes.Saylor.includesExamFees=false;
 const plan=P.generate(p,input);assert(plan.costs.missing.includes('StraighterLine taxes and checkout charges included in your quote'));assert(plan.costs.missing.includes('Saylor administration/proctoring charges included in your quote'));assert.equal(plan.costs.total,null);
 input.providerQuotes.StraighterLine.courseKeys=['StraighterLine:old'];assert(P.generate(p,input).costs.missing.some(reason=>/quote needs updating/.test(reason)));
});
test('one provider quote does not confirm another provider checkout price or university fees',()=>{
 const p=model();p.requirements[2].options=[option('Study.com','S1')];const base=P.generate(p,inputs());const input=inputs({providerQuotes:{StraighterLine:quoteFor(base.rows,'StraighterLine',250)},feesConfirmed:false});
 const plan=P.generate(p,input);assert(plan.costs.missing.includes('Provider taxes and checkout price'));assert(plan.costs.missing.includes('University and transcript fees verified against your quote'));assert.equal(plan.costs.total,null);
});
test('a six-credit bundled exam has one quote key and one future purchase',()=>{
 const p=model();p.totalCredits=9;p.externalMaxCredits=6;p.requirements=p.requirements.slice(0,2).map((row,index)=>({...row,options:[option('CLEP','COMP',{bundleId:'composition',bundleCredits:6})]})).concat(p.requirements[3]);
 const input=inputs(),base=P.generate(p,input);assert.deepEqual(P.providerQuoteKeys(base.rows,'CLEP'),['bundle:composition']);input.providerQuotes={CLEP:quoteFor(base.rows,'CLEP',20)};
 const plan=P.generate(p,input);assert.equal(plan.costs.providerCosts.length,1);assert.equal(plan.costs.providerCosts[0].amount,20);assert.equal(plan.costs.total,370);
});
test('unsafe or malformed quote metadata cannot become a priced complete estimate',()=>{
 for(const patch of [{sourceUrl:'javascript:alert(1)'},{sourceUrl:'https://name:secret@example.edu/'},{courseKeys:['StraighterLine:ENG101','StraighterLine:ENG101']},{includesTaxes:'true'}]){const {p,input}=priced();Object.assign(input.providerQuotes.StraighterLine,patch);const plan=P.generate(p,input);assert.equal(plan.costs.providerCosts.find(row=>row.provider==='StraighterLine').amount,null);assert.equal(plan.costs.total,null);}
});
test('a malformed saved quote collection cannot silently fall back to a complete published price',()=>{
 const p=model();p.requirements=[{...p.requirements[0],options:[option('Sophia','S1')]},p.requirements[3]];p.totalCredits=6;p.externalMaxCredits=3;
 for(const providerQuotes of [null,[],false,'invalid']){const plan=P.generate(p,inputs({providerQuotes,taxesConfirmed:true}));assert.equal(plan.costs.providerCosts[0].amount,null);assert.equal(plan.costs.total,null);assert(plan.costs.missing.some(reason=>/quote storage needs review/.test(reason)));}
});
test('the cost optimizer can select a quoted provider without an unknown-provider penalty',()=>{
 const p=model();p.requirements=[{...p.requirements[0],options:[option('StraighterLine','ENG101'),option('Sophia','S1')]},p.requirements[3]];p.totalCredits=6;p.externalMaxCredits=3;
 const input=inputs({priority:'cost',taxesConfirmed:true,providerQuotes:{StraighterLine:{amount:20,courseKeys:['StraighterLine:ENG101'],includesTaxes:true}}});
 const plan=P.generate(p,input);assert.equal(plan.rows[0].option.provider,'StraighterLine');assert.equal(plan.costs.total,370);
});
test('the actual Journey adapter forwards private quotes and keeps source records unchanged',()=>{
 const p=model(),route={id:p.id,modelId:p.id,school:p.school,title:p.title,level:'bachelor',modalities:['online'],field:'general',goals:['any-degree','career-growth']},catalog={pathways:[route]};
 let state=J.initialize(null,null,catalog);state.selectedPathwayId=p.id;state.profile={...state.profile,school:p.school,degree:p.title,pathwayId:p.id,hasPrior:'none',modality:'online'};
 const {input}=priced(p);state.scenarios[p.id]=copy(input);state.learning=[];const before=JSON.stringify(state.learning),draft=J.buildDraft(state,catalog,[p]),cost=E.remainingCosts(draft,state,{});
 assert.equal(cost.total,610);assert.equal(cost.complete,true);assert.equal(JSON.stringify(state.learning),before);assert.equal(draft.plan.totals.confirmed,0);
});
