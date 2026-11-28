import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  canonicalResearchURL, parseResearchSearchCandidates, parseFetchedResearchEvidence,
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
