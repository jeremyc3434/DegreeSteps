/* Public "where does this course count?" pages, generated from the same source-backed plans the planner uses.
 * Only published receiving-school equivalencies in plans a student can open are listed; nothing is inferred from titles. */
import {readFile,readdir,unlink,rmdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {icon} from './public-visuals.mjs';
import {createRequire} from 'node:module';
// Rendering only: the course's provider link goes through the shared outbound helper, loaded on first use.
let OutboundHelper;const outbound=()=>OutboundHelper??=createRequire(import.meta.url)('../dist/outbound.js');

const list=value=>Array.isArray(value)?value:[];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const https=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}};
/** The page path for an outside course (shared with plan pages so they can link to it). */
export const transferPath=(provider,code,title)=>'/transfer/'+slug(provider)+'/'+slug(code+'-'+title)+'/';
export const slug=value=>String(value||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);
const unitLabel=(n,system)=>system==='competency-unit'?n+' CU'+(n===1?'':'s'):n+' '+(system==='quarter'?'quarter credit':'credit')+(n===1?'':'s');
// Elective slots split into numbered allocations ("… · allocation 3") are one requirement for a reader.
const baseTitle=title=>String(title||'').replace(/\s*[·-]\s*allocation\s+\d+\s*$/i,'');
// Official when typed as a receiving-school equivalency, or (older records without a type) when every cited source is the
// school's own transfer/equivalency guide rather than a provider page.
const providerHost=/(sophia\.org|study\.com|straighterline\.com|saylor\.org|collegeboard\.org|getcollegecredit\.com|acenet\.edu|nccrs\.org)$/i;
const schoolGuide=source=>{let host='';try{host=new URL(source.url).hostname;}catch{return false;}return !providerHost.test(host)&&/equivalenc|transfer guide|receiving/i.test(source.title||'');};
const officialEvidence=(option,sources)=>option.evidence==='published'&&(/receiving-school|official/i.test(option.evidenceType||'')||!option.evidenceType&&list(option.sourceIds).length>0&&list(option.sourceIds).every(id=>sources.get(id)&&schoolGuide(sources.get(id))));

/** Collects every published receiving-school match per outside course across the plans in the finder index. */
export async function loadTransferCourses(dist,{publicPlans=[]}={}){
  const read=async path=>JSON.parse(await readFile(resolve(dist,path),'utf8'));
  const index=await read('data/plan-library-index.json'),registry=await read('data/curriculum-registry.json');
  const entries=new Map(registry.models.map(entry=>[entry.id,entry])),docs=new Map(),publicByRoute=new Map(publicPlans.map(plan=>[plan.id,plan]));
  const courses=new Map();
  for(const [routeId,info] of Object.entries(index.plans)){
    const entry=entries.get(info.modelId);if(!entry)continue;
    if(!docs.has(entry.path))docs.set(entry.path,await read(entry.path));
    const doc=docs.get(entry.path),model=(doc.models||[doc]).find(item=>item.id===info.modelId);if(!model)continue;
    const sources=new Map(list(model.sources).concat(list(doc.sources)).map(source=>[source.id,source]));
    const planHref=publicByRoute.get(routeId)?.path||'/portal.html?usePlan='+encodeURIComponent(routeId);
    for(const req of list(model.requirements))for(const option of list(req.options)){
      if(!option.provider||option.provider==='University'||!option.code||!officialEvidence(option,sources))continue;
      const key=option.provider+'|'+option.code;
      if(!courses.has(key))courses.set(key,{provider:option.provider,code:option.code,title:option.title,url:https(option.url),sourceCredits:option.sourceCredits,sourceCreditSystem:option.sourceCreditSystem,matches:[]});
      const course=courses.get(key),evidence=list(option.sourceIds).map(id=>sources.get(id)).find(source=>https(source?.url));
      const match={school:model.school,program:model.title,routeId,planHref,tier:info.tier,receivingCode:req.code||option.receivingCode||'',receivingTitle:baseTitle(req.title||option.receivingTitle||''),credits:option.credits,creditSystem:option.creditSystem||model.creditSystem,evidenceUrl:evidence?https(evidence.url):'',evidenceTitle:evidence?.title||'',condition:list(option.conditions)[0]||''};
      // One row per plan and requirement: alternative placements of the same course stay separate requirements.
      if(!course.matches.some(m=>m.routeId===routeId&&m.receivingCode===match.receivingCode&&m.receivingTitle===match.receivingTitle))course.matches.push(match);
    }
  }
  const out=[...courses.values()].filter(course=>course.matches.length).map(course=>({...course,path:transferPath(course.provider,course.code,course.title),schools:[...new Set(course.matches.map(m=>m.school))].sort(),plans:new Set(course.matches.map(m=>m.routeId)).size}));
  for(const course of out)course.matches.sort((a,b)=>Number(a.tier==='confirmation')-Number(b.tier==='confirmation')||a.school.localeCompare(b.school)||a.program.localeCompare(b.program));
  return out.sort((a,b)=>a.provider.localeCompare(b.provider)||a.title.localeCompare(b.title));
}

const plural=(n,word)=>n+' '+word+(n===1?'':'s');
const andList=items=>items.length<3?items.join(' and '):items.slice(0,-1).join(', ')+' and '+items[items.length-1];
export function transferDescription(course){return 'See where '+course.provider+' '+course.title+' ('+course.code+') is listed in a school’s published transfer guidance: '+plural(course.plans,'researched degree plan')+' at '+andList(course.schools)+', with the requirement it fills and the source.';}

export function renderTransferCourse(course){
  const sourceCredits=Number.isFinite(course.sourceCredits)&&course.sourceCreditSystem?unitLabel(course.sourceCredits,course.sourceCreditSystem)+' recommended by the provider':'';
  // One row per plan: a course listed for several requirements can fill only one of them.
  const byPlan=new Map();for(const m of course.matches){if(!byPlan.has(m.routeId))byPlan.set(m.routeId,{...m,requirements:[],evidence:new Map()});const row=byPlan.get(m.routeId);row.requirements.push((m.receivingCode?'<strong>'+esc(m.receivingCode)+'</strong> ':'')+esc(m.receivingTitle));if(m.evidenceUrl&&!row.evidence.has(m.evidenceUrl))row.evidence.set(m.evidenceUrl,m.evidenceTitle);}
  const rows=[...byPlan.values()].map(m=>'<tr><th scope="row">'+esc(m.school)+'<small>'+esc(m.program)+'</small></th><td data-label="Requirement it fills"><span>'+(m.requirements.length>1?'Can fill one of: '+m.requirements.join('; '):m.requirements[0])+'</span></td><td data-label="Credit awarded">'+esc(unitLabel(m.credits,m.creditSystem))+'</td><td data-label="Plan status">'+(m.tier==='confirmation'?'<span class="transfer-status transfer-status-confirm">Needs school confirmation</span>':'<span class="transfer-status transfer-status-reviewed">Reviewed plan</span>')+'</td><td data-label="Evidence"><span>'+([...m.evidence].map(([url,title])=>'<a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(title||'School transfer guidance')+'</a>').join('<br>')||'School transfer guidance')+'</span></td><td data-label="Plan"><a href="'+esc(m.planHref)+'">See the plan'+icon('arrow','ds-link-arrow')+'</a></td></tr>').join('');
  const conditions=[...new Set(course.matches.map(m=>m.condition).filter(Boolean))].slice(0,3);
  return '<section class="site-container page-intro ds-rail-intro transfer-intro" data-transfer-course="'+esc(course.provider+'|'+course.code)+'"><div class="ds-rail-copy"><p class="ds-step-kicker">'+esc(course.provider)+' · '+esc(course.code)+'</p><h1>Where '+esc(course.provider)+' '+esc(course.title)+' counts toward a degree</h1><p class="page-lede">'+esc(plural(course.plans,'researched degree plan'))+' at '+esc(andList(course.schools))+' list this course in the school’s published transfer guidance.</p><ul class="transfer-facts">'+(sourceCredits?'<li>'+esc(sourceCredits)+'</li>':'')+(course.url?'<li>'+outbound().link({href:course.url,html:'Course page at '+esc(course.provider),provider:course.provider,rel:'noopener noreferrer'})+'</li>':'')+'</ul></div></section>'+
    '<section class="site-container transfer-matches"><h2>Where it counts</h2><div class="public-plan-table transfer-table" tabindex="0" role="region" aria-label="Schools and degree plans that list this course"><table><thead><tr><th scope="col">School and degree</th><th scope="col">Requirement it fills</th><th scope="col">Credit awarded</th><th scope="col">Plan status</th><th scope="col">Evidence</th><th scope="col"><span class="sr-only">Plan link</span></th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    (conditions.length?'<h2>Conditions the schools list</h2><ul class="transfer-conditions">'+conditions.map(c=>'<li>'+esc(c)+'</li>').join('')+'</ul>':'')+
    (course.matches.some(m=>m.creditSystem==='competency-unit')?'<p class="transfer-note">CU = competency unit, WGU’s measure of credit.</p>':'')+
    '<p class="transfer-note">A listing here means the school’s published guidance accepts this course for that requirement in that plan. Your school still evaluates your official records, completion dates and eligibility. It does not mean the course counts at other schools or in other programs, and a provider’s credit recommendation is not itself a school award.</p></section>'+
    '<section class="site-container final-cta"><div><h2>See the whole degree, not just one course.</h2><p>Open a plan to see every requirement, the outside courses that fit, and what you would take at the university.</p></div><div><a class="site-button" href="/degree-plans/">Browse degree plans</a><a class="text-link" href="/transfer/">More transfer courses</a></div></section>';
}

export function renderTransferIndex(courses){
  const providers=[...new Set(courses.map(c=>c.provider))];
  const groups=providers.map(provider=>{const items=courses.filter(c=>c.provider===provider);return '<section class="transfer-group" data-resource-group><h2>'+esc(provider)+' <span>'+items.length+'</span></h2><ul class="transfer-list">'+items.map(c=>'<li data-resource-card data-resource-text="'+esc([c.provider,c.code,c.title,...c.schools,...c.matches.map(m=>m.program+' '+m.receivingCode+' '+m.receivingTitle)].join(' ').toLowerCase())+'"><a href="'+esc(c.path)+'"><strong>'+esc(c.title)+'</strong><span>'+esc(c.code)+'</span></a><small>'+esc(plural(c.plans,'plan'))+' · '+esc(c.schools.join(', '))+'</small></li>').join('')+'</ul></section>';}).join('');
  const schools=[...new Set(courses.flatMap(c=>c.schools))];
  return '<section class="site-container page-intro ds-rail-intro"><div class="ds-rail-copy"><p class="ds-step-kicker">Transfer course directory</p><h1>Where do outside courses count?</h1><p class="page-lede">Look up an outside course from '+esc(providers.length>1?providers.slice(0,-1).join(', ')+' or '+providers[providers.length-1]:providers[0]||'a provider')+' and see which researched degree plans list it in the school’s published transfer guidance.</p><ul class="plan-hub-stats"><li><strong>'+courses.length+'</strong> courses</li><li><strong>'+schools.length+'</strong> schools</li><li><strong>'+providers.length+'</strong> providers</li></ul><label class="resource-search"><span>Find a course</span><input type="search" data-resource-search placeholder="Try Macroeconomics, a provider, or a course code" autocomplete="off"></label><p data-resource-count class="search-count" role="status" aria-live="polite"></p></div></section><div class="site-container transfer-groups">'+groups+'</div><section class="site-container final-cta"><div><h2>Ready to see a whole degree?</h2><p>A course only helps when it fills a requirement in your degree. See complete plans with every requirement accounted for.</p></div><div><a class="site-button" href="/degree-plans/">Browse degree plans</a></div></section>';
}

/** Removes generated course pages that are no longer current. Only files carrying the generator's marker are touched. */
export async function removeObsoleteTransferPages(dist,courses){
  const keep=new Set(courses.map(course=>course.path)),root=resolve(dist,'transfer'),removed=[];
  let providers;try{providers=await readdir(root,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return removed;throw error;}
  for(const provider of providers.filter(entry=>entry.isDirectory())){
    for(const entry of await readdir(resolve(root,provider.name),{withFileTypes:true})){
      const path='/transfer/'+provider.name+'/'+entry.name+'/';if(!entry.isDirectory()||keep.has(path))continue;
      const file=resolve(root,provider.name,entry.name,'index.html');let html;
      try{html=await readFile(file,'utf8');}catch(error){if(error.code==='ENOENT')continue;throw error;}
      if(!html.includes('data-transfer-course='))continue;
      await unlink(file);removed.push(path);
      try{await rmdir(resolve(root,provider.name,entry.name));}catch(error){if(error.code!=='ENOTEMPTY'&&error.code!=='ENOENT')throw error;}
    }
  }
  return removed.sort();
}
