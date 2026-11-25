/** Source-bound UPI candidates reused across the six existing TESU ledgers. No university award is inferred. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {upiCourseReview,validateUPICourseReview} from './upi-course-catalog.mjs';
import {providerReview,tesuProviderEligibility,applyTESUProviderReview} from './tesu-provider-review.mjs';
import {applyTESUUPIProviderDefaults,tesuUPIModelIds} from './tesu-upi-defaults.mjs';
import {attachUPICoursePurchasePrice} from './upi-course-pricing.mjs';
const root=resolve(import.meta.dirname,'..'),copy=value=>structuredClone(value),list=value=>Array.isArray(value)?value:[];
export const upiTESUReview=JSON.parse(await readFile(resolve(root,'content/pathway-kits/tesu/upi-review-2026-11-25.json'),'utf8'));
const slug=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const courseURL=value=>{try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||!['upistudy.com','www.upistudy.com'].includes(u.hostname))return null;return u.pathname.replace(/\/$/,'');}catch{return null;}};
const mapId=(mapping,course)=>'upi-'+slug(course.aceId||course.providerCourseCode)+'-to-'+slug(mapping.receivingCode)+'-provider-2026-11-25';
const optionId=(mapping,course,requirement)=>mapId(mapping,course)+'-'+requirement.id;
const unique=values=>[...new Set(values.filter(Boolean))];

export function validateTESUUPIReview(review=upiTESUReview){
  assert.equal(review.school,'Thomas Edison State University');assert.equal(review.publicationPromotionAllowed,false);
  assert.equal(review.checkedOn,'2026-11-25');assert.equal(review.sources.length,1);
  assert.equal(review.sources[0].url,'https://www.upistudy.com/pages/tesu');
  assert.equal(review.sources[0].evidenceType,'provider-published');
  const ids=new Set();
  for(const mapping of review.mappings){
    assert(mapping.id&&!ids.has(mapping.id),'Mapping rows have unique original table IDs.');ids.add(mapping.id);
    assert.equal(mapping.claimOrigin,'provider-published');assert.equal(mapping.receivingAwardIndependentlyVerified,false);
    assert(courseURL(mapping.courseUrl),'A candidate retains its exact provider course URL.');
    assert(/^[A-Z]+-\d{4}$/.test(mapping.receivingCode)&&mapping.receivingTitle,'An exact named receiving course is required.');
    assert(mapping.receivingCredits>0&&mapping.providerClaimedSourceCredits>0&&mapping.creditSystem==='semester','Keep original and receiving quantities separate.');
    assert(mapping.quote.includes(mapping.providerLabel)&&mapping.quote.includes(mapping.receivingCode),'Retain the exact provider row for the candidate.');
  }
  return review;
}

/** Exact provider URL joins source-course evidence; similar course names never create an identity match. */
export function supportedUPIMappings(identityReview=upiCourseReview,review=upiTESUReview){
  validateUPICourseReview(identityReview);validateTESUUPIReview(review);
  return review.mappings.flatMap(mapping=>{
    const candidates=identityReview.courses.filter(course=>courseURL(course.courseUrl)===courseURL(mapping.courseUrl));
    if(candidates.length!==1)return [];
    const course=candidates[0];
    // A provider-only receiving assertion cannot resolve an original/receiving credit discrepancy.
    if(course.sourceCreditSystem!=='semester'||course.sourceCredits!==mapping.providerClaimedSourceCredits||course.sourceCredits!==mapping.receivingCredits)return [];
    return [{mapping,course}];
  });
}

export function upiKitIdentity(course,identityReview=upiCourseReview){
  const canonical=course.aceId||course.providerCourseCode;
  const recommendationSources=course.identitySourceIds.filter(id=>['ace-course-exhibit','nccrs-course-exhibit'].includes(identityReview.sources.find(source=>source.id===id)?.kind));
  // ACE's minimum is a course-completion standard. Guide's generic minScore
  // rejects known failures; the explicitly named companion field preserves its
  // overall-course meaning rather than implying a separate final-exam minimum.
  const passing=Number.isFinite(course.providerCoursePassingPercent)?course.providerCoursePassingPercent:course.minScore;
  return attachUPICoursePurchasePrice({code:canonical,title:course.title,providerCourseCode:course.providerCourseCode,
    ...(course.aceId?{aceId:course.aceId}:{}),codeAliases:unique([course.providerCourseCode,...list(course.codeAliases)]).filter(alias=>alias!==canonical),
    sourceCredits:course.sourceCredits,sourceCreditSystem:course.sourceCreditSystem,sourceUpper:course.sourceUpper,
    sourceCreditStatus:'verified',sourceCreditEvidence:{credits:course.sourceCredits,creditSystem:course.sourceCreditSystem,sourceIds:copy(recommendationSources)},
    courseVersion:course.courseVersion,recommendationStart:course.recommendationStart,recommendationEnd:course.recommendationEnd,
    recommendationPeriodSourceIds:copy(recommendationSources),identitySourceIds:copy(course.identitySourceIds),
    identityReviewId:identityReview.id,identityCheckedOn:identityReview.checkedOn,url:course.courseUrl,
    ...(Number.isFinite(passing)?{minScore:passing,minScoreSourceIds:copy(recommendationSources),providerCoursePassingPercent:passing,providerCoursePassingSourceIds:copy(recommendationSources),passingScoreScope:'overall-course-completion'}:{})},identityReview);
}

function modelInScope(model){
  const legacy=model.id==='tesu-general-management'&&model.level==="Bachelor's"&&model.format==='Online'&&!model.modalities;
  return model.school==='Thomas Edison State University'&&tesuUPIModelIds.includes(model.id)&&(legacy||model.level==='bachelor'&&list(model.modalities).includes('online'))&&model.totalCredits===120&&model.creditSystem==='semester';
}
function namedReceivingCodes(model){return new Set(model.requirements.filter(row=>!row.freeElective).map(row=>row.code));}
function placementSources(model,requirement){
  if(list(requirement.sourceIds).length)return copy(requirement.sourceIds);
  // The retained legacy ledger attaches its reviewed curriculum at model level;
  // current kit ledgers attach the same kind of degree evidence to each row.
  if(model.id==='tesu-general-management'&&list(model.sources).some(source=>source.id==='tesu-gm-current-program-2026-11-17'))return ['tesu-gm-current-program-2026-11-17'];
  return [];
}
function placementAllowed(model,requirement,mapping){
  if(!modelInScope(model)||requirement.institutionalOnly||requirement.credits!==mapping.receivingCredits)return false;
  if(requirement.freeElective===true){
    if(!['elective','electives'].includes(requirement.category)||requirement.group!=='free-electives'||requirement.excludeAlreadyUsed===false||model.transferPolicyReview?.duplicatesCountOnce!==true)return false;
    return !namedReceivingCodes(model).has(mapping.receivingCode)&&placementSources(model,requirement).length>0;
  }
  return requirement.code===mapping.receivingCode&&placementSources(model,requirement).length>0;
}

export function upiTESUOption(model,requirement,mapping,course,identityReview=upiCourseReview,review=upiTESUReview){
  if(!placementAllowed(model,requirement,mapping))return null;
  // The source facts are independently reviewed, while the receiving claim stays explicitly conditional.
  const identity=upiKitIdentity(course,identityReview),degreeSourceIds=placementSources(model,requirement),sourceIds=unique([review.sources[0].id,...course.identitySourceIds,...degreeSourceIds,...review.providerApprovalSourceIds]);
  const elective=requirement.freeElective===true,receivingUpper=/^[A-Z]+-[34]\d{3}$/.test(mapping.receivingCode);
  return {id:optionId(mapping,course,requirement),provider:'UPI Study',...identity,
    credits:mapping.receivingCredits,creditSystem:'semester',receivingCode:mapping.receivingCode,receivingTitle:mapping.receivingTitle,upper:receivingUpper,
    creditOrigin:'alternative',sourceType:'alternative',evidence:'conditional',evidenceType:'provider-published',
    mappingChecked:review.checkedOn,mappingReviewId:review.id,mappingResearchClosed:false,receivingMapStatus:'provider-published-candidate',individualApproval:false,
    mappingScope:'Provider-published named TESU candidate; an independent university receiving-course award has not been established.',
    mappingEvidence:{schoolName:review.school,provider:'UPI Study',providerCourseCode:identity.code,receivingCode:mapping.receivingCode,credits:mapping.receivingCredits,creditSystem:'semester',sourceIds:[review.sources[0].id],claimOrigin:'provider-published',publisher:'UPI Study',individualApproval:false,providerTransferStatus:mapping.providerTransferStatus,scope:'provider-published-university-course-candidate'},
    degreePlacementEvidence:{modelId:model.id,schoolName:model.school,programName:model.title,requirementId:requirement.id,receivingCode:mapping.receivingCode,credits:mapping.receivingCredits,creditSystem:'semester',sourceIds:degreeSourceIds,placementType:elective?'elective':'exact-course',scope:elective?'Proposed nonduplicating use in the published unrestricted free-elective block; provider acceptance remains conditional.':'The current degree names this receiving course; provider acceptance remains conditional.'},
    sourceIds,eligibilityReview:tesuProviderEligibility('UPI Study'),...(elective?{placementType:'elective',allocationType:'free-elective'}:{}),
    conditions:[
      'UPI Study publishes this TESU course match. Its verification label is a provider claim; an independent TESU receiving-course award has not been established.',
      'The completed original course must match its reviewed credit quantity, units and recommendation period. Provider approval is separate from course acceptance and enrollment permission.',
      ...(elective?['Proposed use in this unrestricted free-elective block must be nonduplicating and fit the current degree.']:[])
    ]};
}

export function applyTESUUPIReviewedMaps(input,identityReview=upiCourseReview,review=upiTESUReview){
  let model=copy(input);if(!modelInScope(model))return model;
  const pairs=supportedUPIMappings(identityReview,review),newSourceIds=new Set();
  for(const requirement of model.requirements){
    for(const {mapping,course} of pairs){
      const option=upiTESUOption(model,requirement,mapping,course,identityReview,review);if(!option)continue;
      const index=requirement.options.findIndex(existing=>existing.id===option.id);if(index<0)requirement.options.push(option);else requirement.options[index]=option;
      option.sourceIds.forEach(id=>newSourceIds.add(id));
    }
  }
  for(const source of [...review.sources,...identityReview.sources])if(newSourceIds.has(source.id)&&!model.sources.some(existing=>existing.id===source.id))model.sources.push(copy(source));
  model=applyTESUUPIProviderDefaults(applyTESUProviderReview(model));return model;
}

/** Materialize shared identity/award rows once; explicit placements bind them to each current ledger. */
export async function writeTESUUPIKit({identityReview=upiCourseReview,review=upiTESUReview,check=false}={}){
  const pairs=supportedUPIMappings(identityReview,review),kitDir=resolve(root,'content/pathway-kits/tesu');
  const read=async name=>JSON.parse(await readFile(resolve(kitDir,name),'utf8'));
  const write=async (file,value)=>{const text=JSON.stringify(value,null,2)+'\n';if(check)assert.equal(await readFile(file,'utf8'),text,file+' requires the reviewed UPI supplement.');else await writeFile(file,text);};
  const provider={kind:'pathway-kit-provider',version:1,provider:'UPI Study',sources:copy(identityReview.sources),courses:identityReview.courses.map(course=>upiKitIdentity(course,identityReview))};
  await write(resolve(root,'content/pathway-kits/providers/upi-study.json'),provider);
  const school=await read('school.json');
  if(!school.programDefaults.defaultProviders.includes('UPI Study'))school.programDefaults.defaultProviders.push('UPI Study');
  // The directory body already reviewed on this date also names UPI; retain that source's current review scope.
  for(const source of [providerReview.source,providerReview.policySource,...review.sources]){const index=school.sources.findIndex(existing=>existing.id===source.id);if(index<0)school.sources.push(copy(source));else school.sources[index]=copy(source);}
  const equivalencies=await read('equivalencies.json');
  equivalencies.equivalencies=equivalencies.equivalencies.filter(row=>row.mappingReviewId!==review.id);
  equivalencies.conditionLibrary['tesu-upi-proposed-free-elective']='Proposed use in this unrestricted free-elective block must be nonduplicating and fit the current degree.';
  equivalencies.placementModes['upi-exact-placement']={placementEvidence:{placementType:'exact-course',citeInOption:true}};
  equivalencies.placementModes['upi-elective-placement']={set:{placementType:'elective',allocationType:'free-elective'},appendConditionIds:['tesu-upi-proposed-free-elective'],placementEvidence:{placementType:'elective',citeInOption:true}};
  const programs=[],sharedRows=new Map();
  for(const slug of school.programOrder){
    const program=await read('programs/'+slug+'.json');
    const model={...copy(school.programDefaults),...copy(program.modelFields),id:program.modelId,school:school.name,title:program.title,level:program.level,totalCredits:program.totalCredits,creditSystem:program.creditSystem||school.creditSystem,modalities:program.modalities||program.modelFields.modalities||school.programDefaults.modalities,requirements:program.requirements};
    const programAdded=[];
    for(const requirement of program.requirements){
      requirement.optionRows=requirement.optionRows.filter(entry=>!String(typeof entry==='string'?entry:entry?.row||entry?.optionId||'').startsWith('upi-'));
      for(const {mapping,course}of pairs){
        const option=upiTESUOption(model,requirement,mapping,course,identityReview,review);if(!option)continue;
        const rowId=mapId(mapping,course);
        if(!sharedRows.has(rowId)){
          const {code,...identity}=upiKitIdentity(course,identityReview),sharedSourceIds=unique([review.sources[0].id,...course.identitySourceIds,...review.providerApprovalSourceIds]);
          const extra=copy(option);for(const key of ['id','provider','code','degreePlacementEvidence','placementType','allocationType'])delete extra[key];
          extra.sourceIds=copy(sharedSourceIds);extra.conditions=option.conditions.slice(0,2);
          sharedRows.set(rowId,{id:rowId,provider:'UPI Study',code:course.aceId||course.providerCourseCode,status:'published',optionId:rowId,
            credits:option.credits,creditSystem:option.creditSystem,receivingCode:option.receivingCode,receivingTitle:option.receivingTitle,evidence:option.evidence,evidenceType:option.evidenceType,creditOrigin:'alternative',sourceIds:sharedSourceIds,mappingChecked:review.checkedOn,mappingReviewId:review.id,conditions:option.conditions.slice(0,2),identity,
            scope:{all:true,levels:['bachelor'],modalities:['online'],catalogs:[program.catalog]},
            quotes:[{sourceId:review.sources[0].id,text:mapping.quote}],extra});
        }
        requirement.optionRows.push({row:rowId,mode:requirement.freeElective?'upi-elective-placement':'upi-exact-placement',optionId:option.id});programAdded.push(option);
      }
    }
    const used=unique(programAdded.flatMap(option=>option.sourceIds));
    program.modelSourceIds=unique([...program.modelSourceIds,...used]);
    program.modelFields.providerEligibilityReview=applyTESUProviderReview({school:school.name,sources:[],requirements:[]}).providerEligibilityReview;
    programs.push({program,options:programAdded.length});
    await write(resolve(kitDir,'programs/'+program.slug+'.json'),program);
  }
  equivalencies.equivalencies.push(...sharedRows.values());
  await write(resolve(kitDir,'school.json'),school);await write(resolve(kitDir,'equivalencies.json'),equivalencies);
  return {providerCourses:provider.courses.length,supportedReceivingCandidates:pairs.length,placements:programs.map(({program,options})=>({modelId:program.modelId,options})),check};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  if(process.argv.includes('--write-kit')||process.argv.includes('--check-kit'))console.log(JSON.stringify(await writeTESUUPIKit({check:process.argv.includes('--check-kit')})));
  else throw Error('Choose --write-kit or --check-kit; this helper never directly publishes a new degree.');
}
