/* Campus preferences travel through actual course/cost comparison calculations. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Comparison=require('./dist/plan-comparison-engine.js'),Journey=require('./dist/journey-engine.js');
const copy=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const source={id:'catalog',title:'Synthetic official catalog',url:'https://example.edu/catalog'};
 const option=(provider,code)=>({id:provider+'-'+code,provider,code,title:code,credits:3,creditSystem:'semester',evidence:'published',sourceIds:['catalog']});
 const models=['far','local'].map((id,index)=>({id,school:id+' University',title:(index?'Z':'A')+' Business degree',level:'bachelor',format:'Residential',creditSystem:'semester',totalCredits:6,institutionMinCredits:3,upperMinCredits:0,externalMaxCredits:3,sources:[source],pricing:{model:'per-credit',amount:500,currency:'USD',sourceUrl:'https://example.edu/tuition'},requirements:[{id:'writing',code:'writing',title:'Writing',credits:3,category:'general',options:[option('University','WRIT')]},{id:'capstone',code:'CAP',title:'Capstone',credits:3,category:'major',institutionalOnly:true,options:[option('University','CAP')]}]}));
 const pathways=models.map(model=>({id:model.id,modelId:model.id,school:model.school,title:model.title,level:'bachelor',field:'business',fields:['business'],goals:['any-degree'],modalities:['campus']}));
 const catalog={pathways,curriculumRegistry:{models:models.map(model=>({id:model.id,routeIds:[model.id],coverage:'complete',readyTemplate:true,unresolvedRequiredChoices:0}))}};
 let state=Journey.initialize(null,null,catalog);state=Journey.applyAnswer(state,'start','explore',catalog);
 Object.assign(state.profile,{goal:'any-degree',degreeLevel:'bachelor',field:'any',modality:'campus',priority:'balanced',campusLocation:'near-home',homeState:'VA'});state.journey.step='routes';state.whatIf={};state.sheet.notes={private:'Keep this private note'};
 const campus=(route,state)=>({id:route.id+'-campus',school:route.school,city:'Test City',state,routeIds:[route.id],sourceUrls:['https://example.edu/campus'],traits:[]});
 const facts={campuses:[campus(pathways[0],'AZ'),campus(pathways[1],'VA')]};
 return{state,catalog,models,facts,option};
}
function build(f,priority='credits',extra={}){return Comparison.build(f.state,{...f.catalog,...extra},f.models,{entries:[]},{fromCourses:true,priority,deferMatrix:true});}
test('a sourced campus preference breaks a true academic and price tie in the final comparison',()=>{
 const f=fixture(),before=JSON.stringify(f.state),plain=build(f),personal=build(f,'credits',{campusFacts:f.facts});
 assert.deepEqual(plain.scenarios.map(row=>row.pathwayId),['far','local']);
 assert.deepEqual(personal.scenarios.map(row=>row.pathwayId),['local','far']);
 assert(personal.scenarios.every(row=>row.available&&row.eligible));
 assert.equal(personal.scenarios[0].summary.estimatedBaseCost,personal.scenarios[1].summary.estimatedBaseCost);
 assert.equal(personal.scenarios[0].summary.collectionFitFraction,personal.scenarios[1].summary.collectionFitFraction);
 assert(personal.scenarios[0].recommendationReasons.some(reason=>/home state/.test(reason)));
 assert.equal(JSON.stringify(f.state),before);
});
test('missing, wrong-route or unsafe campus evidence stays neutral during final comparison',()=>{
 for(const alter of [facts=>{facts.campuses[1].routeIds=['different-program'];},facts=>{facts.campuses[1].sourceUrls=['javascript:alert(1)'];}]){
  const f=fixture();alter(f.facts);const result=build(f,'credits',{campusFacts:f.facts});
  assert.deepEqual(result.scenarios.map(row=>row.pathwayId),['far','local']);
  assert(result.scenarios.every(row=>!row.recommendationReasons.some(reason=>/home state/.test(reason))));
 }
});
test('an explicit cost priority still orders by available cost ahead of a campus preference',()=>{
 const f=fixture();f.models[0].pricing.amount=100;
 const result=build(f,'cost',{campusFacts:f.facts});
 assert.deepEqual(result.scenarios.map(row=>row.pathwayId),['far','local']);
 assert(result.scenarios[0].summary.estimatedBaseCost<result.scenarios[1].summary.estimatedBaseCost);
 assert(result.scenarios[1].recommendationReasons.some(reason=>/home state/.test(reason)));
 assert.equal(result.rankingScope.orderingMetric,'estimatedBaseCost');
});
test('course reuse continues to rank before campus fit while all original learning remains unchanged',()=>{
 const f=fixture();f.models[0].requirements[0].options=[f.option('Sophia','S1')];
 f.state.learning=[{id:'original-course',provider:'Sophia',code:'S1',title:'Writing',credits:3,creditSystem:'semester',status:'saved',evaluations:[]}];
 f.state.scenarios={far:{providers:['Sophia'],allowConditional:true}};const before=JSON.stringify(f.state);
 const result=build(f,'credits',{campusFacts:f.facts});
 assert.deepEqual(result.scenarios.map(row=>row.pathwayId),['far','local']);
 assert(result.scenarios[0].summary.collectionFitFraction>result.scenarios[1].summary.collectionFitFraction);
 assert(result.scenarios[1].recommendationReasons.some(reason=>/home state/.test(reason)));
 assert.equal(JSON.stringify(f.state),before);
});
test('a chosen active degree remains first in an explicit comparison despite a stronger campus preference elsewhere',()=>{
 const f=fixture();f.state=Journey.selectRoute(f.state,f.catalog.pathways[0],f.catalog);const before=JSON.stringify(f.state);
 const result=Comparison.build(f.state,{...f.catalog,campusFacts:f.facts},f.models,{entries:[]},{selectedIds:['current','route:local'],deferMatrix:true});
 assert.deepEqual(result.scenarios.map(row=>row.pathwayId),['far','local']);assert.equal(result.scenarios[0].isCurrent,true);
 assert(result.scenarios[1].recommendationReasons.some(reason=>/home state/.test(reason)));
 assert.equal(JSON.stringify(f.state),before);assert.equal(f.state.selectedPathwayId,'far');
});
