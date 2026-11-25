/** Build-time binding of an exact reviewed standalone purchase to an original UPI course. */
import {readFileSync} from 'node:fs';
const reviewedRates=JSON.parse(readFileSync(new URL('../content/estimates/plan-estimate-rates.json',import.meta.url),'utf8'));
const copy=value=>structuredClone(value),list=value=>Array.isArray(value)?value:[];
const sameVersion=(a,b)=>a!==null&&a!==undefined&&b!==null&&b!==undefined&&String(a)===String(b);
const validDay=value=>typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const providerURL=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&['upistudy.com','www.upistudy.com'].includes(u.hostname)?u.href:null;}catch{return null;}};

/** A mismatch removes stale purchase metadata; it does not change any academic identity. */
export function attachUPICoursePurchasePrice(identity,identityReview,{rates=reviewedRates}={}){
  if(!identity||typeof identity!=='object'||Array.isArray(identity))return null;
  const option=copy(identity);for(const key of ['cost','costVerified','costStatus','costEvidence'])delete option[key];
  if(!option||option.provider!==undefined&&option.provider!=='UPI Study'||!/^UPIS-\d{4}$/.test(option.code||'')||option.creditOrigin!==undefined&&option.creditOrigin!=='alternative')return option;
  const price=list(rates?.providers).find(row=>row.provider==='UPI Study'&&row.type==='per-course'&&row.amount===undefined),course=list(identityReview?.courses).find(row=>row.aceId===option.code&&sameVersion(row.courseVersion,option.courseVersion));
  if(!price||!course||course.sourceCredits!==option.sourceCredits||course.sourceCreditSystem!==option.sourceCreditSystem||course.recommendationStart!==option.recommendationStart||course.recommendationEnd!==option.recommendationEnd)return option;
  const quotes=list(price.courseQuotes).filter(quote=>quote.code===option.code&&sameVersion(quote.courseVersion,option.courseVersion)&&quote.sourceCredits===option.sourceCredits&&quote.sourceCreditSystem===option.sourceCreditSystem&&quote.recommendationStart===option.recommendationStart&&quote.recommendationEnd===option.recommendationEnd);
  if(quotes.length!==1)return option;
  const quote=quotes[0],offering=course.currentOffering,sources=new Map(list(identityReview.sources).map(source=>[source.id,source])),rateSources=new Map(list(rates.sources).map(source=>[source.id,source]));
  if(!Number.isFinite(quote.amount)||quote.amount<0||quote.currency!=='USD'||!validDay(quote.checkedOn)||quote.checkedOn>rates.checkedOn||quote.checkedOn<quote.recommendationStart||quote.checkedOn>quote.recommendationEnd||offering?.price!==quote.amount||offering.currency!=='USD'||offering.aceId!==option.code||offering.recommendationStart!==option.recommendationStart||offering.recommendationEnd!==option.recommendationEnd||providerURL(offering.courseUrl)!==providerURL(option.url)||!providerURL(option.url)||!list(quote.sourceIds).length||!quote.sourceIds.every(id=>list(option.identitySourceIds).includes(id)&&sources.get(id)?.url===rateSources.get(id)?.url&&sources.get(id)?.sha256===rateSources.get(id)?.sha256))return option;
  const providerSource=quote.sourceIds.map(id=>sources.get(id)).find(source=>source?.kind==='provider-course'&&list(source.roles).includes('pricing')&&providerURL(source.url)===providerURL(option.url));
  const originalSource=quote.sourceIds.map(id=>sources.get(id)).find(source=>source?.kind==='ace-course-exhibit'&&String(source.title).includes(option.code));
  if(!providerSource||!originalSource)return option;
  return {...option,cost:quote.amount,costVerified:true,costStatus:'reviewed-source-course-purchase',costEvidence:{kind:'upi-standalone-course-purchase-v1',basis:'per-course',provider:'UPI Study',code:quote.code,courseVersion:quote.courseVersion,sourceCredits:quote.sourceCredits,sourceCreditSystem:quote.sourceCreditSystem,recommendationStart:quote.recommendationStart,recommendationEnd:quote.recommendationEnd,amount:quote.amount,currency:'USD',checkedOn:quote.checkedOn,courseUrl:option.url,sourceIds:copy(quote.sourceIds),includesMembership:false,includesTranscript:false,includesTaxes:false}};
}
