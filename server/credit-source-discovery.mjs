/** Public provider navigation data. A directory listing never establishes a transfer award. */
const DegreeCreditSourceDiscovery = (() => {
 'use strict';
 const MAX_PROVIDERS=64,MAX_DOMAINS=80,MAX_HINTS=120000;
 const routeOrigins=new Set(['alternative','institutional','noncredit']),routeBases=new Set(['ACE','NCCRS','institution-issued','none']),routeStatuses=new Set(['current','candidate','historical']);
 const list=value=>Array.isArray(value)?value:[];
 const clean=(value,max)=>typeof value==='string'?value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';
 const idPattern=/^[a-z0-9][a-z0-9-]{0,99}$/;
 const secretParameter=/^(?:access_token|refresh_token|api_key|apikey|authorization|password|session|session_id|sessionid|token)$/i;
 const tracking=/^(?:utm_.*|fbclid|gclid|dclid|msclkid|gbraid|wbraid|mc_cid|mc_eid|_ga|_gl|ref|referrer|email|student_id|lead_id|prospect_id|user_id|contact_id)$/i;
 function publicURL(value){
  if(typeof value!=='string'||value.length>2000)return null;
  try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||!url.hostname.includes('.')||/^(?:\d|\[)/.test(url.hostname)||/(?:^|\.)(?:localhost|local|internal|invalid|test)$/.test(url.hostname))return null;for(const key of [...url.searchParams.keys()]){if(secretParameter.test(key))return null;if(tracking.test(key))url.searchParams.delete(key);}url.hash='';url.searchParams.sort();return url.href;}catch{return null;}
 }
 function domain(value){
  const host=new URL(value).hostname.toLowerCase().replace(/\.$/,'').replace(/^www\./,'');
  // Keep shared help-center and hosting tenants isolated; other roots are the provider's public domain.
  if(/(?:^|\.)(?:zohodesk\.com|zendesk\.com|freshdesk\.com|github\.io|blogspot\.com|googleusercontent\.com|amazonaws\.com|azurewebsites\.net)$/.test(host))return host;
  const labels=host.split('.'),tail=labels.slice(-2).join('.');return /^(?:ac|co|com|edu|org|gov)\.[a-z]{2}$/.test(tail)?labels.slice(-3).join('.'):tail;
 }
 function screening(kind){
  if(['retired-provider','retired-examination'].includes(kind))return{use:'historical-records-only',newCreditCandidate:false,creditRoute:'historical-award',creditOrigin:'requires-original-record'};
  if(kind==='preparation-and-funding')return{use:'preparation-and-funding-only',newCreditCandidate:false,creditRoute:'supports-separate-examination',creditOrigin:'no-independent-credit-award'};
  if(kind==='qualifying-prior-learning')return{use:'eligible-prior-learning',newCreditCandidate:false,creditRoute:'documented-training',creditOrigin:'requires-original-record'};
  if(kind==='training-and-conversion')return{use:'college-conversion-required',newCreditCandidate:true,creditRoute:'training-plus-separate-college-award',creditOrigin:'requires-issuer-and-conversion-evidence'};
  if(['institutional-partner','school-mediated-dual-enrollment'].includes(kind))return{use:'eligibility-dependent',newCreditCandidate:true,creditRoute:'identify-selected-college-or-recommendation-route',creditOrigin:'requires-selected-transcript-issuer'};
  if(kind==='institutional-course')return{use:'new-learning-candidate',newCreditCandidate:true,creditRoute:'college-course',creditOrigin:'institutional-candidate'};
  if(kind==='institutional-examination')return{use:'new-learning-candidate',newCreditCandidate:true,creditRoute:'college-issued-examination',creditOrigin:'destination-may-apply-exam-specific-limits'};
  if(['credential-bundle','industry-certification'].includes(kind))return{use:'exact-credential-and-version-only',newCreditCandidate:true,creditRoute:'designated-completed-credential',creditOrigin:'requires-exact-recommendation-and-issuer'};
  if(kind==='training-provider')return{use:'current-credit-eligibility-needs-research',newCreditCandidate:true,creditRoute:'designated-training-and-version',creditOrigin:'requires-current-recommendation-and-issuer'};
  if(['alternative-provider','credit-examination','language-assessment'].includes(kind))return{use:'new-learning-candidate',newCreditCandidate:true,creditRoute:kind==='alternative-provider'?'designated-recommended-course':'designated-examination-or-assessment',creditOrigin:'alternative-candidate'};
  return{use:'route-and-eligibility-needs-research',newCreditCandidate:true,creditRoute:'identify-exact-credit-route',creditOrigin:'requires-issuer-evidence'};
 }
 function build(snapshot){
  if(!snapshot||!Array.isArray(snapshot.sources)||snapshot.sources.length>MAX_PROVIDERS)throw Error('Use a bounded, reviewed public credit-source directory.');
  const providers=[],ids=new Set(),domains=new Set();
  for(const source of snapshot.sources){
   if(!source||!idPattern.test(source.id||'')||ids.has(source.id))throw Error('Credit sources need unique stable IDs.');ids.add(source.id);
   const name=clean(source.name,160),kind=clean(source.kind,80);if(!name||!kind)throw Error('Credit sources need public names and source kinds.');
   const creditRoutes=list(source.creditRoutes).slice(0,12).filter(route=>route&&idPattern.test(route.id||'')&&routeOrigins.has(route.origin)&&routeBases.has(route.basis)&&routeStatuses.has(route.status)).map(route=>({id:route.id,label:clean(route.label,160),origin:route.origin,basis:route.basis,status:route.status,issuer:clean(route.issuer,240),eligibility:clean(route.eligibility,600),sourceUrls:[...new Set(list(route.sourceUrls).slice(0,8).map(publicURL).filter(Boolean))]}));
   const researchURLs=[...new Set([source.url,...list(source.evidence).slice(0,8).map(item=>item?.url),...creditRoutes.flatMap(route=>route.sourceUrls)].map(publicURL).filter(Boolean))].slice(0,16);
   if(!researchURLs.length)continue;
   for(const url of researchURLs)domains.add(domain(url));
   const aliases=[...new Set([source.id,source.id.replaceAll('-',' '),name,...list(source.aliases).slice(0,8).map(value=>clean(value,160))].filter(Boolean))];
   providers.push({id:source.id,name,aliases,kind,...(['current-offer','candidate'].includes(source.status)?{status:source.status}:{}),...screening(kind),...(creditRoutes.length?{creditRoutes}:{}),creditBasis:clean(source.creditBasis,600),summary:clean(source.summary,450),pace:clean(source.pace,250),priceNote:clean(source.priceNote,350),assessmentNote:clean(source.assessmentNote,350),researchURLs});
  }
  if(domains.size>MAX_DOMAINS)throw Error('The provider research domains exceed the reviewed directory limit.');
  const checkedOn=typeof snapshot.checkedOn==='string'&&/^20\d\d-\d\d-\d\d$/.test(snapshot.checkedOn)?snapshot.checkedOn:null;
  let hints=JSON.stringify({checkedOn,providers});
  if(hints.length>MAX_HINTS)hints=JSON.stringify({checkedOn,providers:providers.map(({id,name,aliases,kind,status,use,newCreditCandidate,creditRoute,creditOrigin,creditRoutes,creditBasis,researchURLs})=>({id,name,aliases:aliases.slice(0,3),kind,status,use,newCreditCandidate,creditRoute,creditOrigin,creditRoutes,creditBasis:creditBasis.slice(0,200),researchURLs:researchURLs.slice(0,3)}))});
  if(hints.length>MAX_HINTS)throw Error('Provider navigation data exceeds its bounded research context.');
  return{version:1,checkedOn,providers,domains:[...domains].sort(),hints};
 }
 return{build};
})();
export function buildCreditSourceDiscovery(snapshot){return DegreeCreditSourceDiscovery.build(snapshot);}
