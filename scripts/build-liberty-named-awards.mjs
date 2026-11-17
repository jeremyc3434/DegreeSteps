/* Compile separately reviewed receiving awards; never manufacture degree rows. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dirname,'..'),clone=value=>JSON.parse(JSON.stringify(value)),key=value=>String(value||'').toUpperCase().replace(/\s+/g,''),slug=value=>String(value).toLowerCase().replace(/[^a-z0-9]+/g,'-');
export const factPath='content/transfer-awards/snapshots/liberty-named-awards-reviewed-2026-11-16.json';
export const outputPath='content/transfer-awards/liberty-named-awards-2026-11.json';
const providers=['Sophia','Study.com','StraighterLine'],modalities=['online','campus'],levels=['associate','bachelor'];
const dateOnly=value=>typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const publicGuide=value=>{try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='www.liberty.edu'&&!u.username&&!u.password&&u.pathname.endsWith('.pdf');}catch{return false;}};
export function validateDocument(value){
  assert(value?.version===1&&value.school==='Liberty University'&&dateOnly(value.checkedOn),'Named-award document needs its school and review date');
  assert(Array.isArray(value.degreeLevels)&&value.degreeLevels.length>0&&new Set(value.degreeLevels).size===value.degreeLevels.length&&value.degreeLevels.every(level=>levels.includes(level)),'Alternative awards are undergraduate only');
  assert(Array.isArray(value.sources)&&Array.isArray(value.awards)&&value.awards.length>0,'Named-award document needs sources and awards');
  assert(!value.models&&!value.requirements,'Receiving awards must not masquerade as degree requirements');
  const sources=new Map();for(const source of value.sources){assert(typeof source.id==='string'&&!sources.has(source.id)&&publicGuide(source.url)&&modalities.includes(source.modality)&&providers.includes(source.provider),'Invalid or duplicate official guide');sources.set(source.id,source);}
  const seen=new Set(),ids=new Set();
  for(const award of value.awards){
    assert(award&&typeof award.id==='string'&&/^[a-z0-9-]{1,200}$/.test(award.id)&&!ids.has(award.id)&&providers.includes(award.provider)&&/^(SOPH|SDCM|OOSL)-\d{4}$/.test(award.code)&&/^[A-Z]{2,6} \d{3}$/.test(award.receivingCode),'Named awards need exact course identities');ids.add(award.id);
    assert(typeof award.providerCourseCode==='string'&&award.providerCourseCode&&typeof award.title==='string'&&award.title,'Named awards need published provider course metadata');
    assert(Number.isFinite(award.credits)&&award.credits>0&&award.credits<=30&&award.creditSystem==='semester','Receiving credit quantities must stay explicit');
    assert(award.sourceCreditStatus==='unknown'&&award.sourceCredits===null&&award.sourceCreditSystem===null&&typeof award.sourceCreditBasis==='string'&&award.sourceCreditBasis.length>0,'Unknown independent source quantities must remain unknown in this receiving-guide-only supplement');
    assert(award.evidence==='conditional'&&award.evidenceType==='official-receiving-school-equivalency'&&award.creditOrigin==='alternative','A schoolwide award is conditional for exact-degree planning');
    assert(Array.isArray(award.modalities)&&award.modalities.length>0&&new Set(award.modalities).size===award.modalities.length&&award.modalities.every(mode=>modalities.includes(mode)),'Award needs reviewed delivery modes');
    assert(Array.isArray(award.degreeLevels)&&award.degreeLevels.length>0&&award.degreeLevels.every(level=>levels.includes(level)),'No graduate alternative-credit inheritance');
    assert(Array.isArray(award.sourceIds)&&award.sourceIds.length===award.modalities.length&&new Set(award.sourceIds).size===award.sourceIds.length&&award.sourceIds.every(id=>sources.has(id)),'Each delivery mode needs an official guide');
    for(const mode of award.modalities)assert(award.sourceIds.some(id=>sources.get(id).modality===mode&&sources.get(id).provider===award.provider),'Missing delivery/provider evidence');
    assert(Array.isArray(award.conditions)&&award.conditions.length>=2&&Array.isArray(award.codeAliases)&&new Set(award.codeAliases).size===award.codeAliases.length,'Named-award evidence needs conditions and distinct aliases');
    assert(award.upper===/ [34]\d{2}$/.test(award.receivingCode),'Upper-level status follows the receiving code, never the provider title');
    const identity=award.provider+'|'+award.code+'|'+award.receivingCode;assert(!seen.has(identity),'Duplicate named receiving award');seen.add(identity);
  }
  return clone(value);
}
export function buildDocument(facts){
  assert(facts?.version===1&&facts.school==='Liberty University'&&Array.isArray(facts.facts),'Reviewed named-award facts are missing');
  const sources=[];
  for(const provider of providers)for(const modality of modalities){const guide=facts.guides?.[provider]?.[modality];assert(guide&&publicGuide(guide.url),'Official format guide missing');sources.push({id:'liberty-named-'+slug(provider)+'-'+modality+'-'+guide.published,title:'Liberty '+modality+' '+provider+' receiving-course guide · '+guide.published,url:guide.url,checked:facts.checkedOn,guideUpdated:guide.published,provider,modality,evidenceType:'official-receiving-school-equivalency',scope:'Named undergraduate receiving awards. Exact-degree applicability, catalog and recommendation-version eligibility remain conditional.'});}
  const awards=facts.facts.map(([provider,code,providerCourseCode,title,receivingCode,credits,page,extra={}])=>{
    const modes=extra.modalities||modalities,refs=sources.filter(source=>source.provider===provider&&modes.includes(source.modality)),sourceIds=refs.map(source=>source.id),aliases=[...new Set([providerCourseCode,...(extra.aliases||[])])];
    return{id:'liberty-named-'+slug(provider)+'-'+slug(code)+'-'+slug(receivingCode),provider,code,providerCourseCode,codeAliases:aliases,title,receivingCode,credits,creditSystem:'semester',sourceCreditStatus:'unknown',sourceCredits:null,sourceCreditSystem:null,sourceCreditBasis:'This receiving-school guide establishes the Liberty award. The current provider/ACE source-credit quantity and recommendation version were not independently reviewed.',creditOrigin:'alternative',upper:/ [34]\d{2}$/.test(receivingCode),degreeLevels:[...levels],modalities:[...modes],sourceIds,sourcePage:page,sourcePages:Object.fromEntries(refs.map(source=>[source.id,source.modality==='campus'?extra.campusPage||page:page])),identitySourceIds:sourceIds,codeAliasEvidence:aliases.map(alias=>({alias,sourceIds:provider==='Sophia'&&code==='SOPH-0016'&&alias==='SCIE1005'?refs.filter(source=>source.modality==='campus').map(source=>source.id):sourceIds})),url:refs.find(source=>source.modality==='online')?.url||refs[0]?.url,evidence:'conditional',evidenceType:'official-receiving-school-equivalency',mappingChecked:facts.checkedOn,mappingReviewId:'liberty-named-2026-11-16',mappingScope:'Exact named undergraduate receiving-course award, scoped to separately reviewed delivery guides; not an individual transfer decision.',conditions:['Confirm Liberty accepts the current provider/ACE course version and recommendation period covering your completion date. Independent source-credit quantities and recommendation windows were not established by this guide review.','Confirm this exact receiving award applies to your selected degree, catalog and delivery format before purchase. Residency, major, grade and duplicate-credit rules still apply.',...(extra.note?[extra.note]:[])]};
  });
  return validateDocument({version:1,checkedOn:facts.checkedOn,school:facts.school,degreeLevels:[...levels],scope:facts.scope,sources,awards});
}
export function scopeAllows(award,context={}){return context.school==='Liberty University'&&award.degreeLevels.includes(context.level)&&award.modalities.includes(context.modality);}
export function optionsFor(document,requirement,context){
  validateDocument(document);
  if(!requirement||requirement.institutionalOnly||!Number.isFinite(requirement.credits))return [];
  const codes=[requirement.code,...(Array.isArray(requirement.allowedCourseCodes)?requirement.allowedCourseCodes:[])].filter(Boolean).map(key);
  return document.awards.filter(award=>scopeAllows(award,context)&&award.credits===requirement.credits&&codes.includes(key(award.receivingCode))&&(!requirement.upperOnly||award.upper)).map(award=>{const primary=document.sources.find(source=>award.sourceIds.includes(source.id)&&source.modality===context.modality),option=clone(award);option.url=primary.url;option.sourcePage=award.sourcePages[primary.id];return option;});
}
export async function run({check=false}={}){
  const facts=JSON.parse(await readFile(resolve(root,factPath),'utf8')),document=buildDocument(facts),json=JSON.stringify(document,null,2)+'\n';
  if(check)assert.equal(await readFile(resolve(root,outputPath),'utf8'),json,outputPath+' is stale');else{await mkdir(resolve(root,'content/transfer-awards'),{recursive:true});await writeFile(resolve(root,outputPath),json);}
  return{check,awards:document.awards.length,receivingCodes:new Set(document.awards.map(award=>award.receivingCode)).size,providers:providers.length,sourceGuides:document.sources.length,checkedOn:document.checkedOn};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(await run({check:process.argv.includes('--check')})));
