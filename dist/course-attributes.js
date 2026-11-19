/* Reviewed learning features describe a course offering, never a school award. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DegreeCourseAttributes=api;}(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const list=v=>Array.isArray(v)?v:[],norm=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,''),provider=v=>({sophialearning:'sophia',study:'studycom'}[norm(v)]||norm(v));
 const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 const url=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return'';}};
 const labels={pace:{'self-paced':'Self-paced',scheduled:'Scheduled classes'},assessment:{'no-proctor':'No proctored exams',proctored:'Proctored exams'},creditOrigin:{ace:'ACE-recommended',nccrs:'NCCRS-recommended',university:'University credit',exam:'Credit exam'}};
 function resolve(course,data,now=new Date().toISOString().slice(0,10)){
  const facts={pace:'unknown',assessment:'unknown',creditOrigin:'unknown',badges:[],evidence:[],issuer:''};
  if(!course||!day(now))return facts;
  const inherited=new Map(),overrides=list(data?.courses).filter(row=>list(row.courseIds).includes(course.id)&&provider(row.provider)===provider(course.provider));
  const validEvidence=record=>day(record.checkedOn)&&record.checkedOn<=now&&(Date.parse(now)-Date.parse(record.checkedOn))/86400000<=90&&list(record.sources).length&&list(record.sources).every(source=>url(source.url));
  const currentVersion=row=>{
   if(row.version&&course.recommendationVersion&&String(row.version)!==String(course.recommendationVersion))return false;
   if(row.recommendationStart&&course.recommendationStart&&row.recommendationStart!==course.recommendationStart)return false;
   if(row.recommendationEnd&&course.recommendationEnd&&row.recommendationEnd!==course.recommendationEnd)return false;
   return (!row.recommendationStart||day(row.recommendationStart)&&row.recommendationStart<=now)&&(!row.recommendationEnd||day(row.recommendationEnd)&&row.recommendationEnd>=now)&&course.activeOffering!==false;
  };
  const mismatched=overrides.some(row=>!currentVersion(row));
  if(mismatched)return facts;
  for(const policy of list(data?.policies)){
   if(!list(policy.courseIds).includes(course.id)||provider(policy.provider)!==provider(course.provider)||!validEvidence(policy))continue;
   for(const [name,value] of Object.entries(policy.attributes||{}))if(labels[name]?.[value])inherited.set(name,{value,record:policy});
  }
  for(const row of overrides){
   if(!validEvidence(row)||!currentVersion(row))continue;
   for(const [name,value] of Object.entries(row.attributes||{}))if(labels[name]?.[value]||value==='unknown')inherited.set(name,{value,record:row});
   if(typeof row.issuer==='string')facts.issuer=row.issuer;
  }
  for(const name of ['pace','assessment','creditOrigin']){
   const item=inherited.get(name);if(!item)continue;facts[name]=item.value;
   if(!labels[name]?.[item.value])continue;
   const evidence={attribute:name,label:labels[name][item.value],checkedOn:item.record.checkedOn,scope:item.record.scope||'Exact listed course offering',sources:list(item.record.sources).map(source=>({title:String(source.title||'Official source'),url:url(source.url)}))};
   facts.badges.push({label:evidence.label,attribute:name});facts.evidence.push(evidence);
  }
  return facts;
 }
 function matches(course,data,filters={},now){const f=resolve(course,data,now);return ['pace','assessment','creditOrigin'].every(name=>!filters[name]||filters[name]==='all'||f[name]===filters[name]);}
 return Object.freeze({resolve,matches});
}));
