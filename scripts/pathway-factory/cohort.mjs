/**
 * Completion-yield research planning, never academic approval.
 *
 * A deterministic greedy heuristic compares complete dependency bundles by
 * whole programs covered / (new review tasks + new public source work groups).
 * Looking at every candidate bundle captures shared and diamond dependencies;
 * it does not prove an optimum or estimate researcher hours. Research can fail.
 * Only the existing scoped queue can supply reusable tasks. A common URL groups
 * capture work; it never merges claims, versions, placements or approvals.
 */
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {canonicalJSON, metadataDigest, readAcademicInputs} from '../build-academic-registry.mjs';
import {loadProgramManifests} from './program-manifest.mjs';

const root = resolve(import.meta.dirname, '../..');
const list = value => Array.isArray(value) ? value : [];
const unique = values => [...new Set(values)].sort();
const clone = value => JSON.parse(JSON.stringify(value));
const assert = (value, message) => { if (!value) throw Error(message); };
const same = (a, b) => canonicalJSON(a) === canonicalJSON(b);
const sameSet = (a, b) => same(unique(list(a)), unique(list(b)));
const code = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const normalized = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const fingerprint = value => 'sha256:' + metadataDigest(value);
const keyed = (items, key, name) => {
  const result = new Map();
  for (const item of list(items)) {
    assert(typeof item?.[key] === 'string' && item[key] && !result.has(item[key]), 'Missing or duplicate ' + name + ' identity.');
    result.set(item[key], item);
  }
  return result;
};
const byId = (a, b) => a.id.localeCompare(b.id, 'en');
function date(value) {
  const stamp = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(value + 'T00:00:00Z') : NaN;
  assert(Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value, 'A real YYYY-MM-DD date is required.');
  return stamp;
}
export function cohortScope(model) {
  return {school:model.school, catalog:model.catalogYear || model.catalog || null, level:model.level || null,
    modality:model.format || list(model.modalities).join(',') || null, creditSystem:model.creditSystem || null};
}
function publicUrl(value) {
  // PDF page/extraction fragments and provider recommendation selectors can
  // change the evidence being reviewed. Keep them in work identity.
  try { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password) return null; return url.href; }
  catch { return null; }
}
function schoolMatches(model, filter) {
  const aliases = {tesu:'thomasedisonstateuniversity', umpi:'universityofmaineatpresqueisle', wgu:'westerngovernorsuniversity'};
  return !filter || list(Array.isArray(filter) ? filter : [filter]).some(value => {
    const key = normalized(value); return key && normalized(model.school).includes(aliases[key] || key);
  });
}
function sourceRows(task, models) {
  const refs = [...list(task.sources)];
  for (const context of list(task.contexts)) {
    const sources = new Map(list(models.get(context.modelId)?.sources).map(source => [source.id, source]));
    for (const id of list(context.sourceIds)) { const source = sources.get(id); if (source) refs.push(source); }
  }
  const urls = new Map();
  for (const source of refs) {
    const url = publicUrl(source.url); if (!url) continue;
    if (!urls.has(url)) urls.set(url, {url, evidenceHashes:[]});
    const digest = source.hash || source.sourceContentHash || source.sha256;
    if (digest) urls.get(url).evidenceHashes.push(digest);
  }
  return [...urls.values()].map(row => ({...row, evidenceHashes:unique(row.evidenceHashes)})).sort((a,b) => a.url.localeCompare(b.url, 'en'));
}
function exactContext(context, finding) {
  return context.code === finding.code && ['requirementIds', 'optionIds', 'sourceIds'].every(key => sameSet(context[key], finding[key]));
}
function matchingRows(task, context, model) {
  return list(model.requirements).filter(row => list(context.requirementIds).includes(row.id)).filter(row => {
    if (task.kind === 'named-course-pool') return same({slotKind:row.slot?.kind || null, label:row.slot?.label || row.title,
      upperOnly:row.upperOnly === true || row.upper === true, allowedCodes:unique(list(row.allowedCourseCodes)),
      allowedPrefixes:unique([...list(row.allowedCoursePrefixes), ...list(row.allowedPrefixes)])},
    {slotKind:task.slotKind, label:task.label, upperOnly:task.upperOnly, allowedCodes:task.allowedCodes, allowedPrefixes:task.allowedPrefixes});
    return true;
  });
}
function matchingOptions(task, context, model) {
  const sources = new Map(list(model.sources).map(source => [source.id,source]));
  return matchingRows(task, context, model).flatMap(row => list(row.options).filter(option => list(context.optionIds).includes(option.id)).filter(option => {
    const receiving = option.universityMapRecord || option.mappingEvidence || {};
    return same({provider:option.provider, sourceCourse:code(option.code), courseVersion:option.courseVersion ?? null,
      sourceCredits:option.sourceCredits ?? null, sourceCreditSystem:option.sourceCreditSystem ?? null, creditOrigin:option.creditOrigin || null,
      receivingCode:code(option.receivingCode || row.code) || null, receivingCategory:option.receivingCategory || null,
      receivingCredits:option.credits, receivingCreditSystem:option.creditSystem || model.creditSystem,
      receivingProgramId:receiving.programId ?? null, agreementId:receiving.agreementId ?? null,
      recommendationStart:option.recommendationStart || null, recommendationEnd:option.recommendationEnd || null,
      sourceEvidence:unique(list(option.sourceIds).map(id=>sources.get(id)).filter(Boolean).map(source=>metadataDigest({url:source.url,hash:source.sourceContentHash || source.sha256 || null,kind:source.kind || null})))},
    Object.fromEntries(['provider','sourceCourse','courseVersion','sourceCredits','sourceCreditSystem','creditOrigin','receivingCode','receivingCategory',
      'receivingCredits','receivingCreditSystem','receivingProgramId','agreementId','recommendationStart','recommendationEnd','sourceEvidence'].map(key => [key, task[key]])));
  }).map(option => ({requirementId:row.id, optionId:option.id})));
}
function hold(finding, reason) {
  return {findingId:finding.id, code:finding.code, message:finding.message || null, owner:finding.owner || null, reason,
    requirementIds:unique(list(finding.requirementIds)), optionIds:unique(list(finding.optionIds)), sourceIds:unique(list(finding.sourceIds))};
}
function dependenciesFor(model, program, taskContexts) {
  const blockers = list(program.findings).filter(finding => finding.blocking === true), taskIds = [], unrepresented = [];
  const findingDependencies = blockers.map(finding => {
    const matched = list(taskContexts.get(model.id)).filter(({context}) => context.findingId === finding.id);
    for (const {task, context} of matched) {
      assert(exactContext(context, finding), 'Stale task finding context: ' + task.id + '/' + finding.id);
      assert(same(task.scope, cohortScope(model)), 'Research task escaped its exact academic scope: ' + task.id + '/' + model.id);
      if (['receiving-award','provider-identity'].includes(task.kind)) assert(matchingOptions(task, context, model).length, 'Stale original-course or receiving-award identity: ' + task.id);
      if (task.kind === 'named-course-pool') assert(matchingRows(task, context, model).length, 'Stale named course pool: ' + task.id);
      if (task.kind === 'program-review') assert(task.modelId === model.id && task.code === finding.code, 'Program-specific review escaped its program: ' + task.id);
      if (task.kind === 'school-policy') assert(task.field === finding.field, 'Stale policy field: ' + task.id);
    }
    let complete = matched.length > 0;
    if (finding.code === 'open-course-choice') complete = matched.length > 0 && list(finding.requirementIds).length > 0 && list(finding.requirementIds).every(id => matched.some(({task,context}) => task.kind === 'named-course-pool' && matchingRows(task,context,model).some(row => row.id === id)));
    if (['mapping-evidence','conditional-award','provider-identity','provider-course-identity'].includes(finding.code) && list(finding.optionIds).length) {
      const pairs = list(model.requirements).filter(row => list(finding.requirementIds).includes(row.id)).flatMap(row => list(row.options).filter(option => finding.optionIds.includes(option.id)).map(option => ({requirementId:row.id, optionId:option.id})));
      complete = pairs.length > 0 && pairs.every(pair => matched.some(({task,context}) => ['receiving-award','provider-identity'].includes(task.kind) && matchingOptions(task,context,model).some(item => same(item,pair))));
    }
    const ids = unique(matched.map(({task}) => task.id)); taskIds.push(...ids);
    if (!complete) unrepresented.push(hold(finding, 'The exact blocking finding is not fully represented by the research task queue.'));
    return {findingId:finding.id, code:finding.code, taskIds:ids, fullyRepresented:complete};
  });
  // Publication gates can exist outside findings (for example, too few mapped
  // transfer credits). Completing a queue cannot silently remove those gates.
  for (const reason of unique(list(program.publication?.reasonCodes))) if (!blockers.some(finding => finding.code === reason)) {
    unrepresented.push({findingId:null, code:reason, owner:null, reason:'Publication hold has no blocking finding/task dependency; separate evidence and a fresh assessment are required.', requirementIds:[], optionIds:[], sourceIds:[]});
  }
  if (!blockers.length && !unrepresented.length) unrepresented.push({findingId:null, code:'unexplained-publication-hold', owner:null, reason:'The program is not published but has no represented publication blockers.', requirementIds:[], optionIds:[], sourceIds:[]});
  return {dependencyTaskIds:unique(taskIds), blockingFindingIds:unique(blockers.map(finding => finding.id)), findingDependencies,
    unrepresentedBlockers:unrepresented, potentialReadyIfAllResearchSucceeds:unrepresented.length === 0};
}
function validateInputs({models,quality,queue,publication,registry,asOf,maxInputAgeDays}) {
  const today = date(asOf); assert(Number.isInteger(maxInputAgeDays) && maxInputAgeDays >= 0, 'maxInputAgeDays must be a non-negative integer.');
  assert(typeof registry?.revision === 'string' && registry.revision, 'Academic registry revision is required.');
  for (const [name, value] of Object.entries({quality,queue,publication,registry})) {
    assert(value && (value.registryRevision || value.revision) === registry.revision, 'Stale or mismatched ' + name + ' registry revision.');
    const stamp = date(value.asOf); assert(stamp <= today, name + ' has a future input date.');
    assert(value.asOf === quality.asOf, 'Stale or mismatched ' + name + ' asOf date.');
    assert(today - stamp <= maxInputAgeDays * 86400000, name + ' snapshot is stale; refresh the academic artifacts.');
  }
  const byModel = keyed(models, 'id', 'model'), programs = keyed(quality.programs, 'modelId', 'quality program');
  assert(sameSet([...byModel.keys()], [...programs.keys()]), 'Stale quality/model inventory.');
  if (registry.programs) assert(sameSet(list(registry.programs).map(row => row.id), [...byModel.keys()]), 'Stale registry/model inventory.');
  const qualityReady = unique(list(quality.programs).filter(p => p.publication?.ready === true).map(p => p.modelId));
  const published = keyed(publication.plans, 'modelId', 'published plan');
  assert([...published.values()].every(plan => plan.publicationReady === true) && sameSet([...published.keys()], qualityReady), 'Stale publication/quality readiness inventory.');
  assert(queue.automaticApprovals === 0, 'Research queue must not assert automatic approvals.');
  for (const model of models) for (const source of list(model.sources)) for (const key of ['checked','checkedOn','checkedAt']) {
    if (source[key] !== undefined) { const stamp = date(source[key]); assert(stamp <= today && source[key] <= quality.asOf, 'Future or newer source review requires refreshed academic artifacts: ' + model.id + '/' + source.id); }
  }
  const tasks = keyed(queue.tasks, 'id', 'research task'), taskContexts = new Map();
  for (const task of tasks.values()) {
    assert(task.automaticApproval === false, 'A research task cannot assert academic approval.');
    for (const context of list(task.contexts)) {
      const model = byModel.get(context.modelId), program = programs.get(context.modelId);
      assert(model && program, 'Research task references an unknown model: ' + task.id);
      const finding = list(program.findings).find(finding => finding.id === context.findingId && finding.blocking === true);
      assert(finding && exactContext(context, finding), 'Stale or unknown blocking finding context: ' + task.id);
      assert(same(task.scope, cohortScope(model)), 'Research task escaped its exact academic scope: ' + task.id + '/' + model.id);
      if (!taskContexts.has(model.id)) taskContexts.set(model.id, []);
      taskContexts.get(model.id).push({task,context});
    }
  }
  return {byModel,programs,tasks,taskContexts,qualityReady};
}
function evidenceStrength(candidate) {
  // Prefer measured mapped-transfer/CBE value, never a school's marketing cap.
  const fraction = Number.isFinite(candidate.acceleration.outsideFraction) ? candidate.acceleration.outsideFraction : 0;
  return (candidate.acceleration.eligible ? 2 : 0) + fraction;
}
function choose(candidates, taskWork, target) {
  const selected = new Set(), coveredTasks = new Set(), coveredSources = new Set(), steps = [];
  while (selected.size < target) {
    const remaining = candidates.filter(candidate => !selected.has(candidate.modelId)); if (!remaining.length) break;
    const potential = remaining.filter(candidate => candidate.potentialReadyIfAllResearchSucceeds);
    // A hold cannot be scored as a completed degree. Once the currently
    // closable set is exhausted, pick research candidates with the strongest
    // measured acceleration value, then use shared-work yield to break ties.
    const strongest = Math.max(...remaining.map(evidenceStrength));
    const pool = potential.length ? potential : remaining.filter(candidate => evidenceStrength(candidate) === strongest);
    let best;
    for (const seed of pool) {
      const bundle = new Set([...coveredTasks, ...seed.dependencyTaskIds]);
      const unlocked = [seed,...pool.filter(candidate => candidate !== seed && candidate.dependencyTaskIds.every(id => bundle.has(id))).sort((a,b) => evidenceStrength(b)-evidenceStrength(a) || a.modelId.localeCompare(b.modelId,'en'))].slice(0,target-selected.size);
      const newTasks = [...bundle].filter(id => !coveredTasks.has(id));
      const newSources = unique(newTasks.flatMap(id => taskWork.get(id))).filter(id => !coveredSources.has(id));
      const workUnits = newTasks.length + newSources.length;
      const ratio = unlocked.length / Math.max(1,workUnits);
      const value = {seed,unlocked,newTasks,newSources,workUnits,ratio,strength:unlocked.reduce((sum,candidate) => sum+evidenceStrength(candidate),0)};
      if (!best || value.ratio > best.ratio || value.ratio === best.ratio && (value.strength > best.strength || value.strength === best.strength && seed.modelId.localeCompare(best.seed.modelId,'en') < 0)) best = value;
    }
    for (const candidate of best.unlocked) selected.add(candidate.modelId);
    for (const id of best.newTasks) coveredTasks.add(id); for (const id of best.newSources) coveredSources.add(id);
    steps.push({seedModelId:best.seed.modelId, addedModelIds:best.unlocked.map(candidate => candidate.modelId),
      additionalTaskIds:best.newTasks.sort(), additionalSourceWorkGroupIds:best.newSources.sort(),
      wholeProgramsCovered:best.unlocked.length, potentialReadyPrograms:best.unlocked.filter(candidate => candidate.potentialReadyIfAllResearchSucceeds).length,
      marginalWorkUnits:best.workUnits, wholeProgramsPerWorkUnit:best.ratio});
  }
  return {selected, steps};
}

/** Pure: all dates and academic snapshots are supplied, nothing is mutated. */
export function buildCohortPlan({models,quality,queue,publication,registry,programManifests=[],excludeModelIds=[],target=20,school=null,schools=school,asOf=quality?.asOf,maxInputAgeDays=31}={}) {
  assert(Number.isInteger(target) && target >= 1 && target <= 1000, 'target must be an integer from 1 to 1000.');
  const {byModel,programs,tasks,taskContexts,qualityReady} = validateInputs({models,quality,queue,publication,registry,asOf,maxInputAgeDays});
  const ready = new Set(qualityReady);
  const exclusions = new Map(list(excludeModelIds).map(id => [id,'Explicitly excluded from additional program targets; existing records and publication status are retained.']));
  for(const document of list(programManifests)) for(const legacy of list(document.legacyIdentities)) exclusions.set(legacy.modelId,'Explicit legacy identity retained separately; it is not another new degree target and no student records are migrated.');
  const candidates = [...programs.values()].filter(program => !ready.has(program.modelId) && !exclusions.has(program.modelId) && schoolMatches(byModel.get(program.modelId),schools)).map(program => {
    const model = byModel.get(program.modelId), scope = cohortScope(model);
    return {modelId:model.id, title:model.title, scope, scopeFingerprint:fingerprint(scope), ...dependenciesFor(model,program,taskContexts),
      acceleration:{eligible:program.acceleration?.eligible === true, mechanism:program.acceleration?.mechanism ?? null,
        outsideFraction:program.metrics?.outsideFraction ?? null, reason:program.acceleration?.reason ?? null}};
  }).sort((a,b) => a.modelId.localeCompare(b.modelId,'en'));
  const taskSources = new Map([...tasks.values()].map(task => [task.id,sourceRows(task,byModel)]));
  const groupId = url => 'source-work-' + metadataDigest(url).slice(0,24);
  const taskWork = new Map([...tasks.values()].map(task => [task.id, taskSources.get(task.id).length ? taskSources.get(task.id).map(source => groupId(source.url)) : ['unlocated-' + task.id]]));
  const {selected, steps} = choose(candidates,taskWork,target), selectedPrograms = candidates.filter(candidate => selected.has(candidate.modelId));
  const dependencyIds = new Set(selectedPrograms.flatMap(program => program.dependencyTaskIds)), workGroups = new Map();
  const dependencies = [...dependencyIds].sort().map(id => {
    const task = tasks.get(id), contexts = task.contexts.filter(context => selected.has(context.modelId)), sources = taskSources.get(id);
    for (const workId of taskWork.get(id)) {
      const source = sources.find(source => groupId(source.url) === workId);
      if (!workGroups.has(workId)) workGroups.set(workId,{id:workId,url:source?.url ?? null,sourceLocated:Boolean(source),taskIds:[],modelIds:[],scopeFingerprints:[],evidenceHashes:[],automaticApprovals:0});
      const group = workGroups.get(workId); group.taskIds.push(id); group.modelIds.push(...contexts.map(context => context.modelId));
      group.scopeFingerprints.push(fingerprint(task.scope)); group.evidenceHashes.push(...list(source?.evidenceHashes));
    }
    return {...clone(task),contexts:clone(contexts),affectedModelIds:unique(contexts.map(context => context.modelId)),
      sourceTaskFingerprint:fingerprint(task),scopeFingerprint:fingerprint(task.scope),sourceWorkGroupIds:taskWork.get(id),automaticApproval:false};
  });
  const sourceWorkGroups = [...workGroups.values()].map(group => ({...group,...Object.fromEntries(['taskIds','modelIds','scopeFingerprints','evidenceHashes'].map(key => [key,unique(group[key])]))})).sort(byId);
  const sourceInventory = [...byModel.values()].sort(byId).map(model => ({modelId:model.id,sources:list(model.sources).map(source => clone(source)).sort(byId)}));
  const manifest = {schemaVersion:1,asOf,registryRevision:registry.revision,queueRevision:queue.revision ?? null,
    purpose:'Research cohort only. Selection, source capture and completed research do not grant academic approval or publish a plan.',
    algorithm:{name:'completion-yield-greedy-v1',heuristic:true,optimalityClaim:false,workUnit:'one scoped review task plus one distinct source capture group; not hours',
      condition:'Potential-ready counts assume every represented finding is successfully resolved and all publication assessments pass again. Unrepresented holds never count.'},
    targetAdditionalPrograms:target,schoolFilter:schools,academicallyVerified:false,automaticApprovals:0,privateStudentRecordsIncluded:false,
    summary:{currentReady:qualityReady.length,totalModels:models.length,candidateInventory:candidates.length,plannedCandidates:selected.size,
      targetShortfall:Math.max(0,target-selected.size),potentialReady:selectedPrograms.filter(program => program.potentialReadyIfAllResearchSucceeds).length,
      heldCandidates:selectedPrograms.filter(program => !program.potentialReadyIfAllResearchSucceeds).length,dependencyTasks:dependencies.length,
      sourceWorkGroups:sourceWorkGroups.length,automaticApprovals:0},
    currentReadyModelIds:qualityReady,selectedModelIds:[...selected].sort(),programs:selectedPrograms,dependencies,sourceWorkGroups,selectionSteps:steps,
    excludedCandidates:[...exclusions].filter(([modelId]) => byModel.has(modelId)).map(([modelId,reason]) => ({modelId,reason})).sort((a,b) => a.modelId.localeCompare(b.modelId,'en')),
    heldCandidates:candidates.filter(candidate => candidate.unrepresentedBlockers.length).map(candidate => ({modelId:candidate.modelId,selected:selected.has(candidate.modelId),unrepresentedBlockers:candidate.unrepresentedBlockers})),
    fingerprints:{models:fingerprint([...models].sort(byId)),quality:fingerprint(quality),queue:fingerprint(queue),publication:fingerprint(publication),registry:fingerprint(registry),sources:fingerprint(sourceInventory),programManifests:fingerprint(programManifests)}};
  return {...manifest,revision:'research-cohort-v1:' + metadataDigest(manifest)};
}

/** Reads public artifacts only. It does not regenerate or change canonical data. */
export async function readCohortInputs({base=root,asOf=new Date().toISOString().slice(0,10)}={}) {
  const [{models}, quality,queue,publication,registry,programManifestRegistry] = await Promise.all([
    readAcademicInputs(base,{reviewCutoff:asOf}),
    ...['pathway-quality-report','plan-expansion-queue','publication-index','academic-registry'].map(name => readFile(resolve(base,'dist/data',name+'.json'),'utf8').then(JSON.parse)),
    loadProgramManifests({root:base})]);
  return {models,quality,queue,publication,registry,programManifests:programManifestRegistry.documents};
}
export async function planCohort({base=root,asOf=new Date().toISOString().slice(0,10),...options}={}) {
  return buildCohortPlan({...await readCohortInputs({base,asOf}),...options,asOf});
}
export function formatCohortSummary(manifest) {
  const {summary} = manifest;
  return `${summary.currentReady} current ready plans unchanged; ${summary.plannedCandidates} planned candidates (target ${manifest.targetAdditionalPrograms}); ${summary.potentialReady} potential completions if all research succeeds, not academically verified; ${summary.heldCandidates} candidates retain unrepresented holds; 0 automatic approvals.`;
}
async function main() {
  const options = {}, args = process.argv.slice(2); let output;
  for (let i=0;i<args.length;i++) {
    const arg = args[i]; assert(['--target','--school','--as-of','--output'].includes(arg), 'Unknown argument: ' + arg);
    assert(args[i+1] && !args[i+1].startsWith('--'), 'Missing value for ' + arg);
    const value = args[++i]; if(arg === '--output') output=value; else options[{'--target':'target','--school':'school','--as-of':'asOf'}[arg]] = arg === '--target' ? Number(value) : value;
  }
  const manifest = await planCohort(options);
  if(output) await writeFile(resolve(output),JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({revision:manifest.revision,summary:manifest.summary,report:formatCohortSummary(manifest),...(output?{output:resolve(output)}:{selectedModelIds:manifest.selectedModelIds})}));
}
if(process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
