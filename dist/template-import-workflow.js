/* A workbook creates an unfinished private draft, never student course records. */
(function(root,factory){'use strict';const common=typeof module==='object'&&module.exports,api=factory(common?require('./audit-curriculum.js'):root.AuditCurriculum,common?require('./sheet-state.js'):root.DegreeSheet,common?require('./template-import-engine.js'):root.DegreeTemplateImport);if(common)module.exports=api;else root.DegreeTemplateImportWorkflow=api;}(typeof globalThis!=='undefined'?globalThis:this,function(A,Sheet,Engine){
'use strict';
const KEY='degreepath-guide-v3';
function load(storage){
 let raw;try{raw=storage.getItem(KEY);}catch{throw Error('Your saved workspace could not be opened. Nothing has changed.');}
 if(!raw)return Sheet.initialize(null,null,{pathways:[]});
 let state;try{state=JSON.parse(raw);}catch{throw Error('Your saved workspace could not be read. It has not been replaced.');}
 A.validatePrivateWork(state);return state;
}
function context(metadata){return{school:metadata.school,degree:metadata.title,programId:metadata.programId,level:metadata.level,modality:metadata.modality,creditSystem:metadata.creditSystem,sourceUrl:metadata.sourceUrl,catalog:metadata.catalog};}
function save(storage,parsed,metadata,{confirmed=false}={}){
 if(!confirmed)throw Error('Review the school, degree and selected requirements before continuing.');
 if(!/^workbook-import-[A-Za-z0-9-]{8,100}$/.test(metadata.programId||''))throw Error('Start a new imported draft before continuing.');
 if(!metadata.school?.trim()||!metadata.title?.trim())throw Error('Add the school and degree name.');
 if(!Engine.safeURL(metadata.sourceUrl))throw Error('Add an https link to the degree or catalog.');
 if(!['associate','bachelor','master','doctorate','specialist'].includes(metadata.level)||!['semester','quarter','competency-unit'].includes(metadata.creditSystem))throw Error('Choose the degree level and credit units.');
 const payload=Engine.draftPayload(parsed,metadata),total=payload.rows.reduce((s,r)=>s+Number(r.credits),0);
 if(!Number.isFinite(Number(metadata.totalCredits))||Number(metadata.totalCredits)<=0||Math.abs(Number(metadata.totalCredits)-total)>0.001)throw Error('The selected rows total '+total+'. They must match the degree total before continuing.');
 const latest=load(storage),ctx=context(metadata);if(A.readDraft(latest,ctx))throw Error('This imported draft is already saved. Open its editable plan instead of replacing it.');
 const next=A.saveDraft(latest,ctx,payload);try{storage.setItem(KEY,JSON.stringify(next));}catch{throw Error('Your imported draft could not be saved. Your previous workspace is unchanged. Keep this page open and try again.');}
 return{state:next,href:A.launchURL(ctx),requirements:payload.rows.length};
}
return Object.freeze({KEY,load,context,save});
}));
