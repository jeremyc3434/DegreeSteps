/** Public research selection and native-fetch provenance for the course workspace.
 *
 * Search results are acquisition hints, not online-verification evidence. Only
 * this module's actual bounded HTTPS retrieval or successful native document
 * parser mints an in-memory proof. Persisted metadata and object copies cannot
 * recreate that proof. Retrieval does not verify a claim or publication currency.
 */
import {normalizeLearningSources} from './learning-sources.mjs';

export const MAX_RESEARCH_SOURCES = 8;
export const MAX_RESEARCH_EVIDENCE_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_RESULTS = 64, MAX_BLOCKS = 128, MAX_DOCUMENT_BYTES = 196608;
const MAX_DOCUMENT_TEXT = 24000, MAX_EVIDENCE_EXCERPT = 6000;
const MAX_HTTP_BYTES = 512 * 1024, MAX_HTTP_CANDIDATES = 8, MAX_HTTP_CONCURRENCY = 3;
const onlineProofs = new WeakMap(), searchProofs = new WeakMap();
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const array = value => Array.isArray(value) ? value : [];
const validId = value => typeof value === 'string' && /^S[1-9]\d?$/i.test(value);
const clean = value => String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
const clip = (value, limit) => { const result = value.slice(0, limit); return /[\ud800-\udbff]$/.test(result) ? result.slice(0, -1) : result; };

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
  const title = typeof source.title === 'string' ? clip(clean(source.title), 200) : url;
  const excerpt = typeof source.excerpt === 'string' ? clip(clean(source.excerpt), MAX_EVIDENCE_EXCERPT) : '';
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
    if (typeof citation.cited_text === 'string') record.excerpt = clip(clean(record.excerpt + '\n' + citation.cited_text), MAX_EVIDENCE_EXCERPT);
  }
  return [...found.values()].map(record => mint({url: record.url, title: record.title, excerpt: record.excerpt, origin: 'web-search-result'}, {
    search: Object.freeze({url: record.url, cited: record.cited, groups: Object.freeze([...record.groups]), order: record.order})
  }));
}

function documentText(source) {
  let text = source.data;
  if (source.media_type !== 'text/plain') {
    text = text.replace(/<!--[\s\S]*?(?:-->|$)/g, ' ').replace(/<(script|style|noscript|template|svg|iframe)\b[^<>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, ' ')
      .replace(/<\/(?:p|div|li|h[1-6]|section|article|blockquote|tr)\s*>/gi, '\n').replace(/<br\b[^<>]*>/gi, '\n').replace(/<[^>]*(?:>|$)/g, ' ')
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

function retrievalURL(value) {
  const safe = canonicalResearchURL(value); if (!safe) return null;
  // These public-looking services intentionally resolve names to local/private
  // addresses. Other DNS/egress restrictions belong to the hosting network too.
  const host = new URL(safe).hostname;
  if (/(?:^|\.)(?:nip\.io|sslip\.io|localtest\.me|lvh\.me|vcap\.me)$/.test(host)) return null;
  return safe;
}

function readableHTTPDocument(raw, mediaType) {
  if (mediaType === 'text/plain') return {title: '', text: documentText({data: raw, media_type: mediaType})};
  const titleMatch = /<title\b[^<>]*>([\s\S]*?)(?:<\/title\s*>|$)/i.exec(raw);
  const title = titleMatch ? clip(documentText({data: titleMatch[1], media_type: 'text/html'}), 200) : '';
  const stripped = raw.replace(/<!--[\s\S]*?(?:-->|$)/g, ' ')
    .replace(/<(script|style|noscript|template|svg|iframe|nav|header|footer|aside|form)\b[^<>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, ' ');
  let selected = stripped;
  for (const tag of ['main', 'article', 'body']) {
    const start = new RegExp('<' + tag + '\\b[^<>]*>', 'i').exec(stripped);
    if (!start) continue;
    const offset = start.index + start[0].length, end = stripped.toLowerCase().indexOf('</' + tag, offset);
    selected = stripped.slice(offset, end < 0 ? undefined : end); break;
  }
  return {title, text: documentText({data: selected, media_type: 'text/html'})};
}

/** Server-only actual public HTTPS acquisition. Callers pass their server fetch
 * implementation, never a client-supplied response/parser artifact. Public URL
 * validation and same-host redirects supplement the host's network egress guard;
 * they are not a claim that JavaScript hostname validation resolves DNS safely.
 */
export async function retrieveResearchEvidence(candidates, {fetcher = fetch, now = Date.now(), timeoutMs = 8000} = {}) {
  if (!Array.isArray(candidates) || typeof fetcher !== 'function' || !Number.isFinite(now)) throw new TypeError('Use bounded source candidates and a server fetch implementation.');
  const timeout = Math.max(10, Math.min(8000, Number(timeoutMs) || 8000)), seen = new Set(), tasks = [], rejected = [];
  const reject = (index, reason, url, httpStatus) => ({index, reason, ...(url ? {url} : {}), ...(Number.isInteger(httpStatus) ? {httpStatus} : {})});
  for (const [index, candidate] of candidates.slice(0, MAX_RESULTS).entries()) {
    const url = retrievalURL(candidate?.url);
    if (!url) { rejected.push(reject(index, 'unsafe-url')); continue; }
    if (seen.has(url)) continue;
    seen.add(url);
    if (tasks.length >= MAX_HTTP_CANDIDATES) { rejected.push(reject(index, 'retrieval-limit', url)); continue; }
    tasks.push(async () => {
      const controller = new AbortController(); let failDeadline, reader, currentResponse;
      const deadline = new Promise((_, fail) => { failDeadline = fail; });
      const timer = setTimeout(() => { controller.abort(); failDeadline(Object.assign(Error(), {reason: 'timeout'})); void reader?.cancel().catch(() => {}); }, timeout);
      const refuse = (reason, httpStatus) => { throw Object.assign(Error(), {reason, httpStatus}); };
      const race = pending => Promise.race([pending, deadline]);
      let current = url, redirects = 0;
      try {
        const originalHost = new URL(url).hostname, alias = originalHost.startsWith('www.') ? originalHost.slice(4) : 'www.' + originalHost;
        const hosts = new Set([originalHost, alias]);
        while (true) {
          if (/\.pdf$/i.test(new URL(current).pathname)) refuse('pdf-not-supported');
          const pending = Promise.resolve().then(() => fetcher(current, {method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store', headers: {Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9'}, signal: controller.signal}));
          void pending.then(response => { if (controller.signal.aborted) void response?.body?.cancel().catch(() => {}); }, () => {});
          currentResponse = await race(pending);
          if (!(currentResponse instanceof Response) || currentResponse.redirected) refuse('invalid-response');
          if (currentResponse.url && retrievalURL(currentResponse.url) !== current) refuse('unexpected-response-url');
          if ([301, 302, 303, 307, 308].includes(currentResponse.status)) {
            const location = currentResponse.headers.get('Location'); void currentResponse.body?.cancel().catch(() => {});
            let next; try { next = location && retrievalURL(new URL(location, current).href); } catch {}
            if (!next || !hosts.has(new URL(next).hostname)) refuse('unsafe-redirect');
            if (redirects++ >= 2) refuse('redirect-limit');
            current = next; continue;
          }
          if (!currentResponse.ok) refuse('http-error', currentResponse.status);
          break;
        }
        const contentType = currentResponse.headers.get('Content-Type') || '', mediaType = contentType.split(';')[0].trim().toLowerCase();
        if (mediaType === 'application/pdf') refuse('pdf-not-supported');
        if (!['text/plain', 'text/html', 'application/xhtml+xml'].includes(mediaType)) refuse('unsupported-document');
        reader = currentResponse.body?.getReader(); if (!reader) refuse('empty-document');
        const chunks = []; let size = 0, truncated = false;
        while (true) {
          const part = await race(reader.read()); if (part.done) break;
          if (!(part.value instanceof Uint8Array)) refuse('invalid-response');
          const amount = Math.min(MAX_HTTP_BYTES - size, part.value.byteLength);
          chunks.push(part.value.slice(0, amount)); size += amount;
          if (size === MAX_HTTP_BYTES) { truncated = true; void reader.cancel().catch(() => {}); break; }
        }
        const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        if (!size) refuse('empty-document');
        if (bytes.slice(0, 5).every((value, index) => value === [37, 80, 68, 70, 45][index]) && size >= 5) refuse('pdf-not-supported');
        const charset = /charset\s*=\s*["']?([^;\s"']+)/i.exec(contentType)?.[1] || 'utf-8';
        let raw; try { const decoder = new TextDecoder(charset, {fatal: true}); raw = decoder.decode(bytes, {stream: truncated}); } catch { refuse('invalid-text-encoding'); }
        if (raw.includes('\u0000')) refuse('unsupported-document');
        const extracted = readableHTTPDocument(raw, mediaType), fullText = extracted.text;
        if (fullText.length < 40) refuse('empty-document');
        if (/^(?:access denied|forbidden|error\b|404\b|page not found|not found\b|just a moment|attention required|verify (?:you are|your)|sign in\b|log in\b|login\b)/i.test(extracted.title) || /^(?:access denied|forbidden|page not found|just a moment|checking your browser|verify (?:you are|your)|enable javascript and cookies|please (?:sign|log) in)\b/i.test(fullText)) refuse('unreadable-page');
        const retainedText = clip(fullText, MAX_DOCUMENT_TEXT), excerpt = clip(retainedText, MAX_EVIDENCE_EXCERPT), title = extracted.title || current;
        const bodySha256 = 'sha256:' + [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
        const receipt = Object.freeze({kind: 'server-https-text-retrieval', version: 1, url: current, requestedURL: url, retrievedAt: new Date(now).toISOString(), observedAt: new Date(now).toISOString(), httpStatus: currentResponse.status, mediaType, documentTitle: title, bodySha256, bodyHashScope: truncated ? 'retrieved-prefix' : 'complete-response-body', documentSha256: truncated ? null : bodySha256, contentSha256: await digest(fullText), contentHashScope: truncated ? 'readable-retrieved-prefix' : 'readable-response-body', excerptSha256: await digest(excerpt), retrievedBytes: size, bodyTruncated: truncated, textTruncated: fullText.length > MAX_DOCUMENT_TEXT, textCharacters: fullText.length, retainedTextCharacters: retainedText.length, redirects, claimSupportVerified: false, contentCurrencyVerified: false});
        const proof = Object.freeze({url: current, requestedURL: url, title, excerpt, retrievedAtMs: now, receipt});
        return {source: mint({...(validId(candidate.id) ? {id: candidate.id.toUpperCase()} : {}), url: current, requestedURL: url, title, excerpt, origin: 'server-https-fetch'}, {online: proof})};
      } catch (error) { return {rejected: reject(index, ['timeout', 'pdf-not-supported', 'invalid-response', 'unexpected-response-url', 'unsafe-redirect', 'redirect-limit', 'http-error', 'unsupported-document', 'empty-document', 'invalid-text-encoding', 'unreadable-page'].includes(error?.reason) ? error.reason : 'fetch-error', url, error?.httpStatus)}; }
      finally { clearTimeout(timer); void reader?.cancel().catch(() => {}); void currentResponse?.body?.cancel().catch(() => {}); try { reader?.releaseLock(); } catch {} }
    });
  }
  const results = []; let cursor = 0;
  async function worker() { while (cursor < tasks.length) { const index = cursor++; results[index] = await tasks[index](); } }
  await Promise.all(Array.from({length: Math.min(MAX_HTTP_CONCURRENCY, tasks.length)}, worker));
  return {sources: results.flatMap(result => result.source ? [result.source] : []), rejected: [...rejected, ...results.flatMap(result => result.rejected ? [result.rejected] : [])]};
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
    const fullText = documentText(source), text = clip(fullText, MAX_DOCUMENT_TEXT);
    if (text.length < 40) { reject('empty-document', url); continue; }
    const comparable = value => value.replace(/\s+/g, ' ').trim();
    const fullComparable = comparable(fullText), passages = [...new Set(citations.filter(citation =>
      ['char_location', 'content_block_location'].includes(citation?.type) && citation.document_index === documentIndex &&
      typeof citation.cited_text === 'string' && citation.cited_text.length <= MAX_EVIDENCE_EXCERPT
    ).map(citation => clean(citation.cited_text)).filter(passage => passage.length >= 20 && fullComparable.includes(comparable(passage))))].slice(0, 12);
    // Keep real cited material even when the relevant section lies after the
    // document's opening text. A model's invented quote cannot pass this check.
    const excerpt = clip(clean([...passages, text].join('\n\n')), MAX_EVIDENCE_EXCERPT), title = typeof doc.title === 'string' ? clip(clean(doc.title), 200) : url;
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
  const aliases = new Map();
  for (const source of [...array(providedSources), ...array(cachedSources), ...array(discoveries)].slice(0, MAX_RESULTS * 4)) {
    if (!hasOnlineResearchEvidence(source, {now, maxAgeMs})) continue;
    const proof = onlineProofs.get(source); if (proof.requestedURL && proof.requestedURL !== proof.url) aliases.set(proof.requestedURL, proof.url);
  }
  function add(raw, bucket, position) {
    const source = boundedSource(raw); if (!source) return;
    source.url = aliases.get(source.url) || source.url;
    let row = records.get(source.url);
    if (!row) { row = {url: source.url, title: source.title, excerpt: source.excerpt, order: records.size, provided: Infinity, fresh: false, cited: false, groups: new Set(), online: null, search: null, origin: 'cached-unverified'}; records.set(source.url, row); }
    if (bucket !== 'discovery' && source.id && (!idOwners.has(source.id) || idOwners.get(source.id) === source.url)) {
      reservedIds.add(source.id); idOwners.set(source.id, source.url); if (!row.id) row.id = source.id;
    }
    if (bucket === 'provided') { row.provided = Math.min(row.provided, position); if (!row.online) { row.title = source.title; row.excerpt = source.excerpt; row.origin = 'student-provided'; } }
    if (bucket === 'discovery') row.fresh = true;
    const online = hasOnlineResearchEvidence(raw, {now, maxAgeMs}) ? onlineProofs.get(raw) : null;
    const search = searchProofs.get(raw);
    if (online && (!row.online || online.retrievedAtMs >= row.online.retrievedAtMs)) { row.online = online; row.excerpt = raw.excerpt; row.title = source.title; row.origin = raw.origin === 'server-https-fetch' ? 'server-https-fetch' : 'provider-web-fetch'; }
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
