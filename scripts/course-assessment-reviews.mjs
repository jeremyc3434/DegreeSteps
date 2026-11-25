/** Source-reviewed prospective assessment formats; this packet grants no transfer credit. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=resolve(import.meta.dirname,'..');
const BEGIN='/* BEGIN_REVIEWED_ASSESSMENTS */',END='/* END_REVIEWED_ASSESSMENTS */';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const string=(value,max)=>typeof value==='string'&&value===value.trim()&&value.length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
const quotation=value=>typeof value==='string'&&value===value.trim()&&value.length<=2000&&!/[\u0000-\u001f\u007f]/.test(value);
const identified=value=>string(value,160)&&/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value);
const normalized=value=>value.toUpperCase().replace(/[^A-Z0-9]/g,'');
const edition=value=>typeof value==='string'?value.replace(/[–—]/g,'-'):'';
const validEdition=value=>{
  if(!string(value,9))return false;
  const raw=edition(value),range=/^(20\d{2})(?:-(20\d{2}))?$/.exec(raw);
  return range?(!range[2]||Number(range[2])===Number(range[1])+1):/^20\d{2}(?:0[1-9]|1[0-2])$/.test(raw);
};
const validDate=value=>{
  if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(value))return false;
  try{return new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}catch{return false;}
};
const safeURL=value=>{
  if(!string(value,2000))return null;
  try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||!url.hostname)return null;url.hash='';return url.href;}catch{return null;}
};
const array=(value,min,max)=>Array.isArray(value)&&value.length>=min&&value.length<=max;
const unique=values=>new Set(values).size===values.length;
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const bindingKey=binding=>JSON.stringify([binding.modelId,edition(binding.catalogYear),binding.format]);
const overlap=(left,right)=>!left||!right||left.some(key=>right.includes(key));

export function validateCourseAssessmentReviews(packet){
  assert(object(packet)&&packet.schemaVersion===1&&array(packet.sources,1,2000)&&array(packet.reviews,1,5000),'Course assessment reviews need a supported, bounded source packet.');
  const sources=new Map(),wordsByURL=new Map();
  for(const source of packet.sources){
    assert(object(source)&&identified(source.id)&&!sources.has(source.id)&&safeURL(source.url)&&string(source.title,300)&&validDate(source.checkedOn)&&quotation(source.quote),'Assessment evidence needs a unique identity, HTTPS source, title, review date and bounded quotation field.');
    const url=safeURL(source.url),words=(wordsByURL.get(url)||0)+(source.quote?source.quote.split(/\s+/).length:0);
    assert(words<=25,'Assessment excerpts from the same source must share a 25-word quotation limit.');
    wordsByURL.set(url,words);sources.set(source.id,source);
  }
  const ids=new Set(),scopesByCourse=new Map();
  for(const review of packet.reviews){
    assert(object(review)&&identified(review.id)&&!ids.has(review.id)&&string(review.provider,100)&&normalized(review.provider)&&['provider-policy','course'].includes(review.scope)&&['unmonitored','monitored','restricted','unknown'].includes(review.status)&&string(review.label,120)&&string(review.detail,1200),'Assessment reviews need unique identities, explicit scope, status and bounded descriptions.');
    ids.add(review.id);
    assert(array(review.courseCodes,1,1000)&&review.courseCodes.every(value=>string(value,80)&&normalized(value))&&unique(review.courseCodes.map(normalized)),'Assessment reviews need unique, explicit course codes.');
    assert(array(review.sourceIds,1,30)&&unique(review.sourceIds)&&review.sourceIds.every(id=>identified(id)&&sources.has(id)),'Every assessment review needs its exact reviewed sources.');
    let bindings=null;
    if(review.programBindings!==undefined){
      assert(review.provider==='University','Only university course assessments support exact program bindings.');
      assert(array(review.programBindings,1,200)&&review.programBindings.every(binding=>object(binding)&&identified(binding.modelId)&&validEdition(binding.catalogYear)&&['online','campus'].includes(binding.format)),'Assessment program bindings need exact model, catalog and format.');
      bindings=review.programBindings.map(bindingKey);
      assert(unique(bindings),'Assessment program bindings must be unique.');
    }
    assert(normalized(review.provider)!=='UNIVERSITY'||review.provider==='University'&&review.scope==='course'&&bindings,'University assessment claims need exact course and program bindings.');
    for(const value of review.courseCodes){
      const key=JSON.stringify([normalized(review.provider),normalized(value)]),prior=scopesByCourse.get(key)||[];
      assert(!prior.some(scope=>overlap(scope,bindings)),'Assessment reviews must not overlap for the same provider, course and program scope.');
      prior.push(bindings);scopesByCourse.set(key,prior);
    }
  }
  return packet;
}

export function buildCourseAssessmentModule(source,packet){
  validateCourseAssessmentReviews(packet);
  assert(typeof source==='string'&&source.split(BEGIN).length===2&&source.split(END).length===2&&source.indexOf(BEGIN)<source.indexOf(END),'The assessment runtime needs exactly one ordered reviewed-data marker pair.');
  const value=JSON.stringify(packet).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  return source.slice(0,source.indexOf(BEGIN)+BEGIN.length)+'\n'+value+'\n'+source.slice(source.indexOf(END));
}

export async function runCourseAssessmentReviews({base=root,check=false}={}){
  const input=resolve(base,'content/discovery/course-assessment-reviews.json'),output=resolve(base,'dist/course-assessment.js');
  const [raw,source]=await Promise.all([readFile(input,'utf8'),readFile(output,'utf8')]);
  const packet=validateCourseAssessmentReviews(JSON.parse(raw)),generated=buildCourseAssessmentModule(source,packet);
  if(check)assert(generated===source,'Course assessment evidence is stale. Run node scripts/course-assessment-reviews.mjs.');
  else if(generated!==source)await writeFile(output,generated);
  return{sources:packet.sources.length,reviews:packet.reviews.length,courseBindings:packet.reviews.reduce((total,review)=>total+review.courseCodes.length,0)};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  const args=process.argv.slice(2);assert(args.every(arg=>arg==='--check'),'Use --check or no arguments.');
  console.log(JSON.stringify(await runCourseAssessmentReviews({check:args.includes('--check')})));
}
