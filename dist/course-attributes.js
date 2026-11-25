/* Reviewed learning features describe a course offering, never a school award. */
(function(root,factory){const common=typeof module==='object'&&module.exports,api=factory(common?require('./course-assessment.js'):root.DegreeCourseAssessment,common?require('./course-library-engine.js'):root.DegreeCourseLibrary,common?require('./provider-registry.js'):root.DegreeCreditProviders);if(common)module.exports=api;else root.DegreeCourseAttributes=api;}(typeof globalThis!=='undefined'?globalThis:this,function(Assessment,Library,Providers){
 'use strict';
 const list=v=>Array.isArray(v)?v:[],norm=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,''),provider=v=>Providers?.get(v)?Providers.key(v):({sophialearning:'sophia',study:'studycom'}[norm(v)]||norm(v));
 const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 const url=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return'';}};
 const fresh=(value,now)=>day(value)&&day(now)&&value<=now&&(Date.parse(now)-Date.parse(value))/86400000<=90;
 const checked=record=>[record?.checkedOn,record?.checkedAt,record?.checked].map(value=>typeof value==='string'?value.slice(0,10):'').find(day)||'';
 const courseURL=(value,name)=>{if(Providers){const allowed=Providers.trustedURL(value,name);if(!allowed)return '';const u=new URL(allowed);if(u.pathname==='/')return '';u.hash='';u.pathname=u.pathname.replace(/\/+$/,'');return u.href;}try{const u=new URL(value),host=({sophia:'sophia.org',studycom:'study.com',straighterline:'straighterline.com',saylor:'saylor.org',clep:'collegeboard.org',dsst:'getcollegecredit.com',christianleadersinstitute:'christianleaders.org'})[provider(name)];if(!host||u.protocol!=='https:'||u.username||u.password||!(u.hostname===host||u.hostname.endsWith('.'+host))||u.pathname==='/')return '';u.hash='';u.pathname=u.pathname.replace(/\/+$/,'');return u.href;}catch{return '';}};
 function assessmentIdentityFor(course,now){
  const identity=course?.assessmentIdentity;
  if(identity?.version!==1||provider(identity.provider)!==provider(course.provider)||!identity.code||typeof identity.code!=='string'||identity.code.length>100||!courseURL(identity.courseUrl,course.provider)||courseURL(identity.courseUrl,course.provider)!==courseURL(course.url,course.provider)||!fresh(identity.checkedOn,now)||!list(identity.sources).length||!identity.sources.every(source=>url(source.url)&&fresh(source.checkedOn,now)))return null;
  return identity;
 }
 function mergeAssessmentIdentity(base,indexed,indexSources,now=new Date().toISOString().slice(0,10)){
  if(!base||!indexed||!day(now)||base.activeOffering===false||indexed.activeOffering===false||provider(base.provider)!==provider(indexed.provider))return base;
  const official=courseURL(base.url,base.provider),code=typeof indexed.code==='string'?indexed.code.trim():'';
  if(!official||official!==courseURL(indexed.url,indexed.provider)||official!==courseURL(indexed.evidenceUrl,indexed.provider)||!code||code.length>100||!/[0-9]/.test(code)||!fresh(checked(indexed),now))return base;
  const baseCodes=[base.code,base.mappingCode,...list(base.codeAliases)].filter(Boolean).map(norm),indexCodes=[code,...list(indexed.codeAliases)].filter(Boolean).map(norm);
  if(!indexCodes.some(value=>baseCodes.includes(value)))return base;
  const identitySource=list(indexSources).find(source=>source.id===indexed.sourceId&&url(source.url)&&fresh(checked(source),now));if(!identitySource)return base;
  const existing=assessmentIdentityFor(base,now);if(existing&&norm(existing.code)!==norm(code))return {...base,assessmentIdentity:null};
  return {...base,assessmentIdentity:{version:1,provider:base.provider,code,courseUrl:official,checkedOn:checked(indexed),sources:[{id:identitySource.id,title:String(identitySource.title||'Reviewed course identity'),url:url(identitySource.url),checkedOn:checked(identitySource)}]}};
 }
 const labels={pace:{'self-paced':'Self-paced',scheduled:'Scheduled classes'},assessment:{'no-proctor':'No proctored exams',proctored:'Proctored exams',restricted:'Screen sharing / browser restrictions'},creditOrigin:{ace:'ACE-recommended',nccrs:'NCCRS-recommended',university:'University credit',exam:'Credit exam'}};
 function resolve(course,data,now=new Date().toISOString().slice(0,10)){
  const facts={pace:'unknown',assessment:'unknown',creditOrigin:'unknown',badges:[],evidence:[],issuer:''};
  if(!course||!day(now)||course.activeOffering===false)return facts;
  const inherited=new Map(),overrides=list(data?.courses).filter(row=>list(row.courseIds).includes(course.id)&&provider(row.provider)===provider(course.provider));
  const validEvidence=record=>day(record.checkedOn)&&record.checkedOn<=now&&(Date.parse(now)-Date.parse(record.checkedOn))/86400000<=90&&list(record.sources).length&&list(record.sources).every(source=>url(source.url));
  const currentVersion=row=>{
   const versions=[course.courseVersion,course.recommendationVersion].filter(value=>value!==undefined&&value!==null&&value!=='');
   if(row.version&&versions.some(version=>String(row.version)!==String(version)))return false;
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
  // Assessment reviews are independent of credit recommendations. Only exact
  // course codes (or source-grounded listing aliases) can link the two views.
  const grounded=list(course.identitySourceIds).length||list(course.planIdentitySourceIds).length||list(course.listingIdentitySourceIds).length;
  const identity={...course,mappingCode:grounded?course.mappingCode:null,codeAliases:grounded?list(course.codeAliases):[]};
  const codes=[assessmentIdentityFor(course,now)?.code,Library?.courseCode?.(identity),course.code,...(grounded?[course.mappingCode,...list(course.codeAliases)]:[]),...overrides.filter(row=>validEvidence(row)&&currentVersion(row)).map(row=>row.code)].filter(value=>typeof value==='string'&&value.trim());
  const reviewed=[];
  for(const code of [...new Set(codes)]){
   const assessment=Assessment?.describe?.(null,{provider:course.provider,code},now);
   if(!assessment||!list(assessment.sources).length||!assessment.sources.every(source=>day(source.checkedOn)&&source.checkedOn<=now&&(Date.parse(now)-Date.parse(source.checkedOn))/86400000<=90&&url(source.url)))continue;
   if(!reviewed.some(fact=>fact.reviewId===assessment.reviewId&&fact.status===assessment.status))reviewed.push(assessment);
  }
  if(reviewed.length&&new Set(reviewed.map(fact=>JSON.stringify([fact.status,fact.label,fact.detail]))).size===1){
   const assessment=reviewed[0],value=({unmonitored:'no-proctor',monitored:'proctored',restricted:'restricted',unknown:'unknown'})[assessment.status]||'unknown';
   const sources=[...new Map(reviewed.flatMap(fact=>fact.sources).map(source=>[source.url,source])).values()];
   const checkedOn=sources.map(source=>source.checkedOn).sort()[0];
   const record={checkedOn,scope:assessment.scope==='provider-policy'?'Published provider assessment policy for this identified course.':'Published assessment evidence for this exact course.',sources};
   inherited.set('assessment',{value,record});
   facts.assessmentFact={...assessment,sources};
  }else if(reviewed.length){
   inherited.set('assessment',{value:'unknown',record:{checkedOn:now,sources:[]}});
  }
  for(const name of ['pace','assessment','creditOrigin']){
   const item=inherited.get(name);if(!item)continue;facts[name]=item.value;
   if(!labels[name]?.[item.value]&&!(name==='assessment'&&facts.assessmentFact))continue;
   const evidence={attribute:name,label:name==='assessment'&&facts.assessmentFact?facts.assessmentFact.label:labels[name][item.value],checkedOn:item.record.checkedOn,scope:item.record.scope||'Exact listed course offering',sources:list(item.record.sources).map(source=>({title:String(source.title||'Official source'),url:url(source.url),...(source.checkedOn?{checkedOn:source.checkedOn}:{}),...(source.id?{id:source.id}:{})}))};
   if(labels[name]?.[item.value])facts.badges.push({label:labels[name][item.value],attribute:name});facts.evidence.push(evidence);
  }
  return facts;
 }
 function matches(course,data,filters={},now){const f=resolve(course,data,now);return ['pace','assessment','creditOrigin'].every(name=>!filters[name]||filters[name]==='all'||f[name]===filters[name]);}
 return Object.freeze({resolve,matches,mergeAssessmentIdentity});
}));
