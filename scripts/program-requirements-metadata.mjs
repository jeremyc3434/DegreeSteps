/** Reviewed discovery notes. These records never grant admission, credit or professional eligibility. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const list=value=>Array.isArray(value)?value:[];
const text=value=>typeof value==='string'?value.trim():'';
const identified=value=>/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(text(value));
const edition=value=>text(value).replace(/[–—]/g,'-');
const mode=model=>/^online$/i.test(model?.format)?'online':/^(residential|campus|on campus)$/i.test(model?.format)?'campus':null;
const code=value=>text(value).toUpperCase().replace(/[^A-Z0-9]/g,'');
const https=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}};
const date=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(text(value)))return false;try{return new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}catch{return false;}};
const unique=values=>new Set(values).size===values.length;
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const validEdition=value=>{const raw=edition(value),range=/^(20\d{2})(?:-(20\d{2}))?$/.exec(raw);return Boolean(range?(!range[2]||Number(range[2])===Number(range[1])+1):/^20\d{2}(?:0[1-9]|1[0-2])$/.test(raw));};

function currentCatalogProof(review,sources){
  const identity=review?.catalogIdentity,source=sources.get(identity?.sourceId);
  if(review?.catalogYear!==undefined||identity?.kind!=='reviewed-current-catalog'||!text(identity.label)||identity.label!==text(identity.label)||identity.label.length>300||!identified(identity.sourceId)||!https(identity.sourceUrl)||!date(identity.checkedOn)||!/^[a-f0-9]{64}$/.test(identity.sourceSha256||''))return null;
  if(source?.kind!=='university'||source.url!==identity.sourceUrl||source.checkedOn!==identity.checkedOn||source.sha256!==identity.sourceSha256||!text(source.capture).startsWith('content/source-captures/'))return null;
  return {identity,source};
}
function reviewEdition(review,sources){
  if(review.catalogIdentity!==undefined)return currentCatalogProof(review,sources)?.identity.label||null;
  return validEdition(review.catalogYear)?edition(review.catalogYear):null;
}
function currentCatalogMatches(model,review,sources){
  if(review.catalogIdentity===undefined)return true;
  const proof=currentCatalogProof(review,sources),identity=model?.catalogIdentity;
  if(!proof||identity?.kind!=='reviewed-current-catalog'||identity.label!==proof.identity.label||identity.sourceUrl!==proof.identity.sourceUrl||identity.checkedOn!==proof.identity.checkedOn)return false;
  const source=list(model.sources).find(source=>source.id===proof.identity.sourceId);
  return Boolean(source?.kind==='university'&&source.url===proof.source.url&&(source.checkedOn||source.checked)===proof.source.checkedOn&&source.sha256===proof.identity.sourceSha256&&source.capture===proof.source.capture&&list(model.sourceIds).includes(source.id));
}

export function validateProgramRequirementPacket(packet){
  assert(packet?.schemaVersion===1&&Array.isArray(packet.sources)&&packet.sources.length>0&&packet.sources.length<=200&&Array.isArray(packet.reviews)&&packet.reviews.length<=200,'Program requirement reviews need a supported source packet.');
  const sources=new Map();
  for(const source of packet.sources){
    assert(identified(source?.id)&&!sources.has(source.id)&&https(source.url)&&text(source.title)&&date(source.checkedOn)&&text(source.quote)&&text(source.quote).split(/\s+/).length<=25,'Program requirement evidence needs unique identities, HTTPS sources, a review date and a short quote.');
    sources.set(source.id,source);
  }
  const quoteWords=new Map();
  for(const source of sources.values()){const words=(quoteWords.get(source.url)||0)+text(source.quote).split(/\s+/).length;quoteWords.set(source.url,words);assert(words<=25,'Repeated source references must keep quoted excerpts short.');}
  const ids=new Set();
  for(const review of packet.reviews){
    assert(identified(review?.id)&&!ids.has(review.id)&&Array.isArray(review.modelIds)&&review.modelIds.length>0&&unique(review.modelIds)&&review.modelIds.every(identified)&&reviewEdition(review,sources)&&['online','campus'].includes(review.modality),'Program requirement reviews need an exact model, catalog and delivery format.');
    ids.add(review.id);
    assert(Array.isArray(review.programBindings)&&review.programBindings.length===review.modelIds.length&&unique(review.programBindings.map(binding=>binding.modelId))&&review.modelIds.every(id=>review.programBindings.some(binding=>binding?.modelId===id&&https(binding.degreeUrl))),'Program requirement reviews need exact degree-page bindings.');
    assert(Array.isArray(review.facts)&&review.facts.length>0&&review.facts.length<=30&&unique(review.facts.map(fact=>fact.id)),'Program requirement facts need unique identities.');
    for(const fact of review.facts){
      assert(identified(fact?.id)&&['admission','attendance','assessment','professional'].includes(fact.kind)&&['school-policy','program','course'].includes(fact.scope)&&text(fact.label)&&text(fact.label).length<=120&&text(fact.detail)&&text(fact.detail).length<=1200,'Program requirement facts need a clear kind, scope and description.');
      assert(Array.isArray(fact.sourceIds)&&fact.sourceIds.length>0&&unique(fact.sourceIds)&&fact.sourceIds.every(id=>sources.has(id)),'Every program requirement fact needs its reviewed source.');
      assert(fact.prominent===undefined||typeof fact.prominent==='boolean','Program requirement prominence must be explicit.');
      assert(fact.type===undefined||identified(fact.type),'Program requirement types must be safe identifiers.');
      assert(fact.scope!=='course'||Array.isArray(fact.courseCodes)&&fact.courseCodes.length>0&&unique(fact.courseCodes)&&fact.courseCodes.every(value=>code(value)),'Course-specific requirements need exact course codes.');
    }
  }
  return packet;
}

export function assembleProgramRequirements(model,packets=[]){
  if(!model?.id||!mode(model))return [];
  const year=edition(model.catalogYear||model.catalog),courses=new Set(list(model.requirements).map(requirement=>code(requirement.code)).filter(Boolean)),result=[],seen=new Set();
  for(const packet of list(packets)){
    try{validateProgramRequirementPacket(packet);}catch{continue;}
    const sources=new Map(packet.sources.map(source=>[source.id,source]));
    for(const review of packet.reviews){
      if(!review.modelIds.includes(model.id)||reviewEdition(review,sources)!==year||review.modality!==mode(model)||!currentCatalogMatches(model,review,sources))continue;
      const binding=review.programBindings.find(binding=>binding.modelId===model.id);
      if(!binding||!list(model.sources).some(source=>source.url===binding.degreeUrl))continue;
      for(const fact of review.facts){
        if(fact.scope==='course'&&!fact.courseCodes.every(value=>courses.has(code(value))))continue;
        if(seen.has(fact.id))continue;seen.add(fact.id);
        result.push({id:fact.id,kind:fact.kind,scope:fact.scope,label:text(fact.label),detail:text(fact.detail),prominent:fact.prominent===true&&fact.scope!=='school-policy',...(fact.type?{type:fact.type}:{}),...(fact.scope==='course'?{courseCodes:[...fact.courseCodes]}:{}),reviewId:review.id,sourceIds:[...fact.sourceIds],sources:fact.sourceIds.map(id=>{const source=sources.get(id);return{id:source.id,url:source.url,title:source.title,checkedOn:source.checkedOn};})});
      }
    }
  }
  return result;
}

export async function loadProgramRequirementReviews(root=resolve(import.meta.dirname,'..')){
  const names=['liberty-program-requirements.json','wgu-program-requirements.json','umpi-program-requirements.json','tesu-program-requirements.json'];
  return Promise.all(names.map(async name=>validateProgramRequirementPacket(JSON.parse(await readFile(resolve(root,'content/discovery',name),'utf8')))));
}
