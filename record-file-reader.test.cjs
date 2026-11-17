const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const XLSX = require('xlsx');
const fflate = require('fflate');

const fixtures = path.join(__dirname, 'test-support/fixtures/course-import');
const manifest = require('./test-support/fixtures/course-import/manifest.json');
const Reader = () => require('./dist/record-file-reader.js');
const file = (name, bytes = fs.readFileSync(path.join(fixtures, name)), type = '') => new File([bytes], name, {type});
const pdfModule = () => import('pdfjs-dist/legacy/build/pdf.mjs');

function createReader(t, options = {}) {
  const reader = Reader().create({loadPdf:pdfModule, ...options});
  t.after(() => reader.destroy());
  return reader;
}

function workbookBytes(rows, options = {}) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), options.name || 'Courses');
  workbook.Workbook = {WBProps:{date1904:options.date1904 === true}};
  options.edit?.(workbook.Sheets[workbook.SheetNames[0]], workbook);
  return XLSX.write(workbook, {type:'buffer', bookType:'xlsx'});
}

function inspect(bytes, options = {}) {return Reader().inspectWorkbook(bytes, {XLSX, fflate, ...options});}

test('UTF-8 BOM CSV and TSV remain local text with the original units and fractional credits', async t => {
  const reader = createReader(t);
  for (const [extension, delimiter] of [['csv', ','], ['tsv', '\t']]) {
    const text = ['Provider'+delimiter+'Course code'+delimiter+'Credits'+delimiter+'Credit units', 'Example Quarter College'+delimiter+'ART101'+delimiter+'3.25'+delimiter+'quarter'].join('\r\n');
    const result = await reader.read(file('synthetic-fractional.'+extension, Buffer.from('\ufeff'+text, 'utf8')));
    assert.equal(result.format, extension);
    assert.equal(result.text, text);
    assert.notEqual(result.text.charCodeAt(0), 0xfeff);
    assert.match(result.text, /3\.25/);
    assert.match(result.text, /quarter/);
    assert(Array.isArray(result.warnings));
  }
});

test('the synthetic XLSX fixture preserves typed completion dates, numeric scores and separate credit units', () => {
  const result = inspect(fs.readFileSync(path.join(fixtures, 'mixed-original-course-units.xlsx')));
  assert.equal(result.format, 'xlsx');
  assert.equal(result.rows.length, manifest.expectedMixedRows+1);
  assert.deepEqual(result.rows[0].slice(0, 7), ['Provider','Course code','Course title','Credits','Credit units','Status','Completion date']);
  assert.equal(result.rows[1][3], 3);
  assert.equal(result.rows[1][6], '2025-05-01');
  assert.equal(result.rows[2][4], 'quarter');
  assert.equal(result.rows[2][6], '2025-06-12');
  assert.equal(result.rows[3][4], 'competency-unit');
  assert.equal(result.rows[3][6], '2026-01-20');
  assert.equal(result.rows[4][8], 63);
  assert.equal(result.selectedSheet.name, 'My courses');
  assert.equal(result.dateSystem, '1900');
});

test('XLSX inspection retains raw fractional credits and blanks formula caches and error cells with exact issues', () => {
  const bytes = workbookBytes([
    ['Provider','Course code','Course title','Credits','Completion date','Grade'],
    ['Example College','ART101','Fractional original credit',3.5,null,'A'],
    ['Example College','BAD101','Formula is not a credit award',99,null,'A'],
    ['Example College','ERR101','Unreadable grade',3,null,null]
  ], {edit(sheet) {
    sheet.D2.z = '0';
    sheet.D3 = {t:'n', v:99, f:'SUM(90,9)', z:'0'};
    sheet.F4 = {t:'e', v:7};
  }});
  const result = inspect(bytes);
  assert.equal(result.rows[1][3], 3.5, 'display rounding must not replace original numeric credits');
  assert.equal(result.rows[2][3], null, 'a formula cache must never become an original course quantity');
  assert.equal(result.rows[3][5], null, 'spreadsheet errors remain unresolved');
  assert(result.cellIssues.some(issue => issue.sheet === 'Courses' && issue.row === 3 && issue.column === 4 && issue.address === 'D3' && /formula/i.test(issue.code+' '+issue.message)));
  assert(result.cellIssues.some(issue => issue.address === 'F4' && /error/i.test(issue.code+' '+issue.message)));
  assert.equal(result.sheets[0].formulaCount, 1);
});

test('XLSX 1900 and 1904 date systems use the serial day without rounding away omitted times', () => {
  for (const date1904 of [false, true]) {
    const bytes = workbookBytes([['Completed on','Credits'], [1.99999,3.5]], {date1904, edit(sheet) {sheet.A2.z = 'yyyy-mm-dd hh:mm:ss';}});
    const result = inspect(bytes);
    assert.equal(result.dateSystem, date1904 ? '1904' : '1900');
    assert.equal(result.rows[1][0], date1904 ? '1904-01-02' : '1900-01-01');
    assert.equal(result.rows[1][1], 3.5);
    assert(result.cellIssues.some(issue => issue.address === 'A2' && issue.rawValue === 1.99999 && /time/i.test(issue.code+' '+issue.message)));
  }
});

test('XLSX sheet selection is explicit and reports every source sheet', () => {
  const bytes = workbookBytes([['Course code','Credits'], ['FIRST101',3]], {name:'First sheet', edit(sheet, workbook) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Course code','Credits'], ['SELECTED201',2.75]]), 'Selected records');
  }});
  const result = inspect(bytes, {sheet:'Selected records'});
  assert.deepEqual(result.sheets.map(sheet => sheet.name), ['First sheet','Selected records']);
  assert.equal(result.selectedSheet.name, 'Selected records');
  assert.equal(result.selectedSheet.index, 2);
  assert.equal(result.rows[1][0], 'SELECTED201');
  assert.equal(result.rows[1][1], 2.75);
  assert.throws(() => inspect(bytes, {sheet:'Missing sheet'}), error => /sheet/i.test(error.message));
});

function declaredExpansion(entries, expandedBytes) {
  const archive = Buffer.from(fflate.zipSync(Object.fromEntries(Array.from({length:entries}, (_, index) => ['part-'+index+'.xml', new Uint8Array([1,2,3])]))));
  let changed = 0;
  for (let offset = 0; offset <= archive.length-46; offset++) {
    if (archive.readUInt32LE(offset) === 0x02014b50) {archive.writeUInt32LE(expandedBytes, offset+24); changed++;}
  }
  assert.equal(changed, entries);
  return archive;
}

test('declared ZIP expansion caps reject oversized XLSX data before the spreadsheet parser runs', () => {
  const limits = Reader().limits;
  assert(limits.maxZipBytes > 0 && limits.maxZipEntryBytes > 0);
  let reads = 0;
  const parser = {...XLSX, read() {reads++; throw Error('Spreadsheet parsing must not begin before ZIP size checks.');}};
  const oversizedEntry = declaredExpansion(1, limits.maxZipEntryBytes+1);
  assert.throws(() => Reader().inspectWorkbook(oversizedEntry, {XLSX:parser, fflate}), error => ['xlsx-too-large','xlsx-unsafe'].includes(error.code));
  const entries = Math.ceil(limits.maxZipBytes/limits.maxZipEntryBytes)+1;
  const oversizedTotal = declaredExpansion(entries, limits.maxZipEntryBytes);
  assert.throws(() => Reader().inspectWorkbook(oversizedTotal, {XLSX:parser, fflate}), error => ['xlsx-too-large','xlsx-unsafe'].includes(error.code));
  assert.equal(reads, 0);
});

test('XLSX row and column caps produce a typed failure instead of silently dropping courses', () => {
  const limits = Reader().limits;
  const rows = workbookBytes(Array.from({length:limits.maxRows+1}, (_, index) => ['COURSE'+index,3]));
  const columns = workbookBytes([Array.from({length:limits.maxColumns+1}, (_, index) => 'Column '+index)]);
  for (const bytes of [rows, columns]) assert.throws(() => inspect(bytes), error => error.code === 'xlsx-too-large');
});

test('the file byte cap rejects a file before reading its bytes or starting an extraction', async t => {
  const reader = createReader(t);
  let byteReads = 0;
  await assert.rejects(reader.read({name:'too-large.pdf', size:Reader().limits.maxBytes+1, async arrayBuffer() {byteReads++; return new ArrayBuffer(0);}}), error => error.code === 'file-too-large');
  assert.equal(byteReads, 0);
});

test('the actual PDF extractor recovers the readable synthetic transcript in source line order', async t => {
  const reader = createReader(t), progress = [];
  const result = await reader.read(file('synthetic-transcript.pdf', undefined, 'application/pdf'), {onProgress:value => progress.push(value)});
  assert.equal(result.format, 'pdf');
  assert.equal(result.extractionStatus, 'text');
  assert.equal(result.needsAI, false);
  assert.equal(result.pageCount, 1);
  assert.equal(result.pages.length, 1);
  assert.equal(result.text.trim(), manifest.expectedReadablePdfText);
  assert.deepEqual(result.pages[0].lines, manifest.expectedReadablePdfText.split('\n'));
  assert(result.pages[0].items.length > 0);
  assert(result.pages[0].lineItems.every(line => typeof line.text === 'string' && Number.isFinite(line.y) && Array.isArray(line.items)));
  assert(progress.length > 0);
});

test('an encrypted PDF is a password-protected failure rather than an empty successful import', async t => {
  const reader = createReader(t);
  await assert.rejects(reader.read(file('password-protected-transcript.pdf', undefined, 'application/pdf')), error => error.code === 'password-protected');
});

test('an image-only PDF asks for extraction help and retains its page information', async t => {
  const reader = createReader(t), result = await reader.read(file('image-only-transcript.pdf', undefined, 'application/pdf'));
  assert.equal(result.extractionStatus, 'image-only');
  assert.equal(result.needsAI, true);
  assert.equal(result.pageCount, 1);
  assert.equal(result.pages.length, 1);
  assert.equal(result.text.trim(), '');
  assert.equal(result.pages[0].items.length, 0);
  assert.match(result.message, /scan|image|text|extract/i);
});

test('the PDF page cap stops extraction before reading any page text', async t => {
  let pagesRead = 0, destroyed = 0;
  const document = {numPages:Reader().limits.maxPages+1, async getPage() {pagesRead++; throw Error('An oversized PDF must not begin extracting pages.');}};
  const reader = createReader(t, {loadPdf:async () => ({getDocument() {return {promise:Promise.resolve(document), async destroy() {destroyed++;}};}})});
  await assert.rejects(reader.read(file('synthetic-transcript.pdf')), error => error.code === 'too-many-pages');
  assert.equal(pagesRead, 0);
  assert.equal(destroyed, 1);
});

async function waitUntil(predicate) {
  for (let turn = 0; turn < 100; turn++) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail('the local extraction did not reach its expected pending operation');
}

test('canceling a pending PDF rejects that read and prevents late extraction progress from replacing a newer file', async t => {
  let releaseDocument, started = false, destroyed = 0, pageReads = 0;
  const pendingDocument = new Promise(resolve => {releaseDocument = resolve;});
  const reader = createReader(t, {loadPdf:async () => ({getDocument() {started = true; return {promise:pendingDocument, async destroy() {destroyed++;}};}})});
  const progress = [], pending = reader.read(file('synthetic-transcript.pdf'), {onProgress:value => progress.push(value)});
  const rejected = assert.rejects(pending, error => /abort|cancel|supersed/i.test(error.code+' '+error.name+' '+error.message));
  await waitUntil(() => started);
  reader.cancel();
  const newerText = 'Course code,Credits\nLATEST201,2.75';
  const newer = await reader.read(file('latest.csv', newerText));
  const progressAtCancel = progress.length;
  releaseDocument({numPages:1, async getPage() {pageReads++; return {async getTextContent() {return {items:[{str:'STALE101'}]};}};}});
  await rejected;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(newer.text, newerText);
  assert.equal(pageReads, 0, 'a late loading result must not resume the canceled extraction');
  assert.equal(progress.length, progressAtCancel);
  assert(destroyed > 0);
});

test('an already aborted signal prevents the file read and leaves a later import usable', async t => {
  const reader = createReader(t), controller = new AbortController();
  controller.abort();
  let byteReads = 0;
  const pendingFile = {name:'aborted.csv', size:12, async arrayBuffer() {byteReads++; return new ArrayBuffer(12);}};
  await assert.rejects(reader.read(pendingFile, {signal:controller.signal}), error => /abort|cancel/i.test(error.code+' '+error.name+' '+error.message));
  assert.equal(byteReads, 0);
  const result = await reader.read(file('next.csv', 'Course code,Credits\nNEXT101,3'));
  assert.match(result.text, /NEXT101/);
});

test('the actual XLSX worker reads the synthetic workbook through local vendored libraries only', async () => {
  const dist = path.join(__dirname, 'dist'), listeners = [], replies = [], imports = [], networkCalls = [];
  const forbidden = name => () => {networkCalls.push(name); throw Error('Record extraction must not use the network.');};
  const sandbox = {
    console, URL, TextDecoder, TextEncoder, ArrayBuffer, DataView, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array, Float32Array, Float64Array,
    fetch:forbidden('fetch'), XMLHttpRequest:forbidden('XMLHttpRequest'), WebSocket:forbidden('WebSocket'),
    addEventListener(type, callback) {if (type === 'message') listeners.push(callback);},
    postMessage(value) {replies.push(structuredClone(value));}
  };
  sandbox.self = sandbox;
  const context = vm.createContext(sandbox);
  sandbox.importScripts = (...urls) => {
    for (const url of urls) {
      assert.equal(typeof url, 'string');
      assert(!/^(?:[a-z]+:|\/\/|\/)/i.test(url) && !url.includes('..'), 'worker scripts must use fixed local paths');
      const name = url.split('?')[0];
      const target = path.resolve(dist, name);
      assert(target.startsWith(dist+path.sep));
      imports.push(name);
      vm.runInContext(fs.readFileSync(target, 'utf8'), context, {filename:name});
    }
  };
  vm.runInContext(fs.readFileSync(path.join(dist, 'record-file-worker.js'), 'utf8'), context, {filename:'record-file-worker.js'});
  const bytes = fs.readFileSync(path.join(fixtures, 'mixed-original-course-units.xlsx'));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset+bytes.byteLength);
  const request = {data:{id:1, kind:'xlsx', buffer, sheet:'My courses'}};
  if (typeof sandbox.onmessage === 'function') await sandbox.onmessage(request);
  for (const listener of listeners) await listener(request);
  assert.equal(replies.length, 1);
  assert.equal(replies[0].id, 1);
  assert.equal(replies[0].ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(replies[0].value)), JSON.parse(JSON.stringify(inspect(bytes, {sheet:'My courses'}))));
  assert(imports.some(name => name.includes('xlsx')));
  assert(imports.some(name => name.includes('fflate')));
  assert.deepEqual(networkCalls, []);
});

class FakeFileWorker {
  constructor() {this.messages = []; this.terminated = 0; this.listeners = new Map();}
  postMessage(value) {this.messages.push(structuredClone(value));}
  addEventListener(type, callback) {if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(callback);}
  removeEventListener(type, callback) {this.listeners.get(type)?.delete(callback);}
  terminate() {this.terminated++;}
  captureReply() {
    const handlers = [...(this.listeners.get('message') || []), ...(typeof this.onmessage === 'function' ? [this.onmessage] : [])];
    return data => {for (const handler of handlers) handler({data});};
  }
  reply(data) {this.captureReply()(data);}
}

test('a newer XLSX read terminates the old worker and ignores late or mismatched extraction results', async t => {
  const workers = [], reader = createReader(t, {workerFactory:() => {const worker = new FakeFileWorker(); workers.push(worker); return worker;}});
  const bytes = workbookBytes([['Course code','Credits'], ['ORIGINAL101',3]]);
  const older = reader.read(file('older.xlsx', bytes));
  const olderRejected = assert.rejects(older, error => error.name === 'AbortError' && error.code === 'superseded');
  await waitUntil(() => workers[0]?.messages.length > 0);
  const oldMessage = workers[0].messages[0], oldReply = workers[0].captureReply();
  assert.equal(oldMessage.kind, 'xlsx');
  assert(oldMessage.buffer instanceof ArrayBuffer);
  const newer = reader.read(file('newer.xlsx', bytes));
  newer.catch(() => {});
  await waitUntil(() => workers[1]?.messages.length > 0);
  assert(workers[0].terminated > 0);
  const newMessage = workers[1].messages[0];
  assert.notEqual(oldMessage.id, newMessage.id);
  let settled = false;
  newer.then(() => {settled = true;}, () => {settled = true;});
  const oldValue = {format:'xlsx', rows:[['STALE101',3]], sheets:[], cellIssues:[]};
  oldReply({id:oldMessage.id, ok:true, value:oldValue});
  workers[1].reply({id:String(newMessage.id)+'-wrong', ok:true, value:oldValue});
  await Promise.resolve();
  assert.equal(settled, false);
  const newValue = {format:'xlsx', rows:[['LATEST201',2.75]], sheets:[], cellIssues:[]};
  workers[1].reply({id:newMessage.id, ok:true, value:newValue});
  const result = await newer;
  await olderRejected;
  assert.deepEqual(result.rows, newValue.rows);
  assert.equal(workers[1].terminated, 1);
});

const PNG_MAGIC = Buffer.from([137,80,78,71,13,10,26,10]);

function fakePdfRenderer(t, options = {}) {
  const sizes = options.sizes || [{width:1000,height:2000}];
  const stats = {documents:0, pageRequests:[], renders:[], canvases:[], encoded:0, destroyed:0};
  const pages = sizes.map((size, index) => ({
    getViewport({scale}) {return {width:size.width*scale, height:size.height*scale, transform:[scale,0,0,scale,0,0]};},
    async getTextContent() {return {items:[{str:'Synthetic page '+(index+1), transform:[1,0,0,1,0,10], width:100, height:10}]};},
    render({canvasContext, viewport}) {
      const canvas = canvasContext.canvas;
      canvas.pageNumber = index+1;
      const entry = {page:index+1, width:canvas.width, height:canvas.height, viewport, cancelled:0};
      stats.renders.push(entry);
      return {promise:options.renderPromise ? options.renderPromise(entry) : Promise.resolve(), cancel() {entry.cancelled++;}};
    },
    cleanup() {}
  }));
  const reader = createReader(t, {
    loadPdf:async () => ({getDocument() {stats.documents++; return {promise:Promise.resolve({numPages:pages.length, async getPage(number) {stats.pageRequests.push(number); return pages[number-1];}}), async destroy() {stats.destroyed++;}};}}),
    createCanvas(width, height) {
      const canvas = {
        width, height,
        getContext() {return {canvas:this};},
        async convertToBlob() {
          stats.encoded++;
          const length = options.blobSize ? options.blobSize(this) : PNG_MAGIC.length+this.pageNumber;
          const bytes = new Uint8Array(length);
          bytes.set(PNG_MAGIC);
          bytes.fill(this.pageNumber, PNG_MAGIC.length);
          return new Blob([bytes], {type:'image/png'});
        }
      };
      stats.canvases.push(canvas);
      return canvas;
    }
  });
  return {reader, stats, file:file('synthetic-render.pdf', '%PDF-1.7\nSynthetic test data\n')};
}

test('native PDF text reading never renders pages or creates AI image canvases', async t => {
  const harness = fakePdfRenderer(t, {sizes:[{width:1000,height:2000},{width:2000,height:1000}]});
  const result = await harness.reader.read(harness.file);
  assert.equal(result.text, 'Synthetic page 1\n\nSynthetic page 2');
  assert.equal(result.needsAI, false);
  assert.equal(harness.stats.renders.length, 0);
  assert.equal(harness.stats.canvases.length, 0);
  assert.equal(harness.stats.encoded, 0);
});

test('explicit AI rendering preserves page order and reports exact PNG byte and downsampled pixel totals', async t => {
  const harness = fakePdfRenderer(t, {sizes:[{width:1000,height:2000},{width:4000,height:2000},{width:1000,height:1000}]}), progress = [];
  const result = await harness.reader.renderForAI(harness.file, {maxTotalPixels:2000000, maxDimension:10000, onProgress:value => progress.push(value)});
  assert.deepEqual(result.pages.map(page => page.page), [1,2,3]);
  let decodedBytes = 0;
  for (const page of result.pages) {
    assert.equal(page.mediaType, 'image/png');
    const bytes = Buffer.from(page.data, 'base64');
    assert.deepEqual(bytes.subarray(0, PNG_MAGIC.length), PNG_MAGIC);
    assert(bytes.subarray(PNG_MAGIC.length).every(value => value === page.page));
    assert(bytes.length <= 2*1024*1024);
    decodedBytes += bytes.length;
  }
  assert.equal(result.totalBytes, decodedBytes);
  assert.equal(result.totalBytes, 30);
  assert(result.totalBytes <= 8*1024*1024);
  assert.equal(result.totalPixels, 2000000);
  assert.equal(result.totalPixels, harness.stats.renders.reduce((sum, render) => sum+render.width*render.height, 0));
  assert(harness.stats.renders.every(render => Math.max(render.width,render.height) <= 2000));
  assert(harness.stats.canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
  assert.deepEqual(progress.map(value => value.page), [1,2,3]);
});

test('AI rendering rejects a PDF above the page cap before silently dropping or rendering any page', async t => {
  const harness = fakePdfRenderer(t, {sizes:Array.from({length:26}, () => ({width:1000,height:2000}))});
  await assert.rejects(harness.reader.renderForAI(harness.file, {maxPages:100}), error => error.code === 'ai-too-many-pages');
  assert.deepEqual(harness.stats.pageRequests, []);
  assert.equal(harness.stats.renders.length, 0);
  assert.equal(harness.stats.canvases.length, 0);
});

test('oversized PNGs hit bounded retries and the readable resolution floor without returning partial pages', async t => {
  for (const scenario of [{pages:1, dimension:2000, blobBytes:2*1024*1024+1},{pages:1, dimension:900, blobBytes:2*1024*1024+1},{pages:5, dimension:2000, blobBytes:2*1024*1024}]) {
    const harness = fakePdfRenderer(t, {sizes:Array.from({length:scenario.pages}, () => ({width:1000,height:1000})), blobSize:() => scenario.blobBytes}), progress = [];
    await assert.rejects(harness.reader.renderForAI(harness.file, {maxDimension:scenario.dimension, onProgress:value => progress.push(value)}), error => error.code === 'ai-image-too-large');
    assert(harness.stats.renders.length >= 1 && harness.stats.renders.length <= 5);
    assert(harness.stats.renders.every(render => render.page === 1), 'the first oversized page cannot be skipped');
    assert(harness.stats.renders.every(render => Math.max(render.width,render.height) >= 800));
    for (let index = 1; index < harness.stats.renders.length; index++) assert(harness.stats.renders[index].width < harness.stats.renders[index-1].width);
    assert(harness.stats.canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
    assert.deepEqual(progress, []);
  }
});

test('canceling AI rendering cancels its render task, clears canvases and suppresses late image progress', async t => {
  let finishRender;
  const pendingRender = new Promise(resolve => {finishRender = resolve;});
  const harness = fakePdfRenderer(t, {renderPromise:() => pendingRender}), progress = [];
  const pending = harness.reader.renderForAI(harness.file, {onProgress:value => progress.push(value)});
  const rejected = assert.rejects(pending, error => error.name === 'AbortError' && error.code === 'cancelled');
  await waitUntil(() => harness.stats.renders.length === 1);
  harness.reader.cancel();
  assert(harness.stats.renders[0].cancelled > 0);
  assert(harness.stats.canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
  finishRender();
  await rejected;
  assert.equal(harness.stats.encoded, 0);
  assert.deepEqual(progress, []);
});

test('the actual image-only PDF rasterizes locally into a PNG within the AI image budgets', async t => {
  const {createCanvas} = require('@napi-rs/canvas'), canvases = [];
  const reader = createReader(t, {createCanvas(width,height) {const canvas = createCanvas(width,height); canvases.push(canvas); return canvas;}});
  const result = await reader.renderForAI(file('image-only-transcript.pdf', undefined, 'application/pdf'));
  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0].page, 1);
  assert.equal(result.pages[0].mediaType, 'image/png');
  const bytes = Buffer.from(result.pages[0].data, 'base64');
  assert.deepEqual(bytes.subarray(0, PNG_MAGIC.length), PNG_MAGIC);
  assert.equal(result.totalBytes, bytes.length);
  assert(bytes.length > PNG_MAGIC.length && bytes.length <= 2*1024*1024);
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  assert.equal(result.totalPixels, width*height);
  assert(Math.max(width,height) <= 2000);
  assert(result.totalPixels <= 40000000);
  assert(canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
});

test('PDF text streams cancel on overflow and abort without continuing late text extraction', async t => {
  for (const mode of ['overflow','abort']) {
    let finishChunk, reads = 0, cancelled = 0, unlocked = 0;
    const waitingChunk = new Promise(resolve => {finishChunk = resolve;});
    const streamReader = {
      async read() {reads++; return mode === 'overflow' ? {done:false,value:{items:Array.from({length:Reader().limits.maxPdfPageItems+1}, () => ({str:'synthetic'}))}} : waitingChunk;},
      async cancel() {cancelled++;}, releaseLock() {unlocked++;}
    };
    const page = {getViewport() {return {width:100,height:200,transform:[1,0,0,1,0,0]};}, streamTextContent() {return {getReader() {return streamReader;}};}};
    const reader = createReader(t, {loadPdf:async () => ({getDocument() {return {promise:Promise.resolve({numPages:1, async getPage() {return page;}}), async destroy() {}};}})}), progress = [];
    const pending = reader.read(file('stream-test.pdf', '%PDF-1.7\nSynthetic stream test\n'), {onProgress:value => progress.push(value)});
    const rejected = assert.rejects(pending, error => mode === 'overflow' ? error.code === 'pdf-too-much-text' : error.name === 'AbortError' && error.code === 'cancelled');
    await waitUntil(() => reads > 0);
    if (mode === 'abort') {reader.cancel(); finishChunk({done:false,value:{items:[{str:'LATE101'}]}});}
    await rejected;
    assert(cancelled > 0);
    assert.equal(unlocked, 1);
    assert.equal(reads, 1);
    assert.deepEqual(progress.map(value => value.page), [0]);
  }
});
