const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Engine = require('./dist/plan-comparison-engine.js');
const Journey = require('./dist/journey-engine.js');
const Sheet = require('./dist/sheet-state.js');
const Catalog = require('./dist/program-catalog.js');

const dist = path.join(__dirname, 'dist');
const serializable = value => JSON.parse(JSON.stringify(value));

function fixture() {
  const fullCatalog = Catalog.merge(require('./dist/data/pathways.json'), require('./dist/data/program-catalog.json'));
  const route = fullCatalog.pathways.find(item => item.modelId === 'liberty-business-residential');
  assert(route, 'the production Liberty route must remain available');
  const catalog = {...fullCatalog, pathways:[route]};
  const state = Journey.initialize(Sheet.selectPathway(Sheet.initialize(null, null, catalog), route), null, catalog);
  state.learning = [{id:'local-student-record', provider:'Sophia', code:'SOPH-0015', title:'English Composition I', credits:3, creditSystem:'semester', status:'earned', evaluations:[]}];
  state.sheet.notes = {'liberty-business-residential':{'engl-101':'Synthetic private planning note'}};
  return {state, catalog, models:[require('./dist/data/liberty.json')], costs:require('./dist/data/cost-comparisons.json'), options:{selectedIds:['current'], deferMatrix:true}};
}

function localWorker() {
  const imports = [], messages = [], progress = [], listeners = new Set(), networkCalls = [];
  const forbidden = name => (...args) => {networkCalls.push({name,args}); throw Error('No network is available in a comparison worker test.');};
  const sandbox = {
    console, URL, URLSearchParams, Intl,
    fetch:forbidden('fetch'), XMLHttpRequest:forbidden('XMLHttpRequest'), WebSocket:forbidden('WebSocket'), EventSource:forbidden('EventSource'),
    postMessage(value) {messages.push(structuredClone(value));},
    addEventListener(type, callback) {if (type === 'message') listeners.add(callback);}
  };
  sandbox.self = sandbox;
  const context = vm.createContext(sandbox);
  sandbox.importScripts = (...urls) => {
    for (const url of urls) {
      assert.match(url, /^(?:\.\/)?[a-z0-9-]+\.js(?:\?[a-z0-9=._-]+)?$/i, 'worker imports must be fixed scripts in the local dist directory');
      const filename = url.replace(/^\.\//, '').split('?')[0];
      imports.push(filename);
      vm.runInContext(fs.readFileSync(path.join(dist, filename), 'utf8'), context, {filename});
    }
  };
  vm.runInContext(fs.readFileSync(path.join(dist, 'degree-comparison-worker.js'), 'utf8'), context, {filename:'degree-comparison-worker.js'});
  return {
    imports, messages, progress, networkCalls,
    async dispatch(data) {
      const event = {data:structuredClone(data)};
      if (typeof sandbox.onmessage === 'function') await sandbox.onmessage(event);
      for (const listener of listeners) await listener(event);
      const replies = messages.splice(0), terminal = replies.filter(message => typeof message.ok === 'boolean');
      assert.equal(terminal.length, 1, 'one worker request produces exactly one terminal response');
      for (const message of replies.filter(message => message.event === 'progress')) {
        assert.equal(message.id, data.id, 'every progress update belongs to the original local request');
        assert.equal('ok' in message, false, 'progress is nonterminal');
        progress.push(message);
      }
      assert.equal(replies.at(-1), terminal[0], 'the final result follows all progress updates');
      return terminal[0];
    }
  };
}

test('the actual classic worker builds the production Liberty comparison using only local UMD modules', async () => {
  const payload = fixture(), before = structuredClone(payload), expected = Engine.build(payload.state, payload.catalog, payload.models, payload.costs, payload.options);
  assert.equal(expected.scenarios.length, 1);
  assert.equal(expected.scenarios[0].available, true);
  assert.equal(expected.scenarios[0].summary.applicableCompletedCredits, 3);
  const worker = localWorker();
  const response = await worker.dispatch({id:1, kind:'build', payload});
  assert.equal(response.id, 1);
  assert.equal(response.ok, true);
  assert.deepEqual(serializable(response.value), serializable(expected));
  assert.equal(worker.progress[0].value.phase, 'started');
  assert.deepEqual(worker.progress[0].value.matchingRouteIds, ['current']);
  assert.equal(worker.progress[1].value.phase, 'candidate');
  assert.equal(worker.progress[1].value.candidate.summary.applicableCompletedCredits, 3);
  assert.equal(worker.progress[1].value.complete, false);
  assert.equal(worker.progress[1].value.recommendation, null);
  assert.equal(JSON.stringify(worker.progress).includes('Synthetic private planning note'), false);
  assert.equal(JSON.stringify(worker.progress).includes('local-student-record'), false);
  assert.deepEqual(payload, before, 'the original student state remains unchanged');
  assert(worker.imports.includes('plan-comparison-engine.js'), 'the worker must load the production comparison engine');
  assert.equal(new Set(worker.imports).size, worker.imports.length);
  assert.deepEqual(worker.networkCalls, []);
});

test('the actual classic worker computes deferred course cells with the production matrix engine', async () => {
  const data = fixture(), view = Engine.build(data.state, data.catalog, data.models, data.costs, data.options);
  assert.equal(view.matrixDeferred, true);
  assert.deepEqual(view.matrix, []);
  const payload = {view, catalog:data.catalog, models:data.models}, before = structuredClone(payload);
  const expected = Engine.courseMatrix(view, data.catalog, data.models), worker = localWorker();
  const response = await worker.dispatch({id:42, kind:'matrix', payload});
  assert.equal(response.id, 42);
  assert.equal(response.ok, true);
  assert.deepEqual(serializable(response.value), serializable(expected));
  assert.deepEqual(payload, before);
  assert.deepEqual(worker.networkCalls, []);
});

test('the actual classic worker builds the production draft used to save a plan version', async () => {
  const data = fixture(), payload = {state:data.state, catalog:data.catalog, models:data.models}, before = structuredClone(payload);
  const expected = Journey.buildDraft(payload.state, payload.catalog, payload.models), worker = localWorker();
  const response = await worker.dispatch({id:43, kind:'draft', payload});
  assert.equal(response.id, 43);
  assert.equal(response.ok, true);
  assert.deepEqual(serializable(response.value), serializable(expected));
  assert.deepEqual(payload, before, 'saving a draft calculation leaves the original records unchanged');
  assert(worker.imports.includes('journey-engine.js'));
  assert.deepEqual(worker.networkCalls, []);
});

test('the actual classic worker reports unreadable inputs as a correlated local error', async () => {
  const worker = localWorker(), response = await worker.dispatch({id:3, kind:'build', payload:{url:'https://example.invalid/private'}});
  assert.equal(response.id, 3);
  assert.equal(response.ok, false);
  assert(response.error, 'the failure is usable by the runner');
  assert.deepEqual(worker.networkCalls, []);
});

class FakeWorker {
  constructor() {this.messages = []; this.terminateCount = 0; this.listeners = new Map();}
  postMessage(message) {this.messages.push(structuredClone(message));}
  addEventListener(type, callback) {if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(callback);}
  removeEventListener(type, callback) {this.listeners.get(type)?.delete(callback);}
  terminate() {this.terminateCount++;}
  captureReply() {
    const callbacks = [...(this.listeners.get('message') || []), ...(typeof this.onmessage === 'function' ? [this.onmessage] : [])];
    return value => {for (const callback of callbacks) callback({data:value});};
  }
  reply(value) {this.captureReply()(value);}
}

function createRunner(t, options = {}) {
  const workers = [], Runner = require('./dist/comparison-runner.js');
  const runner = Runner.create({delayMs:0, timeoutMs:1000, workerFactory:() => {const worker = new FakeWorker(); workers.push(worker); return worker;}, ...options});
  t.after(() => runner.destroy());
  return {runner, workers};
}

async function waitForMessage(workers, index = 0) {
  for (let turn = 0; turn < 100; turn++) {
    if (workers[index]?.messages.length) return workers[index].messages[0];
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  assert.fail('runner did not send its queued local worker request');
}

test('new comparison work terminates the previous job and late replies cannot replace the newest result', async t => {
  const {runner, workers} = createRunner(t), first = runner.run('build', {state:{learning:[{id:'older'}]}});
  const rejected = assert.rejects(first, error => error.code === 'superseded');
  const firstMessage = await waitForMessage(workers), lateReply = workers[0].captureReply();
  const latest = runner.run('build', {state:{learning:[{id:'newer'}]}}), secondMessage = await waitForMessage(workers, 1);
  assert.equal(workers[0].terminateCount, 1);
  assert.notEqual(firstMessage.id, secondMessage.id);
  assert.equal(workers.length, 2, 'each run owns a separate worker');
  let latestSettled = false;
  latest.then(() => {latestSettled = true;}, () => {latestSettled = true;});
  lateReply({id:firstMessage.id, ok:true, value:'outdated'});
  await Promise.resolve();
  assert.equal(latestSettled, false);
  workers[1].reply({id:secondMessage.id, ok:true, value:'current'});
  assert.equal(await latest, 'current');
  await rejected;
});

test('a mismatched reply id is ignored until the current job replies', async t => {
  const {runner, workers} = createRunner(t), result = runner.run('matrix', {view:{courses:[]}}), request = await waitForMessage(workers);
  let settled = false;
  result.then(() => {settled = true;}, () => {settled = true;});
  workers[0].reply({id:String(request.id)+'-wrong', ok:true, value:'wrong'});
  await Promise.resolve();
  assert.equal(settled, false);
  workers[0].reply({id:request.id, ok:true, value:[]});
  assert.deepEqual(await result, []);
});

test('progress is nonterminal and late progress cannot survive completion or supersession', async t => {
  const progress = [], {runner, workers} = createRunner(t);
  const first = runner.run('build', {state:{}}, {onProgress:value => progress.push(value)}), firstRequest = await waitForMessage(workers);
  let settled = false;
  first.then(() => {settled = true;}, () => {settled = true;});
  const lateFirst = workers[0].captureReply();
  lateFirst({id:firstRequest.id+100, event:'progress', value:'mismatched'});
  lateFirst({id:firstRequest.id, event:'progress', value:'first candidate'});
  await Promise.resolve();
  assert.deepEqual(progress, ['first candidate']);
  assert.equal(settled, false);
  assert.equal(workers[0].terminateCount, 0);
  const rejected = assert.rejects(first, error => error.code === 'superseded');
  const second = runner.run('build', {state:{}}, {onProgress:value => progress.push(value)}), secondRequest = await waitForMessage(workers, 1);
  lateFirst({id:firstRequest.id, event:'progress', value:'superseded candidate'});
  const lateSecond = workers[1].captureReply();
  lateSecond({id:secondRequest.id, event:'progress', value:'second candidate'});
  lateSecond({id:secondRequest.id, ok:true, value:'finished'});
  assert.equal(await second, 'finished');
  lateSecond({id:secondRequest.id, event:'progress', value:'after completion'});
  assert.deepEqual(progress, ['first candidate','second candidate']);
  await rejected;
});

test('a throwing progress callback cannot fail the authoritative result or enter the worker payload', async t => {
  const {runner, workers} = createRunner(t);
  let calls = 0;
  const result = runner.run('build', {state:{}}, {onProgress() {calls++; throw Error('Presentation failed');}}), request = await waitForMessage(workers);
  assert.deepEqual(Object.keys(request).sort(), ['id','kind','payload']);
  workers[0].reply({id:request.id, event:'progress', value:{phase:'candidate'}});
  workers[0].reply({id:request.id, ok:true, value:'authoritative result'});
  assert.equal(await result, 'authoritative result');
  assert.equal(calls, 1);
});

test('progress neither replaces nor extends the original timeout, and timed-out updates are ignored', async t => {
  const timers = new Map(), workers = [], progress = [];
  let sequence = 0;
  const context = {module:{exports:{}}, setTimeout(callback, delay) {timers.set(++sequence, {callback, delay}); return sequence;}, clearTimeout(id) {timers.delete(id);}};
  vm.runInNewContext(fs.readFileSync(path.join(dist, 'comparison-runner.js'), 'utf8'), context);
  const runner = context.module.exports.create({delayMs:0, timeoutMs:90, workerFactory() {const worker = new FakeWorker(); workers.push(worker); return worker;}});
  t.after(() => runner.destroy());
  const result = runner.run('build', {state:{}}, {onProgress:value => progress.push(value)}), rejected = assert.rejects(result, error => error.code === 'timeout');
  const launch = [...timers.entries()][0];timers.delete(launch[0]);launch[1].callback();
  const request = workers[0].messages[0], timeout = [...timers.entries()][0], reply = workers[0].captureReply();
  assert.equal(timeout[1].delay, 90);
  for (let update = 0; update < 4; update++) {
    reply({id:request.id, event:'progress', value:update});
    assert.equal(timers.size, 1);
    assert.equal(timers.get(timeout[0]), timeout[1], 'progress preserves the same absolute timer');
  }
  timers.delete(timeout[0]);timeout[1].callback();
  await rejected;
  reply({id:request.id, event:'progress', value:'late'});
  assert.deepEqual(progress, [0,1,2,3]);
  assert.equal(workers[0].terminateCount, 1);
});

test('cancel rejects pending work and terminates its worker', async t => {
  const progress = [], {runner, workers} = createRunner(t), result = runner.run('build', {state:{}}, {onProgress:value => progress.push(value)});
  const rejected = assert.rejects(result);
  const request = await waitForMessage(workers), lateReply = workers[0].captureReply();
  runner.cancel();
  await rejected;
  lateReply({id:request.id, event:'progress', value:'after cancel'});
  assert.deepEqual(progress, []);
  assert.equal(workers[0].terminateCount, 1);
});

test('a worker that never responds reaches the bounded timeout and is terminated', async t => {
  const {runner, workers} = createRunner(t, {timeoutMs:20}), result = runner.run('build', {state:{}});
  await assert.rejects(result, error => /time|long/i.test(error.message) || error.code === 'timeout');
  assert.equal(workers.length, 1);
  assert.equal(workers[0].terminateCount, 1);
});

test('runner sends only the requested local computation envelope and preserves private source records', async t => {
  const {runner, workers} = createRunner(t), payload = fixture(), before = structuredClone(payload), result = runner.run('build', payload);
  const request = await waitForMessage(workers);
  assert.deepEqual(Object.keys(request).sort(), ['id','kind','payload']);
  assert.equal(request.kind, 'build');
  assert.deepEqual(request.payload, before);
  assert.deepEqual(payload, before);
  workers[0].reply({id:request.id, ok:true, value:'done'});
  assert.equal(await result, 'done');
});

test('Worker-unavailable fallback visibly reports local execution and yields before calling the engine', async t => {
  const scheduled = new Map(), calls = [], notices = [];
  let token = 0;
  const payload = fixture(), value = {scenarios:[], local:true};
  const {runner} = createRunner(t, {
    workerFactory:() => {throw Error('Worker unavailable');},
    schedule(callback) {scheduled.set(++token, callback); return token;},
    cancelSchedule(id) {scheduled.delete(id);},
    engine:{build(...args) {calls.push(['build', ...args]); return value;}, courseMatrix() {throw Error('wrong engine operation');}},
    onFallback(...args) {notices.push(args);}
  });
  const result = runner.run('build', payload);
  assert.deepEqual(calls, [], 'the expensive engine must not execute in the initiating event handler');
  assert(scheduled.size > 0, 'fallback yields through the supplied scheduler');
  for (let turns = 0; turns < 5 && !calls.length; turns++) {
    const next = scheduled.entries().next().value;
    assert(next, 'fallback remains scheduled until the engine runs');
    scheduled.delete(next[0]);
    next[1]();
    await Promise.resolve();
  }
  assert.equal(await result, value);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'build');
  assert.deepEqual(calls[0].slice(1,6), [payload.state, payload.catalog, payload.models, payload.costs, payload.options]);
  assert.equal(typeof calls[0][6].onProgress, 'function');
  assert(notices.length > 0, 'the page can disclose its local main-thread fallback');
  assert.equal(runner.workerAvailable, false);
});

test('Worker-unavailable fallback dispatches matrix work to courseMatrix', async t => {
  const callbacks = [], calls = [], value = [{course:{id:'local'}}];
  const payload = {view:{courses:[]}, catalog:{pathways:[]}, models:[]};
  const {runner} = createRunner(t, {
    workerFactory:() => {throw Error('Worker unavailable');},
    schedule(callback) {callbacks.push(callback); return callbacks.length;},
    cancelSchedule() {},
    engine:{build() {throw Error('wrong engine operation');}, courseMatrix(...args) {calls.push(args); return value;}}
  });
  const result = runner.run('matrix', payload);
  assert.equal(calls.length, 0);
  for (let turns = 0; turns < 5 && !calls.length; turns++) {assert(callbacks.length); callbacks.shift()(); await Promise.resolve();}
  assert.equal(await result, value);
  assert.deepEqual(calls, [[payload.view, payload.catalog, payload.models]]);
});

test('Worker-unavailable fallback forwards synchronous progress without changing its final result', async t => {
  const callbacks = [], progress = [], value = {scenarios:[], local:true};
  const {runner} = createRunner(t, {
    workerFactory() {throw Error('Worker unavailable');},
    schedule(callback) {callbacks.push(callback); return callbacks.length;}, cancelSchedule() {},
    engine:{build(state, catalog, models, costs, options, runtime) {runtime.onProgress({phase:'started'});runtime.onProgress({phase:'candidate'});return value;}}
  });
  const result = runner.run('build', {state:{}, catalog:{}, models:[], costs:{}}, {onProgress:update => progress.push(update)});
  assert.deepEqual(progress, []);
  for (let turn = 0; turn < 5 && callbacks.length; turn++) {callbacks.shift()();await Promise.resolve();}
  assert.equal(await result, value);
  assert.deepEqual(progress, [{phase:'started'},{phase:'candidate'}]);
});
