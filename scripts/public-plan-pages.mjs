/** Public, zero-record previews of the same reviewed plans used by the planner. */
import {readFile,readdir,unlink,rmdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {icon,schoolMarkHTML,creditSplit} from './public-visuals.mjs';
import {subjectAreas,subjectsFor} from './subject-areas.mjs';
import {transferPath} from './transfer-pages.mjs';

const require=createRequire(import.meta.url);
const Planner=require('../dist/planner.js');
const View=require('../dist/course-plan-view.js');
const Estimate=require('../dist/plan-estimate-engine.js');
const EstimateView=require('../dist/plan-estimate-view.js');
// Rendering only: provider links go through the shared outbound helper, loaded on first use. Plan building
// (buildPublicPlan, loadPublicPlans) never loads it or reads partner settings.
let OutboundHelper;const outbound=()=>OutboundHelper??=require('../dist/outbound.js');
const list=value=>Array.isArray(value)?value:[];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const https=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}};

export const publicPlanDefinitions=Object.freeze([
 {id:'wgu-catalog-ecceaa488637ac83',modelId:'curriculum-wgu-catalog-ecceaa488637ac83',slug:'wgu-business-management',title:'WGU Business Management transfer plan',shortTitle:'Business Management',format:'Online',outside:69,university:41,total:110,unit:'competency units',description:'Explore the current 110-unit WGU Business Management degree with a proposed 69-unit transfer route, actual Sophia and Study.com course choices, and 41 units at WGU.'},
 {id:'liberty-business-residential',modelId:'liberty-business-residential',slug:'liberty-business-residential',title:'Liberty residential business transfer plan',shortTitle:'Business Administration & Data Analysis',format:'On campus',outside:83,university:37,total:120,unit:'semester credits',description:'See a Liberty residential business degree plan with 83 proposed outside credits, 37 university credits, and course-by-course Sophia, Study.com and other selected options.'},
 {id:'liberty-criminal-justice-online',modelId:'liberty-criminal-justice-online',slug:'liberty-criminal-justice-online',title:'Liberty Criminal Justice online transfer plan',shortTitle:'Criminal Justice — online',format:'Online',outside:72,university:48,total:120,unit:'semester credits',description:'Review an online Liberty Criminal Justice degree plan with 72 proposed transfer credits, 48 university credits, exact degree requirements, and selected outside course options.'},
 {id:'liberty-criminal-justice-residential',modelId:'liberty-criminal-justice-residential',slug:'liberty-criminal-justice-residential',title:'Liberty Criminal Justice residential transfer plan',shortTitle:'Criminal Justice — on campus',format:'On campus',outside:74,university:46,total:120,unit:'semester credits',description:'Explore Liberty Criminal Justice on campus with a proposed 74-credit transfer route, 46 credits at Liberty, and a complete source-linked course plan for the residential catalog.'}
]);

/**
 * Weekly source freshness flags (dist/data/plan-freshness.json, written by scripts/pathway-factory/freshness.mjs):
 * plan route id -> {status:"rechecking", since}. Optional: a missing, empty or malformed file changes nothing.
 */
export async function loadPlanFreshness(dist){
 try{const value=JSON.parse(await readFile(resolve(dist,'data/plan-freshness.json'),'utf8'));return value?.plans&&typeof value.plans==='object'&&!Array.isArray(value.plans)?value.plans:{};}catch{return {};}
}
export function freshnessFor(plans,id){
 const entry=plans?.[id];return entry?.status==='rechecking'&&/^\d{4}-\d{2}-\d{2}$/.test(entry.since||'')?{status:'rechecking',since:entry.since}:null;
}
const longDate=value=>new Intl.DateTimeFormat('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z'));
/** The neutral note shown beside a plan's research date while a cited source page is being rechecked. */
export function freshnessNoteHTML(freshness){
 return freshness?'<p class="public-plan-freshness" role="note">Rechecking: the school updated a source page on '+esc(longDate(freshness.since))+'.</p>':'';
}

export function publicPlanPath(plan){return '/degree-plans/'+plan.slug+'/';}
/** Transfer-directory pages that exist, set by the site build so plan rows can link to them. */
let transferPaths=new Set();
export function setTransferPaths(paths){transferPaths=new Set(paths);}
export function usePublicPlanHref(plan){return '/portal.html?usePlan='+encodeURIComponent(plan.id);}
function catalogLabel(value){const raw=String(value||''),match=raw.match(/^(20\d{2})(0[1-9]|1[0-2])$/);return match?new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(Number(match[1]),Number(match[2])-1,1))):raw;}

export function buildPublicPlan(definition,{model,entry,baseline,quality,courseCatalog={},rates,generate=Planner.generate}){
 assert.equal(model?.id,definition.modelId,'Public plan model identity changed.');
 assert(entry?.routeIds?.includes(definition.id),'Public route is not bound to its exact curriculum.');
 assert.equal(quality?.publication?.ready,true,'Only publication-ready research can become a public plan page.');
 assert.equal(baseline?.researchStatus,'research-ready','The saved baseline must have completed research.');
 assert.equal(baseline?.pathwayId,definition.id,'Public plan must use its exact saved route.');
 assert.equal(model.totalCredits,definition.total,'Published degree size changed.');
 const selected=new Map(list(baseline.rows).map(row=>[row.requirementId,row]));
 assert.equal(selected.size,list(model.requirements).length,'Every public requirement needs one saved selection.');
 for(const req of model.requirements){const saved=selected.get(req.id),option=list(req.options).find(option=>option.id===saved?.optionId);assert(option&&option.provider===saved.provider&&option.credits===saved.credits,'Saved course selection no longer matches its requirement.');}
 const providers=[...new Set(model.requirements.flatMap(row=>list(row.options).map(option=>option.provider)))].filter(provider=>provider&&provider!=='University');
 const plan=generate(model,{providers,allowConditional:true,priority:'transfer',completed:[],optionSelections:Object.fromEntries([...selected].map(([id,row])=>[id,row.optionId])),optimizationNodeBudget:12000});
 assert.equal(plan.validation?.academicCountsValid,true,'The public plan must pass the academic solver.');
 assert.equal(plan.totals.accounted,definition.total);
 assert.equal(plan.totals.external,baseline.summary.transferCredits,'The preview must reproduce its current reviewed outside-course total.');
 assert.equal(plan.totals.institutional,baseline.summary.universityCredits,'The preview must reproduce its current reviewed university-course total.');
 assert.equal(plan.totals.reported,0);assert.equal(plan.totals.confirmed,0);
 assert.equal(plan.rows.length,model.requirements.length);
 for(const row of plan.rows)assert.equal(row.option?.id,selected.get(row.requirementId)?.optionId,'The preview must preserve the saved baseline selection.');
 const view=View.build({program:model,plan,state:{learning:[]},match:{completed:[]}},courseCatalog);
 assert.equal(view.totals.accounted,definition.total);assert.equal(view.progress.completedCredits,0);assert.equal(view.curriculumIssues.length,0,'Public degree sections must be unambiguous.');
 const estimate=rates?Estimate.calculate({program:model,plan,rates}):null;
 const description='Explore '+model.school+'’s '+model.title+' with '+plan.totals.external+' proposed outside '+definition.unit+', '+plan.totals.institutional+' university '+definition.unit+', and a complete researched course plan.';
 return {...definition,outside:plan.totals.external,university:plan.totals.institutional,description,path:publicPlanPath(definition),useHref:usePublicPlanHref(definition),school:model.school,degree:model.title,catalog:catalogLabel(model.catalog),checkedOn:baseline.summary.checkedOn||entry.checkedOn||'',model,plan,view,baseline,quality,estimate};
}

export async function loadPublicPlans(dist=resolve(import.meta.dirname,'../dist')){
 const read=async path=>JSON.parse(await readFile(resolve(dist,path),'utf8'));
 const [registry,quality,index,courseCatalog,rates]=await Promise.all(['data/curriculum-registry.json','data/pathway-quality-report.json','data/baseline-index.json','data/course-catalog.json','data/plan-estimate-rates.json'].map(read));
 const freshness=await loadPlanFreshness(dist);
 assert.equal(index.privateRecordsIncluded,false,'Public baselines must not include private student records.');
 assert.equal(index.registryRevision,quality.registryRevision,'The public plan evidence revisions must match.');
 const packs=new Map(),plans=[],definitions=publicPlanDefinitions.filter(definition=>quality.programs.some(program=>program.modelId===definition.modelId&&program.publication.ready));
 // Additional completed research becomes a real crawlable preview through the
 // same strict renderer. A directory listing or complete ledger cannot enter.
 for(const reviewed of quality.programs.filter(program=>program.publication.ready&&!definitions.some(definition=>definition.modelId===program.modelId))){
  const entry=registry.models.find(entry=>entry.id===reviewed.modelId);assert(entry,'Reviewed public curriculum is missing.');
  if(!packs.has(entry.path))packs.set(entry.path,await read(entry.path));
  const pack=packs.get(entry.path),model=pack.id===entry.id?pack:list(pack.models).find(model=>model.id===entry.id);
  const baseline=Object.values(index.baselines).find(baseline=>baseline.modelId===entry.id&&baseline.researchStatus==='research-ready');
  assert(model&&baseline,'A publication-ready plan needs its complete saved course choices.');
  const unit=model.creditSystem==='competency-unit'?'competency units':model.creditSystem==='quarter'?'quarter credits':'semester credits';
  const slug=model.school==='Western Governors University'?'wgu-'+model.title.replace(/\s*[–—-]\s*B\.S\.\s*$/i,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''):entry.id.replace(/^curriculum-/,'');assert(/^[a-z0-9-]+$/.test(slug),'Public degree URLs need stable safe identifiers.');
  const schoolLabel=({'Western Governors University':'WGU','Liberty University':'Liberty','Thomas Edison State University':'TESU','University of Maine at Presque Isle':'UMPI'})[model.school]||model.school;
  definitions.push({id:baseline.pathwayId,modelId:entry.id,slug,title:schoolLabel+' '+model.title+' transfer plan',shortTitle:model.title,format:baseline.modality==='campus'?'On campus':'Online',outside:baseline.summary.transferCredits,university:baseline.summary.universityCredits,total:model.totalCredits,unit,description:'Explore '+model.school+'’s '+model.title+' with '+baseline.summary.transferCredits+' proposed outside '+unit+', '+baseline.summary.universityCredits+' university '+unit+', and a complete researched course plan.'});
 }
 assert.equal(new Set(definitions.map(definition=>definition.slug)).size,definitions.length,'Public degree URLs must not collide.');
 for(const definition of definitions){
  const entry=registry.models.find(entry=>entry.id===definition.modelId);assert(entry,'Public curriculum is missing.');
  if(!packs.has(entry.path))packs.set(entry.path,await read(entry.path));
  const pack=packs.get(entry.path),model=pack.id===entry.id?pack:list(pack.models).find(model=>model.id===entry.id);
  plans.push(buildPublicPlan(definition,{model,entry,baseline:Object.values(index.baselines).find(baseline=>baseline.modelId===entry.id&&baseline.pathwayId===definition.id),quality:quality.programs.find(program=>program.modelId===entry.id),courseCatalog,rates}));
  const fresh=freshnessFor(freshness,definition.id);if(fresh)plans.at(-1).freshness=fresh;
 }
 return plans;
}

/** Withdraw only obsolete generated previews, retaining unrelated content and assets. */
export async function removeObsoletePreviews(dist,plans){
 const folder=resolve(dist,'degree-plans'),allowed=new Set(plans.map(plan=>plan.slug)),removed=[];
 let entries;try{entries=await readdir(folder,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return removed;throw error;}
 for(const entry of entries){
  if(!entry.isDirectory()||allowed.has(entry.name))continue;
  const file=resolve(folder,entry.name,'index.html');let html;
  try{html=await readFile(file,'utf8');}catch(error){if(error.code==='ENOENT')continue;throw error;}
  if(!html.includes('data-public-plan-id=')||!html.includes('public-plan-hero'))continue;
  await unlink(file);removed.push('/degree-plans/'+entry.name+'/');
  try{await rmdir(resolve(folder,entry.name));}catch(error){if(error.code!=='ENOTEMPTY'&&error.code!=='ENOENT')throw error;}
 }
 return removed.sort();
}

const schoolShort=school=>({'Western Governors University':'WGU','Liberty University':'Liberty','Thomas Edison State University':'TESU','University of Maine at Presque Isle':'UMPI','Grand Canyon University':'GCU'})[school]||school;
const share=plan=>Math.round(plan.outside/plan.total*100);
function formatChip(plan){return '<span class="ds-chip ds-chip-format">'+icon(plan.format==='Online'?'online':'campus','ds-chip-icon')+esc(plan.format)+'</span>';}
const levelOf=plan=>{const v=String(plan.model?.level||'').toLowerCase();return /associate/.test(v)?'associate':/master/.test(v)?'master':/doctor/.test(v)?'doctorate':/bachelor/.test(v)?'bachelor':'';};
const levelLabel={associate:'Associate',bachelor:'Bachelor’s',master:'Master’s',doctorate:'Doctoral'};
const paceOf=plan=>/self|competency|subscription/i.test(plan.model?.paceModel||'')?'self-paced':'';
const costRange=plan=>{const r=plan.estimate?.costs?.knownRange;return r&&Number.isFinite(r.min)&&Number.isFinite(r.max)&&r.min>0?r:null;};
const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
/** Facts the plan library filters and sorts on, kept on each card as data attributes. */
export function planFacets(plan){
 const range=costRange(plan);
 return {format:plan.format==='Online'?'online':'campus',subjects:subjectsFor(plan.degree||plan.shortTitle),level:levelOf(plan),pace:paceOf(plan),school:plan.school,share:share(plan),cost:range?range.min:null,title:plan.shortTitle};
}
/** One reviewed route as a card: a credit-split bar with its visible numbers as the text equivalent. */
export function renderPlanCard(plan,{heading='h2',showSchool=true}={}){
 const f=planFacets(plan),range=costRange(plan);
 const data=' data-plan-format="'+f.format+'" data-plan-subjects="'+esc(f.subjects.join(' '))+'" data-plan-level="'+f.level+'" data-plan-pace="'+f.pace+'" data-plan-school="'+esc(f.school)+'" data-plan-share="'+f.share+'"'+(f.cost!==null?' data-plan-cost="'+f.cost+'"':'')+' data-plan-title="'+esc(f.title)+'"';
 return '<article class="public-plan-card"'+data+'><div class="public-plan-card-top">'+(showSchool?schoolMarkHTML(plan.school,'ds-school-mark ds-school-mark-sm')+'<p class="public-plan-card-school">'+esc(plan.school)+'</p>':'')+formatChip(plan)+'</div><'+heading+'><a href="'+esc(plan.path)+'">'+esc(plan.shortTitle)+'</a></'+heading+'>'+creditSplit({outside:plan.outside,university:plan.university,total:plan.total,schoolLabel:schoolShort(plan.school),unit:plan.unit})+'<p class="public-plan-card-share"><strong>'+share(plan)+'%</strong> of the degree proposed through outside courses <span>· '+esc(plan.unit)+'</span></p>'+(range?'<p class="public-plan-card-cost">Planning estimate <strong>'+money(range.min)+'–'+money(range.max)+'</strong> <span>before aid</span></p>':'')+'<a class="public-plan-card-link" href="'+esc(plan.path)+'">See the course plan'+icon('arrow','ds-link-arrow')+'</a></article>';
}

const stop=new Set(['introduction','intro','principles','fundamentals','foundations','general','and','the','for','with','of','to','in','i','ii','iii','course','courses','applied','studies','study','survey','basic','elementary']);
const titleWords=text=>new Set(String(text||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').split(' ').filter(word=>word.length>2&&!stop.has(word)).map(word=>word.replace(/(ies|es|s)$/,'')));
/** True when an outside course and its receiving requirement share no meaningful word (e.g. Macroeconomics for a World History slot). */
// Compares three-letter stems so related wording (Speaking/Speech, Biology/Biological) is not flagged.
const stems=words=>new Set([...words].map(word=>word.slice(0,3)));
function looksUnrelated(entry){
 // Elective slots accept many subjects, so an unrelated-looking title there is expected.
 if(entry.requirements.some(req=>/elective/i.test([req.title,req.category].join(' '))))return false;
 const courseWords=[...titleWords(entry.title)],course=stems(courseWords);
 const related=words=>[...words].some(word=>course.has(word.slice(0,3))||courseWords.some(other=>other.includes(word)||word.includes(other)));
 return course.size>0&&entry.requirements.length>0&&entry.requirements.every(req=>!related(titleWords(req.title)));
}
function entryRow(entry,plan){
 const atSchool=entry.provider==='University',requirement=entry.requirements.map(req=>'<span><strong>'+esc(req.code||'Degree requirement')+'</strong> '+esc(req.title)+'</span>').join('');
 const link=https(entry.courseUrl),label=atSchool?plan.school:entry.provider;
 const searchText=[entry.requirements.map(req=>[req.code,req.title].join(' ')).join(' '),entry.title,entry.code,label].join(' ').toLowerCase().replace(/\s+/g,' ');
 // An open slot planned at the school: the student picks the course (owner-approved 2026-11-23).
 const slot=atSchool&&entry.requirements.length===1&&entry.requirements[0].allocationSlot===true&&entry.requirements[0].slot?.label?entry.requirements[0].slot:null;
 if(slot){
  const context='program:'+plan.model.id,credits=entry.credits;
  const ask='community.html?'+new URLSearchParams({tab:'feed',context,compose:'1',title:(()=>{const short=String(slot.label).replace(/\s*\([^)]*\)\s*$/,'')||String(slot.label),full='Which course should I take for '+short+' in '+plan.school+' '+plan.model.title+'?',brief='Which course should I take for '+short+' in '+plan.model.title+'?';return full.length<=160?full:brief.length<=160?brief:brief.slice(0,158)+'…?';})(),body:'I need a course for "'+slot.label+'" ('+credits+' '+plan.unit+') in the '+plan.school+' '+plan.model.title+'. Which course did you take, and did the school accept it?'}).toString();
  return '<tr data-preview-provider="university" data-preview-source="university" data-preview-text="'+esc(searchText)+'" data-requirement-ids="'+esc(entry.requirementIds.join(' '))+'" data-open-slot="'+esc(slot.kind)+'"><th scope="row">'+requirement+'</th><td data-label="Proposed course"><strong class="public-plan-slot">Choose any approved '+esc(slot.label)+' course — '+esc(String(credits))+' '+esc(plan.unit)+'</strong><small>You pick the course'+(slot.of>1?' (choice '+slot.choice+' of '+slot.of+')':'')+' · <a class="public-plan-slot-ask" href="'+esc(ask)+'">Ask the community</a> · <a href="community.html?'+esc(new URLSearchParams({tab:'feed',context}).toString())+'">See what others chose</a></small></td><td data-label="Source">'+esc(plan.school)+'<small>Open course choice</small></td><td data-label="'+(plan.unit==='competency units'?'Degree units':'Degree credits')+'" data-degree-credits="'+entry.credits+'">'+entry.credits+'</td><td data-label="Evidence">'+(https(entry.evidenceUrl)?'<a href="'+esc(entry.evidenceUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(entry.evidenceLabel||'Degree requirement')+'</a>':esc(entry.evidenceLabel||'Degree requirement'))+'</td></tr>';
 }
 return '<tr data-preview-provider="'+esc(atSchool?'university':'outside')+'" data-preview-source="'+esc(atSchool?'university':entry.provider)+'" data-preview-text="'+esc(searchText)+'" data-requirement-ids="'+esc(entry.requirementIds.join(' '))+'"><th scope="row">'+requirement+'</th><td data-label="Proposed course">'+(link?outbound().link({href:link,html:esc(entry.title),provider:atSchool?'University':entry.provider,rel:'noopener noreferrer'}):esc(entry.title))+(entry.code?'<small>'+esc(entry.code)+'</small>':'')+(!atSchool&&entry.code&&transferPaths.has(transferPath(entry.provider,entry.code,entry.title))?'<small><a class="public-plan-elsewhere" href="'+esc(transferPath(entry.provider,entry.code,entry.title))+'" aria-label="Where else '+esc(entry.provider+' '+entry.title)+' counts">Where else this course counts</a></small>':'')+(!atSchool&&looksUnrelated(entry)?'<small class="public-plan-map-note">'+esc(schoolShort(plan.school))+'’s published transfer guidance accepts this course for this requirement.</small>':'')+'</td><td data-label="Source">'+esc(label)+(atSchool?'<small>'+(entry.kind==='universityRequired'?'University requirement':'Selected university coursework')+'</small>':'')+'</td><td data-label="'+(plan.unit==='competency units'?'Degree units':'Degree credits')+'" data-degree-credits="'+entry.credits+'">'+entry.credits+'</td><td data-label="Evidence">'+(https(entry.evidenceUrl)?'<a href="'+esc(entry.evidenceUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(entry.evidenceLabel||'Course evidence')+'</a>':esc(entry.evidenceLabel||'Degree requirement'))+'</td></tr>';
}
function sectionHTML(section,plan,depth=0){
 const heading=depth?'h3':'h2',shared=list(section.sharedEntries).map(entry=>'<p class="public-plan-shared">'+esc(entry.requirements.map(req=>[req.code,req.title].filter(Boolean).join(' ')).join('; '))+' also fulfills this section. Its credits are counted in its primary section.</p>').join('');
 if(section.children?.length)return '<section class="public-plan-section" aria-labelledby="public-section-'+esc(section.id)+'"><'+heading+' id="public-section-'+esc(section.id)+'">'+esc(section.title)+' <span>'+section.credits+' '+esc(plan.unit)+'</span></'+heading+'>'+section.children.map(child=>sectionHTML(child,plan,depth+1)).join('')+shared+'</section>';
 const table=section.entries.length?'<div class="public-plan-table" tabindex="0" role="region" aria-label="'+esc(section.title)+' course choices"><table><thead><tr><th scope="col">Degree requirement</th><th scope="col">Proposed course</th><th scope="col">Source</th><th scope="col">Degree '+(plan.unit==='competency units'?'units':'credits')+'</th><th scope="col">Evidence</th></tr></thead><tbody>'+section.entries.map(entry=>entryRow(entry,plan)).join('')+'</tbody></table></div>':'';
 return '<details class="public-plan-section public-plan-leaf" open data-preview-section><summary><span>'+esc(section.title)+'</span><strong>'+section.credits+' '+esc(plan.unit)+'</strong></summary>'+table+shared+'</details>';
}
function publishedRate(model){
 const pricing=model.pricing,sources=new Map(list(model.sources).map(source=>[source.id,source]));
 if(!pricing||pricing.currency!=='USD'||!list(pricing.sourceIds).length||!pricing.sourceIds.every(id=>https(sources.get(id)?.url))||!https(pricing.sourceUrl)||!pricing.sourceIds.some(id=>sources.get(id)?.url===pricing.sourceUrl))return '';
 const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
 if(pricing.model==='subscription'&&Number.isFinite(pricing.amount))return '<p class="public-plan-rate">Published university rate: <strong>'+money(pricing.amount)+' per '+esc(pricing.period)+'</strong>. The number of paid terms depends on the work you finish. Outside courses and separate charges are additional. <a href="'+esc(pricing.sourceUrl)+'" target="_blank" rel="noopener noreferrer">See the rate source</a>.</p>';
 if(pricing.model==='banded-term'&&Number.isFinite(pricing.termRate))return '<p class="public-plan-rate">Published full-time university tuition: <strong>'+money(pricing.termRate)+' per '+esc(pricing.period)+'</strong> for '+pricing.bandMin+'–'+pricing.bandMax+' credits in the reviewed band. Fees, housing, meals and other charges are separate. <a href="'+esc(pricing.sourceUrl)+'" target="_blank" rel="noopener noreferrer">See the rate source</a>.</p>';
 return '';
}

/** Source ids this plan actually cites (requirements, options, policies, pricing) — not every source in its shared school document. */
export function referencedSourceIds(model){
 const ids=new Set();
 const walk=(value,key='')=>{if(Array.isArray(value)){if(/sourceIds?$/i.test(key))value.forEach(id=>typeof id==='string'&&ids.add(id));else value.forEach(item=>walk(item));return;}if(!value||typeof value!=='object')return;for(const [name,item] of Object.entries(value)){if(name==='sources')continue;if(/sourceId$/i.test(name)&&typeof item==='string')ids.add(item);walk(item,name);}};
 walk(model);return ids;
}
const providerHosts=/(^|\.)(sophia\.org|study\.com|straighterline\.com|saylor\.org|collegeboard\.org|getcollegecredit\.com|ace\.org|nccrs\.org)$/i;
function sourceKind(source){let host='';try{host=new URL(source.url).hostname;}catch{}const text=[...(source.roles||[]),source.title,source.kind].join(' ');if(/receiving|partnership|transfer|agreement|equivalenc|articulation|course map/i.test(text)&&!/^(ACE|NCCRS)\b/.test(source.title||'')&&!/catalog: transfer ceiling/i.test(source.title||''))return 1;if(/^(ACE|NCCRS)\b/.test(source.title||'')||providerHosts.test(host))return 2;return 0;}
export function renderPublicPlan(plan,allPlans=[]){
 const collect=section=>[...list(section.entries),...list(section.children).flatMap(collect)],providers=[...new Set(plan.view.sections.flatMap(collect).filter(entry=>entry.provider&&entry.provider!=='University').map(entry=>entry.provider))].sort((a,b)=>a.localeCompare(b));
 const unit=esc(plan.unit),related=allPlans.filter(other=>other.id!==plan.id&&other.school===plan.school).map(other=>'<li><a href="'+esc(other.path)+'">'+esc(other.shortTitle)+' · '+esc(other.format)+'</a></li>').join('');
 const graduation=list(plan.model.graduationRequirements).map(item=>'<li><strong>'+esc(item.title||item.id)+'</strong> '+esc(item.description||item.detail||'')+'</li>').join('');
 const referenced=referencedSourceIds(plan.model),cited=list(plan.model.sources).filter(source=>https(source.url)&&referenced.has(source.id));
 const sourceGroups=[['University catalog and policies',[]],['Transfer agreements and course maps',[]],['Outside courses and credit recommendations',[]]];
 for(const source of cited)sourceGroups[sourceKind(source)][1].push(source);
 const sources=sourceGroups.filter(([,items])=>items.length).map(([title,items])=>'<li class="public-plan-source-group"><h3>'+esc(title)+' <span>('+items.length+')</span></h3><ul>'+items.map(source=>'<li><a href="'+esc(source.url)+'" target="_blank" rel="noopener noreferrer">'+esc(source.title||source.id)+'</a></li>').join('')+'</ul></li>').join('');
 return '<article data-public-plan-id="'+esc(plan.id)+'" data-growth-plan="'+esc(plan.id)+'"><section class="site-container public-plan-hero"><p>'+esc(plan.school)+' · '+esc(plan.format)+' · Catalog '+esc(plan.catalog)+'</p><h1>'+esc(plan.title)+'</h1><p class="page-lede">See the courses, keep the full degree together, and make this route your own.</p><div class="public-plan-actions"><a class="site-button" href="'+esc(plan.useHref)+'">Use this plan</a><a class="text-link" href="#course-plan">See every course</a></div><p>No account or transcript needed to start.</p><div class="public-plan-mix-card"><div class="ds-split-track public-plan-mix-bar" aria-hidden="true"><span class="ds-split-outside" style="flex-grow:'+plan.outside+'"></span><span class="ds-split-school" style="flex-grow:'+plan.university+'"></span></div><dl class="public-plan-mix"><div class="is-outside"><dt>Outside coursework proposed</dt><dd>'+plan.outside+' <small>'+unit+'</small></dd></div><div class="is-school"><dt>University coursework</dt><dd>'+plan.university+' <small>'+unit+'</small></dd></div><div class="is-total"><dt>Complete degree</dt><dd>'+plan.total+' <small>'+unit+'</small></dd></div></dl></div><p class="public-plan-note">A proposed route starting with no past courses. These are degree '+(plan.unit==='competency units'?'competency units awarded by WGU':'semester credits')+'; original source quantities can differ. Your own records can change the choices. Research checked '+esc(plan.checkedOn)+'.</p>'+freshnessNoteHTML(plan.freshness)+publishedRate(plan.model)+'</section>'+(EstimateView.available(plan.estimate)?'<section class="site-container public-plan-estimates" aria-label="Planning costs and study pace"><h2>Cost & timing</h2>'+EstimateView.render(plan.estimate)+'</section>':'')+'<section class="site-container" id="course-plan"><div class="public-plan-heading"><div><h2>Your course-by-course route</h2><p>Every degree requirement is included. Each credit is counted once.</p></div></div><div class="public-plan-tools" data-preview-tools><label class="public-plan-find"><span>Find a course</span><input type="search" data-preview-search placeholder="Course, code or provider" autocomplete="off" disabled></label><label><span>Show courses</span><select data-preview-filter disabled><option value="all">All courses</option><option value="outside">Outside courses</option><option value="university">University courses</option></select></label>'+(providers.length>1?'<label><span>Provider</span><select data-preview-source disabled><option value="">All providers</option>'+providers.map(name=>'<option value="'+esc(name)+'">'+esc(name)+'</option>').join('')+'</select></label>':'')+'<div class="public-plan-tool-actions"><button type="button" class="public-plan-tool-button" data-preview-toggle-all disabled>Collapse all sections</button><button type="button" class="public-plan-tool-clear" data-preview-clear hidden>Clear filters</button></div></div><p data-preview-count role="status" aria-live="polite"></p>'+plan.view.sections.map(section=>sectionHTML(section,plan)).join('')+'<p class="public-plan-note">The proposed course matches use the receiving university’s published evidence. Individual admission, prior-learning evaluation and any required future-course approval remain the university’s decisions. This preview does not award credits or promise a completion date or complete degree price.</p></section>'+(graduation?'<section class="site-container public-plan-additional"><h2>Beyond the course list</h2><ul>'+graduation+'</ul></section>':'')+'<section class="site-container public-plan-sources"><details><summary>Sources for this plan ('+cited.length+')</summary><ul class="public-plan-source-groups">'+sources+'</ul></details></section>'+(related?'<section class="site-container public-plan-related"><h2>Other routes at '+esc(plan.school)+'</h2><ul>'+related+'</ul></section>':'')+'<section class="site-container final-cta"><div><h2>Make this your starting point.</h2><p>Add your courses, choose your priorities, and keep your next step clear.</p></div><div><a class="site-button" href="'+esc(plan.useHref)+'">Use this plan</a><p>Your existing courses stay with you.</p></div></section></article>';
}

export function renderPublicPlanHub(plans,scope=null){
 const groups=new Map();for(const plan of plans){if(!groups.has(plan.school))groups.set(plan.school,[]);groups.get(plan.school).push(plan);}
 const ordered=[...groups].sort(([a,x],[b,y])=>y.length-x.length||a.localeCompare(b));
 const top=plans.reduce((best,plan)=>share(plan)>share(best)?plan:best,plans[0]);
 const formats=list=>[...new Set(list.map(plan=>plan.format))].join(' & ');
 const facets=plans.map(planFacets);
 const groupHTML=([school,list],index)=>'<section class="plan-school-group" data-plan-group="'+esc(school)+'" aria-labelledby="plan-school-'+index+'"><header class="plan-school-head">'+schoolMarkHTML(school)+'<div><h2 id="plan-school-'+index+'">'+esc(school)+'</h2><p>'+list.length+' researched plan'+(list.length===1?'':'s')+' · '+esc(formats(list))+' · '+esc([...new Set(list.map(plan=>plan.unit))].join(', '))+'</p></div></header><div class="public-plan-cards">'+[...list].sort((a,b)=>a.shortTitle.localeCompare(b.shortTitle)).map(plan=>renderPlanCard(plan,{heading:'h3'})).join('')+'</div></section>';
 const key=top?'<aside class="plan-hub-key" aria-label="How to read each plan"><p class="plan-hub-key-label">How to read a plan</p>'+creditSplit({outside:top.outside,university:top.university,total:top.total,schoolLabel:schoolShort(top.school),unit:top.unit,className:'ds-split-dark ds-split-large'})+'<p class="plan-hub-key-note"><span class="ds-swatch ds-swatch-outside" aria-hidden="true"></span>Outside courses: Sophia, Study.com and other proposed sources. <span class="ds-swatch ds-swatch-school" aria-hidden="true"></span>Coursework at the university.</p><p class="plan-hub-key-example">Example: '+esc(top.school)+' '+esc(top.shortTitle)+' · '+esc(top.format)+'</p></aside>':'';
 const count=(field,value)=>facets.filter(f=>Array.isArray(f[field])?f[field].includes(value):f[field]===value).length;
 const chip=(name,value,label,n)=>'<label class="plan-chip"><input type="checkbox" name="'+name+'" value="'+esc(value)+'"><span>'+esc(label)+'</span><small data-facet-count>'+n+'</small></label>';
 const group=(legend,name,options)=>options.length<2&&name!=='subject'?'':'<fieldset class="plan-facet" data-facet="'+name+'"><legend>'+legend+'</legend><div class="plan-chips">'+options.map(([value,label])=>chip(name,value,label,count(name==='subject'?'subjects':name,value))).join('')+'</div></fieldset>';
 const subjects=subjectAreas.filter(subject=>count('subjects',subject.id)).map(subject=>[subject.id,subject.label]);
 const levels=['associate','bachelor','master','doctorate'].filter(level=>count('level',level)).map(level=>[level,levelLabel[level]]);
 const schools=ordered.map(([school])=>[school,school]);
 const formatsOpt=[['online','Online'],['campus','On campus']].filter(([value])=>count('format',value));
 const pace=count('pace','self-paced')?'<fieldset class="plan-facet" data-facet="pace"><legend>Pace</legend><div class="plan-chips">'+chip('pace','self-paced','Self-paced',count('pace','self-paced'))+'</div></fieldset>':'';
 const shareOpt=[[0,'Any'],[50,'50%+'],[60,'60%+'],[70,'70%+']];
 const shareGroup='<fieldset class="plan-facet" data-facet="share"><legend>Outside credit</legend><div class="plan-segment">'+shareOpt.map(([value,label],i)=>'<label><input type="radio" name="share" value="'+value+'"'+(i===0?' checked':'')+'><span>'+label+'</span></label>').join('')+'</div></fieldset>';
 const library='<section class="site-container plan-library" data-plan-library data-no-step-trail aria-label="Degree plan library">'+
  '<div class="plan-library-bar" data-plan-toolbar hidden><div class="plan-library-bar-inner">'+
   '<label class="plan-library-search">'+icon('search','plan-library-search-icon')+'<span class="sr-only">Search plans</span><input type="search" data-plan-search placeholder="Search by degree, school or subject" autocomplete="off"></label>'+
   '<label class="plan-library-sort"><span>Sort</span><select data-plan-sort><option value="outside">Most outside credit</option><option value="cost">Lowest estimate</option><option value="az">Degree A–Z</option><option value="school">By school</option></select></label>'+
   '<button type="button" class="plan-library-toggle" data-plan-filter-toggle aria-expanded="false" aria-controls="plan-filters">Filters<span data-plan-filter-count hidden></span></button>'+
  '</div></div>'+
  '<div class="plan-library-body">'+
   '<form id="plan-filters" class="plan-library-filters" data-plan-filters hidden aria-label="Filter degree plans"><div class="plan-library-filters-head"><p>Filter plans</p><button type="button" class="plan-library-close" data-plan-filter-close aria-label="Close filters">×</button></div>'+
    group('Subject','subject',subjects)+shareGroup+group('Format','format',formatsOpt)+group('Degree level','level',levels)+pace+group('School','school',schools)+
    '<div class="plan-library-filters-foot"><button type="button" class="plan-library-clear" data-plan-clear>Clear all</button><button type="button" class="site-button plan-library-apply" data-plan-filter-close>Show plans</button></div></form>'+
   '<div class="plan-library-results"><div class="plan-library-summary"><p data-plan-count role="status" aria-live="polite">'+plans.length+' researched plans</p><ul class="plan-library-active" data-plan-active></ul><button type="button" class="plan-library-copy" data-plan-copy hidden>Copy link to this list</button></div>'+
    '<div class="plan-hub-groups" data-plan-results>'+ordered.map(groupHTML).join('')+'</div>'+
    '<div class="plan-library-empty" data-plan-empty hidden><h2>No plans match these filters yet.</h2><p>Try removing a filter, or ask for the degree you have in mind. New researched plans are added regularly.</p><div><button type="button" class="site-button secondary" data-plan-clear>Clear all filters</button><a class="text-link" href="/request-plan.html">Request a degree plan</a></div></div>'+
    '<button type="button" class="plan-library-more" data-plan-more hidden>Show more plans</button>'+
   '</div></div></section>';
 return '<section class="site-container page-intro ds-rail-intro plan-hub-intro"><div class="ds-rail-copy"><p class="ds-step-kicker">Step 1 · Pick a starting route</p><h1>A real course plan. A clearer way forward.</h1><p class="page-lede">Open a researched route, see the outside courses and university work, then make it fit your own starting point.</p><p>'+(scope?'This library lists the '+plans.length+' reviewed plans with public pages. DegreeSteps has '+scope.total+' researched plans at '+scope.schools+' schools: '+scope.reviewed+' reviewed and '+(scope.total-scope.reviewed)+' that still need school confirmation. The plan finder lists them all.':'These previews have complete, source-backed course selections. More available templates are inside the planner.')+'</p><ul class="plan-hub-stats"><li><strong>'+plans.length+'</strong> reviewed plans</li><li><strong>'+groups.size+'</strong> universities</li>'+(top?'<li><strong>Up to '+share(top)+'%</strong> through outside courses</li>':'')+'</ul><p class="plan-hub-more"><a href="/programs.html">'+(scope?'See all '+scope.total+' plans in the plan finder':'Browse every course plan in the planner, including plans still awaiting school confirmation')+icon('arrow','ds-link-arrow')+'</a></p></div>'+key+'</section>'+library+'<section class="site-container final-cta"><div><h2>Looking for another degree?</h2><p>Browse all available templates, bring your own courses, or research a specific university degree.</p></div><div><a class="site-button" href="/programs.html">Browse available plans</a><a class="text-link" href="/import-courses.html">Use my past courses</a></div></section>';
}
