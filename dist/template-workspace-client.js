(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.DegreeTemplateWorkspace=api;}(typeof globalThis!=='undefined'?globalThis:this,function(root){
'use strict';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const list=v=>Array.isArray(v)?v:[];
function safeURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!/^(localhost|127\.|10\.|192\.168\.|\[|0\.)/.test(u.hostname)?u.href:null;}catch{return null;}}
function connectionError(research=false){const error=Error(research?'The connection was interrupted. Check your saved research before starting again.':'This service could not be reached. Your saved plan is unchanged.');error.code=research?'RESEARCH_CONNECTION_INTERRUPTED':'NETWORK_UNAVAILABLE';return error;}
function responseError(body,status){const error=Error(typeof body?.error==='string'?body.error:typeof body?.message==='string'?body.message:'That action could not be completed. Please try again.');error.status=status;error.data=body;return error;}
async function researchStream(response){
 const reader=response.body?.getReader?.();if(!reader)throw connectionError(true);
 const decoder=new TextDecoder('utf-8',{fatal:true}),maxFrame=4*1024*1024,maxTotal=8*1024*1024;let buffer='',event='',data=[],frameSize=0,total=0,terminal=null;
 function line(value){
  frameSize+=value.length;if(frameSize>maxFrame)throw connectionError(true);
  if(value===''){
   if((event==='result'||event==='error')&&data.length){
    let envelope;try{envelope=JSON.parse(data.join('\n'));}catch{throw connectionError(true);}
    if(!envelope||!Number.isSafeInteger(envelope.status)||envelope.status<200||envelope.status>599||!envelope.body||typeof envelope.body!=='object'||Array.isArray(envelope.body))throw connectionError(true);
    if(event==='error'&&envelope.status<400)throw connectionError(true);
    if(event==='error'||envelope.status>=300)throw responseError(envelope.body,envelope.status);
    terminal=envelope.body;
   }
   event='';data=[];frameSize=0;return;
  }
  if(value[0]===':')return;
  const colon=value.indexOf(':'),name=colon<0?value:value.slice(0,colon);let content=colon<0?'':value.slice(colon+1);if(content[0]===' ')content=content.slice(1);
  if(name==='event')event=content;else if(name==='data')data.push(content);
 }
 function drain(final=false){
  while(!terminal){const match=/[\r\n]/.exec(buffer);if(!match)return;const end=match.index;if(buffer[end]==='\r'&&end===buffer.length-1&&!final)return;const value=buffer.slice(0,end),width=buffer[end]==='\r'&&buffer[end+1]==='\n'?2:1;buffer=buffer.slice(end+width);line(value);}
 }
 try{
  while(!terminal){const chunk=await reader.read();if(chunk.done){buffer+=decoder.decode();drain(true);if(!terminal)throw connectionError(true);break;}total+=chunk.value.byteLength;if(total>maxTotal)throw connectionError(true);buffer+=decoder.decode(chunk.value,{stream:true});drain();if(buffer.length>maxFrame)throw connectionError(true);}
  return terminal;
 }catch(error){if(Number.isInteger(error?.status))throw error;throw connectionError(true);}
 finally{try{await reader.cancel();}catch{}try{reader.releaseLock();}catch{}}
}
async function api(path,{method='GET',body}={}){
 if(!/^\/api\/(?:templates|admin\/(?:templates|colleges|academic-coverage)|colleges)(?:[/?][A-Za-z0-9_/?=%&.,:+-]*)?$/.test(path)&&!/^\/api\/admin\/ai-connection(?:\/test)?$/.test(path))throw Error('Choose a valid workspace action.');
 const research=method==='POST'&&/^\/api\/templates\/requests(?:\/[A-Za-z0-9_-]+\/research)?$/.test(path),headers={Accept:research?'text/event-stream, application/json':'application/json'};if(method!=='GET'){headers['Content-Type']='application/json';headers['X-Portal-Request']='1';}
 let response;try{response=await root.fetch(path,{method,headers,credentials:'same-origin',cache:'no-store',redirect:'error',...(method==='GET'?{}:{body:JSON.stringify(body||{})})});}catch{throw connectionError(research);}
 if(research&&/^text\/event-stream(?:\s*;|$)/i.test(response.headers?.get?.('Content-Type')||''))return researchStream(response);
 let data;try{data=await response.json();}catch{if(research)throw connectionError(true);throw Error('This service could not be opened. Your saved plan has not changed.');}
 if(!response.ok)throw responseError(data,response.status);return data;
}
function artifactOf(template){return template?.artifact?.model||template?.artifact||template?.model||null;}
function requirementsDraft(template){
 const a=artifactOf(template);if(!a||!Array.isArray(a.requirements)||!a.requirements.length)throw Error('This research does not have requirement rows yet. You can still start a plan from scratch.');
 const school=String(a.schoolName||a.school||template.schoolName||'').trim(),title=String(a.programName||a.title||template.programName||'').trim();
 const sourceUrl=safeURL(a.officialUniversityUrl||a.sourceUrl||template.url||list(a.sources).find(s=>safeURL(s.url))?.url);if(!school||!title)throw Error('This research is missing its exact school or degree name.');
 if(school.length>120||title.length>200)throw Error('This degree name is too long for the builder. Open a new plan and enter a shorter name.');
 const id=String(template.id||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,85);if(!id)throw Error('Choose a saved degree research request.');
 const metadata={school,title,programId:'researched-'+id+'-r'+String(template.revision||1).replace(/\D/g,'').slice(0,8),level:a.level||template.level||'',modality:a.modality||template.modality||(a.format==='Online'?'online':a.format==='Residential'?'campus':''),catalog:a.catalogYear||a.catalog||template.catalogYear||'',creditSystem:a.creditSystem||'',sourceUrl:sourceUrl||'',totalCredits:Number.isFinite(a.totalCredits)?a.totalCredits:'',institutionMinCredits:Number.isFinite(a.institutionMinCredits)?a.institutionMinCredits:'',upperMinCredits:Number.isFinite(a.upperMinCredits)?a.upperMinCredits:'',reviewedByStudent:false};
 if(a.requirements.length>500)throw Error('This research has too many rows to import safely.');
 const rows=a.requirements.map(r=>({section:String(r.section||r.categoryLabel||r.category||'Degree requirements').slice(0,100),code:String(r.code||'').slice(0,80),title:String(r.title||r.requirement||'').slice(0,200),credits:Number.isFinite(r.credits)&&r.credits>=0?r.credits:'',requiredAtUniversity:r.requiredAtUniversity===true||r.institutionalOnly===true,upperLevel:r.upperLevel===true||r.upper===true,sourceUrl:safeURL(r.sourceUrl)||sourceUrl||''}));
 if(rows.some(r=>!r.title))throw Error('Some requirement rows are incomplete. Review the research before importing it.');
 return{metadata,rows,context:{school,degree:title,programId:metadata.programId,level:metadata.level,modality:metadata.modality,catalog:metadata.catalog,creditSystem:metadata.creditSystem,sourceUrl:metadata.sourceUrl}};
}
function prepareBuilder(state,template,A){
 const draft=requirementsDraft(template);A.validatePrivateWork(state);
 if(A.readDraft(state,draft.context))return{state,href:A.launchURL(draft.context),reused:true};
 const next=A.saveDraft(state,draft.context,{metadata:draft.metadata,rows:draft.rows,csv:'',mode:'rows'});return{state:next,href:A.launchURL(draft.context),reused:false};
}
function openBuilder(template){
 const A=root.AuditCurriculum;if(!A||!root.DegreeSheet)throw Error('Refresh this page before opening the plan builder.');
 let state;try{const raw=root.localStorage.getItem('degreepath-guide-v3');state=raw?JSON.parse(raw):root.DegreeSheet.initialize(null,null,{pathways:[]});}catch{throw Error('Your existing device plan could not be read. It has not been replaced.');}
 const result=prepareBuilder(state,template,A);if(!result.reused)root.localStorage.setItem('degreepath-guide-v3',JSON.stringify(result.state));root.location.assign(result.href);
}
const copy=value=>JSON.parse(JSON.stringify(value)),normal=value=>String(value||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase(),codeKey=value=>normal(value).replace(/[^a-z0-9]/g,''),known=value=>typeof value==='number'&&Number.isFinite(value);
function revisionIdentity(template){
 if(typeof template?.id!=='string'||!template.id||template.id.length>100||!Number.isSafeInteger(template.revision)||template.revision<1)throw Error('Choose a saved, reviewed template revision.');
 const value=template.id+':'+template.revision;let hash=2166136261;for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}
 return 'student-audit-community-'+template.id.replace(/[^A-Za-z0-9_-]/g,'').slice(0,45)+'-'+(hash>>>0).toString(16)+'-r'+template.revision;
}
function prepareTemplatePlan(state,template,A,catalog,consent={},research=false){
 if(!research&&consent.reviewedByStudent!==true)throw Error('Review the complete requirements and confirm them before using this template.');
 if(!research&&(template?.status!=='ready'||template.sourcesReviewed===false||template.academicReviewed===false))throw Error('Only a reviewed, ready-to-use community template can open a course plan.');
 if(!A?.create||!A.validateEntry||!A.commit||!catalog||!Array.isArray(catalog.pathways))throw Error('The plan builder is not ready. Refresh this page; your saved plan is unchanged.');
 if(research&&(!['draft','ready'].includes(template?.status)||template.planBuildable!==true||!template.planArtifact))throw Error('The research still needs a source-backed degree credit ledger. Open its results to see what is missing.');
 const material=research?{...template,artifact:template.planArtifact}:template;
 A.validatePrivateWork(state);const id=research?revisionIdentity(template).replace('student-audit-community-','student-audit-research-'):revisionIdentity(template),namespace='ct-'+id.split('-').slice(-2).join('-'),original=artifactOf(material),draft=requirementsDraft(material);
 const levelAliases={bachelors:'bachelor',bachelor:'bachelor',associates:'associate',associate:'associate',masters:'master',master:'master',doctoral:'doctorate',doctorate:'doctorate',specialist:'specialist'};draft.metadata.level=levelAliases[codeKey(draft.metadata.level)]||draft.metadata.level;
 if(!original||!['associate','bachelor','master','doctorate','specialist'].includes(draft.metadata.level)||!['online','campus',...(research?['hybrid']:[])].includes(draft.metadata.modality)||!['semester','quarter','competency-unit'].includes(draft.metadata.creditSystem))throw Error('The reviewed template needs its exact degree level, study format, and credit units.');
 if(original.learningFormat!==undefined&&!['course-based','competency-based','self-paced'].includes(original.learningFormat))throw Error('The template has an invalid learning format.');
 if(research&&template.referenceChoice!=null&&(typeof template.referenceChoice!=='string'||!/^[a-z0-9][a-z0-9_-]{0,99}$/.test(template.referenceChoice)))throw Error('The research has an invalid learning-format choice.');
 const compare=(a,b,label)=>{if(a&&b&&normal(String(a).replace(/[–—]/g,'-'))!==normal(String(b).replace(/[–—]/g,'-')))throw Error('The template '+label+' does not match its reviewed degree.');};
 compare(template.schoolName,draft.metadata.school,'school');compare(template.programName,draft.metadata.title,'degree');compare(levelAliases[codeKey(template.level)]||template.level,draft.metadata.level,'level');compare(template.modality,draft.metadata.modality,'study format');compare(template.catalogYear,draft.metadata.catalog,'catalog');
 compare(original.school,original.schoolName,'school');compare(original.title,original.programName,'degree');
 const mode=original.format==='Online'?'online':['Residential','On campus','Campus'].includes(original.format)?'campus':research&&original.format==='Hybrid'?'hybrid':null;if(mode)compare(mode,draft.metadata.modality,'study format');
 if(!draft.metadata.sourceUrl||!draft.metadata.catalog)throw Error('The reviewed template needs its official source and catalog.');
 const existing=list(state.customCurricula).find(entry=>entry.route?.id===id);
 if(existing){const selected=A.commit(state,A.validateEntry(existing),{catalog:A.attach?A.attach(catalog,state):catalog});selected.templateOrigin={title:draft.metadata.title,context:'template:'+(research?'research-':'reviewed-')+template.id,revision:template.revision,pathwayId:existing.route.id};return {state:selected,entry:copy(existing),href:'plan.html',reused:true};}
 const artifact=copy(original),sources=list(artifact.sources),sourceIds=new Map(),sourceById=new Map();
 if(!sources.length||sources.length>100)throw Error('The reviewed template is missing its source references.');
 sources.forEach((source,index)=>{if(typeof source.id!=='string'||!source.id||sourceById.has(source.id)||!safeURL(source.url))throw Error('A template source reference is invalid.');sourceById.set(source.id,source);sourceIds.set(source.id,namespace+'-source-'+(index+1));});
 const sourceRefs=value=>{if(!Array.isArray(value)||!value.length||value.some(source=>!sourceIds.has(source)))throw Error('A course choice is missing its reviewed source reference.');return value.map(source=>sourceIds.get(source));};
 const reviewedPublication=!research&&template.sourcesReviewed===true&&template.academicReviewed===true;
 const schoolDomain=value=>{const parts=new URL(value).hostname.toLowerCase().split('.'),last=parts.slice(-2).join('.');return /^(?:ac|co|com|edu|org|gov)\.[a-z]{2}$/.test(last)?parts.slice(-3).join('.'):last;},officialDomain=schoolDomain(draft.metadata.sourceUrl);
 const checked=value=>typeof value==='string'&&/^20\d\d-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value&&Date.parse(value)<=Date.now()+86400000;
 const officialSource=(source,role)=>source&&safeURL(source.url)&&schoolDomain(source.url)===officialDomain&&(!source.kind||['university','official'].includes(source.kind))&&(!Array.isArray(source.roles)||source.roles.includes(role))&&(!source.checked||checked(source.checked))&&(!source.checkedOn||checked(source.checkedOn));
 const exactScope=scope=>scope&&normal(scope.schoolName)===normal(draft.metadata.school)&&normal(scope.programName)===normal(draft.metadata.title)&&scope.level===draft.metadata.level&&scope.modality===draft.metadata.modality&&normal(String(scope.catalogYear).replace(/[–—]/g,'-'))===normal(String(draft.metadata.catalog).replace(/[–—]/g,'-'));
 function documentedPublished(req,option){
  if(!reviewedPublication||option.evidence!=='published')return false;
  const references=list(option.sourceIds);if(!references.length)return false;
  if(option.provider==='University')return codeKey(option.code)===codeKey(req.code)&&references.every(id=>list(req.sourceIds).includes(id)&&officialSource(sourceById.get(id),'curriculum'))||A.reviewedFreeElectiveChoice?.({...artifact,school:draft.metadata.school,title:draft.metadata.title,level:draft.metadata.level,creditSystem:draft.metadata.creditSystem,communityTemplate:{id:template.id,revision:template.revision,sourcesReviewed:true,academicReviewed:true},auditProvenance:{status:'student-provided'}},req,option,sourceById)===true;
  if(!option.receivingCode||codeKey(option.receivingCode)!==codeKey(req.code))return false;
  const claim=option.mappingEvidence;
  if(claim)return exactScope(claim)&&claim.provider===option.provider&&codeKey(claim.providerCourseCode)===codeKey(option.code)&&codeKey(claim.receivingCode)===codeKey(req.code)&&claim.credits===req.credits&&claim.creditSystem===draft.metadata.creditSystem&&list(claim.sourceIds).length>0&&claim.sourceIds.every(id=>references.includes(id)&&officialSource(sourceById.get(id),'receiving-map')&&list(sourceById.get(id)?.roles).includes('receiving-map')&&exactScope(sourceById.get(id)?.scope));
  return typeof option.mappingReviewId==='string'&&!!option.mappingReviewId&&checked(option.mappingChecked)&&references.every(id=>{const source=sourceById.get(id);return officialSource(source,'receiving-map')&&source.evidenceType==='official-receiving-school-equivalency'&&checked(source.checked||source.checkedOn);});
 }
 const requirementIds=new Map(),codes=new Map();artifact.requirements.forEach((req,index)=>{if(!req||typeof req.id!=='string'||!req.id||requirementIds.has(req.id)||typeof req.title!=='string'||req.title.length>200||(!research||req.selectionRequired!==true)&&(typeof req.code!=='string'||!req.code.trim())||typeof req.code==='string'&&req.code.length>100||!known(req.credits)||req.credits<=0||!research&&(req.researchGap||req.selectionRequired))throw Error('Choose named, complete requirements before using this template.');requirementIds.set(req.id,'audit-row-'+(index+1));const key=codeKey(req.code);if(key)codes.set(key,codes.has(key)?null:'audit-row-'+(index+1));sourceRefs(req.sourceIds);});
 const sectionIds=new Map(list(artifact.curriculumSections).map((section,index)=>[section.id,namespace+'-section-'+(index+1)]));
 const dependency=value=>{const mapped=requirementIds.get(value)||codes.get(codeKey(value));if(!mapped)throw Error('A template prerequisite does not identify one exact requirement.');return mapped;};
 function mapped(value,key=''){
  if(['group','sectionId','parentId'].includes(key)&&sectionIds.has(value))return sectionIds.get(value);
  if(['sourceIds','identitySourceIds','policySourceIds'].includes(key))return Array.isArray(value)&&!value.length&&key!=='sourceIds'?[]:sourceRefs(value);
  if(key==='sourceId'){if(!sourceIds.has(value))throw Error('A template source reference is missing.');return sourceIds.get(value);}
  if(key==='sourcePages'){const pages={};for(const [source,page]of Object.entries(value||{})){if(!sourceIds.has(source))throw Error('A course evidence page has no source.');pages[sourceIds.get(source)]=page;}return pages;}
  if(['requirementIds','sharedRequirementIds','prerequisites','capstoneRequirementIds'].includes(key))return list(value).map(dependency);
  if(key==='requirementId')return dependency(value);
  if(Array.isArray(value))return value.map(item=>mapped(item));
  if(value&&typeof value==='object'){const out={};for(const [name,item]of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(name))throw Error('The template contains an unsupported metadata field.');out[name]=mapped(item,name);}return out;}
  return value;
 }
 const rows=draft.rows.map((row,index)=>({...row,...(research&&artifact.requirements[index].selectionRequired===true?{selectionRequired:true}:{}),sourceUrl:safeURL(sourceById.get(artifact.requirements[index].sourceIds[0]).url)||draft.metadata.sourceUrl}));
 const entry=research?A.createResearch(rows,{...draft.metadata,id,templateId:template.id,templateRevision:template.revision}):A.create(rows,{...draft.metadata,id,reviewedByStudent:true}),model=entry.model;
 model.sources.push(...sources.map(source=>({...copy(source),id:sourceIds.get(source.id),evidenceType:source.evidenceType||(research?'ai-researched-source':'reviewed-community-template-source')})));
 const bundles=new Map();
 model.requirements=model.requirements.map((base,index)=>{
  const req=artifact.requirements[index],required=base.institutionalOnly||req.requiredAtUniversity===true||req.institutionalOnly===true,options=list(req.options).filter(option=>option?.selectionRequired!==true);
  if(!options.length&&!(research&&req.selectionRequired===true))throw Error('Each requirement needs a named course option or an explicit pending course choice.');
  const next={...base,...mapped(Object.fromEntries(Object.entries(req).filter(([name])=>!['id','options','requiredAtUniversity','upperLevel','section'].includes(name)))),id:base.id,institutionalOnly:required,studentProvided:true,options:[]};
  if(req.upper===true||req.upperLevel===true)next.upper=true;
  if(req.minimumCompletedCredits!==undefined&&(!known(req.minimumCompletedCredits)||req.minimumCompletedCredits<0||req.minimumCompletedCredits>model.totalCredits))throw Error('A reviewed completed-credit prerequisite is invalid.');
  if(req.category)next.category=req.category;else if(req.section)next.category=/general/i.test(req.section)?'general':/elective/i.test(req.section)?'elective':'major';
  const optionIds=new Set();next.options=options.map((option,optionIndex)=>{
   if(!option||typeof option.id!=='string'||!option.id||optionIds.has(option.id)||typeof option.provider!=='string'||!option.provider.trim()||typeof option.code!=='string'||!option.code.trim()||typeof option.title!=='string'||!option.title.trim()||!known(option.credits)||Math.abs(option.credits-next.credits)>0.001||option.creditSystem&&option.creditSystem!==model.creditSystem||option.selectionRequired||!safeURL(option.url))throw Error('A reviewed course option has missing or mismatched course facts.');optionIds.add(option.id);
   if(required&&option.provider!=='University')throw Error('A university-only requirement cannot use an outside transfer course.');
   const alternative=['sophia','sophialearning','studycom','straighterline','clep','dsst','saylor','modernstates','davar','coopersmith','aleks','aleksindependentuse','upistudy','csm','seemore','seemorecorestrategiesformathematics'].includes(codeKey(option.provider)),origin=String(option.creditOrigin||option.sourceType||'').toLowerCase().replace(/[\s_]/g,'-'),institutional=['institutional','institutional-credit','college','college-issued','regionally-accredited','university'].includes(origin),recognized=institutional||['alternative','alternative-credit','ace','ace-recommended','nccrs','nccrs-recommended','noncollegiate','exam','credit-by-exam'].includes(origin);
   if(codeKey(option.provider)==='university'&&option.provider!=='University')throw Error('Use the canonical University provider for destination courses.');
   if(option.provider!=='University'&&(alternative&&institutional||!alternative&&!recognized))throw Error('A transfer option needs a consistent college-issued or alternative credit source.');
   if(['master','doctorate','specialist'].includes(model.level)&&option.provider!=='University'&&(alternative||option.graduateApproval!==true||!institutional))throw Error('Graduate transfer choices need exact graduate-program approval and college-issued credit.');
   const documented=documentedPublished(req,option),added={...mapped(option),id:namespace+'-row-'+(index+1)+'-option-'+(optionIndex+1),evidence:documented?'published':'conditional',creditSystem:model.creditSystem,conditions:[...list(option.conditions),...(documented?[]:['Your university must confirm this placement for your own records and catalog.'])]};
   for(const field of ['status','learningId','completedOn','schoolConfirmed','confirmed','evaluations'])delete added[field];
   if(added.bundleId){if(!bundles.has(added.bundleId))bundles.set(added.bundleId,namespace+'-bundle-'+(bundles.size+1));added.bundleId=bundles.get(added.bundleId);}
   if(alternative)added.creditOrigin='alternative';
   if(option.provider!=='University'){for(const field of ['sourceCredits','sourceCreditSystem','bundleCredits','sourceCreditVerification'])delete added[field];added.sourceCreditStatus='unknown';added.sourceCreditBasis='Original credits and units need an independent course record.';}
   return added;
  });return next;
 });
 for(const field of ['institutionMinCredits','externalMaxCredits','alternativeMaxCredits','upperMinCredits','majorMinInstitutionCredits','majorResidencyBasisCredits'])if(artifact[field]!==undefined&&artifact[field]!==null){if(!known(artifact[field])||artifact[field]<0||artifact[field]>model.totalCredits)throw Error('A reviewed degree credit limit is invalid.');model[field]=artifact[field];}
 if(artifact.majorInstitutionFraction!==undefined&&artifact.majorInstitutionFraction!==null){if(!known(artifact.majorInstitutionFraction)||artifact.majorInstitutionFraction<0||artifact.majorInstitutionFraction>1)throw Error('The reviewed major residency fraction is invalid.');model.majorInstitutionFraction=artifact.majorInstitutionFraction;}
 if(artifact.majorInstitutionFraction===0&&artifact.majorResidencyBasisCredits===0){delete model.majorInstitutionFraction;delete model.majorResidencyBasisCredits;if(artifact.majorMinInstitutionCredits===undefined||artifact.majorMinInstitutionCredits===null)model.majorMinInstitutionCredits=0;}
 for(const field of ['learningFormat','policySourceIds','policyEvidence','residencyPolicy','namedCourseCompletionReview','gradePolicy','transferGradePolicy','upperGroupMinimums','graduationRequirements','policyReview','obligations','overlaps','rulesNotes','prerequisiteNotes','minimumGrade','minGrade','unresolved','creditConversions','paceModel','pricing','pricingNotes','tuitionComparison','curriculumStructureCheckedOn'])if(artifact[field]!==undefined)model[field]=mapped(artifact[field],field);
 if(Array.isArray(artifact.curriculumSections)&&artifact.curriculumSections.length){model.curriculumSections=artifact.curriculumSections.map(section=>({...mapped(section),id:sectionIds.get(section.id),...(section.parentId?{parentId:sectionIds.get(section.parentId)||section.parentId}: {})}));}
 const providers=[...new Set(model.requirements.flatMap(req=>req.options.map(option=>option.provider)))].filter(provider=>provider!=='University');model.defaultProviders=list(artifact.defaultProviders).length?artifact.defaultProviders.filter(provider=>providers.includes(provider)):providers;
 model.completeExecutablePathway=false;if(research){model.researchTemplate={id:template.id,revision:template.revision,...(template.referenceChoice!=null?{referenceChoice:template.referenceChoice}:{})};model.coverageLabel='AI-researched degree plan · confirmation needed';model.unresolved=[...new Set([...list(model.unresolved),...list(template.planIssues),'Confirm this AI-researched degree plan and transfer placements with the university.'])];model.policyReview=[{field:'aiResearch',status:'unverified',message:'This plan was generated from public degree sources. It has not been reviewed by you or independently approved.'},...list(model.policyReview)];model.auditProvenance={...model.auditProvenance,status:'ai-research',reviewedByStudent:false,independentlyVerified:false};entry.route.courseMapStatus='ai-research';entry.route.summary='Your editable AI-researched degree plan. Unresolved requirements and transfer decisions need confirmation.';}else{model.communityTemplate={id:template.id,revision:template.revision,...(reviewedPublication?{sourcesReviewed:true,academicReviewed:true}:{})};model.personalEvaluationReminder='Your school evaluates your own transcripts, duplicate credit and catalog eligibility. Published course maps do not record an individual credit award.';model.coverageLabel='Reviewed community template · proposed personal plan';entry.route.summary='Your copy of a reviewed community template. Individual university approval is still needed.';}
 A.validateEntry(entry);const attached=A.attach?A.attach(catalog,state):catalog,next=A.commit(state,entry,{catalog:attached});next.templateOrigin={title:draft.metadata.title,context:'template:'+(research?'research-':'reviewed-')+template.id,revision:template.revision,pathwayId:entry.route.id};return {state:next,entry,href:'plan.html',reused:false};
}
function prepareReviewedPlan(state,template,A,catalog,consent={}){return prepareTemplatePlan(state,template,A,catalog,consent,false);}
function validateResearchMaterial(template){
 const a=template?.planArtifact;if(template?.planBuildable!==true||!a||typeof a!=='object')throw Error('The research still needs a source-backed degree credit ledger. Open its results to see what is missing.');
 const official=safeURL(a.officialUniversityUrl||template.url),sources=new Map(list(a.sources).map(s=>[s.id,s]));
 if(!official)throw Error('The degree needs an official university source before opening a plan.');
 const domain=value=>{const parts=new URL(value).hostname.toLowerCase().split('.'),last=parts.slice(-2).join('.');return /^(?:ac|co|com|edu|org|gov)\.[a-z]{2}$/.test(last)?parts.slice(-3).join('.'):last;},officialDomain=domain(official);
 const scope=s=>s&&normal(s.schoolName)===normal(a.schoolName||a.school)&&normal(s.programName)===normal(a.programName||a.title)&&s.level===a.level&&s.modality===a.modality&&normal(String(s.catalogYear).replace(/[–—]/g,'-'))===normal(String(a.catalogYear||a.catalog).replace(/[–—]/g,'-'));
 const refs=(ids,role,institution=false)=>Array.isArray(ids)&&ids.length>0&&ids.every(id=>{const s=sources.get(id);return s&&safeURL(s.url)&&list(s.roles).includes(role)&&(!institution||s.kind==='university'&&domain(s.url)===officialDomain&&scope(s.scope));});
 for(const r of list(a.requirements)){
  if(!refs(r.sourceIds,'curriculum',true))throw Error('A degree requirement is missing its official university source.');
  for(const o of list(r.options)){
   if(o.provider==='University'){if(codeKey(o.code)!==codeKey(r.code)||!refs(o.sourceIds,'curriculum',true))throw Error('A university course does not match its sourced degree requirement.');continue;}
   const m=o.mappingEvidence,ids=list(o.identitySourceIds),maps=list(m?.sourceIds);
   if(!m||!scope(m)||m.provider!==o.provider||codeKey(m.providerCourseCode)!==codeKey(o.code)||codeKey(m.receivingCode)!==codeKey(r.code)||codeKey(o.receivingCode)!==codeKey(r.code)||m.credits!==r.credits||m.creditSystem!==a.creditSystem||m.creditOrigin!==o.creditOrigin||!refs(maps,'receiving-map',true)||maps.some(id=>ids.includes(id))||!maps.every(id=>list(o.sourceIds).includes(id))||!refs(ids,'provider-identity')||!ids.every(id=>{const s=sources.get(id);return ['provider','accreditor','university'].includes(s.kind)&&s.provider===o.provider&&list(s.courseCodes).some(code=>codeKey(code)===codeKey(o.code));}))throw Error('A transfer course needs separate university mapping and provider-course evidence.');
  }
 }
 return true;
}
function prepareResearchPlan(state,template,A,catalog){validateResearchMaterial(template);return prepareTemplatePlan(state,template,A,catalog,{},true);}
function previewResearchPlan(template){
 try{
  const common=typeof module==='object'&&module.exports,A=root.AuditCurriculum||(common?require('./audit-curriculum.js'):null),S=root.DegreeSheet||(common?require('./sheet-state.js'):null),P=root.DegreePlanner||(common?require('./planner.js'):null);
  if(!A||!S?.initialize||!P?.generate)return null;
  const catalog={pathways:[]},result=prepareResearchPlan(S.initialize(null,null,catalog),template,A,catalog),model=result.entry.model,providers=[...new Set(model.requirements.flatMap(r=>r.options.map(o=>o.provider)))].filter(provider=>provider!=='University'),plan=P.generate(model,{providers,allowConditional:true,priority:'transfer',completed:[],optimizationNodeBudget:12000});
  const transferCredits=plan.rows.reduce((sum,row)=>sum+(row.option&&row.option.provider!=='University'?row.credits:0),0),universityCredits=plan.rows.reduce((sum,row)=>sum+(row.option?.provider==='University'?row.credits:0),0);
  return{model,plan,rows:plan.rows,totalCredits:model.totalCredits,transferCredits,universityCredits};
 }catch{return null;}
}
function sourcePlanIdentity(sourcePlan){
 const route=sourcePlan?.route,model=sourcePlan?.model;if(!route||!model||typeof route.id!=='string'||typeof route.modelId!=='string'||route.modelId!==model.id||!route.id||!model.id||normal(route.school)!==normal(model.school))throw Error('Choose an available degree plan from the current library.');
 const level=value=>({bachelor:'bachelor',bachelors:'bachelor',associate:'associate',associates:'associate',master:'master',masters:'master',doctorate:'doctorate',doctoral:'doctorate',specialist:'specialist'})[codeKey(value)];
 const modes=list(route.modalities),modelModes=/^online$/i.test(model.format)?['online']:/^(?:residential|on campus|campus)$/i.test(model.format)?['campus']:null;
 if(!level(route.level)||level(route.level)!==level(model.level)||!['semester','quarter','competency-unit'].includes(model.creditSystem)||!modes.length||modes.some(mode=>!['online','campus','hybrid'].includes(mode)||modelModes&&!modelModes.includes(mode)))throw Error('The degree plan needs its exact level, study format and credit units.');
 return{route,model};
}
function previewSourcePlan(sourcePlan){
 try{
  const common=typeof module==='object'&&module.exports,C=root.DegreeProgramCatalog||(common?require('./program-catalog.js'):null),P=root.DegreePlanner||(common?require('./planner.js'):null),{route,model:original}=sourcePlanIdentity(sourcePlan);
  if(!C?.validateModel||!C?.modelReadiness||!P?.generate)return null;
  const model=C.validateModel(original,{id:route.modelId,school:route.school,creditUnit:original.creditSystem});if(!C.modelReadiness(model).available)return null;
  const providers=[...new Set(model.requirements.flatMap(r=>list(r.options).map(o=>o.provider)))].filter(provider=>provider!=='University'),plan=P.generate(model,{providers,allowConditional:true,priority:'transfer',completed:[],optimizationNodeBudget:12000});if(plan.validation?.academicCountsValid!==true||plan.rows.length!==model.requirements.length||plan.rows.some(row=>!row.option||row.selectionRequired))return null;
  return{model,plan,rows:plan.rows,totalCredits:model.totalCredits,transferCredits:plan.rows.reduce((sum,row)=>sum+(row.option.provider!=='University'?row.credits:0),0),universityCredits:plan.rows.reduce((sum,row)=>sum+(row.option.provider==='University'?row.credits:0),0)};
 }catch{return null;}
}
async function openSourcePlan(sourcePlan){
 const C=root.DegreeProgramCatalog,S=root.DegreeSheet,A=root.AuditCurriculum;if(!C?.load||!C?.modelsForRoutes||!C?.isPlanAvailable||!C?.rememberPlan||!C?.targetIdentity||!S?.selectPathway||!A?.validatePrivateWork)throw Error('Refresh this page before opening the degree plan.');
 const expected=sourcePlanIdentity(sourcePlan),fetcher=async path=>{if(!/^data\/[A-Za-z0-9_./-]+\.json$/.test(path)||path.includes('..'))throw Error('Choose a valid public degree source.');return root.fetch(path,{cache:'no-store',credentials:'same-origin',redirect:'error'});},response=await fetcher('data/pathways.json');if(!response.ok)throw Error('The degree library could not be loaded. Your saved plan is unchanged.');
 let catalog=await C.load(await response.json(),{fetcher,required:true});const route=list(catalog.pathways).find(row=>row.id===expected.route.id);if(!route||route.modelId!==expected.model.id||expected.route.modalities.some(mode=>!list(route.modalities).includes(mode))||normal(route.school)!==normal(expected.route.school)||normal(route.title)!==normal(expected.route.title)||route.level!==expected.route.level)throw Error('This degree plan changed. Open its latest results before using it.');
 const models=await C.modelsForRoutes([route],{fetcher,required:true,includeLegacy:false}),model=models.find(row=>row.id===route.modelId),catalogIdentity=value=>normal(String(value?.catalogYear||value?.catalog||'').replace(/[–—]/g,'-'));if(model&&(catalogIdentity(model)!==catalogIdentity(expected.model)||['evidenceCheckedOn','curriculumStructureCheckedOn','officialMappingCheckedOn','revision','version'].some(field=>normal(model[field])!==normal(expected.model[field]))))throw Error('The catalog or sources for this degree plan changed. Refresh its results before opening it. Your saved plan is unchanged.');if(!model||normal(model.school)!==normal(expected.model.school)||normal(model.title)!==normal(expected.model.title)||model.creditSystem!==expected.model.creditSystem||!C.isPlanAvailable(route,catalog,models)||!previewSourcePlan({route,model}))throw Error('This degree no longer has a complete available course plan. Your saved plan is unchanged.');
 let state;try{const raw=root.localStorage.getItem('degreepath-guide-v3');state=raw?JSON.parse(raw):S.initialize(null,null,{pathways:[]});}catch{throw Error('Your existing device plan could not be read. It has not been replaced.');}A.validatePrivateWork(state);catalog=A.attach(catalog,state);if(C.attachSourceCurricula)catalog=C.attachSourceCurricula(catalog,state);
 let next=copy(state);const oldId=state.selectedPathwayId||state.profile.pathwayId;
 if(oldId&&oldId!==route.id&&!state.sheet?.isExample){const oldEntry=[...list(state.customCurricula),...list(state.sourceCurricula)].find(entry=>entry.route?.id===oldId),oldRoute=list(catalog.pathways).find(row=>row.id===oldId)||oldEntry?.route||state.targetIdentity?.route||{id:oldId,school:state.profile.school||state.profile.schoolChoice,title:state.profile.degree,level:state.profile.degreeLevel},oldDraft={pathway:oldRoute,program:oldEntry?.model};if(state.whatIf?.snapshots!==undefined&&!Array.isArray(state.whatIf.snapshots))throw Error('Your saved comparisons need recovery before switching plans.');const historyId=C.planHistoryId(state,oldDraft);if(list(state.whatIf?.snapshots).length>=20&&!list(state.whatIf?.snapshots).some(row=>row.id===historyId))throw Error('Save or remove an older comparison before opening another degree.');next=C.rememberPlan(next,oldDraft);}
 next=S.selectPathway(next,route);const selectedModes=list(expected.route.modalities);if(selectedModes.length===1)next.profile={...next.profile,modality:selectedModes[0]};else if(list(route.modalities).length===1)next.profile={...next.profile,modality:route.modalities[0]};next.targetIdentity=C.targetIdentity(next,{pathway:route,program:model});next.journey={...next.journey,version:1,completed:true,view:'home',planReviewed:false,schoolContacted:false};delete next.templateOrigin;A.validatePrivateWork(next);
 try{root.localStorage.setItem('degreepath-guide-v3',JSON.stringify(next));}catch{throw Error('This device could not save the degree plan. Your previous plan has not been replaced.');}if(typeof root.dispatchEvent==='function'&&typeof root.CustomEvent==='function')root.dispatchEvent(new root.CustomEvent('degreepath:save',{detail:{deviceSaved:true}}));root.location.assign('plan.html');return{state:next,route,model,href:'plan.html'};
}
async function openResearchPlan(template){
 const A=root.AuditCurriculum,C=root.DegreeProgramCatalog;if(!A?.createResearch||!C||!root.DegreeSheet)throw Error('Refresh this page before opening your researched degree plan.');
 if(typeof template?.id!=='string'||!Number.isSafeInteger(template.revision))throw Error('Choose a saved degree research result.');
 const current=await api('/api/templates/requests'),saved=list(current.items).map(item=>item.template||item).find(item=>item.id===template.id);
 if(!saved||saved.revision!==template.revision)throw Error('This research changed. Open its latest results before using the plan.');
 let state;try{const raw=root.localStorage.getItem('degreepath-guide-v3');state=raw?JSON.parse(raw):root.DegreeSheet.initialize(null,null,{pathways:[]});}catch{throw Error('Your existing device plan could not be read. It has not been replaced.');}
 const response=await root.fetch('data/pathways.json');if(!response.ok)throw Error('The plan library could not be loaded. Your saved plan is unchanged.');let catalog=await C.load(await response.json());if(C.attachSourceCurricula)catalog=C.attachSourceCurricula(catalog,state);
 const result=prepareResearchPlan(state,saved,A,catalog);try{root.localStorage.setItem('degreepath-guide-v3',JSON.stringify(result.state));}catch{throw Error('This device could not save the degree plan. Your previous plan has not been replaced.');}
 if(typeof root.dispatchEvent==='function'&&typeof root.CustomEvent==='function')root.dispatchEvent(new root.CustomEvent('degreepath:save',{detail:{deviceSaved:true}}));root.location.assign(result.href);return result;
}
async function openReviewedTemplate(template,consent={}){
 if(consent.reviewedByStudent!==true)throw Error('Review the complete requirements and confirm them before using this template.');
 const A=root.AuditCurriculum,C=root.DegreeProgramCatalog;if(!A||!C||!root.DegreeSheet)throw Error('Refresh this page before using a reviewed degree template.');
 let state;try{const raw=root.localStorage.getItem('degreepath-guide-v3');state=raw?JSON.parse(raw):root.DegreeSheet.initialize(null,null,{pathways:[]});}catch{throw Error('Your existing device plan could not be read. It has not been replaced.');}
 const current=await api('/api/templates/'+encodeURIComponent(template.id));if(!current.template||current.template.status!=='ready'||current.template.revision!==template.revision)throw Error('This template changed. Review its latest requirements before using it.');template=current.template;
 const response=await root.fetch('data/pathways.json');if(!response.ok)throw Error('Your previous degree could not be loaded. Your saved plan is unchanged.');let catalog=await C.load(await response.json());if(C.attachSourceCurricula)catalog=C.attachSourceCurricula(catalog,state);
 const result=prepareReviewedPlan(state,template,A,catalog,consent);try{root.localStorage.setItem('degreepath-guide-v3',JSON.stringify(result.state));}catch{throw Error('This device could not save the template. Your previous plan has not been replaced.');}
 if(typeof root.dispatchEvent==='function'&&typeof root.CustomEvent==='function')root.dispatchEvent(new root.CustomEvent('degreepath:save',{detail:{deviceSaved:true}}));root.location.assign(result.href);return result;
}

function sourceHTML(sources){return list(sources).map(s=>{const u=safeURL(s.url);return u?'<li><a href="'+esc(u)+'" target="_blank" rel="noopener noreferrer">'+esc(s.title||s.label||new URL(u).hostname)+'</a>'+(s.checked||s.checkedOn?' · Checked '+esc(s.checked||s.checkedOn):'')+'</li>':'';}).join('');}
function researchHTML(template){const a=artifactOf(template);if(!a)return'<p>The research is not available yet.</p>';const unresolved=list(a.unresolved||a.unresolvedItems);return'<h3>'+esc(a.programName||a.title||template.programName||'Degree research')+'</h3><p>'+esc(a.schoolName||a.school||template.schoolName||'')+'</p>'+(a.summary?'<p>'+esc(a.summary)+'</p>':'')+(unresolved.length?'<div class="tw-notice"><strong>Still needs confirmation</strong><ul>'+unresolved.map(x=>'<li>'+esc(typeof x==='string'?x:x.message||x.description||x.code)+'</li>').join('')+'</ul></div>':'')+'<p>'+list(a.requirements).length+' requirement rows · '+esc(a.totalCredits??'Unconfirmed')+' '+esc(a.creditSystem||'credit units')+'</p><details><summary>Research sources</summary><ul>'+sourceHTML(a.sources)+'</ul></details><p class="tw-muted">These are researched degree facts. Your college must confirm how your own courses apply. Opening the builder keeps your existing courses and asks you to review the requirements.</p>';}
return Object.freeze({api,esc,safeURL,list,artifactOf,requirementsDraft,prepareBuilder,openBuilder,prepareReviewedPlan,openReviewedTemplate,prepareResearchPlan,previewResearchPlan,openResearchPlan,previewSourcePlan,openSourcePlan,sourceHTML,researchHTML});
}));
