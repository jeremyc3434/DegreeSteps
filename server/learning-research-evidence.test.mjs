import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  canonicalResearchURL, parseResearchSearchCandidates, parseFetchedResearchEvidence, retrieveResearchEvidence,
  selectResearchCandidates, selectResearchEvidence, hasOnlineResearchEvidence,
  getResearchEvidenceProvenance, createResearchFetchTool, MAX_RESEARCH_EVIDENCE_AGE_MS
} from './learning-research-evidence.mjs';

const now = Date.parse('2026-11-28T06:00:00Z');
const passage = 'An inventory policy should distinguish when to order from how much to order. Demand and lead-time uncertainty affect the amount of buffer required.';
const hit = (url, title) => ({type: 'web_search_result', url, title});
const batch = content => ({type: 'web_search_tool_result', content});
const cite = (url, cited_text) => ({type: 'web_search_result_location', url, cited_text});
const fetched = ({url = 'https://www.nist.gov/inventory', text = passage, type = 'text/plain', retrieved = '2026-11-28T05:59:30Z', title = 'Inventory guidance'} = {}) => ({
  type: 'web_fetch_tool_result', tool_use_id: 'actual-fetch', content: {
    type: 'web_fetch_result', url, retrieved_at: retrieved,
    content: {type: 'document', title, source: {type: 'text', media_type: type, data: text}}
  }
});

test('cited results from later searches survive a full first result batch', () => {
  const first = Array.from({length: 8}, (_, index) => hit('https://www.cdc.gov/eoq-' + index, 'EOQ ' + index));
  const message = {content: [batch(first), batch([hit('https://www.nist.gov/jit', 'Just in time')]), batch([hit('https://www.census.gov/buffer', 'Safety stock')]), {type: 'text', citations: [cite('https://www.nist.gov/jit', 'A specific JIT passage.'), cite('https://www.census.gov/buffer', 'A specific buffer passage.')]}]};
  const discoveries = parseResearchSearchCandidates(message);
  assert.equal(discoveries.length, 10, 'candidate extraction must not truncate to the first eight results');
  const selected = selectResearchCandidates({discoveries, now});
  assert.equal(selected.length, 8);
  assert(selected.some(source => source.title === 'Just in time' && source.excerpt === 'A specific JIT passage.'));
  assert(selected.some(source => source.title === 'Safety stock'));
  assert(selected.every(source => !hasOnlineResearchEvidence(source, {now})), 'search passages are not full-page retrieval proof');
});

test('uncited acquisition hints are diversified across completed search batches', () => {
  const discoveries = parseResearchSearchCandidates({content: [
    batch(Array.from({length: 8}, (_, index) => hit('https://www.cdc.gov/a-' + index, 'First topic ' + index))),
    batch([hit('https://www.nist.gov/second-topic', 'Second topic')]),
    batch([hit('https://www.census.gov/third-topic', 'Third topic')])
  ]});
  const selected = selectResearchCandidates({discoveries, limit: 3, now});
  assert.deepEqual(selected.map(source => source.title), ['First topic 0', 'Second topic', 'Third topic']);
});

test('fresh discoveries replace weak cached sources while surviving URL identities stay stable', () => {
  const cachedSources = Array.from({length: 8}, (_, index) => ({id: 'S' + (index + 1), url: 'https://www.cdc.gov/old-' + index, title: 'Cached ' + index, excerpt: ''}));
  const discoveries = parseResearchSearchCandidates({content: [batch([hit('https://www.nist.gov/new-jit', 'Fresh JIT'), hit('https://www.census.gov/new-buffer', 'Fresh buffer')]), {type: 'text', citations: [cite('https://www.nist.gov/new-jit', 'Actual quoted JIT passage.'), cite('https://www.census.gov/new-buffer', 'Actual quoted safety-stock passage.')]}]});
  const selected = selectResearchCandidates({cachedSources, discoveries, now});
  assert.equal(selected.length, 8);
  assert.deepEqual(selected.slice(0, 2).map(source => source.title), ['Fresh JIT', 'Fresh buffer']);
  assert.equal(selected.find(source => source.url === cachedSources[0].url).id, 'S1');
  assert(!['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'].includes(selected[0].id), 'a new URL must not inherit an evicted source ID');
  assert.equal(new Set(selected.map(source => source.id)).size, selected.length);
});

test('student-supplied source IDs survive canonical deduplication and authenticated retrieval', async () => {
  const providedSources = [{id: 'S4', url: 'https://www.nist.gov/inventory?utm_source=course#section', title: 'Assigned reading', excerpt: 'The supplied course passage is private input.'}];
  const online = await parseFetchedResearchEvidence({content: [fetched()]}, {now});
  const selected = selectResearchEvidence({providedSources, discoveries: online.sources, now});
  assert.equal(selected.length, 1); assert.equal(selected[0].id, 'S4');
  assert.equal(selected[0].title, 'Inventory guidance', 'actual retrieved title replaces the unverified bibliographic label'); assert.equal(selected[0].url, 'https://www.nist.gov/inventory');
  assert.equal(selected[0].excerpt, passage); assert(hasOnlineResearchEvidence(selected[0], {now}));
});

test('actual fetched documents are not lost behind a full bounded search candidate set', async () => {
  const hints = parseResearchSearchCandidates({content: [batch(Array.from({length: 64}, (_, index) => hit('https://www.cdc.gov/hint-' + index, 'Hint ' + index)))]});
  const online = await parseFetchedResearchEvidence({content: [fetched()]}, {now});
  const selected = selectResearchEvidence({discoveries: [...hints, ...online.sources], now});
  assert.equal(selected.length, 1); assert.equal(selected[0].url, 'https://www.nist.gov/inventory');
  assert(hasOnlineResearchEvidence(selected[0], {now}));
});

test('actual successful native text and HTML documents produce bounded hashed online receipts', async () => {
  const html = '<main><h1>Inventory &amp; service</h1><script>do not retain this</script><p>' + passage + '</p></main>';
  const result = await parseFetchedResearchEvidence({content: [fetched(), fetched({url: 'https://www.cdc.gov/operations', text: html, type: 'text/html'})]}, {now});
  assert.equal(result.sources.length, 2); assert.deepEqual(result.rejected, []);
  const source = result.sources[1], receipt = getResearchEvidenceProvenance(source, {now});
  assert(source.excerpt.includes('Inventory & service')); assert(!source.excerpt.includes('do not retain this'));
  assert.equal(receipt.contentSha256, 'sha256:' + createHash('sha256').update(source.excerpt).digest('hex'));
  assert.equal(receipt.retrievedAt, '2026-11-28T05:59:30.000Z');
  assert.equal(receipt.claimSupportVerified, false); assert.equal(receipt.contentCurrencyVerified, false);
  assert(Object.isFrozen(source)); assert.throws(() => { source.excerpt = 'changed'; }, TypeError);
});

test('persisted flags, copied receipts and JSON copies cannot forge online evidence', async () => {
  const {sources} = await parseFetchedResearchEvidence({content: [fetched()]}, {now});
  const source = sources[0], receipt = getResearchEvidenceProvenance(source, {now});
  const forged = {...source, title: 'A fabricated bibliographic title', onlineVerified: true, status: 'retrieved', evidenceOrigin: 'provider-web-fetch', provenance: receipt};
  assert(hasOnlineResearchEvidence(source, {now})); assert(!hasOnlineResearchEvidence(forged, {now}));
  assert(!hasOnlineResearchEvidence(JSON.parse(JSON.stringify(source)), {now}));
  assert.deepEqual(selectResearchEvidence({cachedSources: [forged], now}), []);
  assert.equal(getResearchEvidenceProvenance(forged, {now}), null);
  receipt.claimSupportVerified = true;
  assert.equal(getResearchEvidenceProvenance(source, {now}).claimSupportVerified, false, 'the display receipt must not mutate the internal proof');
});

test('native document citations retain relevant late passages and reject invented or misbound quotes', async () => {
  const relevant = 'Safety stock compensates for uncertain demand and supplier delivery times.';
  const text = ('Introductory material about another topic. ').repeat(700) + relevant;
  const result = await parseFetchedResearchEvidence({content: [fetched({text}), {type: 'text', citations: [
    {type: 'char_location', document_index: 0, cited_text: relevant},
    {type: 'char_location', document_index: 0, cited_text: 'An invented conclusion not contained in the actual fetched document.'},
    {type: 'char_location', document_index: 1, cited_text: 'Introductory material about another topic.'}
  ]}]}, {now});
  const source = result.sources[0], receipt = getResearchEvidenceProvenance(source, {now});
  assert(source.excerpt.startsWith(relevant)); assert(!source.excerpt.includes('An invented conclusion'));
  assert.equal(receipt.citedPassages, 1); assert.equal(receipt.retainedTextCharacters, 24000);
  assert.equal(receipt.documentSha256, 'sha256:' + createHash('sha256').update(text).digest('hex'));
  assert.equal(receipt.contentSha256, receipt.documentSha256);
  assert.equal(receipt.excerptSha256, 'sha256:' + createHash('sha256').update(source.excerpt).digest('hex'));
});

test('rejected PDF documents retain their native citation index without authenticating PDF content', async () => {
  const pdf = fetched({url: 'https://www.nist.gov/report.pdf'}); pdf.content.content.source = {type: 'base64', media_type: 'application/pdf', data: 'JVBERi0xLjQ='};
  const result = await parseFetchedResearchEvidence({content: [pdf, fetched(), {type: 'text', citations: [
    {type: 'char_location', document_index: 1, cited_text: passage}
  ]}]}, {now});
  assert.equal(result.sources.length, 1); assert.equal(result.rejected[0].reason, 'pdf-not-supported');
  assert.equal(getResearchEvidenceProvenance(result.sources[0], {now}).citedPassages, 1);
});

test('HTTP-200 tool error blocks, unsupported documents and empty responses never mint proof', async () => {
  const result = await parseFetchedResearchEvidence({content: [
    {type: 'web_fetch_tool_result', content: {type: 'web_fetch_tool_result_error', error_code: 'url_not_accessible', url: 'https://www.nist.gov/error'}},
    fetched({text: ''}),
    {...fetched(), content: {...fetched().content, content: {type: 'document', source: {type: 'url', media_type: 'text/plain', url: 'https://www.nist.gov/not-read'}}}}
  ]}, {now});
  assert.deepEqual(result.sources, []);
  assert.deepEqual(result.rejected.map(row => row.reason), ['fetch-error', 'empty-document', 'unsupported-document']);
});

test('PDFs, unsafe addresses and signed/private links are excluded without echoing secret input', async () => {
  const pdf = fetched({url: 'https://www.nist.gov/report.pdf'}); pdf.content.content.source = {type: 'base64', media_type: 'application/pdf', data: 'JVBERi0xLjQ='};
  const result = await parseFetchedResearchEvidence({content: [pdf, fetched({url: 'https://127.0.0.1/private'}), fetched({url: 'https://www.nist.gov/private?access_token=secret-never-repeat'})]}, {now});
  assert.deepEqual(result.sources, []);
  assert.deepEqual(result.rejected.map(row => row.reason), ['pdf-not-supported', 'unsafe-url', 'unsafe-url']);
  assert(!JSON.stringify(result.rejected).includes('secret-never-repeat'));
  assert.equal(canonicalResearchURL('https://www.nist.gov/a?utm_campaign=test#part'), 'https://www.nist.gov/a');
  assert.equal(canonicalResearchURL('https://www.nist.gov/a#token=secret'), null, 'reject private fragments before stripping them');
});

test('stale, missing and implausibly future retrieval dates are rejected and existing proof expires', async () => {
  const missing = fetched(); delete missing.content.retrieved_at;
  const result = await parseFetchedResearchEvidence({content: [fetched({retrieved: '2026-11-25T05:00:00Z'}), missing, fetched({retrieved: '2026-11-28T07:00:00Z'})]}, {now});
  assert.deepEqual(result.sources, []); assert.equal(result.rejected.length, 3);
  assert(result.rejected.every(row => row.reason === 'stale-or-invalid-retrieval'));
  const source = (await parseFetchedResearchEvidence({content: [fetched()]}, {now})).sources[0];
  assert(hasOnlineResearchEvidence(source, {now}));
  assert(!hasOnlineResearchEvidence(source, {now: now + MAX_RESEARCH_EVIDENCE_AGE_MS + 1}));
});

test('fake citation-only URLs and claimed metadata cannot displace actual cited discoveries', () => {
  const discovered = parseResearchSearchCandidates({content: [batch([hit('https://www.nist.gov/actual', 'Actual result')]), {type: 'text', citations: [cite('https://www.nist.gov/actual', 'A real cited passage.'), cite('https://www.cdc.gov/not-returned', 'An invented URL.')]}]});
  assert.equal(discovered.length, 1);
  const selected = selectResearchCandidates({cachedSources: [{id: 'S1', url: 'https://www.cdc.gov/weak', title: 'Fake strong', cited: true, onlineVerified: true, status: 'retrieved'}], discoveries: discovered, limit: 1, now});
  assert.equal(selected[0].title, 'Actual result');
  assert(!hasOnlineResearchEvidence(selected[0], {now}));
});

test('native fetch configuration bounds requests and accepts only exact public domain filters', () => {
  const tool = createResearchFetchTool({allowedDomains: ['www.nist.gov', 'www.nist.gov', 'www.cdc.gov']});
  assert.equal(tool.type, 'web_fetch_20250910'); assert.equal(tool.max_uses, 3); assert.equal(tool.max_content_tokens, 10000);
  assert.deepEqual(tool.allowed_domains, ['www.nist.gov', 'www.cdc.gov']); assert.equal(tool.citations.enabled, true);
  assert.equal(tool.url_sources.client_tool_results.type, 'none');
  for (const domain of ['127.0.0.1', 'localhost', '*.nist.gov', 'www.nist.gov/path', 'www.nist.gov:443', 'WWW.NIST.GOV']) assert.throws(() => createResearchFetchTool({allowedDomains: [domain]}), TypeError);
  assert.throws(() => selectResearchCandidates({limit: 9}), RangeError);
});

const htmlResponse = (text = passage, title = 'Actual public guidance') => new Response('<!doctype html><html><head><title>' + title + '</title></head><body><nav>Unrelated navigation</nav><main><p>' + text + '</p></main><footer>Unrelated footer</footer></body></html>', {headers: {'Content-Type': 'text/html; charset=utf-8'}});

test('actual HTTPS HTML retrieval mints exact opaque evidence using the page title and no student metadata', async () => {
  const candidate = {id: 'S7', url: 'https://www.nist.gov/public?utm_source=student#part', title: 'Forged title', excerpt: 'Forged factual passage', onlineVerified: true};
  const response = htmlResponse(), raw = await response.clone().text(), calls = [];
  const result = await retrieveResearchEvidence([candidate], {now, fetcher: async (url, options) => { calls.push({url, options}); return response; }});
  assert.deepEqual(result.rejected, []); assert.equal(result.sources.length, 1);
  const source = result.sources[0], receipt = getResearchEvidenceProvenance(source, {now});
  assert.equal(source.id, 'S7'); assert.equal(source.title, 'Actual public guidance'); assert.equal(source.excerpt, passage); assert(hasOnlineResearchEvidence(source, {now}));
  assert.equal(receipt.kind, 'server-https-text-retrieval'); assert.equal(receipt.url, 'https://www.nist.gov/public'); assert.equal(receipt.requestedURL, receipt.url);
  assert.equal(receipt.bodySha256, 'sha256:' + createHash('sha256').update(raw).digest('hex')); assert.equal(receipt.documentSha256, receipt.bodySha256);
  assert.equal(receipt.contentSha256, 'sha256:' + createHash('sha256').update(passage).digest('hex')); assert.equal(receipt.excerptSha256, receipt.contentSha256);
  assert.equal(receipt.bodyTruncated, false); assert.equal(receipt.bodyHashScope, 'complete-response-body'); assert.equal(receipt.retrievedBytes, Buffer.byteLength(raw));
  assert.equal(receipt.claimSupportVerified, false); assert.equal(receipt.contentCurrencyVerified, false); assert.equal(receipt.retrievedAt, new Date(now).toISOString());
  assert.equal(calls[0].options.redirect, 'manual'); assert.equal(calls[0].options.credentials, 'omit'); assert.equal(calls[0].options.method, 'GET');
  assert.deepEqual(Object.keys(calls[0].options.headers), ['Accept']); assert(!JSON.stringify(calls).includes('Forged'));
  assert(!hasOnlineResearchEvidence({...source, onlineEvidence: receipt}, {now})); assert.deepEqual(selectResearchEvidence({discoveries: [JSON.parse(JSON.stringify(source))], now}), []);
});

test('emoji at excerpt, retained-text and title limits remains valid UTF-16 with stable opaque proof and exact hashes',async()=>{
  const title='T'.repeat(199)+'🎓 title',text='A'.repeat(5999)+'🎓'+'B'.repeat(17998)+'🎓 ending';
  const http=await retrieveResearchEvidence([{id:'S7',url:'https://www.nist.gov/emoji'}],{now,fetcher:async()=>htmlResponse(text,title)});
  const native=await parseFetchedResearchEvidence({content:[fetched({text,title})]},{now});
  for(const sources of[http.sources,native.sources]){
    assert.equal(sources.length,1);const source=sources[0],receipt=getResearchEvidenceProvenance(source,{now});
    assert(source.title.isWellFormed());assert(source.excerpt.isWellFormed());assert.equal(source.title.length,199);assert.equal(source.excerpt.length,5999);assert.equal(receipt.retainedTextCharacters,23999);
    const selected=selectResearchEvidence({discoveries:sources,now});assert.equal(selected.length,1);assert(hasOnlineResearchEvidence(selected[0],{now}));assert.equal(selected[0].excerpt,source.excerpt);
    assert.equal(receipt.excerptSha256,'sha256:'+createHash('sha256').update(source.excerpt).digest('hex'));assert(JSON.parse(JSON.stringify(source)).excerpt.isWellFormed());
  }
});

test('manual HTTPS redirects preserve requested source identity only through opaque same-host/www-alias proof', async () => {
  const original = {id: 'S4', url: 'https://nist.gov/reading', title: 'Original title', excerpt: 'Unverified annotation.'}, calls = [];
  const result = await retrieveResearchEvidence([original], {now, fetcher: async url => { calls.push(url); return calls.length === 1 ? new Response(null, {status: 301, headers: {Location: 'https://www.nist.gov/reading'}}) : htmlResponse(); }});
  assert.equal(result.sources[0].url, 'https://www.nist.gov/reading'); assert.equal(result.sources[0].requestedURL, original.url);
  const selected = selectResearchEvidence({providedSources: [original], discoveries: result.sources, now}); assert.equal(selected.length, 1); assert.equal(selected[0].id, 'S4'); assert.equal(selected[0].title, 'Actual public guidance');
  assert.equal(getResearchEvidenceProvenance(selected[0], {now}).requestedURL, original.url); assert.equal(getResearchEvidenceProvenance(selected[0], {now}).redirects, 1);
  const candidates = selectResearchCandidates({providedSources: [original], discoveries: result.sources, now}); assert.equal(candidates.length, 1); assert.equal(candidates[0].id, 'S4');
});

test('every redirect rejects unsafe URLs, credentials, token queries, unrelated hosts, and more than two hops', async () => {
  for (const location of ['https://127.0.0.1/private', 'http://www.nist.gov/plain', 'https://www.nist.gov/private?access_token=never-echo', 'https://student:secret@www.nist.gov/private', 'https://evil.nist.gov/article', 'https://www.nist.gov.attacker.edu/article', 'https://localtest.me/private']) {
    let calls = 0; const result = await retrieveResearchEvidence([{url: 'https://www.nist.gov/article'}], {now, fetcher: async () => { calls++; return new Response(null, {status: 302, headers: {Location: location}}); }});
    assert.equal(calls, 1); assert.deepEqual(result.sources, []); assert.equal(result.rejected[0].reason, 'unsafe-redirect'); assert(!JSON.stringify(result).includes('never-echo')); assert(!JSON.stringify(result).includes('student:secret'));
  }
  let calls = 0; const loop = await retrieveResearchEvidence([{url: 'https://www.nist.gov/0'}], {now, fetcher: async () => new Response(null, {status: 302, headers: {Location: '/' + (++calls)}})});
  assert.equal(calls, 3); assert.equal(loop.rejected[0].reason, 'redirect-limit');
});

test('unsafe and local-resolution aliases never reach a fetcher and rejected metadata cannot mint evidence', async () => {
  const unsafe = ['https://127.0.0.1/private', 'https://localhost/private', 'https://foo.local/private', 'https://localtest.me/a', 'https://foo.nip.io/a', 'https://foo.sslip.io/a', 'https://lvh.me/a', 'https://www.nist.gov/private?token=never-echo'];
  const result = await retrieveResearchEvidence(unsafe.map(url => ({url, onlineEvidence: {kind: 'server-https-text-retrieval'}, excerpt: passage})), {now, fetcher: async () => { assert.fail('Unsafe URL reached HTTP retrieval.'); }});
  assert.equal(result.sources.length, 0); assert.equal(result.rejected.length, unsafe.length); assert(result.rejected.every(row => row.reason === 'unsafe-url' && !row.url)); assert(!JSON.stringify(result).includes('never-echo'));
});

test('eight candidates use at most three concurrent HTTP requests and extra URLs are not fetched', async () => {
  let active = 0, maximum = 0, calls = 0;
  const candidates = Array.from({length: 10}, (_, index) => ({url: 'https://www.nist.gov/article-' + index}));
  const result = await retrieveResearchEvidence(candidates, {now, fetcher: async () => { active++; calls++; maximum = Math.max(maximum, active); await new Promise(done => setTimeout(done, 3)); active--; return htmlResponse(); }});
  assert.equal(calls, 8); assert.equal(maximum, 3); assert.equal(result.sources.length, 8); assert.equal(result.rejected.length, 2); assert(result.rejected.every(row => row.reason === 'retrieval-limit'));
});

test('HTTP and body deadlines cover ignored aborts and cancel stalled response streams', async () => {
  for (const phase of ['fetch', 'body']) {
    let cancelled = 0;
    const fetcher = phase === 'fetch' ? async () => new Promise(() => {}) : async () => new Response(new ReadableStream({start(controller) { controller.enqueue(new TextEncoder().encode('<main>' + passage)); }, cancel() { cancelled++; }}), {headers: {'Content-Type': 'text/html'}});
    const started = performance.now(), result = await retrieveResearchEvidence([{url: 'https://www.nist.gov/article'}], {fetcher, now, timeoutMs: 15});
    assert(performance.now() - started < 1000); assert.equal(result.sources.length, 0); assert.equal(result.rejected[0].reason, 'timeout'); if (phase === 'body') assert.equal(cancelled, 1);
  }
});

test('bounded HTTP prefixes retain exact bytes and excerpt hashes without claiming a complete document', async () => {
  const raw = '<title>Large public text</title><main>' + passage.repeat(5000) + '</main>', bytes = new TextEncoder().encode(raw); let cancelled = 0;
  const result = await retrieveResearchEvidence([{url: 'https://www.nist.gov/large'}], {now, fetcher: async () => new Response(new ReadableStream({start(controller) { controller.enqueue(bytes); }, cancel() { cancelled++; }}), {headers: {'Content-Type': 'text/html', 'Content-Length': String(bytes.byteLength)}})});
  assert.equal(result.sources.length, 1); assert.equal(cancelled, 1); const source = result.sources[0], receipt = getResearchEvidenceProvenance(source, {now});
  assert.equal(receipt.bodyTruncated, true); assert.equal(receipt.retrievedBytes, 512 * 1024); assert.equal(receipt.bodyHashScope, 'retrieved-prefix'); assert.equal(receipt.documentSha256, null);
  assert.equal(receipt.bodySha256, 'sha256:' + createHash('sha256').update(bytes.slice(0, 512 * 1024)).digest('hex')); assert.equal(receipt.retainedTextCharacters, 24000); assert.equal(source.excerpt.length, 6000);
  assert.equal(receipt.excerptSha256, 'sha256:' + createHash('sha256').update(source.excerpt).digest('hex')); assert.equal(receipt.contentHashScope, 'readable-retrieved-prefix');
});

test('HTML extraction strips scripts, navigation and forms and bounds malformed public HTML', async () => {
  const raw = '<title>Readable primary document</title><body><nav>PRIVATE NAV</nav><script>evil()</script><main><p>' + passage + '</p><form>PRIVATE FORM</form></main><footer>PRIVATE FOOTER</footer>' + '<script>'.repeat(10000);
  const result = await retrieveResearchEvidence([{url: 'https://www.nist.gov/article'}], {now, fetcher: async () => new Response(raw, {headers: {'Content-Type': 'text/html'}})});
  assert.equal(result.sources.length, 1); assert.equal(result.sources[0].excerpt, passage); assert(!JSON.stringify(result.sources[0]).includes('PRIVATE')); assert(!result.sources[0].excerpt.includes('evil'));
  for(const bad of['<'.repeat(512*1024),'<title>Public source</title><main>'+'<script'.repeat(70000),'<title'.repeat(70000),'<br'+' '.repeat(500000)]){
    const started=performance.now(),malformed=await retrieveResearchEvidence([{url:'https://www.nist.gov/malformed'}],{now,fetcher:async()=>new Response(bad,{headers:{'Content-Type':'text/html'}})});
    assert.equal(malformed.sources.length,0);assert.equal(malformed.rejected[0].reason,'empty-document');assert(performance.now()-started<1000);
  }
});

test('unreadable HTTP responses, misleading PDFs, challenge pages and empty documents never mint proof', async () => {
  const cases = [
    [() => new Response(passage, {status: 503, headers: {'Content-Type': 'text/plain'}}), 'http-error'],
    [() => new Response(passage, {headers: {'Content-Type': 'application/pdf'}}), 'pdf-not-supported'],
    [() => new Response('%PDF-1.7 ' + passage, {headers: {'Content-Type': 'text/plain'}}), 'pdf-not-supported'],
    [() => new Response(passage, {headers: {'Content-Type': 'application/json'}}), 'unsupported-document'],
    [() => new Response('<main>Too short.</main>', {headers: {'Content-Type': 'text/html'}}), 'empty-document'],
    [() => htmlResponse('Please enable JavaScript and cookies before the page can be accessed.', 'Just a moment...'), 'unreadable-page'],
    [() => htmlResponse(passage, 'Log in to your account'), 'unreadable-page'],
    [() => new Response(new Uint8Array([255, 254, 251]), {headers: {'Content-Type': 'text/plain; charset=utf-8'}}), 'invalid-text-encoding'],
    [() => new Response(passage + '\u0000', {headers: {'Content-Type': 'text/plain'}}), 'unsupported-document']
  ];
  for (const [make, reason] of cases) { const result = await retrieveResearchEvidence([{url: 'https://www.nist.gov/article', excerpt: passage, verified: true}], {now, fetcher: async () => make()}); assert.deepEqual(result.sources, []); assert.equal(result.rejected[0].reason, reason); }
  let calls = 0; const pdfURL = await retrieveResearchEvidence([{url: 'https://www.nist.gov/article.pdf'}], {now, fetcher: async () => { calls++; return htmlResponse(); }}); assert.equal(calls, 0); assert.equal(pdfURL.rejected[0].reason, 'pdf-not-supported');
});
