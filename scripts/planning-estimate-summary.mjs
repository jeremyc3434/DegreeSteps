/** Report the same researched planning ranges as the student worksheet.
 * These ranges never establish academic readiness or a complete price quote. */
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),Estimate=require('../dist/plan-estimate-engine.js');
const list=value=>Array.isArray(value)?value:[];
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const range=value=>value&&finite(value.min)&&finite(value.max)&&value.min>=0&&value.max>=value.min;
const stamp=value=>{if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(value))return null;const parsed=Date.parse(value+'T00:00:00Z');return Number.isFinite(parsed)&&new Date(parsed).toISOString().slice(0,10)===value?parsed:null;};
const safeURL=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}};
const unavailable=(reason,reasonCode)=>({available:false,status:'unavailable',reason,reasonCode,complete:false,scope:'known-remaining-course-charges-before-aid'});

export function summarizePlanningEstimate({model,plan,rates,asOf,calculate=Estimate.calculate}={}){
 const asOfStamp=stamp(asOf);
 if(asOfStamp===null)throw Error('Use a real planning-estimate review date.');
 if(list(plan?.rows).some(row=>['reported','confirmed'].includes(row.status)))throw Error('Catalog estimates require a fresh baseline without private learning records.');
 if(!rates)return unavailable('No reviewed planning-rate data was supplied.','rates-not-supplied');
 let result;
 try{result=calculate({program:model,plan,rates});}catch{return unavailable('The planning range could not be checked.','estimate-needs-review');}
 if(result?.available!==true)return unavailable(result?.reason||'A researched planning range is not available for this exact degree.',result?.reasonCode||'estimate-unavailable');
 if(result.programId!==model?.id||!['planning-range','partial-range'].includes(result.status)||!range(result.costs?.knownRange)||!list(result.sources).length)return unavailable('The planning range does not match a complete reviewed estimate.','estimate-binding-invalid');
 const sources=list(result.sources).map(source=>({id:source.id,title:source.title,url:safeURL(source.url),checkedOn:source.checkedOn||source.checked||source.checkedAt||null}));
 if(sources.some(source=>!source.id||!source.url||stamp(source.checkedOn)===null||stamp(source.checkedOn)>asOfStamp||asOfStamp-stamp(source.checkedOn)>=30*86400000))return unavailable('A price source needs a current dated review.','rate-review-due');
 const timing=result.timing||{},assumptions=list(timing.assumptions).filter(value=>typeof value==='string'&&value.trim());
 const totalMonths=range(timing.totalMonths)&&assumptions.length?{...timing.totalMonths}:null;
 return {available:true,status:result.status,complete:false,scope:'known-remaining-course-charges-before-aid',currency:result.costs.currency||'USD',rateEntryId:result.rateEntryId,...(typeof result.rateScope==='string'?{rateScope:result.rateScope}:{}),knownRange:{...result.costs.knownRange},missing:list(result.costs.missing).filter(value=>typeof value==='string'),notes:list(result.notes).filter(value=>typeof value==='string'),timing:{status:totalMonths?'assumption-based-range':'not-estimated',totalMonths,universityTerms:range(timing.universityTerms)?{...timing.universityTerms}:null,termLabel:timing.termLabel||null,assumptions},sources};
}
