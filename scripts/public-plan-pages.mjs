/** Public, zero-record previews of the same reviewed plans used by the planner. */
import {readFile,readdir,unlink,rmdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {icon,schoolMarkHTML,creditSplit} from './public-visuals.mjs';

const require=createRequire(import.meta.url);
const Planner=require('../dist/planner.js');
const View=require('../dist/course-plan-view.js');
const Estimate=require('../dist/plan-estimate-engine.js');
const EstimateView=require('../dist/plan-estimate-view.js');
const list=value=>Array.isArray(value)?value:[];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const https=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}};

export const publicPlanDefinitions=Object.freeze([
 {id:'wgu-catalog-ecceaa488637ac83',modelId:'curriculum-wgu-catalog-ecceaa488637ac83',slug:'wgu-business-management',title:'WGU Business Management transfer plan',shortTitle:'Business Management',format:'Online',outside:69,university:41,total:110,unit:'competency units',description:'Explore the current 110-unit WGU Business Management degree with a proposed 69-unit transfer route, actual Sophia and Study.com course choices, and 41 units at WGU.'},
 {id:'liberty-business-residential',modelId:'liberty-business-residential',slug:'liberty-business-residential',title:'Liberty residential business transfer plan',shortTitle:'Business Administration & Data Analysis',format:'On campus',outside:83,university:37,total:120,unit:'semester credits',description:'See a Liberty residential business degree plan with 83 proposed outside credits, 37 university credits, and course-by-course Sophia, Study.com and other selected options.'},
 {id:'liberty-criminal-justice-online',modelId:'liberty-criminal-justice-online',slug:'liberty-criminal-justice-online',title:'Liberty Criminal Justice online transfer plan',shortTitle:'Criminal Justice — online',format:'Online',outside:72,university:48,total:120,unit:'semester credits',description:'Review an online Liberty Criminal Justice degree plan with 72 proposed transfer credits, 48 university credits, exact degree requirements, and selected outside course options.'},
 {id:'liberty-criminal-justice-residential',modelId:'liberty-criminal-justice-residential',slug:'liberty-criminal-justice-residential',title:'Liberty Criminal Justice residential transfer plan',shortTitle:'Criminal Justice — on campus',format:'On campus',outside:74,university:46,total:120,unit:'semester credits',description:'Explore Liberty Criminal Justice on campus with a proposed 74-credit transfer route, 46 credits at Liberty, and a complete source-linked course plan for the residential catalog.'}
]);

export function publicPlanPath(plan){return '/degree-plans/'+plan.slug+'/';}
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
/** One reviewed route as a card: a credit-split bar with its visible numbers as the text equivalent. */
export function renderPlanCard(plan,{heading='h2',showSchool=true}={}){return '<article class="public-plan-card" data-plan-format="'+(plan.format==='Online'?'online':'campus')+'"><div class="public-plan-card-top">'+(showSchool?schoolMarkHTML(plan.school,'ds-school-mark ds-school-mark-sm')+'<p class="public-plan-card-school">'+esc(plan.school)+'</p>':'')+formatChip(plan)+'</div><'+heading+'><a href="'+esc(plan.path)+'">'+esc(plan.shortTitle)+'</a></'+heading+'>'+creditSplit({outside:plan.outside,university:plan.university,total:plan.total,schoolLabel:schoolShort(plan.school),unit:plan.unit})+'<p class="public-plan-card-share"><strong>'+share(plan)+'%</strong> of the degree proposed through outside courses <span>· '+esc(plan.unit)+'</span></p><a class="public-plan-card-link" href="'+esc(plan.path)+'">See the course plan'+icon('arrow','ds-link-arrow')+'</a></article>';}

function entryRow(entry,plan){
 const atSchool=entry.provider==='University',requirement=entry.requirements.map(req=>'<span><strong>'+esc(req.code||'Degree requirement')+'</strong> '+esc(req.title)+'</span>').join('');
 const link=https(entry.courseUrl),label=atSchool?plan.school:entry.provider;
 return '<tr data-preview-provider="'+esc(atSchool?'university':'outside')+'" data-requirement-ids="'+esc(entry.requirementIds.join(' '))+'"><th scope="row">'+requirement+'</th><td>'+(link?'<a href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">'+esc(entry.title)+'</a>':esc(entry.title))+(entry.code?'<small>'+esc(entry.code)+'</small>':'')+'</td><td>'+esc(label)+(atSchool?'<small>'+(entry.kind==='universityRequired'?'University requirement':'Selected university coursework')+'</small>':'')+'</td><td data-degree-credits="'+entry.credits+'">'+entry.credits+'</td><td>'+(https(entry.evidenceUrl)?'<a href="'+esc(entry.evidenceUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(entry.evidenceLabel||'Course evidence')+'</a>':esc(entry.evidenceLabel||'Degree requirement'))+'</td></tr>';
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

export function renderPublicPlan(plan,allPlans=[]){
 const unit=esc(plan.unit),related=allPlans.filter(other=>other.id!==plan.id&&other.school===plan.school).map(other=>'<li><a href="'+esc(other.path)+'">'+esc(other.shortTitle)+' · '+esc(other.format)+'</a></li>').join('');
 const graduation=list(plan.model.graduationRequirements).map(item=>'<li><strong>'+esc(item.title||item.id)+'</strong> '+esc(item.description||item.detail||'')+'</li>').join('');
 const sources=list(plan.model.sources).filter(source=>https(source.url)).map(source=>'<li><a href="'+esc(source.url)+'" target="_blank" rel="noopener noreferrer">'+esc(source.title||source.id)+'</a></li>').join('');
 return '<article data-public-plan-id="'+esc(plan.id)+'" data-growth-plan="'+esc(plan.id)+'"><section class="site-container public-plan-hero"><p>'+esc(plan.school)+' · '+esc(plan.format)+' · Catalog '+esc(plan.catalog)+'</p><h1>'+esc(plan.title)+'</h1><p class="page-lede">See the courses, keep the full degree together, and make this route your own.</p><p class="public-plan-degree">'+esc(plan.degree)+'</p><div class="public-plan-actions"><a class="site-button" href="'+esc(plan.useHref)+'">Use this plan</a><a class="text-link" href="#course-plan">See every course</a></div><p>No account or transcript needed to start.</p><div class="public-plan-mix-card"><div class="ds-split-track public-plan-mix-bar" aria-hidden="true"><span class="ds-split-outside" style="flex-grow:'+plan.outside+'"></span><span class="ds-split-school" style="flex-grow:'+plan.university+'"></span></div><dl class="public-plan-mix"><div class="is-outside"><dt>Outside coursework proposed</dt><dd>'+plan.outside+' <small>'+unit+'</small></dd></div><div class="is-school"><dt>University coursework</dt><dd>'+plan.university+' <small>'+unit+'</small></dd></div><div class="is-total"><dt>Complete degree</dt><dd>'+plan.total+' <small>'+unit+'</small></dd></div></dl></div><p class="public-plan-note">A proposed route starting with no past courses. These are degree '+(plan.unit==='competency units'?'competency units awarded by WGU':'semester credits')+'; original source quantities can differ. Your own records can change the choices. Research checked '+esc(plan.checkedOn)+'.</p>'+publishedRate(plan.model)+'</section>'+(EstimateView.available(plan.estimate)?'<section class="site-container public-plan-estimates" aria-label="Planning costs and study pace"><h2>Cost & timing</h2>'+EstimateView.render(plan.estimate)+'</section>':'')+'<section class="site-container" id="course-plan"><div class="public-plan-heading"><div><h2>Your course-by-course route</h2><p>Every degree requirement is included. Each credit is counted once.</p></div><label><span>Show courses</span><select data-preview-filter disabled><option value="all">All coursework</option><option value="outside">Outside courses</option><option value="university">University coursework</option></select></label></div><p data-preview-count role="status" aria-live="polite"></p>'+plan.view.sections.map(section=>sectionHTML(section,plan)).join('')+'<p class="public-plan-note">The proposed course matches use the receiving university’s published evidence. Individual admission, prior-learning evaluation and any required future-course approval remain the university’s decisions. This preview does not award credits or promise a completion date or complete degree price.</p></section>'+(graduation?'<section class="site-container public-plan-additional"><h2>Beyond the course list</h2><ul>'+graduation+'</ul></section>':'')+'<section class="site-container public-plan-sources"><details><summary>Course and university sources ('+plan.model.sources.length+')</summary><ul>'+sources+'</ul></details></section>'+(related?'<section class="site-container public-plan-related"><h2>Other routes at '+esc(plan.school)+'</h2><ul>'+related+'</ul></section>':'')+'<section class="site-container final-cta"><div><h2>Make this your starting point.</h2><p>Add your courses, choose your priorities, and keep your next step clear.</p></div><div><a class="site-button" href="'+esc(plan.useHref)+'">Use this plan</a><p>Your existing courses stay with you.</p></div></section></article>';
}

export function renderPublicPlanHub(plans){
 const groups=new Map();for(const plan of plans){if(!groups.has(plan.school))groups.set(plan.school,[]);groups.get(plan.school).push(plan);}
 const ordered=[...groups].sort(([a,x],[b,y])=>y.length-x.length||a.localeCompare(b));
 const top=plans.reduce((best,plan)=>share(plan)>share(best)?plan:best,plans[0]);
 const formats=list=>[...new Set(list.map(plan=>plan.format))].join(' & ');
 const groupHTML=([school,list],index)=>'<section class="plan-school-group" data-plan-group aria-labelledby="plan-school-'+index+'"><header class="plan-school-head">'+schoolMarkHTML(school)+'<div><h2 id="plan-school-'+index+'">'+esc(school)+'</h2><p>'+list.length+' researched plan'+(list.length===1?'':'s')+' · '+esc(formats(list))+' · '+esc([...new Set(list.map(plan=>plan.unit))].join(', '))+'</p></div></header><div class="public-plan-cards">'+[...list].sort((a,b)=>a.shortTitle.localeCompare(b.shortTitle)).map(plan=>renderPlanCard(plan,{heading:'h3',showSchool:false})).join('')+'</div></section>';
 const key=top?'<aside class="plan-hub-key" aria-label="How to read each plan"><p class="plan-hub-key-label">How to read a plan</p>'+creditSplit({outside:top.outside,university:top.university,total:top.total,schoolLabel:schoolShort(top.school),unit:top.unit,className:'ds-split-dark ds-split-large'})+'<p class="plan-hub-key-note"><span class="ds-swatch ds-swatch-outside" aria-hidden="true"></span>Outside courses: Sophia, Study.com and other proposed sources. <span class="ds-swatch ds-swatch-school" aria-hidden="true"></span>Coursework at the university.</p><p class="plan-hub-key-example">Example: '+esc(top.school)+' '+esc(top.shortTitle)+' · '+esc(top.format)+'</p></aside>':'';
 return '<section class="site-container page-intro ds-rail-intro plan-hub-intro"><div class="ds-rail-copy"><p class="ds-step-kicker">Step 1 · Pick a starting route</p><h1>A real course plan. A clearer way forward.</h1><p class="page-lede">Open a researched route, see the outside courses and university work, then make it fit your own starting point.</p><p>These previews have complete, source-backed course selections. More available templates are inside the planner.</p><ul class="plan-hub-stats"><li><strong>'+plans.length+'</strong> complete plans</li><li><strong>'+groups.size+'</strong> universities</li>'+(top?'<li><strong>Up to '+share(top)+'%</strong> through outside courses</li>':'')+'</ul><label class="public-plan-hub-filter"><span>Where would you study?</span><select data-public-plan-format disabled><option value="all">Online or on campus</option><option value="online">Online</option><option value="campus">On campus</option></select></label><p data-public-plan-count role="status" aria-live="polite"></p></div>'+key+'</section><div class="site-container plan-hub-groups">'+ordered.map(groupHTML).join('')+'</div><section class="site-container final-cta"><div><h2>Looking for another degree?</h2><p>Browse all available templates, bring your own courses, or research a specific university degree.</p></div><div><a class="site-button" href="/programs.html">Browse available plans</a><a class="text-link" href="/import-courses.html">Use my past courses</a></div></section>';
}
