/** Repository-native research intake. GitHub text is inert, unverified data.
 * No shell, AI, publication, database, deployment or student-record mutations. */
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,readdir,writeFile,lstat,rm,rename} from 'node:fs/promises';
import {resolve,join,relative,basename} from 'node:path';
import {pathToFileURL} from 'node:url';

export const REPOSITORY='jeremyc3434/DegreeSteps';
export const INTAKE_PATH='content/research-intake';
const ROOT=resolve(import.meta.dirname,'..');
const HASH=/^[a-f0-9]{64}$/;
const FINDING=/^finding-[a-f0-9]{64}$/;
const list=value=>Array.isArray(value)?value:[];
const unique=values=>[...new Set(values)].sort();
const fail=message=>{throw Error(message);};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
export function stable(value){
 if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
 if(object(value))return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}';
 return JSON.stringify(value);
}
export const digest=value=>createHash('sha256').update(stable(value)).digest('hex');
export function day(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)fail('Use a real YYYY-MM-DD date.');
 return value;
}
function text(value,name,max=65536){if(typeof value!=='string'||value.length>max)fail(name+' must be bounded text.');return value;}
function nonempty(value,name,max=2000){text(value,name,max);if(!value.trim())fail(name+' is required.');return value;}
function enumeration(value,choices,name){if(!choices.includes(value))fail('Invalid '+name+'.');return value;}
function integer(value,name){if(!Number.isSafeInteger(value)||value<1)fail('Invalid '+name+'.');return value;}
function stamp(value){if(value===null||value===undefined)return null;if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))fail('Invalid GitHub timestamp.');return value;}
function optionalDay(value){return value===null?null:day(value);}
export function publicURL(value){
 text(value,'URL',2048);let url;try{url=new URL(value);}catch{fail('Invalid public HTTPS URL.');}
 if(url.protocol!=='https:'||url.username||url.password||url.port||!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(url.hostname)||/(?:^|\.)(?:localhost|local|internal|test|invalid)$/i.test(url.hostname)||/[\u0000-\u0020\u007f\\]/.test(value)||/%(?:0a|0d)/i.test(value))fail('Invalid public HTTPS URL.');
 return url.href;
}
export function isIntakeIssue(issue){
 return !issue?.pull_request&&(issue?.number===56||/^Weekly research intake(?:$|\s|[—:-])/i.test(issue?.title||'')||String(issue?.body||'').toLowerCase().includes('<!-- degreesteps-research-intake:v1 -->')||list(issue?.labels).some(label=>(typeof label==='string'?label:label?.name)==='weekly-research'));
}
function githubURL(number,commentId=null){return 'https://github.com/'+REPOSITORY+'/issues/'+number+(commentId?'#issuecomment-'+commentId:'');}
export function submissionsFromSnapshot(snapshot){
 if(!object(snapshot)||snapshot.repository!==REPOSITORY||!object(snapshot.issue)||!Array.isArray(snapshot.comments))fail('Snapshot must contain the configured repository, issue and complete comments array.');
 const issue=snapshot.issue,number=integer(issue.number,'issue number');
 if(!isIntakeIssue(issue))fail('This is not a weekly research intake issue.');
 if(!Number.isSafeInteger(issue.comments)||issue.comments<0||issue.comments!==snapshot.comments.length)fail('Issue comment count must match the complete comments array; refetch a changing conversation.');
 if(snapshot.comments.length>2000)fail('Too many comments for one intake.');
 const seen=new Set();
 return [issue,...snapshot.comments].map((item,index)=>{
  if(!object(item))fail('Invalid GitHub entry.');
  const commentId=index?integer(item.id,'comment ID'):null,key=index?'comment-'+commentId:'issue-'+number;
  if(seen.has(key))fail('Duplicate GitHub entry.');seen.add(key);
  const url=githubURL(number,commentId);
  if((item.html_url||item.url)&&![(item.html_url||item.url),item.html_url].includes(url))fail('GitHub entry URL does not match its identity.');
  const source={repository:REPOSITORY,issueNumber:number,kind:index?'comment':'issue',commentId,url,author:nonempty(item.user?.login,'GitHub author',100),createdAt:stamp(item.created_at),updatedAt:stamp(item.updated_at)};
  if(list(issue.labels).some(label=>(typeof label==='string'?label:label?.name)==='weekly-research'))source.intakeLabel='weekly-research';
  const content={title:index?'':nonempty(issue.title,'Issue title',1024),body:text(item.body??'','Issue body')};
  const core={schemaVersion:1,kind:'research-submission',publicationAllowed:false,source,content};
  return {...core,submissionKey:REPOSITORY+':'+key,revision:digest(core)};
 });
}
export function validateSubmission(record){
 const source=record?.source;
 if(record?.schemaVersion!==1||record?.kind!=='research-submission'||record.publicationAllowed!==false||!HASH.test(record.revision)||!object(source)||source.repository!==REPOSITORY)fail('Invalid immutable submission.');
 const snapshot={repository:REPOSITORY,issue:{number:source.issueNumber,title:record.content?.title||'Weekly research intake',body:'',user:{login:source.author},comments:source.kind==='comment'?1:0,labels:source.intakeLabel?[source.intakeLabel]:[]},comments:[]};
 if(source.kind==='issue'){snapshot.issue={...snapshot.issue,...{html_url:source.url,body:record.content.body,created_at:source.createdAt,updated_at:source.updatedAt}};}
 else if(source.kind==='comment')snapshot.comments=[{id:source.commentId,html_url:source.url,body:record.content.body,user:{login:source.author},created_at:source.createdAt,updated_at:source.updatedAt}];
 else fail('Invalid submission kind.');
 const rebuilt=submissionsFromSnapshot(snapshot).at(source.kind==='issue'?0:1);
 if(stable(rebuilt)!==stable(record))fail('Submission hash or identity does not match immutable content.');
 return record;
}
/** Comparison only: retain the raw immutable revision and reviewer bindings.
 * GitHub timestamps and intake routing labels do not change a source's meaning. */
export function semanticSubmissionRevision(record){
 validateSubmission(record);const {revision,...core}=record;
 const {createdAt,updatedAt,intakeLabel,...source}=core.source;
 return digest({...core,source});
}
function sameSourceMeaning(reviewed,observed,semantics){
 const meanings=revisions=>unique(revisions.map(revision=>semantics.get(revision)||fail('Unknown immutable source revision.')));
 return stable(meanings(reviewed))===stable(meanings(observed));
}
export function leadsFromSubmission(record){
 validateSubmission(record);let heading='',headings=[],found=[];
 for(const line of record.content.body.split(/\r?\n/)){
  const h=line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*$/);if(h){headings.length=h[1].length;headings[h[1].length-1]=h[2];heading=headings.filter(Boolean).join(' / ');}
  const match=line.match(/^\s*[-*]\s+\[[ xX]\]\s+(.+)$/);if(match)found.push({claim:match[1].trim(),section:heading,kind:'lead'});
 }
 // Non-list comments and issue prose are retained as a context item for human triage.
 if(!found.length&&record.content.body.trim())found=[{claim:record.content.body.trim(),section:'Context / unstructured submission',kind:'context'}];
 return found.map(item=>{
  const sourceUrls=unique([...item.claim.matchAll(/https:\/\/[^\s<>"`]+/g)].map(match=>match[0].replace(/[),.;]+$/,'')).map(raw=>{try{return publicURL(raw);}catch{return null;}}).filter(Boolean));
  const normalizedClaim=item.claim.normalize('NFKC').replace(/\s+/g,' ').trim();
  const identity={normalizedClaim,sourceUrls},scopeSection=item.section.split(' / ').filter(part=>!/^P\d(?:\s|$)/i.test(part)).join(' / ').normalize('NFKC').replace(/\s+/g,' ').trim();
  // Priority headings may change without changing a claim. Other headings can
  // identify its institution/program and therefore belong to its identity.
  if(item.kind==='lead'&&scopeSection)identity.scopeSection=scopeSection;
  return {...item,id:'finding-'+digest(identity),sourceUrls,origins:[{submissionKey:record.submissionKey,revision:record.revision,url:record.source.url}]};
 });
}
export function emptyReview(findingId){return{
 schemaVersion:1,kind:'research-review',publicationAllowed:false,findingId,revision:1,previousReviewHash:null,sourceRevisions:[],
 reviewer:'',reviewedOn:null,verifiedOn:null,announcedOn:null,effectiveOn:null,followUpOn:null,
 triage:'WATCH',status:'inbox',changeKind:'unknown',summary:'',evidence:[],receiptPaths:[],
 facts:{scope:{institution:null,program:null,level:null,modality:null,catalog:null},costs:[],accreditation:[],transfer:{overallCap:null,aceCap:null,nccrsCap:null,combinedCplCap:null,externallyAssessedCap:null,residency:null,majorResidency:null,totalCredits:null},aceRecommendations:[],equivalencies:[],assessments:[]},
 product:{status:'unassessed',paths:[],notes:''},
 editorial:{status:'unassessed',proposedUrls:[],publishedUrls:[],existingUrls:[],title:null,metaDescription:null,canonicalUrl:null,internalLinks:[],structuredData:null,sitemap:null,studentUsefulness:'',novelty:'',searchIntent:'',debtFreeRelevance:'',urgency:'',overlapNotes:'',evidenceIds:[],metrics:null}
};}
export function validateReview(review,{asOf=new Date().toISOString().slice(0,10)}={}){
 day(asOf);
 if(review?.schemaVersion!==1||review?.kind!=='research-review'||review.publicationAllowed!==false||!FINDING.test(review.findingId))fail('Invalid research review.');
 integer(review.revision,'review revision');
 if(review.revision===1?review.previousReviewHash!==null:!HASH.test(review.previousReviewHash))fail('Invalid previous review hash.');
 if(!Array.isArray(review.sourceRevisions)||!review.sourceRevisions.length||review.sourceRevisions.some(value=>!HASH.test(value))||unique(review.sourceRevisions).length!==review.sourceRevisions.length)fail('Bind each review to immutable source revisions.');
 nonempty(review.reviewer,'Reviewer',200);day(review.reviewedOn);if(review.reviewedOn>asOf)fail('Review cannot be future dated.');
 for(const key of ['verifiedOn','announcedOn','effectiveOn','followUpOn'])optionalDay(review[key]);
 if(review.verifiedOn&&review.verifiedOn>review.reviewedOn)fail('Verification cannot follow review.');
 if(review.announcedOn&&review.announcedOn>review.reviewedOn)fail('An announcement must already have been observed.');
 if(review.followUpOn&&review.followUpOn<review.reviewedOn)fail('Follow-up cannot precede review.');
 enumeration(review.triage,['PRODUCT','CONTENT','BOTH','WATCH'],'triage');
 enumeration(review.status,['inbox','researching','ready-for-review','implemented','no-action','watch','superseded'],'status');
 enumeration(review.changeKind,['unknown','new-policy','newly-discovered-existing-policy','confirmation','correction'],'change kind');
 nonempty(review.summary,'Review summary',8000);
 if(!Array.isArray(review.receiptPaths)||review.receiptPaths.some(path=>typeof path!=='string'||!/^content\/research-intake\/evidence\/[a-zA-Z0-9_./-]+\.json$/.test(path)||path.split('/').some(segment=>segment==='..'||segment==='.'||!segment)))fail('Native receipts must use safe repository evidence paths.');
 if(!Array.isArray(review.evidence)||review.evidence.length>100)fail('Use up to 100 evidence records.');
 const evidence=new Map();
 for(const item of review.evidence){
  if(!object(item)||!/^[-a-zA-Z0-9_]{1,100}$/.test(item.id)||evidence.has(item.id))fail('Evidence IDs must be unique.');
  publicURL(item.url);nonempty(item.title,'Evidence title',500);enumeration(item.kind,['university','provider','accreditor','government','community'],'evidence kind');
  day(item.checkedOn);if(item.checkedOn>review.reviewedOn)fail('Evidence check cannot follow review.');nonempty(item.quote,'Evidence excerpt',8000);
  if(item.capturePath!==null&&(!/^content\/source-captures\/[a-zA-Z0-9_./-]+\.txt$/.test(item.capturePath)||item.capturePath.split('/').some(x=>x==='..'||x==='.'||!x)))fail('Invalid capture path.');
  if(item.contentHash!==null&&!HASH.test(item.contentHash))fail('Invalid evidence content hash.');evidence.set(item.id,item);
 }
 const references=(ids,{primary=false,university=false}={})=>{
  if(!Array.isArray(ids)||!ids.length||ids.some(id=>!evidence.has(id)))fail('Every asserted fact needs existing evidence IDs.');
  if(primary&&ids.every(id=>evidence.get(id).kind==='community')||university&&!ids.some(id=>evidence.get(id).kind==='university'))fail('This fact needs primary receiving-university evidence.');
 };
 const facts=review.facts;
 if(!object(facts)||!object(facts.scope)||!object(facts.transfer))fail('Scoped facts and separate transfer caps are required.');
 for(const key of ['institution','program','level','modality','catalog'])if(facts.scope[key]!==null)nonempty(facts.scope[key],key,500);
 for(const key of ['costs','accreditation','aceRecommendations','equivalencies','assessments'])if(!Array.isArray(facts[key])||facts[key].length>100)fail('Invalid fact array.');
 for(const key of ['overallCap','aceCap','nccrsCap','combinedCplCap','externallyAssessedCap','residency','majorResidency','totalCredits']){
  const value=facts.transfer[key];if(value===null||value===undefined&&['combinedCplCap','externallyAssessedCap'].includes(key))continue;
  if(!object(value)||typeof value.credits!=='number'||!Number.isFinite(value.credits)||value.credits<0)fail('Invalid scoped credit quantity.');
  enumeration(value.creditSystem,['semester','quarter','competency-unit'],'credit system');nonempty(value.scope,'Credit scope');references(value.evidenceIds,{university:true});
 }
 for(const cost of facts.costs){if(!object(cost)||typeof cost.amount!=='number'||!Number.isFinite(cost.amount)||cost.amount<0||! /^[A-Z]{3}$/.test(cost.currency))fail('Invalid cost.');for(const key of ['unit','scope','assumptions'])nonempty(cost[key],'Cost '+key);for(const key of ['includes','excludes'])if(!Array.isArray(cost[key])||cost[key].some(x=>typeof x!=='string'))fail('Cost inclusions/exclusions must be explicit arrays.');references(cost.evidenceIds,{primary:true});}
 for(const row of facts.accreditation){for(const key of ['institution','accreditor','status'])nonempty(row[key],'Accreditation '+key);references(row.evidenceIds,{primary:true});}
 for(const row of facts.aceRecommendations){for(const key of ['provider','aceId','version'])nonempty(row[key],'ACE recommendation '+key);day(row.startsOn);day(row.endsOn);if(row.endsOn<row.startsOn||typeof row.sourceCredits!=='number'||!Number.isFinite(row.sourceCredits)||row.sourceCredits<=0)fail('Invalid ACE recommendation period or quantity.');enumeration(row.sourceCreditSystem,['semester','quarter','competency-unit'],'source credit system');references(row.evidenceIds,{primary:true});}
 for(const row of facts.equivalencies){for(const key of ['provider','providerCode','institution','receivingCode','scope'])nonempty(row[key],'Equivalency '+key);for(const key of ['sourceCredits','credits'])if(typeof row[key]!=='number'||!Number.isFinite(row[key])||row[key]<=0)fail('Both original and awarded credits are required.');for(const key of ['sourceCreditSystem','creditSystem'])enumeration(row[key],['semester','quarter','competency-unit'],key);references(row.identityEvidenceIds,{primary:true});references(row.receivingEvidenceIds,{university:true});}
 for(const row of facts.assessments){for(const key of ['name','scope','method'])nonempty(row[key],'Assessment '+key);if(row.proctored!==null&&typeof row.proctored!=='boolean')fail('Proctoring must be true, false or null.');references(row.evidenceIds,{primary:true});}
 const product=review.product,editorial=review.editorial;
 if(!object(product)||!Array.isArray(product.paths)||product.paths.some(path=>typeof path!=='string'||path.startsWith('/')||path.split('/').includes('..')))fail('Invalid product paths.');
 enumeration(product.status,['unassessed','not-needed','proposed','drafted','review-ready','implemented','blocked'],'product status');text(product.notes,'Product notes',8000);
 if(!object(editorial))fail('Editorial triage is required.');
 enumeration(editorial.status,['unassessed','not-needed','proposed','drafted','review-ready','published','blocked'],'editorial status');
 for(const key of ['proposedUrls','publishedUrls','existingUrls','internalLinks']){if(!Array.isArray(editorial[key]))fail('Editorial URL arrays are required.');for(const url of editorial[key]){publicURL(url);if(new URL(url).origin!=='https://degreesteps.com')fail('Editorial URLs must be on DegreeSteps.');}}
 for(const key of ['studentUsefulness','novelty','searchIntent','debtFreeRelevance','urgency','overlapNotes'])text(editorial[key],key,4000);
 for(const key of ['title','metaDescription','canonicalUrl'])if(editorial[key]!==null)nonempty(editorial[key],key,2048);
 if(editorial.canonicalUrl&&new URL(publicURL(editorial.canonicalUrl)).origin!=='https://degreesteps.com')fail('Canonical URL must be on DegreeSteps.');
 for(const key of ['structuredData','sitemap'])if(editorial[key]!==null&&typeof editorial[key]!=='boolean')fail(key+' must be true, false or null.');
 if(!Array.isArray(editorial.evidenceIds)||editorial.evidenceIds.some(id=>!evidence.has(id)))fail('Unknown editorial evidence.');
 if(editorial.metrics!==null){if(!object(editorial.metrics))fail('Invalid measured metrics.');publicURL(editorial.metrics.sourceUrl);day(editorial.metrics.measuredOn);nonempty(editorial.metrics.notes,'Measured metric notes');}
 const verified=['ready-for-review','implemented'].includes(review.status)||['review-ready','implemented'].includes(product.status)||['drafted','review-ready','published'].includes(editorial.status);
 if(verified&&(!review.verifiedOn||!review.followUpOn||!evidence.size||![...evidence.values()].some(item=>item.kind!=='community')))fail('Ready or completed work requires primary evidence, verification and follow-up dates.');
 if(review.changeKind==='new-policy'&&(!review.effectiveOn||!review.announcedOn))fail('A new policy needs distinct announcement and effective dates.');
 if(['drafted','review-ready','published'].includes(editorial.status)){
  if(!editorial.title||!editorial.metaDescription||!editorial.canonicalUrl||!editorial.evidenceIds.length||!editorial.internalLinks.length||!editorial.studentUsefulness||!editorial.searchIntent||!editorial.overlapNotes)fail('Editorial drafts need metadata, citations, internal links and substantive triage.');
  references(editorial.evidenceIds,{primary:true});
 }
 if(editorial.status==='published'&&!editorial.publishedUrls.length)fail('Published editorial work needs its actual URL.');
 if(review.status==='implemented'&&((['PRODUCT','BOTH'].includes(review.triage)&&product.status!=='implemented')||(['CONTENT','BOTH'].includes(review.triage)&&!['review-ready','published'].includes(editorial.status))))fail('Complete both required tracks before closing a finding.');
 return review;
}
async function files(folder){try{return(await readdir(folder,{withFileTypes:true})).filter(entry=>{if(entry.isSymbolicLink())fail('Intake symlinks are not supported.');return entry.isFile()&&entry.name.endsWith('.json');}).map(entry=>entry.name).sort();}catch(error){if(error.code==='ENOENT')return [];throw error;}}
async function readJSON(path){const metadata=await lstat(path);if(metadata.isSymbolicLink()||!metadata.isFile())fail('Intake input must be a regular file without symlinks.');if(metadata.size>8*1024*1024)fail('JSON input exceeds eight MiB.');const bytes=await readFile(path);if(bytes.length>8*1024*1024)fail('JSON input exceeds eight MiB.');return JSON.parse(bytes);}
async function writeJSON(path,value,{immutable=false}={}){
 await mkdir(resolve(path,'..'),{recursive:true});const output=JSON.stringify(value,null,2)+'\n';
 if(immutable){try{await writeFile(path,output,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;if(await readFile(path,'utf8')!==output)fail('Refusing to overwrite an immutable intake record.');}}
 else {const pending=path+'.pending-'+randomUUID();try{await writeFile(pending,output,{flag:'wx'});await rename(pending,path);}finally{await rm(pending,{force:true});}}
}
export async function loadLedger(root=ROOT,{asOf=new Date().toISOString().slice(0,10)}={}){
 const base=join(root,INTAKE_PATH),submissions=[],reviews=[];
 for(const name of await files(join(base,'submissions'))){const record=validateSubmission(await readJSON(join(base,'submissions',name)));if(name!==record.revision+'.json')fail('Submission filename must equal its revision.');submissions.push(record);}
 const semantics=new Map(submissions.map(record=>[record.revision,semanticSubmissionRevision(record)]));
 const findings=new Map();for(const submission of submissions)for(const finding of leadsFromSubmission(submission)){if(findings.has(finding.id))findings.get(finding.id).origins.push(...finding.origins);else findings.set(finding.id,finding);}
 const histories=new Map();
 for(const name of await files(join(base,'reviews'))){const record=validateReview(await readJSON(join(base,'reviews',name)),{asOf}),hash=digest(record);if(name!==hash+'.json')fail('Review filename must equal its hash.');if(!findings.has(record.findingId))fail('Review references an unknown finding.');const known=unique(findings.get(record.findingId).origins.map(origin=>origin.revision));if(record.sourceRevisions.some(revision=>!known.includes(revision)))fail('Review references an unknown source revision.');if(!histories.has(record.findingId))histories.set(record.findingId,[]);histories.get(record.findingId).push({record,hash});reviews.push(record);}
 for(const history of histories.values()){history.sort((a,b)=>a.record.revision-b.record.revision);for(let i=0;i<history.length;i++)if(history[i].record.revision!==i+1||history[i].record.previousReviewHash!==(i?history[i-1].hash:null))fail('Review history must be linear, complete and append-only.');}
 const items=[...findings.values()].sort((a,b)=>a.id.localeCompare(b.id)).map(finding=>{const history=histories.get(finding.id)||[],current=history.at(-1),sourceRevisions=unique(finding.origins.map(origin=>origin.revision)),reviewCurrent=!!current&&sameSourceMeaning(current.record.sourceRevisions,sourceRevisions,semantics);return {...finding,origins:[...new Map(finding.origins.map(origin=>[stable(origin),origin])).values()].sort((a,b)=>stable(a).localeCompare(stable(b))),reviewHash:current?.hash||null,reviewCurrent,requiresReverification:!!current&&!reviewCurrent,review:current?.record||{...emptyReview(finding.id),sourceRevisions}};});
 const core={schemaVersion:1,publicationAllowed:false,repository:REPOSITORY,submissionRevisions:submissions.length,reviewRevisions:reviews.length,findings:items};
 return {...core,revision:digest(core)};
}
export async function buildIndexes(root=ROOT,{check=false,asOf}={}){
 const ledger=await loadLedger(root,{asOf}),base=join(root,INTAKE_PATH),closed=new Set(['implemented','no-action','superseded']);
 const views={inbox:ledger.findings.filter(item=>!item.reviewCurrent||!closed.has(item.review.status)),processed:ledger.findings.filter(item=>item.reviewCurrent&&closed.has(item.review.status)),watchlist:ledger.findings.filter(item=>item.requiresReverification||!closed.has(item.review.status)&&(item.review.triage==='WATCH'||item.review.status==='watch'))};
 const documents={'findings.json':ledger,...Object.fromEntries(Object.entries(views).map(([key,items])=>[key+'.json',{schemaVersion:1,publicationAllowed:false,ledgerRevision:ledger.revision,count:items.length,findingIds:items.map(item=>item.id)}]))};
 for(const [name,value] of Object.entries(documents)){const path=join(base,name);if(check){if(await readFile(path,'utf8')!==JSON.stringify(value,null,2)+'\n')fail('Stale research intake index: '+name);}else await writeJSON(path,value);}
 return ledger;
}
async function withLock(root,action){
 const base=join(root,INTAKE_PATH),lock=join(base,'.mutation-lock');await mkdir(base,{recursive:true});
 try{await mkdir(lock);}catch(error){if(error.code==='EEXIST')fail('Research intake is busy; retry after the current mutation completes. Inspect a stale .mutation-lock only after confirming no intake process is running.');throw error;}
 try{return await action();}finally{await rm(lock,{recursive:true,force:true});}
}
export async function importSnapshot(snapshot,{root=ROOT,asOf}={}){
 const submissions=submissionsFromSnapshot(snapshot);return withLock(root,async()=>{for(const record of submissions)await writeJSON(join(root,INTAKE_PATH,'submissions',record.revision+'.json'),record,{immutable:true});return buildIndexes(root,{asOf});});
}
export async function appendReview(review,{root=ROOT,asOf}={}){
 validateReview(review,{asOf});return withLock(root,async()=>{const ledger=await loadLedger(root,{asOf}),finding=ledger.findings.find(item=>item.id===review.findingId);if(!finding)fail('Unknown finding.');
 const hash=digest(review);try{const old=await readJSON(join(root,INTAKE_PATH,'reviews',hash+'.json'));if(stable(old)===stable(review))return ledger;}catch(error){if(error.code!=='ENOENT')throw error;}
 if(review.revision!==(finding.reviewHash?finding.review.revision+1:1)||review.previousReviewHash!==finding.reviewHash)fail('Review changed: load the latest review revision before appending.');
 const observed=unique(finding.origins.map(origin=>origin.revision));
 if(review.sourceRevisions.some(revision=>!observed.includes(revision)))fail('Source revisions changed: reload the finding before reviewing.');
 const semantics=new Map(await Promise.all(observed.map(async revision=>[revision,semanticSubmissionRevision(await readJSON(join(root,INTAKE_PATH,'submissions',revision+'.json')))])));
 if(!sameSourceMeaning(review.sourceRevisions,observed,semantics))fail('Source revisions changed: reload the finding before reviewing.');
 await writeJSON(join(root,INTAKE_PATH,'reviews',hash+'.json'),review,{immutable:true});return buildIndexes(root,{asOf});});
}
export async function retainReceipt(file,{root=ROOT,issueNumber,asOf=new Date().toISOString().slice(0,10),kind='connector-rendered-extraction'}={}){
 integer(issueNumber,'issue number');day(asOf);enumeration(kind,['connector-rendered-extraction','curated-research-packet'],'receipt kind');
 const source=resolve(file),metadata=await lstat(source);if(!metadata.isFile()||metadata.isSymbolicLink()||metadata.size>8*1024*1024)fail('A native receipt must be a regular JSON file of at most eight MiB.');
 const bytes=await readFile(source);if(bytes.length>8*1024*1024)fail('Native receipt exceeds eight MiB.');JSON.parse(bytes.toString('utf8'));
 const sha256=createHash('sha256').update(bytes).digest('hex'),prefix=INTAKE_PATH+'/evidence/issue'+issueNumber+'/',retainedPath=prefix+sha256+'.json';
 return withLock(root,async()=>{
  const folder=join(root,prefix),manifestPath=join(folder,'retention-manifest.json');await mkdir(folder,{recursive:true});let manifest;
  try{manifest=await readJSON(manifestPath);}catch(error){if(error.code!=='ENOENT')throw error;manifest={schemaVersion:1,issueNumber,preservedOn:asOf,publicationAllowed:false,receiptPolicy:'Native connector extraction receipts are preserved intact. Hashes identify retained JSON bytes, not origin HTML. A connector extraction is not an origin HTTP response.',files:[]};}
  if(manifest.schemaVersion!==1||manifest.issueNumber!==issueNumber||manifest.publicationAllowed!==false||!Array.isArray(manifest.files)||manifest.files.length>10000)fail('Invalid native receipt retention manifest.');
  for(const item of manifest.files){
   if(typeof item.retainedPath!=='string'||!item.retainedPath.startsWith(prefix)||item.retainedPath.split('/').some(part=>part==='..'||part==='.'||!part)||!HASH.test(item.sha256))fail('Invalid retained receipt path or hash.');
   await readJSON(join(root,item.retainedPath));const original=await readFile(join(root,item.retainedPath));
   if(original.length!==item.bytes||createHash('sha256').update(original).digest('hex')!==item.sha256)fail('Retained receipt bytes no longer match the manifest.');
  }
  const existing=manifest.files.find(item=>item.sha256===sha256);if(existing)return{retainedPath:existing.retainedPath,sha256,bytes:bytes.length,replayed:true};
  try{await writeFile(join(root,retainedPath),bytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;if(!(await readFile(join(root,retainedPath))).equals(bytes))fail('Refusing to replace native receipt bytes.');}
  const original=relative(root,source).replaceAll('\\','/'),originalPath=original.startsWith('../')||original.startsWith('/')?basename(source):original;
  manifest.files.push({originalPath,retainedPath,sha256,bytes:bytes.length,retainedOn:asOf,receiptKind:kind,originHttpStatus:null,hashMeaning:'Retained JSON file bytes; not origin HTML.'});manifest.files.sort((a,b)=>a.retainedPath.localeCompare(b.retainedPath));
  await writeJSON(manifestPath,manifest);return{retainedPath,sha256,bytes:bytes.length,replayed:false};
 });
}
export async function fetchSnapshot(number,{token=process.env.GITHUB_TOKEN||process.env.GH_TOKEN,fetchImpl=fetch}={}){
 integer(number,'issue number');if(!token)fail('GITHUB_TOKEN or GH_TOKEN is required for receiving GitHub intake.');
 async function get(path){
  const response=await fetchImpl('https://api.github.com/repos/'+REPOSITORY+path,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'DegreeSteps-Research-Intake'},redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!response.ok)fail('GitHub intake fetch failed (HTTP '+response.status+').');
  if(!response.body||Number(response.headers.get('content-length'))>8*1024*1024)fail('GitHub response is empty or exceeds eight MiB.');
  const chunks=[];let bytes=0;for await(const chunk of response.body){bytes+=chunk.byteLength;if(bytes>8*1024*1024)fail('GitHub response exceeds eight MiB.');chunks.push(Buffer.from(chunk));}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
 }
 const issue=await get('/issues/'+number);if(issue.number!==number||!isIntakeIssue(issue))fail('Fetched issue is not an eligible intake.');const comments=[];
 for(let page=1;page<=20;page++){const batch=await get('/issues/'+number+'/comments?per_page=100&page='+page);if(!Array.isArray(batch))fail('Invalid GitHub comments response.');comments.push(...batch);if(batch.length<100){const snapshot={repository:REPOSITORY,issue,comments};submissionsFromSnapshot(snapshot);return snapshot;}}
 fail('Comment pagination limit reached; refusing a partial import.');
}
export function issueFromEvent(event,eventName){
 if(event?.repository?.full_name!==REPOSITORY)fail('Unexpected intake event repository.');
 if(!['issues','issue_comment','workflow_dispatch'].includes(eventName))fail('Unsupported intake event.');
 if(eventName==='workflow_dispatch')return integer(Number(event.inputs?.issue_number||56),'issue number');
 if(!isIntakeIssue(event.issue))return null;
 if(!['opened','edited','reopened','labeled','created'].includes(event.action))return null;
 return integer(event.issue.number,'issue number');
}
export async function main(args=process.argv.slice(2)){
 const command=args.shift(),options={};for(let i=0;i<args.length;i+=2){if(!['--file','--issue','--event','--as-of','--root','--finding','--kind'].includes(args[i])||args[i+1]===undefined)fail('Unsupported intake option.');options[args[i].slice(2)]=args[i+1];}
 const root=resolve(options.root||ROOT),asOf=day(options['as-of']||new Date().toISOString().slice(0,10));let ledger;
 if(command==='receive'){
  const number=options.event?issueFromEvent(await readJSON(resolve(options.event)),process.env.GITHUB_EVENT_NAME):integer(Number(options.issue),'issue number');
  if(number===null){console.log('Event is outside weekly research intake.');return;}
  ledger=await importSnapshot(await fetchSnapshot(number),{root,asOf});
 }else if(command==='retain'){console.log(JSON.stringify(await retainReceipt(options.file||fail('--file is required.'),{root,asOf,issueNumber:Number(options.issue),kind:options.kind||'connector-rendered-extraction'})));return;}
 else if(command==='import')ledger=await importSnapshot(await readJSON(resolve(options.file||fail('--file is required.'))),{root,asOf});
 else if(command==='review')ledger=await appendReview(await readJSON(resolve(options.file||fail('--file is required.'))),{root,asOf});
 else if(command==='build'||command==='check')ledger=command==='build'?await withLock(root,()=>buildIndexes(root,{asOf})):await buildIndexes(root,{check:true,asOf});
 else if(command==='template'){
  const found=(await loadLedger(root,{asOf})).findings.find(item=>item.id===options.finding);if(!found)fail('Choose an existing --finding.');const template=structuredClone(found.review);template.revision=found.reviewHash?template.revision+1:1;template.previousReviewHash=found.reviewHash;template.sourceRevisions=unique(found.origins.map(origin=>origin.revision));console.log(JSON.stringify(template,null,2));return;
 }else fail('Use receive, import, retain, review, template, build or check.');
 console.log(JSON.stringify({submissionRevisions:ledger.submissionRevisions,reviewRevisions:ledger.reviewRevisions,findings:ledger.findings.length,publicationAllowed:false}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
