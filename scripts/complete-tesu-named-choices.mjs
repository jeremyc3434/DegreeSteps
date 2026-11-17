/* Complete the existing TESU elective ledger with actual published TESU courses.
 * No new outside equivalency, cap change, transcript award or graduation promise. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dirname,'..'),clone=value=>JSON.parse(JSON.stringify(value));
export const evidencePath='content/reviews/tesu-named-course-completion-2026-11-17.json';
const evidence=JSON.parse(await readFile(resolve(root,evidencePath),'utf8'));
const normalize=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function validateEvidence(document){
 assert(document?.version===1&&document.modelId==='tesu-general-management'&&document.checkedOn==='2026-11-17');
 const sources=new Map();for(const source of document.sources){assert(source.id&&!sources.has(source.id));const url=new URL(source.url);assert(url.protocol==='https:'&&!url.username&&!url.password&&['www.tesu.edu','www2.tesu.edu','tesu.smartcatalogiq.com'].includes(url.hostname)&&source.checked===document.checkedOn);sources.set(source.id,source);}
 const choices=document.electiveChoices;assert(choices.length===4&&new Set(choices.map(item=>item.requirementId)).size===4&&new Set(choices.map(item=>normalize(item.code))).size===4);
 for(const choice of choices){assert(/^elective[2-5]$/.test(choice.requirementId)&&/^[A-Z]{3}-\d{4}$/.test(choice.code)&&choice.title&&choice.credits===3&&choice.creditSystem==='semester'&&choice.upper===false);assert(choice.sourceIds.length&&choice.sourceIds.every(id=>sources.has(id)));assert(choice.methods.length&&choice.methods.every(method=>['OL','GS','AC','EP'].includes(method)));if(choice.acceleratedSessionWeeks!==undefined)assert(choice.acceleratedSessionWeeks===4&&choice.methods.includes('AC'));}
 assert(document.residency.modeledStandardCredits===15&&document.residency.separateWaiverOption.modeled===false);return clone(document);
}
validateEvidence(evidence);
export function completeTESUChoices(input){
 const model=clone(input);assert.equal(model.id,evidence.modelId);assert.equal(model.school,evidence.school);assert.equal(model.title,evidence.program);assert.equal(model.format,'Online');assert.equal(model.totalCredits,120);assert.equal(model.creditSystem,'semester');assert.equal(model.institutionMinCredits,15);assert.equal(model.alternativeMaxCredits,90);
 const fixed=new Set(model.requirements.filter(row=>!/^elective[2-5]$/.test(row.id)).map(row=>normalize(row.code)));
 for(const choice of evidence.electiveChoices){
  assert(!fixed.has(normalize(choice.code)),'A TESU elective must not repeat a fixed degree course');
  const requirement=model.requirements.find(row=>row.id===choice.requirementId);assert(requirement?.credits===3&&requirement.category==='elective'&&!requirement.institutionalOnly);
  const university=requirement.options.find(option=>option.provider==='University');assert(university,'Preserve the existing TESU course fallback');
  const sourceIds=['tesu-gm-current-program-2026-11-17','tesu-gm-elective-course-list-2026-11-17',...choice.sourceIds];
  Object.assign(university,{code:choice.code,title:choice.title,credits:3,creditSystem:'semester',sourceCredits:3,sourceCreditSystem:'semester',creditOrigin:'institutional',upper:false,evidence:'published',evidenceType:'official-university-course',sourceIds:[...new Set(sourceIds)],selectionRequired:false,studyMethods:clone(choice.methods),url:evidence.sources.find(source=>source.id===choice.sourceIds[0]).url,courseChoiceCheckedOn:evidence.checkedOn,courseChoiceReviewId:evidence.id,conditions:['Selected from the university course list linked by this degree’s published free-elective block. Original learning may count only once; if this course duplicates your records, choose another documented free elective.']});
  if(choice.acceleratedSessionWeeks)university.deliveryEvidence={acceleratedSessionWeeks:choice.acceleratedSessionWeeks,method:'AC',sourceIds:clone(choice.sourceIds),scope:'The separately scheduled accelerated option only; standard OL and GS offerings do not inherit a four-week duration.'};
  requirement.freeElective=true;requirement.sourceIds=['tesu-gm-current-program-2026-11-17','tesu-gm-elective-course-list-2026-11-17'];
 }
 for(const source of evidence.sources){const index=model.sources.findIndex(item=>item.id===source.id);if(index<0)model.sources.push(clone(source));else model.sources[index]=clone(source);}
 model.namedCourseCompletionReview={id:evidence.id,checkedOn:evidence.checkedOn,evidencePath,requirementIds:evidence.electiveChoices.map(item=>item.requirementId),outsideEquivalenciesAdded:0,standardResidencyCredits:15};
 model.policyEvidence={...(model.policyEvidence||{}),institutionMinCredits:{value:15,creditSystem:'semester',sourceIds:['tesu-tuition-current-2026-11-17'],scope:'Standard nonmilitary course-residency route; qualifying OL,GS,AC,EP coursework only.'},externalMaxCredits:{value:105,creditSystem:'semester',sourceIds:['tesu-gm-current-program-2026-11-17','tesu-tuition-current-2026-11-17'],calculation:'120 degree credits minus 15 modeled TESU course-residency credits.',scope:'Derived bound for this standard residency route, not a published universal105-credit transfer policy or a promise that105 credits have documented outside placements.'},alternativeMaxCredits:{value:90,creditSystem:'semester',sourceIds:['tesu-transfer-policy-current','tesu-transfer-faq'],scope:'Combined alternative-source ceiling remains distinct from institutional transfer and the selected residency route.'},upperMinCredits:{value:18,creditSystem:'semester',sourceIds:['tesu-gm-current-program-2026-11-17'],scope:'Includes 12 area-of-study upper credits, the capstone and another 3 upper credits in the area of study or business core.'}};
 model.policySourceIds=[...new Set([...(model.policySourceIds||[]),...Object.values(model.policyEvidence).flatMap(rule=>rule.sourceIds||[])])];
 model.publishedTuitionSchedule=clone(evidence.tuition);model.publishedFees=clone(evidence.fees);model.publishedResidencyOptions=clone(evidence.residency);model.publishedAcceleratedTiming=clone(evidence.timing);
 model.rulesNotes=model.rulesNotes.map(note=>note.startsWith('The four open free-elective slots now contain')?'The four free-elective slots retain specific nonduplicating outside candidates and now have named, source-linked TESU course alternatives. Selecting a TESU course does not require inventing a course later; transfer applicability remains specific to each outside award.':note);
 const note='TESU’s current undergraduate schedule provides named course alternatives for the four general free-elective slots. PSY-1010 also has a separately documented four-week AC option; this does not establish a four-week whole-degree schedule.';
 if(!model.rulesNotes.includes(note))model.rulesNotes.push(note);
 model.internalResearchFindings=[...(model.internalResearchFindings||[]).filter(item=>!evidence.internalResearch.some(finding=>finding.id===item.id)),...clone(evidence.internalResearch)];
 return model;
}
export async function run({check=false}={}){const file=resolve(root,'dist/data/tesu.json'),original=JSON.parse(await readFile(file,'utf8')),result=completeTESUChoices(original);if(check)assert.deepEqual(original,result,'TESU named course choices need regeneration');else await writeFile(file,JSON.stringify(result,null,2)+'\n');return{check,model:result.id,namedUniversityChoices:4,newOutsideEquivalencies:0};}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(await run({check:process.argv.includes('--check')})));
