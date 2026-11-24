/** Compact discovery facts. These labels never change curriculum or publication decisions. */
import Facts from '../dist/program-opportunities.js';

const list=value=>Array.isArray(value)?value:[];
const catalog=value=>String(value||'').replace(/[–—]/g,'-').trim();
const modality=model=>/^online$/i.test(model?.format)?'online':/^(residential|campus|on campus)$/i.test(model?.format)?'campus':null;
const https=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};

export function buildProgramFit({model,route={},estimate,rates={},reviews={}}){
  const edition=catalog(model.catalogYear||model.catalog),format=modality(model);
  const program={...route,...model,id:route.id||model.id,url:route.url||model.url,
    paceModel:model.paceModel||route.paceModel,pricing:model.pricing||route.pricing};
  // A scoped review can fill a discovery fact without rewriting historical academic evidence.
  const review=list(reviews.reviews).find(item=>list(item.modelIds).includes(model.id)&&
    catalog(item.catalogYear)===edition&&item.modality===format&&item.paceModel==='course-term'&&
    https(item.source?.url)&&list(item.programBindings).some(binding=>binding.modelId===model.id&&
      list(model.sources).some(source=>source.url===binding.degreeUrl)));
  if(review){
    program.paceModel=review.paceModel;
    program.paceSourceUrl=review.source.url;
    program.paceSourceIds=[review.source.id];
    program.paceCheckedOn=review.source.checkedOn;
  }
  // Older standalone models lack discovery pricing. Reuse only an estimate profile that
  // already passed the exact model, format, catalog, credit-unit and degree-size guards.
  if(!program.pricing&&estimate?.available===true){
    const entry=list(rates.entries).find(item=>item.id===estimate.rateEntryId&&list(item.modelIds).includes(model.id)&&
      item.modality===format&&item.creditSystem===model.creditSystem&&item.degreeUnits===model.totalCredits&&
      list(item.catalogs).some(value=>catalog(value)===edition));
    const source=entry&&list(rates.sources).find(item=>list(entry.sourceIds).includes(item.id)&&https(item.url));
    if(source&&['threshold-credit','banded-term'].includes(entry.tuition?.type)){
      program.pricing={...entry.tuition,model:entry.tuition.type,period:entry.termLabel,currency:'USD',
        sourceUrl:source.url,sourceIds:[...entry.sourceIds],checkedOn:source.checkedOn};
    }
  }
  const requirements=list(model.requirements).flatMap(requirement=>{
    const policy=requirement.registrationPolicy;
    if(!policy?.synchronousSeminars)return [];
    const sources=list(policy.sourceIds).map(id=>list(model.sources).find(source=>source.id===id));
    if(!sources.length||sources.some(source=>!https(source?.url)))return [];
    return [{type:'live-seminars',label:/capstone/i.test(requirement.title)?'Live capstone seminars':'Live seminars required',
      courseCode:requirement.code||null,url:sources[0].url,sourceIds:[...policy.sourceIds]}];
  });
  return {modelId:model.id,catalogYear:edition,modality:format,creditSystem:model.creditSystem||null,
    ...Facts.fitFacts(program),requirements,...(review?{learningReviewId:review.id}:{})};
}
