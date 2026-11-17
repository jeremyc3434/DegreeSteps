/* Preloaded school facts. Rankings compare matching evidence scopes only. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DegreeSchoolInsights=api;})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const list=value=>Array.isArray(value)?value:[],clone=value=>JSON.parse(JSON.stringify(value)),normal=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,'');
 const finite=value=>typeof value==='number'&&Number.isFinite(value),day=value=>typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
 const metricNames=new Set(['transferAllowance','cost','speed','ease']);
 function validate(data){
  if(data?.version!==1||!day(data.compiledOn)||!Array.isArray(data.schools))throw new TypeError('School insight data is incomplete.');
  const ids=new Set();
  for(const school of data.schools){
   if(!school?.id||ids.has(school.id)||!school.name||!list(school.scope?.levels).length||!list(school.scope?.modalities).length)throw new TypeError('School insight identity or scope is incomplete.');ids.add(school.id);
   const sources=new Map();
   for(const source of list(school.sources)){
    let url;try{url=new URL(source.url);}catch{throw new TypeError('A school insight source needs a public HTTPS URL.');}
    if(!source.id||sources.has(source.id)||url.protocol!=='https:'||url.username||url.password||!['official','community'].includes(source.kind)||!day(source.checkedOn)||!source.reviewBasis)throw new TypeError('A school insight source is invalid.');sources.set(source.id,source);
   }
   const refs=(value,official=false)=>list(value?.sourceIds).length>0&&value.sourceIds.every(id=>sources.has(id)&&(!official||sources.get(id).kind==='official'));
   for(const item of [...list(school.pros),...list(school.tradeoffs)])if(!item.text||!refs(item,true))throw new TypeError('A school summary claim needs official source evidence.');
   if(!refs(school.pace,true)||typeof school.pace.selfPaced!=='boolean'||!refs(school.transferPolicy,true))throw new TypeError('School pace and transfer facts need official evidence.');
   for(const item of list(school.pricing))if(!refs(item,true)||!(item.amount===null||finite(item.amount)&&item.amount>=0)||!item.unit||!item.scope||!item.conditions)throw new TypeError('Prices need billing units, scope and conditions.');
   if(school.recognition?.status==='verified-institutional'&&(!school.recognition.accreditor||!refs(school.recognition,true)))throw new TypeError('Institutional accreditation needs a reviewed official source.');
   for(const item of list(school.communityPerspectives))if(!item.text||!refs(item)||item.communityVerified!==false||!item.sourceIds.every(id=>sources.get(id).kind==='community'))throw new TypeError('External community accounts must stay separate from verified outcomes.');
   if(school.reviews?.count!==0||school.reviews.ratings!==null||school.reviews.status!=='awaiting-reviews')throw new TypeError('This research seed cannot manufacture student ratings.');
   for(const name of metricNames){const metric=school.metrics?.[name];if(metric===null)continue;if(!metric||!finite(metric.value)||metric.value<0||!metric.unit||!metric.comparisonGroup||!list(metric.scope?.levels).length||!list(metric.scope?.modalities).length||typeof metric.higherIsBetter!=='boolean'||!refs(metric,true))throw new TypeError('Ranking metrics need a comparable scope and official evidence.');if(name==='transferAllowance'&&(metric.unit!=='percent'||metric.value>100))throw new TypeError('Transfer percentages must stay within a documented policy scope.');}
  }
  return true;
 }
 function profile(data,value){const wanted=normal(value);if(!wanted)return null;const found=list(data?.schools).find(school=>normal(school.id)===wanted||normal(school.name)===wanted);return found?clone(found):null;}
 function rank(data,{level='bachelor',modality='online',metric='transferAllowance',comparisonGroup}={}){
  if(!metricNames.has(metric))throw new TypeError('Choose a supported school comparison metric.');
  const groups=new Map(),unranked=[];
  for(const school of list(data?.schools)){
   if(!list(school.scope?.levels).includes(level)||!list(school.scope?.modalities).includes(modality))continue;
   const record=clone(school),fact=school.metrics?.[metric];
   if(!fact||!finite(fact.value)||!fact.comparisonGroup||!list(fact.scope?.levels).includes(level)||!list(fact.scope?.modalities).includes(modality)){unranked.push({profile:record,schoolId:school.id,reason:'No reviewed, comparable '+metric+' metric for this degree level and study format.'});continue;}
   if(comparisonGroup&&fact.comparisonGroup!==comparisonGroup)continue;
   const key=fact.comparisonGroup+'|'+fact.unit+'|'+fact.higherIsBetter;
   if(!groups.has(key))groups.set(key,{id:fact.comparisonGroup,label:fact.comparisonGroup.replaceAll('-',' '),items:[],higherIsBetter:fact.higherIsBetter});
   groups.get(key).items.push({profile:record,schoolId:school.id,value:fact.value,unit:fact.unit,rank:null,label:fact.label,note:fact.note});
  }
  const output=[];
  for(const group of groups.values()){
   group.items.sort((a,b)=>(group.higherIsBetter?b.value-a.value:a.value-b.value)||a.profile.name.localeCompare(b.profile.name));
   let previous=null,currentRank=0;
   group.items.forEach((item,index)=>{if(index===0||item.value!==previous)currentRank=index+1;item.rank=group.items.length>1?currentRank:null;previous=item.value;});
   output.push(group);
  }
  return{metric,level,modality,groups:output,unranked,methodology:String(data?.methodology?.rankings||'Only matching policy scopes are compared. Unknown metrics are not ranked.')};
 }
 return{validate,profile,rank};
});
