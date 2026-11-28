/** Public research selection and native-fetch provenance for the course workspace.
 *
 * Search results are acquisition hints, not online-verification evidence. Only
 * this module's parser for successful provider-native document results mints an
 * in-memory proof. Persisted metadata, student excerpts and object copies cannot
 * recreate that proof. Retrieval does not verify a claim or publication currency.
 */
import {normalizeLearningSources} from './learning-sources.mjs';

export const MAX_RESEARCH_SOURCES = 8;
export const MAX_RESEARCH_EVIDENCE_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_RESULTS = 64, MAX_BLOCKS = 128, MAX_DOCUMENT_BYTES = 196608;
const MAX_DOCUMENT_TEXT = 24000, MAX_EVIDENCE_EXCERPT = 6000;
const onlineProofs = new WeakMap(), searchProofs = new WeakMap();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const array = value => Array.isArray(value) ? value : [];
const validId = value => typeof value === 'string' && /^S[1-9]\d?$/i.test(value);
const clean = value => String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();

/** Applies the workspace's existing URL policy before removing page fragments. */
export function canonicalResearchURL(value) {
  if (typeof value !== 'string') return null;
  try {
    const normalized = normalizeLearningSources([{url: value}])[0];
    const url = new URL(normalized.url); url.hash = '';
    return url.href;
  } catch { return null; }
}

function boundedSource(source) {
  if (!object(source)) return null;
  const url = canonicalResearchURL(source.url); if (!url) return null;
  const title = typeof source.title === 'string' ? clean(source.title).slice(0, 200) : url;
  const excerpt = typeof source.excerpt === 'string' ? clean(source.excerpt).slice(0, MAX_EVIDENCE_EXCERPT) : '';
  return {url, title: title || url, excerpt, ...(validId(source.id) ? {id: source.id.toUpperCase()} : {})};
}

function fresh(proof, {now = Date.now(), maxAgeMs = MAX_RESEARCH_EVIDENCE_AGE_MS} = {}) {
  if (!proof || !Number.isFinite(now) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0 || maxAgeMs > MAX_RESEARCH_EVIDENCE_AGE_MS) return false;
  return proof.retrievedAtMs <= now + 60000 && now - proof.retrievedAtMs <= maxAgeMs;
}

export function hasOnlineResearchEvidence(source, options) {
  if (!object(source)) return false;
  const proof = onlineProofs.get(source);
  return fresh(proof, options) && source.url === proof.url && source.title === proof.title && source.excerpt === proof.excerpt;
}

/** A display/audit receipt only. Copying it does not authorize another object. */
export function getResearchEvidenceProvenance(source, options) {
  if (!hasOnlineResearchEvidence(source, options)) return null;
  const {receipt} = onlineProofs.get(source);
  return {...receipt};
}

function mint(source, {online, search} = {}) {
  const result = Object.freeze(source);
  if (online && result.url === online.url && result.title === online.title && result.excerpt === online.excerpt) onlineProofs.set(result, online);
  if (search && result.url === search.url) searchProofs.set(result, search);
  return result;
}

/** All bounded result batches remain available for cited/diverse selection.
 * Query strings and raw provider identifiers are deliberately not retained.
 */
export function parseResearchSearchCandidates(message) {
  const found = new Map(), citations = [];
  let group = 0;
  for (const block of array(message?.content).slice(0, MAX_BLOCKS)) {
    if (block?.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      const queryGroup = group++;
      for (const result of block.content.slice(0, MAX_RESULTS)) {
        if (result?.type !== 'web_search_result') continue;
        const source = boundedSource(result); if (!source) continue;
        let record = found.get(source.url);
        if (!record) {
          if (found.size >= MAX_RESULTS) continue;
          record = {...source, groups: new Set(), cited: false, order: found.size};
          found.set(source.url, record);
        }
        record.groups.add(queryGroup);
      }
    }
    if (block?.type === 'text') {
      for (const citation of array(block.citations).slice(0, MAX_RESULTS)) {
        if (citation?.type === 'web_search_result_location') citations.push(citation);
      }
    }
  }
  for (const citation of citations) {
    const record = found.get(canonicalResearchURL(citation.url));
    if (!record) continue; // Model prose and citations alone never create a source.
    record.cited = true;
    if (typeof citation.cited_text === 'string') record.excerpt = clean(record.excerpt + '\n' + citation.cited_text).slice(0, MAX_EVIDENCE_EXCERPT);
  }
  return [...found.values()].map(record => mint({url: record.url, title: record.title, excerpt: record.excerpt, origin: 'web-search-result'}, {
    search: Object.freeze({url: record.url, cited: record.cited, groups: Object.freeze([...record.groups]), order: record.order})
  }));
}

function documentText(source) {
  let text = source.data;
  if (source.media_type !== 'text/plain') {
    text = text.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|template|svg|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<\/(?:p|div|li|h[1-6]|section|article|blockquote|tr)\s*>/gi, '\n').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, ' ')
      .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, entity => ({'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' '})[entity])
      .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, value) => {
        const point = value[0].toLowerCase() === 'x' ? parseInt(value.slice(1), 16) : parseInt(value, 10);
        return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : ' ';
      });
  }
  return clean(text).replace(/[\t ]+/g, ' ').replace(/\n[\t ]+/g, '\n').replace(/\n{3,}/g, '\n\n');
}

async function digest(text) {
  const bytes = new TextEncoder().encode(text);
  return 'sha256:' + [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Call only on the server's actual HTTPS provider response, never on PG/client
 * metadata. Basic native fetch returns HTML as a text document. Binary PDFs are
 * intentionally rejected until a separate bounded PDF-evidence path is proven.
 */
export async function parseFetchedResearchEvidence(message, {now = Date.now(), maxAgeMs = MAX_RESEARCH_EVIDENCE_AGE_MS, initialDocumentCount = 0} = {}) {
  if (!Number.isSafeInteger(initialDocumentCount) || initialDocumentCount < 0 || initialDocumentCount > MAX_BLOCKS) throw new RangeError('Use a bounded input-document count.');
  const byURL = new Map(), rejected = [];
  let index = -1, documentIndex = initialDocumentCount - 1;
  const citations = array(message?.content).slice(0, MAX_BLOCKS).filter(block => block?.type === 'text').flatMap(block => array(block.citations).slice(0, MAX_RESULTS));
  const reject = (reason, url) => rejected.push({index, reason, ...(url ? {url} : {})});
  for (const block of array(message?.content).slice(0, MAX_BLOCKS)) {
    index++;
    if (block?.type !== 'web_fetch_tool_result') continue;
    const result = block.content;
    if (!object(result) || result.type !== 'web_fetch_result') { reject('fetch-error'); continue; }
    const doc = result.content, source = doc?.source;
    if (doc?.type === 'document') documentIndex++;
    const url = canonicalResearchURL(result.url);
    if (!url) { reject('unsafe-url'); continue; }
    if (source?.media_type === 'application/pdf' || source?.type === 'base64' || /\.pdf$/i.test(new URL(url).pathname)) { reject('pdf-not-supported', url); continue; }
    if (doc?.type !== 'document' || source?.type !== 'text' || !['text/plain', 'text/html', 'application/xhtml+xml'].includes(source.media_type) || typeof source.data !== 'string') { reject('unsupported-document', url); continue; }
    if (new TextEncoder().encode(source.data).byteLength > MAX_DOCUMENT_BYTES) { reject('document-too-large', url); continue; }
    const retrievedAtMs = typeof result.retrieved_at === 'string' ? Date.parse(result.retrieved_at) : NaN;
    if (!Number.isFinite(retrievedAtMs) || !fresh({retrievedAtMs}, {now, maxAgeMs})) { reject('stale-or-invalid-retrieval', url); continue; }
    const fullText = documentText(source), text = fullText.slice(0, MAX_DOCUMENT_TEXT);
    if (text.length < 40) { reject('empty-document', url); continue; }
    const comparable = value => value.replace(/\s+/g, ' ').trim();
    const fullComparable = comparable(fullText), passages = [...new Set(citations.filter(citation =>
      ['char_location', 'content_block_location'].includes(citation?.type) && citation.document_index === documentIndex &&
      typeof citation.cited_text === 'string' && citation.cited_text.length <= MAX_EVIDENCE_EXCERPT
    ).map(citation => clean(citation.cited_text)).filter(passage => passage.length >= 20 && fullComparable.includes(comparable(passage))))].slice(0, 12);
    // Keep real cited material even when the relevant section lies after the
    // document's opening text. A model's invented quote cannot pass this check.
    const excerpt = clean([...passages, text].join('\n\n')).slice(0, MAX_EVIDENCE_EXCERPT), title = typeof doc.title === 'string' ? clean(doc.title).slice(0, 200) : url;
    const receipt = Object.freeze({kind: 'provider-native-text-retrieval', version: 1, url, retrievedAt: new Date(retrievedAtMs).toISOString(), observedAt: new Date(now).toISOString(), documentSha256: await digest(source.data), contentSha256: await digest(fullText), excerptSha256: await digest(excerpt), mediaType: source.media_type, documentTitle: title || url, textCharacters: fullText.length, retainedTextCharacters: text.length, citedPassages: passages.length, claimSupportVerified: false, contentCurrencyVerified: false});
    const proof = Object.freeze({url, title: title || url, excerpt, retrievedAtMs, receipt});
    const item = mint({url, title: title || url, excerpt, origin: 'provider-web-fetch'}, {online: proof, search: passages.length ? Object.freeze({url, cited: true, groups: Object.freeze([documentIndex]), order: index}) : null});
    const previous = byURL.get(url);
    if (!previous || onlineProofs.get(previous).retrievedAtMs <= retrievedAtMs) byURL.set(url, item);
    if (byURL.size >= MAX_RESULTS) break;
  }
  return {sources: [...byURL.values()], rejected};
}

/** Native fetch is bounded; this fragment never contains a student question. */
export function createResearchFetchTool({allowedDomains = []} = {}) {
  if (!Array.isArray(allowedDomains) || allowedDomains.length > MAX_RESULTS) throw new TypeError('Use a bounded public domain list.');
  const domains = [...new Set(allowedDomains.map(domain => {
    if (typeof domain !== 'string') throw new TypeError('Use public domain names.');
    const url = canonicalResearchURL('https://' + domain + '/');
    if (!url || new URL(url).hostname !== domain || domain.includes('/') || domain !== domain.toLowerCase()) throw new TypeError('Use exact public domain names.');
    return domain;
  }))];
  return {type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 3, max_content_tokens: 10000, citations: {enabled: true}, url_sources: {client_tool_results: {type: 'none'}}, ...(domains.length ? {allowed_domains: domains} : {})};
}

function select({providedSources = [], cachedSources = [], discoveries = [], limit = MAX_RESEARCH_SOURCES, now = Date.now(), maxAgeMs = MAX_RESEARCH_EVIDENCE_AGE_MS} = {}, verifiedOnly) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_RESEARCH_SOURCES) throw new RangeError('Use a source limit from 1 through 8.');
  const records = new Map(), reservedIds = new Set(), idOwners = new Map();
  function add(raw, bucket, position) {
    const source = boundedSource(raw); if (!source) return;
    let row = records.get(source.url);
    if (!row) { row = {url: source.url, title: source.title, excerpt: source.excerpt, order: records.size, provided: Infinity, fresh: false, cited: false, groups: new Set(), online: null, search: null, origin: 'cached-unverified'}; records.set(source.url, row); }
    if (bucket !== 'discovery' && source.id && (!idOwners.has(source.id) || idOwners.get(source.id) === source.url)) {
      reservedIds.add(source.id); idOwners.set(source.id, source.url); if (!row.id) row.id = source.id;
    }
    if (bucket === 'provided') { row.provided = Math.min(row.provided, position); if (!row.online) { row.title = source.title; row.excerpt = source.excerpt; row.origin = 'student-provided'; } }
    if (bucket === 'discovery') row.fresh = true;
    const online = hasOnlineResearchEvidence(raw, {now, maxAgeMs}) ? onlineProofs.get(raw) : null;
    const search = searchProofs.get(raw);
    if (online && (!row.online || online.retrievedAtMs >= row.online.retrievedAtMs)) { row.online = online; row.excerpt = raw.excerpt; row.title = source.title; row.origin = 'provider-web-fetch'; }
    if (search && bucket === 'discovery') {
      row.search = search; row.cited ||= search.cited; for (const group of search.groups) row.groups.add(group);
      if (!row.online && row.provided === Infinity) { if (source.excerpt.length > row.excerpt.length) row.excerpt = source.excerpt; row.title = source.title; row.origin = 'web-search-result'; }
    } else if (bucket === 'discovery' && !online && row.provided === Infinity && !row.search) { row.title = source.title; row.excerpt = source.excerpt; row.origin = 'unverified-discovery'; }
  }
  array(providedSources).slice(0, MAX_RESULTS).forEach((source, index) => add(source, 'provided', index));
  array(cachedSources).slice(0, MAX_RESULTS).forEach((source, index) => add(source, 'cached', index));
  // A full bounded search set can be followed by actual fetched documents.
  // Do not truncate those stronger results merely because hints came first.
  array(discoveries).slice(0, MAX_RESULTS * 2).forEach((source, index) => add(source, 'discovery', index));
  const rows = [...records.values()].filter(row => !verifiedOnly || row.online), chosen = [], selected = new Set();
  const choose = row => { if (chosen.length < limit && !selected.has(row.url)) { selected.add(row.url); chosen.push(row); } };
  rows.filter(row => row.provided !== Infinity).sort((a, b) => a.provided - b.provided).forEach(choose);
  rows.filter(row => row.provided === Infinity && row.online).sort((a, b) => Number(b.cited) - Number(a.cited) || a.order - b.order).forEach(choose);
  function diverse(pool) {
    const groups = new Map();
    for (const row of pool) { const group = [...row.groups][0] ?? ('other-' + row.order); if (!groups.has(group)) groups.set(group, []); groups.get(group).push(row); }
    while (chosen.length < limit && [...groups.values()].some(queue => queue.length)) for (const queue of groups.values()) { const row = queue.shift(); if (row) choose(row); }
  }
  diverse(rows.filter(row => row.provided === Infinity && !row.online && row.fresh && row.cited));
  diverse(rows.filter(row => row.provided === Infinity && !row.online && row.fresh && !row.cited));
  rows.filter(row => row.provided === Infinity && !row.fresh && !row.online).forEach(choose);
  const usedIds = new Set(chosen.map(row => row.id).filter(Boolean));
  return chosen.map(row => {
    let id = row.id;
    if (!id) { let number = 1; while (number <= 99 && (reservedIds.has('S' + number) || usedIds.has('S' + number))) number++; if (number > 99) throw new RangeError('The source IDs are exhausted.'); id = 'S' + number; usedIds.add(id); }
    return mint({id, url: row.url, title: row.title, excerpt: row.excerpt, origin: row.origin}, {online: row.online, search: row.search});
  });
}

/** Picks acquisition hints. Selection alone never verifies their availability. */
export function selectResearchCandidates(options) { return select(options, false); }

/** Only fresh, opaque-proven native document evidence is eligible here. */
export function selectResearchEvidence(options) { return select(options, true); }
