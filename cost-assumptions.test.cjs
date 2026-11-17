/* Exercise the form's actual successful controls and its Journey price adapter. */
const test=require('node:test'),assert=require('node:assert/strict');
const Form=require('./dist/cost-assumptions.js'),Planner=require('./dist/planner.js'),Journey=require('./dist/journey-engine.js'),Comparison=require('./dist/plan-comparison-engine.js');
const copy=value=>JSON.parse(JSON.stringify(value));
const option=(provider,code)=>({id:provider+'-'+code,provider,code,title:code,credits:3,creditSystem:'semester',evidence:'published',sourceIds:['catalog']});
function fixture(){
 const req=(id,provider,code,extra={})=>({id,title:id,credits:3,category:'general',options:[option(provider,code)],...extra});
 const program={id:'cost-form-degree',school:'Example University',title:'B.S. Form journey',level:'bachelor',format:'Online',creditSystem:'semester',totalCredits:12,institutionMinCredits:3,externalMaxCredits:9,upperMinCredits:0,sources:[{id:'catalog',title:'Synthetic test catalog',url:'https://example.edu/catalog'}],requirements:[req('writing','StraighterLine','ENG101'),req('math','StraighterLine','MAT101'),req('social','Saylor','SOC100'),req('capstone','University','CAP',{institutionalOnly:true})]};
 const route={id:program.id,modelId:program.id,school:program.school,title:program.title,level:'bachelor',modalities:['online'],field:'general',goals:['any-degree','career-growth']},catalog={pathways:[route]};
 let state=Journey.initialize(null,null,catalog);state.selectedPathwayId=route.id;state.sheet.isExample=false;state.profile={...state.profile,goal:'any-degree',degreeLevel:'bachelor',field:'any',modality:'online',school:route.school,degree:route.title,pathwayId:route.id,hasPrior:'none'};
 state.learning=[{id:'keep-record',provider:'Old college',code:'HIST100',title:'Private saved course',credits:3,creditSystem:'semester',status:'saved',evaluations:[]}];state.sheet.notes={private:'Keep my private note'};
 state.scenarios[program.id]={providers:['StraighterLine','Saylor','Sophia','Study.com','CLEP'],priority:'transfer',universityRate:'',fees:'',providerWeeks:{Saylor:2,'Inactive provider':8}};
 return{program,route,catalog,state,saved:state.scenarios[program.id]};
}
const draft=f=>Journey.buildDraft(f.state,f.catalog,[f.program]);
function decode(value){return String(value).replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');}
function controls(html){
 const data=new Map();
 for(const tag of html.match(/<input\b[^>]*>/g)||[]){
  const attributes=Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(match=>[match[1],decode(match[2])]));
  if(!attributes.name||attributes.type==='checkbox'&&!/\schecked(?:\s|>)/.test(tag))continue;
  data.set(attributes.name,attributes.value??'on');
 }
 return data;
}
function quote(data,provider,amount,{taxes=true,examFees=true}={}){
 data.set('providerQuote:'+provider,String(amount));data.set('quoteReviewed:'+provider,'on');
 if(taxes)data.set('quoteTaxes:'+provider,'on');else data.delete('quoteTaxes:'+provider);
 if(examFees)data.set('quoteExamFees:'+provider,'on');else data.delete('quoteExamFees:'+provider);
 return data;
}
function completeForm(f,d=draft(f)){
 const data=controls(Form.render(d,f.saved));data.set('universityRate','100');data.set('fees','50');data.set('feesConfirmed','on');quote(data,'StraighterLine',250);quote(data,'Saylor',10);return data;
}
function applied(f,changes){const next=copy(f.state);next.scenarios[f.program.id]={...next.scenarios[f.program.id],...changes};return next;}

test('malformed custom-price storage requires an explicit reset before new prices are saved',()=>{
 const f=fixture();f.saved.providerQuotes=['unreadable'];const d=draft(f),data=completeForm(f,d),before=JSON.stringify(f.state);
 assert.match(Form.render(d,f.saved),/Start over with published prices/);assert.throws(()=>Form.parse(data,d,f.saved),/Review your custom prices/);assert.equal(JSON.stringify(f.state),before);
 data.set('resetProviderQuotes','on');const changes=Form.parse(data,d,f.saved);assert.equal(changes.providerQuotes.StraighterLine.amount,250);assert.equal(changes.providerQuotes.Saylor.amount,10);assert.equal(Array.isArray(changes.providerQuotes),false);
});
test('an unreadable provider price cannot silently disappear when a different estimate is edited',()=>{
 const f=fixture();f.saved.providerQuotes={StraighterLine:'unreadable'};const d=draft(f),data=controls(Form.render(d,f.saved));
 assert.match(Form.render(d,f.saved),/Enter a valid price or choose published prices/);assert.throws(()=>Form.parse(data,d,f.saved),/Review the StraighterLine custom price/);
 data.set('resetQuote:StraighterLine','on');assert.equal(Object.hasOwn(Form.parse(data,d,f.saved).providerQuotes,'StraighterLine'),false);
});

test('the actual rendered Add estimate controls can complete a remaining-cost comparison',()=>{
 const f=fixture(),initial=draft(f),before=JSON.stringify(f.state),data=completeForm(f,initial);
 assert.equal(Comparison.remainingCosts(initial,f.state,{}).total,null);
 const changes=Form.parse(data,initial,f.saved),next=applied(f,changes),updated=Journey.buildDraft(next,f.catalog,[f.program]),cost=Comparison.remainingCosts(updated,next,{});
 assert.equal(cost.total,610);assert.equal(cost.complete,true);assert.equal(cost.universityTuition,300);assert.equal(cost.outsideCourses,260);
 assert.deepEqual(updated.plan.costs.providerCosts.map(row=>[row.provider,row.amount]),[['StraighterLine',250],['Saylor',10]]);
 assert.equal(JSON.stringify(f.state),before);assert.deepEqual(next.learning,f.state.learning);assert.deepEqual(next.sheet.notes,f.state.sheet.notes);assert.equal(updated.plan.totals.confirmed,0);
});
test('only providers with remaining work render price and pace controls',()=>{
 const f=fixture(),d=draft(f),html=Form.render(d,f.saved),data=controls(html);
 assert.deepEqual(Form.futureProviders(d),['StraighterLine','Saylor']);assert(data.has('providerQuote:StraighterLine'));assert(data.has('providerQuote:Saylor'));
 for(const name of ['sophiaMonths','studyMonths','clepWeeks','providerWeeks:Inactive provider','providerQuote:University'])assert.equal(data.has(name),false,name);
 assert.equal(data.get('providerWeeks:Saylor'),'2');assert.match(html,/No|remaining/);
 const finished={program:f.program,plan:{rows:d.plan.rows.map(row=>({...row,status:'confirmed'}))}};
 assert.match(Form.render(finished,f.saved),/No outside courses remain/);assert.deepEqual(Form.futureProviders(finished),[]);
});
test('blank quoted prices remain unknown and explicit zero is a reviewed zero-dollar assumption',()=>{
 const f=fixture(),d=draft(f),empty=controls(Form.render(d,f.saved)),blank=Form.parse(empty,d,f.saved);
 assert.equal(blank.universityRate,'');assert.equal(blank.fees,'');assert.deepEqual(blank.providerQuotes,{});
 const blankState=applied(f,blank),blankCost=Comparison.remainingCosts(Journey.buildDraft(blankState,f.catalog,[f.program]),blankState,{});assert.equal(blankCost.estimatedBaseCost,null);assert.equal(blankCost.total,null);
 const data=completeForm(f,d);quote(data,'StraighterLine',0);quote(data,'Saylor',0);data.set('fees','0');const next=applied(f,Form.parse(data,d,f.saved)),cost=Comparison.remainingCosts(Journey.buildDraft(next,f.catalog,[f.program]),next,{});
 assert.equal(cost.total,300);assert.equal(cost.outsideCourses,0);assert.equal(next.scenarios[f.program.id].providerQuotes.StraighterLine.amount,0);
});
test('a quoted price requires review of the displayed current course scope',()=>{
 const f=fixture(),d=draft(f),data=completeForm(f,d);data.delete('quoteReviewed:StraighterLine');assert.throws(()=>Form.parse(data,d,f.saved),/Confirm the StraighterLine price/);
 data.set('quoteReviewed:StraighterLine','on');data.set('quoteKeys:StraighterLine','not json');assert.throws(()=>Form.parse(data,d,f.saved),/Reopen estimates/);
});
test('courses changed after opening the form cannot silently inherit the old remaining-total quote',()=>{
 const f=fixture(),original=draft(f),data=completeForm(f,original),nextProgram=copy(f.program);nextProgram.requirements[1].options=[option('StraighterLine','MAT102')];
 const fresh=Journey.buildDraft(f.state,f.catalog,[nextProgram]);assert.throws(()=>Form.parse(data,fresh,f.saved),/remaining courses changed/);
 const parsed=Form.parse(data,original,f.saved),saved={...f.saved,...parsed},staleHTML=Form.render(fresh,saved),stale=controls(staleHTML);
 assert.match(staleHTML,/course list changed/);assert.equal(stale.has('quoteReviewed:StraighterLine'),false);assert.throws(()=>Form.parse(stale,fresh,saved),/Confirm the StraighterLine price/);
});
test('unchecking rendered confirmations saves boolean false and leaves unrendered flags alone',()=>{
 const f=fixture();f.program.format='Residential';f.program.requirements[0].options=[option('Sophia','S1')];f.program.requirements[2].options=[option('CLEP','C1')];f.saved.fees=0;
 Object.assign(f.saved,{feesConfirmed:true,taxesConfirmed:true,examFeesConfirmed:true,housingConfirmed:true,modernStates:true,voucherConfirmed:true});
 const d=draft(f),data=controls(Form.render(d,f.saved));for(const flag of ['feesConfirmed','taxesConfirmed','examFeesConfirmed','housingConfirmed','modernStates','voucherConfirmed'])data.delete(flag);
 const changes=Form.parse(data,d,f.saved);for(const flag of ['feesConfirmed','taxesConfirmed','examFeesConfirmed','housingConfirmed','modernStates','voucherConfirmed'])assert.equal(changes[flag],false,flag);
 const next=applied(f,changes),cost=Comparison.remainingCosts(Journey.buildDraft(next,f.catalog,[f.program]),next,{});assert.equal(cost.complete,false);assert.equal(cost.total,null);
 const online=fixture();online.saved.housingConfirmed=true;const onlineChanges=Form.parse(controls(Form.render(draft(online),online.saved)),draft(online),online.saved);assert.equal(Object.hasOwn(onlineChanges,'housingConfirmed'),false);
});
test('provider quote inclusions stay separate and cannot be approved through a global checkbox',()=>{
 const f=fixture(),d=draft(f),data=completeForm(f,d);data.delete('quoteTaxes:StraighterLine');data.delete('quoteExamFees:Saylor');data.set('taxesConfirmed','on');data.set('examFeesConfirmed','on');
 const next=applied(f,Form.parse(data,d,f.saved)),cost=Comparison.remainingCosts(Journey.buildDraft(next,f.catalog,[f.program]),next,{});
 assert.equal(cost.total,null);assert(cost.missing.includes('StraighterLine taxes and checkout charges included in your quote'));assert(cost.missing.includes('Saylor administration/proctoring charges included in your quote'));
});
test('clearing an optional Sophia price restores the ordinary modeled subscription instead of free study',()=>{
 const f=fixture();f.program.requirements[0].options=[option('Sophia','S1')];f.program.requirements[1].options=[option('Sophia','S2')];const d=draft(f);
 f.saved.providerQuotes={Sophia:{amount:10,courseKeys:Planner.providerQuoteKeys(d.plan.rows,'Sophia'),includesTaxes:true}};
 const data=controls(Form.render(d,f.saved));data.set('providerQuote:Sophia','');const changes=Form.parse(data,d,f.saved);assert.equal(Object.hasOwn(changes.providerQuotes,'Sophia'),false);
 const next=applied(f,changes),restored=Journey.buildDraft(next,f.catalog,[f.program]),expected=copy(f.state);delete expected.scenarios[f.program.id].providerQuotes;const baseline=Journey.buildDraft(expected,f.catalog,[f.program]);
 const priced=restored.plan.costs.providerCosts.find(row=>row.provider==='Sophia');assert(priced.amount>0);assert.notEqual(priced.basis,'student-quote');assert.equal(priced.amount,baseline.plan.costs.providerCosts.find(row=>row.provider==='Sophia').amount);
});
test('optional provider weeks preserve other estimates and reject invalid numeric input',()=>{
 const f=fixture(),d=draft(f),data=controls(Form.render(d,f.saved));data.set('providerWeeks:StraighterLine','1.5');data.set('providerWeeks:Saylor','');const changes=Form.parse(data,d,f.saved);
 assert.deepEqual(changes.providerWeeks,{'Inactive provider':8,StraighterLine:1.5,Saylor:null});assert.deepEqual(f.saved.providerWeeks,{Saylor:2,'Inactive provider':8});
 for(const value of ['-2','NaN','Infinity','1e3']){data.set('providerWeeks:StraighterLine',value);assert.throws(()=>Form.parse(data,d,f.saved),/valid|Check/);}
});
test('price references and imported provider labels render safely and reject unsafe links',()=>{
 const f=fixture(),d=draft(f),data=completeForm(f,d);
 for(const source of ['javascript:alert(1)','http://example.edu/price','https://name:secret@example.edu/price']){data.set('quoteSource:StraighterLine',source);assert.throws(()=>Form.parse(data,d,f.saved),/https|sign-in/);}
 data.set('quoteSource:StraighterLine','https://example.edu/price?plan=summer');const changes=Form.parse(data,d,f.saved);assert.equal(changes.providerQuotes.StraighterLine.sourceUrl,'https://example.edu/price?plan=summer');
 const evil='<img src=x onerror=alert(1)>',row=copy(d.plan.rows[0]);row.option.provider=evil;const html=Form.render({program:f.program,plan:{rows:[row]}},{providerQuotes:{[evil]:{amount:1,sourceUrl:'"><script>bad()</script>'}}});
 assert.doesNotMatch(html,/<img|<script/);assert.match(html,/&lt;img/);assert.match(html,/&lt;script/);
});
test('fee and voucher confirmations cannot manufacture amounts or eligibility',()=>{
 const f=fixture(),d=draft(f),data=controls(Form.render(d,f.saved));data.set('feesConfirmed','on');assert.throws(()=>Form.parse(data,d,f.saved),/fees total/);
 data.set('fees','0');assert.equal(Form.parse(data,d,f.saved).fees,0);
 data.set('hasFlag:voucherConfirmed','1');data.set('voucherConfirmed','on');assert.throws(()=>Form.parse(data,d,f.saved),/Modern States voucher option/);
});
test('a fee checkbox without a valid amount cannot confirm a missing or null saved quote',()=>{
 const f=fixture(),d=draft(f),data=new Map([['hasFlag:feesConfirmed','1'],['feesConfirmed','on']]);
 for(const fees of [undefined,null,''])assert.throws(()=>Form.parse(data,d,{...f.saved,fees}),/fees total/);
 assert.equal(Form.parse(data,d,{...f.saved,fees:0}).feesConfirmed,true);
});
test('the estimate summary does not turn missing tuition and zero outside charges into a free degree',()=>{
 const unknown=Form.summary({complete:false,total:null,estimatedBaseCost:null,knownSubtotal:0,missing:['University tuition needs a quote.']});
 assert.match(unknown,/Costs need an estimate/);assert.match(unknown,/Set your pace below/);assert.doesNotMatch(unknown,/>\$0</);
 const finished=Form.summary({complete:true,total:0,estimatedBaseCost:0,knownSubtotal:0,missing:[]});assert.match(finished,/Remaining cost estimate/);assert.match(finished,/>\$0</);
 const partial=Form.summary({complete:false,total:null,estimatedBaseCost:4300,knownSubtotal:4350,missing:['Fees need checking.']});assert.match(partial,/Tuition \+ courses estimate/);assert.match(partial,/>\$4,300</);assert.doesNotMatch(partial,/>\$4,350</);
});
test('remaining checks in the summary are deduplicated and untrusted text stays text',()=>{
 const html=Form.summary({complete:false,estimatedBaseCost:null,knownSubtotal:50,missing:['Fees','<img src=x onerror=bad()>']},{scenarioWeeks:12,missing:['Fees','School schedule']});
 assert.match(html,/Known costs so far/);assert.match(html,/Finish my estimate · 3/);assert.match(html,/12 estimated weeks of study/);assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);
});
