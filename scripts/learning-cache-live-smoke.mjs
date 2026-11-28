/** Bounded, real staging evaluation of the ordinary homework API.
 * Credentials are accepted through stdin only. No client field enables caching.
 * Outputs are original synthetic exercises, saved privately for human review.
 */
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';

const ORIGIN = 'https://degreesteps-staging.degreesteps-d215df9a.workers.dev';
const USER_ID = /^sb-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const EMAIL = /^learning-live-qa-[a-f0-9-]+@example\.invalid$/;
const MODES = new Set(['baseline', 'seeded', 'cached']);
const COST_BASIS = 'Application rate card applied to provider-reported usage; not an invoice or provider-console reconciliation';

export function parseEvaluationArguments(args) {
  let mode;
  assert(args.includes('--allow-live-ai'), 'Explicit --allow-live-ai is required.');
  for (let index = 0; index < args.length; index++) {
    const value = args[index];
    if (value === '--allow-live-ai') continue;
    if (value === '--mode') {
      assert(mode === undefined, 'Choose one evaluation mode.');
      mode = args[++index];
    } else if (value.startsWith('--mode=')) {
      assert(mode === undefined, 'Choose one evaluation mode.');
      mode = value.slice(7);
    } else assert.fail('Only --allow-live-ai and --mode are accepted; credentials belong in stdin.');
  }
  assert(MODES.has(mode), 'Choose --mode baseline, seeded or cached.');
  return mode;
}

function credential(value) {
  assert(value && EMAIL.test(value.email), 'Use a synthetic learning-live-qa account.');
  assert(typeof value.password === 'string' && value.password.length >= 24 && value.password.length <= 4096, 'A synthetic account password is required.');
  assert(USER_ID.test(value.expectedUserId), 'Include the exact expected synthetic account ID.');
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function publicRunMetrics(value) {
  if (!value || typeof value !== 'object') return {
    available: false, unavailableReason: 'This deployed API does not expose an authoritative per-run usage receipt.',
    workflow: null, model: null, promptVersion: null, cacheMode: null, cacheStatus: null,
    prefixTokens: null, inputTokens: null, outputTokens: null, cacheWriteTokens: null,
    cacheReadTokens: null, providerDurationMs: null, ttftMs: null,
    ttftStatus: 'not_streamed', ttftUnavailableReason: 'The ordinary API returns a completed non-streamed result; first-token latency is not measured.',
    costMicroUsd: null, estimated: null, costBasis: null, cacheOutcome: null,
  };
  const text = (key) => typeof value[key] === 'string' && /^[a-zA-Z0-9._:-]{1,100}$/.test(value[key]) ? value[key] : null;
  return {
    available: true, workflow: text('workflow'), model: text('model'), promptVersion: text('promptVersion'),
    cacheMode: text('cacheMode'), cacheStatus: text('cacheStatus'), prefixTokens: count(value.prefixTokens),
    inputTokens: count(value.inputTokens), outputTokens: count(value.outputTokens),
    cacheWriteTokens: count(value.cacheWriteTokens), cacheReadTokens: count(value.cacheReadTokens),
    providerDurationMs: count(value.providerDurationMs), ttftMs: null, ttftStatus: 'not_streamed',
    ttftUnavailableReason: 'The ordinary API returns a completed non-streamed result; first-token latency is not measured.',
    costMicroUsd: count(value.costMicroUsd), estimated: typeof value.estimated === 'boolean' ? value.estimated : null,
    costBasis: text('costBasis'),
    cacheOutcome: count(value.cacheReadTokens) > 0
      ? count(value.cacheWriteTokens) > 0 ? 'read-and-write' : 'read'
      : count(value.cacheWriteTokens) > 0 ? 'write' : count(value.cacheReadTokens) === 0 && count(value.cacheWriteTokens) === 0 ? 'none' : null,
  };
}

function spendSnapshot(value) {
  return {
    period: typeof value?.period === 'string' ? value.period : null,
    daily: value?.dailySpend ? {
      day: value.dailySpend.day, costMicroUsd: count(value.dailySpend.costMicroUsd),
      reservedMicroUsd: count(value.dailySpend.reservedMicroUsd), calls: count(value.dailySpend.calls),
    } : null,
    monthly: value?.monthlySpend ? {
      month: value.monthlySpend.month || value.period,
      costMicroUsd: count(value.monthlySpend.costMicroUsd),
      confirmedCostMicroUsd: count(value.monthlySpend.confirmedCostMicroUsd),
      estimatedCostMicroUsd: count(value.monthlySpend.estimatedCostMicroUsd),
      reservedMicroUsd: count(value.monthlySpend.reservedMicroUsd),
      inputTokens: count(value.monthlySpend.inputTokens), outputTokens: count(value.monthlySpend.outputTokens),
      cacheWriteTokens: count(value.monthlySpend.cacheWriteTokens), cacheReadTokens: count(value.monthlySpend.cacheReadTokens),
      completedRuns: count(value.monthlySpend.completedRuns), failedRuns: count(value.monthlySpend.failedRuns),
    } : null,
  };
}

export function scoreHomeworkAnswer(item, content) {
  const checks = (item.checks || []).map(check => {
    const patterns = Array.isArray(check.anyOf) ? check.anyOf : [];
    return {id:check.id,label:check.label,passed:patterns.length>0&&patterns.some(pattern=>new RegExp(pattern,'im').test(content))};
  });
  return {available:checks.length>0,checks,passed:checks.filter(check=>check.passed).length,total:checks.length,
    limitation:'Deterministic checks spot selected expected details; they do not establish correctness, reasoning quality or learning. Human rubric review is required.'};
}

function delta(before, after, key) {
  const a = before?.[key], b = after?.[key];
  return Number.isSafeInteger(a) && Number.isSafeInteger(b) && b >= a ? b - a : null;
}

function safeFailure(error) {
  const safe = {};
  for (const key of ['code', 'providerPhase', 'providerStopReason']) {
    if (typeof error?.[key] === 'string' && /^[a-z_]{1,80}$/.test(error[key])) safe[key] = error[key];
  }
  if (Number.isInteger(error?.status)) safe.status = error.status;
  safe.message = error?.name === 'AbortError' ? 'The bounded staging request timed out.'
    : typeof error?.qaMessage === 'string' ? error.qaMessage
    : error?.code === 'ERR_ASSERTION' ? String(error.message).slice(0,400)
    : 'The staging evaluation could not complete. Inspect the bounded checks in this private receipt.';
  return safe;
}

export async function main(args = process.argv.slice(2), stdin = process.stdin) {
  const mode = parseEvaluationArguments(args);
  let input = '';
  for await (const part of stdin) {
    input += part;
    assert(Buffer.byteLength(input) <= 16000, 'Invalid synthetic account configuration.');
    if (input.includes('\n')) break;
  }
  const config = JSON.parse(input.trim());
  input = '';
  assert.equal(config.origin, ORIGIN, 'Only the fixed staging origin is allowed.');
  credential(config);
  if (config.other) {
    credential(config.other);
    assert.notEqual(config.other.email, config.email, 'Cross-account checks require a different synthetic account.');
    assert.notEqual(config.other.expectedUserId, config.expectedUserId, 'Cross-account checks require a different synthetic account.');
  }
  const reportPath = resolve(config.reportPath || `outputs/learning/cache-live/${mode}-${Date.now()}.json`);
  assert(reportPath.endsWith('.json'), 'Use a JSON receipt filename.');
  assert(reportPath.startsWith(resolve('outputs') + sep) || reportPath.startsWith('/workspace/audits/'), 'Receipts must remain in the ignored QA workspace.');
  const evaluation = await import('../test-support/homework-evaluation.mjs');
  assert(Array.isArray(evaluation.HOMEWORK_EVALUATION_CASES), 'The fixed held-out evaluation fixture is unavailable.');
  const heldOut = evaluation.HOMEWORK_EVALUATION_CASES;
  assert.equal(heldOut.length, 3, 'Exactly three fixed held-out exercises are required.');
  const cases = mode === 'cached' ? evaluation.HOMEWORK_CACHE_PROBE_CASES : heldOut;
  assert(Array.isArray(cases) && cases.length === (mode === 'cached' ? 2 : 3), 'The fixed cache-probe exercises are unavailable.');
  for (const item of cases) assert(item.id && item.title && item.prompt, 'Each fixed exercise needs an ID, title and prompt.');

  const report = {
    kind: 'degreesteps-homework-cache-live-staging-evaluation', mode, startedAt: new Date().toISOString(), origin: ORIGIN,
    heldOutFixtureSha256:createHash('sha256').update(JSON.stringify(heldOut)).digest('hex'),
    caseFixtureSha256:createHash('sha256').update(JSON.stringify(cases)).digest('hex'),
    identity: 'Ephemeral synthetic student accounts', paidPurchases: 0, aiActionsRequested: 0,
    checks: [], outputs: [], costBasis: COST_BASIS, providerConsoleReconciled: false,
    passedScope:'API execution, private persistence and mode-specific cache evidence; educational quality requires the separate human review.',
    quality: {status: 'manual_review_required', automaticChecksAreQualityProof: false, humanReviewCompleted: false},
  };
  const accounts = [{credential:config,cookies:new Map(),courses:[],signedIn:false}];
  if (mode === 'cached' && config.other) accounts.push({credential:config.other,cookies:new Map(),courses:[],signedIn:false});
  let current = accounts[0];
  const record = (name, details = {}) => report.checks.push({name, passed:true,...details});

  async function api(path, {method = 'GET', body, expectedStatus, timeout = 240000} = {}) {
    assert(/^\/api\/[a-zA-Z0-9/?=&_-]+$/.test(path), 'Use a normal same-origin API path.');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout), started = Date.now();
    try {
      const response = await fetch(ORIGIN + path, {
        method, redirect:'manual', signal:controller.signal,
        headers: {
          Accept:'application/json', Cookie:[...current.cookies].map(([name,value])=>name+'='+value).join('; '),
          ...(body === undefined ? {} : {Origin:ORIGIN,'Content-Type':'application/json',
            ...(path.startsWith('/api/auth/') ? {'X-Portal-Request':'1'} : {'X-Learning-Request':'1'})}),
        },
        ...(body === undefined ? {} : {body:JSON.stringify(body)}),
      });
      for (const cookie of response.headers.getSetCookie()) {
        const first = cookie.split(';',1)[0], at = first.indexOf('=');
        if (at > 0) current.cookies.set(first.slice(0,at),first.slice(at+1));
      }
      assert.match(response.headers.get('Cache-Control') || '', /no-store/, 'Private API responses must not be cached by browsers or shared CDNs.');
      const text = await response.text();
      assert(Buffer.byteLength(text) <= 2000000, 'The staging response exceeded its safety bound.');
      let data;
      try { data = JSON.parse(text); }
      catch { throw Object.assign(new Error(),{qaMessage:'The staging API returned non-JSON data.'}); }
      report.checks.push({path:path.replace(/[a-f0-9-]{36}/gi,'[synthetic-id]'),method,status:response.status,durationMs:Date.now()-started});
      if (expectedStatus !== undefined) assert.equal(response.status,expectedStatus,'The expected private-account boundary was not enforced.');
      else if (!response.ok) throw Object.assign(new Error(),{status:response.status,code:data.code,providerPhase:data.providerPhase,providerStopReason:data.providerStopReason,qaMessage:'The staging API rejected '+method+' '+path.replace(/[a-f0-9-]{36}/gi,'[synthetic-id]')+'.'});
      return {data,durationMs:Date.now()-started,finishedAt:Date.now()};
    } finally { clearTimeout(timer); }
  }

  async function signIn(account) {
    current = account;
    const {data} = await api('/api/auth/login',{method:'POST',body:{email:account.credential.email,password:account.credential.password,returnTo:'/learn.html'}});
    account.credential.password = '';
    account.signedIn = true;
    assert.equal(data.user?.id,account.credential.expectedUserId,'The verified account does not match the synthetic account.');
    record('Provider-verified synthetic account sign-in',{account:accounts.indexOf(account)+1});
    const {data:status} = await api('/api/learning/status');
    assert(status.enabled && status.signedIn && status.storageReady && status.aiConfigured,'The staging learning workspace is not ready.');
    const flags = status.homework || null;
    account.homework = flags;
    if (mode !== 'baseline') {
      assert.equal(flags?.examplesEnabled,true,'The expected server-side seeded prompt is not enabled.');
      assert.equal(flags?.cacheEnabled,mode === 'cached','The server cache flag does not match the evaluation mode.');
    } else if (flags) {
      assert.equal(flags.examplesEnabled,false,'Baseline requires server-side examples to be disabled.');
      assert.equal(flags.cacheEnabled,false,'Baseline requires server-side caching to be disabled.');
    }
    const {data:billing} = await api('/api/learning/billing/status');
    assert.equal(billing.paymentsEnabled,false,'Live checkout must remain disabled during this evaluation.');
    account.initialUsage = spendSnapshot(status.usage);
    record('Server-owned mode and disabled checkout checked',{account:accounts.indexOf(account)+1,homework:flags,baselineFlagsUnavailable:mode==='baseline'&&!flags});
  }

  async function createCourse(account) {
    current = account;
    const {data} = await api('/api/learning/courses',{method:'POST',body:{
      title:'Business foundations — synthetic homework evaluation',provider:'DegreeSteps QA',
      syllabus:'Original practice exercises in business mathematics and reasoning. Explain assumptions, show the method, give accurate arithmetic and help the student understand the result. These exercises are synthetic and are not live graded assessments.',
    }});
    assert(data.item?.id,'The synthetic course was not created.');
    account.courses.push(data.item);
    return data.item;
  }

  try {
    await signIn(accounts[0]);
    const primaryCourse = await createCourse(accounts[0]);
    let primaryProject = null, firstCacheFinishedAt = null;
    for (let index = 0; index < cases.length; index++) {
      const item = cases[index], account = index === 1 && accounts.length === 2 ? accounts[1] : accounts[0];
      current = account;
      let course = primaryCourse;
      if (!account.signedIn) {
        await signIn(account);
        await api('/api/learning/courses/'+primaryCourse.id,{expectedStatus:404});
        await api('/api/learning/projects/'+primaryProject.id,{expectedStatus:404});
        record('Second synthetic account cannot read the first account’s course or project');
        course = await createCourse(account);
      } else if (account !== accounts[0]) course = account.courses[0];
      const {data:beforeStatus} = await api('/api/learning/status');
      const before = spendSnapshot(beforeStatus.usage);
      assert.equal(before.daily?.reservedMicroUsd,0,'Wait for this synthetic account’s earlier AI work to settle.');
      const {data:created} = await api('/api/learning/projects',{method:'POST',body:{
        courseId:course.id,kind:'study',title:item.title,prompt:item.prompt,
        studentNotes:item.studentNotes || 'I want to understand the method and check my own reasoning.',sources:[],
      }});
      const project = created.item;
      assert(project?.id,'The synthetic study project was not created.');
      if (!primaryProject) primaryProject = project;
      const submittedAt = Date.now();
      if (mode === 'cached' && index === 1) {
        report.cacheProbeIntervalMs = submittedAt - firstCacheFinishedAt;
        assert(report.cacheProbeIntervalMs < 5*60*1000,'The second cache probe must be submitted within five minutes.');
      }
      assert(report.aiActionsRequested < 3,'The maximum of three real AI actions has been reached.');
      report.aiActionsRequested++;
      const result = await api('/api/learning/projects/'+project.id+'/run',{method:'POST',body:{revision:project.revision,action:'study',requestId:randomUUID()}});
      if (mode === 'cached' && index === 0) firstCacheFinishedAt = result.finishedAt;
      const artifact = result.data.item?.artifact;
      assert(typeof artifact?.content === 'string' && artifact.content.trim(),'The study action returned no usable explanation.');
      const {data:saved} = await api('/api/learning/projects/'+project.id);
      assert.equal(saved.item?.artifact?.content,artifact.content,'The result did not survive a fresh private-account read.');
      const {data:afterStatus} = await api('/api/learning/status');
      const after = spendSnapshot(afterStatus.usage), metrics = publicRunMetrics(result.data.runUsage);
      const automaticChecks = scoreHomeworkAnswer(item,artifact.content);
      report.outputs.push({
        caseId:item.id,caseTitle:item.title,prompt:item.prompt,studentNotes:item.studentNotes || null,
        account:accounts.indexOf(account)+1,submittedAt:new Date(submittedAt).toISOString(),durationMs:result.durationMs,
        nonStreamedTimeToFirstTokenMs:null,nonStreamedTimeToFirstTokenReason:'Not measured: the normal endpoint returns a completed JSON response.',
        serverHomework:account.homework,runUsage:metrics,
        cost:{currency:'USD',rateCardCostMicroUsd:metrics.costMicroUsd,basis:COST_BASIS,providerConsoleReconciled:false,
          observedDailyAccountDeltaMicroUsd:delta(before.daily,after.daily,'costMicroUsd'),
          observedMonthlyAccountDeltaMicroUsd:delta(before.monthly,after.monthly,'costMicroUsd'),
          monthlyDeltaUnavailableReason:!before.monthly||!after.monthly?'The deployed account API does not expose a monthly spend aggregate.':null,
          observedDailyCallDelta:delta(before.daily,after.daily,'calls'),accountWindowMayIncludeConcurrentWork:delta(before.daily,after.daily,'calls')!==1},
        usageBefore:before,usageAfter:after,automaticChecks,expectedForReviewer:item.expected || null,manualRubric:item.manualReview || item.rubric || null,
        manualReview:{status:'pending',reviewer:null,accuracy:null,clarity:null,learningValue:null,notes:null},artifact,
      });
      record('Real study explanation saved and reloaded',{caseId:item.id});
    }
    if (mode === 'cached') {
      const [first,second] = report.outputs.map(output=>output.runUsage);
      assert(first.available&&second.available,'Cache verification requires authoritative per-run usage.');
      for (const item of [first,second]) {
        assert.equal(item.workflow,'learning-homework','The selected workflow is not the homework workflow.');
        assert.equal(item.cacheMode,'explicit-5m','The server did not enable explicit five-minute caching.');
        assert.equal(item.cacheStatus,'verified','The server did not verify the cacheable prefix.');
      }
      assert(first.model&&first.model===second.model,'Both cache probes must use the same server-owned model.');
      assert(first.promptVersion&&first.promptVersion===second.promptVersion,'Both cache probes must use the same prompt version.');
      assert(first.cacheWriteTokens>0,'The first cache probe did not report actual cache-write tokens.');
      assert(second.cacheReadTokens>0,'The second distinct question did not report actual cache-read tokens.');
      record('Two distinct normal API questions demonstrate an actual provider cache write and read',{crossAccount:accounts.length===2});
    }
    if (mode === 'seeded') {
      for (const output of report.outputs) {
        assert(output.runUsage.available,'The seeded comparison requires authoritative per-run usage.');
        assert.equal(output.runUsage.workflow,'learning-homework','The selected workflow is not the homework workflow.');
        assert.equal(output.runUsage.cacheMode,'off','The seeded comparison must keep caching disabled.');
        assert.equal(output.runUsage.cacheWriteTokens,0,'The uncached seeded comparison unexpectedly wrote a provider cache.');
        assert.equal(output.runUsage.cacheReadTokens,0,'The uncached seeded comparison unexpectedly read a provider cache.');
      }
      record('Seeded homework comparison ran with provider caching disabled');
    }
    report.quality.automaticChecksPassed = report.outputs.reduce((total,output)=>total+output.automaticChecks.passed,0);
    report.quality.automaticChecksTotal = report.outputs.reduce((total,output)=>total+output.automaticChecks.total,0);
    report.quality.automaticCheckGaps = report.outputs.flatMap(output=>output.automaticChecks.checks.filter(check=>!check.passed).map(check=>({caseId:output.caseId,checkId:check.id,label:check.label})));
    report.passed = true;
  } catch (error) {
    report.passed = false;
    report.failure = safeFailure(error);
    process.exitCode = 1;
  } finally {
    for (const account of accounts) {
      current = account;
      account.credential.password = '';
      if (!account.signedIn && !account.cookies.size) continue;
      for (const course of account.courses) {
        try {
          const {data} = await api('/api/learning/courses/'+course.id,{timeout:30000});
          await api('/api/learning/courses/'+course.id,{method:'DELETE',body:{revision:data.item.revision},timeout:30000});
          record('Only this evaluation’s synthetic course and child work deleted',{account:accounts.indexOf(account)+1});
        } catch { report.cleanupNeedsOperator = true;(report.cleanupCourseIds ||= []).push(course.id); }
      }
      try { await api('/api/auth/logout',{method:'POST',body:{},timeout:30000});record('Synthetic session signed out',{account:accounts.indexOf(account)+1}); }
      catch { report.cleanupNeedsOperator = true; }
      account.cookies.clear();
    }
    config.password = '';
    if (config.other) config.other.password = '';
    report.finishedAt = new Date().toISOString();
    await mkdir(dirname(reportPath),{recursive:true,mode:0o700});
    await writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
    console.log(JSON.stringify({passed:report.passed,mode,report:reportPath,aiActionsRequested:report.aiActionsRequested,outputs:report.outputs.length,manualReviewRequired:true,cleanupNeedsOperator:report.cleanupNeedsOperator===true}));
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error=>{console.error(JSON.stringify({passed:false,failure:safeFailure(error)}));process.exitCode=1;});
}
