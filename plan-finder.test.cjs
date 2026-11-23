/* Shared degree finder (dist/plan-finder.js): filters, sorts (including Best for my credits) and the plan card.
 * Synthetic plans and synthetic credits-worth results only. */
const test=require('node:test'),assert=require('node:assert/strict'),F=require('./dist/plan-finder.js');

const plans=[
 {id:'alpha-bs',school:'Alpha University',title:'Business',level:'bachelor',modalities:['online'],paceModel:'course-term'},
 {id:'beta-bs',school:'Beta College',title:'Accounting',level:'bachelor',modalities:['campus'],paceModel:'competency-subscription'},
 {id:'gamma-aa',school:'Gamma University',title:'General Studies',level:'associate',modalities:['online','campus'],paceModel:'self-paced'},
 {id:'delta-bs',school:'Delta University',title:'Psychology',level:'bachelor',modalities:['online'],paceModel:'course-term'}
];
const index={subjects:{business:'Business & management',psychology:'Psychology & human services'},plans:{
 'alpha-bs':{tier:'reviewed',subjects:['business'],start:{outside:60,university:60,total:120},estimate:{min:20000,max:22000},timing:{outsideMonths:{min:6,max:9},universityTerms:{min:4,max:6},termMonths:6},page:'/degree-plans/alpha-bs/'},
 'beta-bs':{tier:'confirmation',subjects:['business'],start:{outside:90,university:30,total:120},estimate:{min:15000,max:18000},timing:{outsideMonths:{min:8,max:12},universityTerms:{min:2,max:3},termMonths:6}},
 'gamma-aa':{tier:'reviewed',subjects:[],start:{outside:30,university:30,total:60}},
 'delta-bs':{tier:'reviewed',subjects:['psychology'],start:{outside:12,university:108,total:120},estimate:{min:40000,max:41000}}
}};
const ids=list=>list.map(p=>p.id);

test('filters by subject, level, format, school, confirmation, share, pace and search words',()=>{
 const ctx=F.context({index});const pick=f=>ids(plans.filter(p=>F.matches(ctx,p,f)));
 assert.deepEqual(pick({subject:'business'}),['alpha-bs','beta-bs']);
 assert.deepEqual(pick({level:'associate'}),['gamma-aa']);
 assert.deepEqual(pick({format:'campus'}),['beta-bs','gamma-aa']);
 assert.deepEqual(pick({school:'Delta University'}),['delta-bs']);
 assert.deepEqual(pick({confirm:false}),['alpha-bs','gamma-aa','delta-bs'],'plans that need school confirmation can be hidden');
 assert.deepEqual(pick({minShare:50}),['alpha-bs','beta-bs','gamma-aa']);
 assert.deepEqual(pick({selfPaced:true}),['beta-bs','gamma-aa']);
 assert.deepEqual(pick({q:'alpha business'}),['alpha-bs'],'every word must match');
 assert.deepEqual(pick({q:'psychology human'}),['delta-bs'],'subject labels are searchable');
 assert.deepEqual(pick({credit:'ace'}),[],'a credit source needs an accepting policy');
 assert.deepEqual(ids(plans.filter(p=>F.matches(ctx,p,{credit:'ace'},{policyOf:p=>p.id==='gamma-aa'?{ace:{status:'case-by-case'}}:{}}))),['gamma-aa']);
});

test('sorts by cost, credits for less, time, A–Z and school; unknown values go last',()=>{
 const ctx=F.context({index});
 assert.deepEqual(ids(F.sort(ctx,plans,'cost')),['beta-bs','alpha-bs','delta-bs','gamma-aa']);
 assert.deepEqual(ids(F.sort(ctx,plans,'outside')),['beta-bs','alpha-bs','gamma-aa','delta-bs']);
 assert.deepEqual(ids(F.sort(ctx,plans,'time')),['beta-bs','alpha-bs','gamma-aa','delta-bs'],'plans without timing go last, then by title');
 assert.deepEqual(ids(F.sort(ctx,plans,'az')),['beta-bs','alpha-bs','gamma-aa','delta-bs']);
 assert.deepEqual(ids(F.sort(ctx,plans,'school')),['alpha-bs','beta-bs','delta-bs','gamma-aa']);
 assert.deepEqual(F.sort(ctx,plans,'cost').map(p=>p.id),F.sort(ctx,[...plans].reverse(),'cost').map(p=>p.id),'the order does not depend on input order');
});

test('Best for my credits ranks plans by credits the student’s finished courses fill, then by cost',()=>{
 const worth=new Map([
  ['delta-bs',{routeId:'delta-bs',status:'ok',filled:9}],
  ['alpha-bs',{routeId:'alpha-bs',status:'ok',filled:9}],
  ['gamma-aa',{routeId:'gamma-aa',status:'ok',filled:3}],
  ['beta-bs',{routeId:'beta-bs',status:'needs-review'}]
 ]),ctx=F.context({index,worth});
 assert.deepEqual(ids(F.sort(ctx,plans,'credits')),['alpha-bs','delta-bs','gamma-aa','beta-bs']);
 assert.equal(F.filled(ctx,plans[1]),null,'a result that is not ok is unknown, never zero');
 assert.match(F.card(ctx,plans[0]),/Your finished courses could fill <strong>9<\/strong> credits/);
 assert.doesNotMatch(F.card(F.context({index}),plans[0]),/Your finished courses/,'no records, no claim');
});

test('the plan card shows cost, credits for less, badges, actions and Compare without inventing data',()=>{
 const ctx=F.context({index});
 const html=F.card(ctx,plans[1],{hooks:{card:'pf-program',school:'pf-school',price:'pf-price',primary:'pf-open-plan'},dataProgram:true,primary:{href:'portal.html?usePlan=beta-bs',label:'Build this plan'},compare:{checked:true}});
 assert.match(html,/class="fd-card pf-program" data-plan="beta-bs" data-program="beta-bs"/);
 assert.match(html,/<span class="pf-school">Beta College<\/span> · On campus/);
 assert.match(html,/Needs school confirmation/);
 assert.match(html,/<strong>\$15k–\$18k<\/strong>/);
 assert.match(html,/Low-cost credits<\/span><strong>90 of 120<\/strong>/);
 assert.match(html,/aria-label="90 of 120 credits can come from low-cost courses"/);
 assert.match(html,/<a class="fd-primary pf-open-plan" href="portal.html\?usePlan=beta-bs">Build this plan<\/a>/);
 assert.match(html,/<input type="checkbox" data-compare="beta-bs" checked>/);
 const unknown=F.card(F.context({index:{plans:{},subjects:{}}}),{id:'x-1',school:'X',title:'Y',level:'bachelor',modalities:[]});
 assert.match(unknown,/Ask the school/);assert.match(unknown,/<strong>—<\/strong>/);assert.doesNotMatch(unknown,/fd-bar/);
 assert.match(F.card(ctx,{...plans[0],title:'<b>x</b>'}),/&lt;b&gt;x&lt;\/b&gt;/,'text is escaped');
 const full=F.card(ctx,plans[2],{compare:{checked:false,disabled:true}});assert.match(full,/data-compare="gamma-aa" disabled/,'a fourth plan cannot be ticked');
 assert.match(F.card(ctx,{...plans[3],school:'Western Governors University'}),/Low-cost units/);
});

test('the starting route falls back to the baseline split when the index has none',()=>{
 const ctx=F.context({index:{plans:{'x-1':{tier:'reviewed'}}},splits:new Map([['x-1',{outside:40,university:80,total:120}]])});
 assert.deepEqual(F.start(ctx,{id:'x-1'}),{outside:40,university:80,total:120});
 assert.equal(F.share(ctx,{id:'x-1'}),1/3);
});
