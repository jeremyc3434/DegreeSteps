import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {safeEditorialHref, articleAction, renderEditorialSection} from './public-editorial.mjs';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const content = JSON.parse(await read('content/public-content.json'));
const bySlug = new Map(content.articles.map(article => [article.slug, article]));
const inventory = JSON.parse(await read('content/issue56-editorial-inventory.json'));
const pathFor = article => `/${article.type === 'guide' ? 'guides' : 'blog'}/${article.slug}/`;
const body = slug => JSON.stringify(bySlug.get(slug)?.sections);

test('Issue 56 editorial triage covers its own submissions without claiming publication or absorbing later intakes', async () => {
  const intake = JSON.parse(await read('content/research-intake/findings.json'));
  const belongsToIssue56 = finding => finding.origins.some(origin => new URL(origin.url).pathname === '/jeremyc3434/DegreeSteps/issues/56');
  const issueFindings = intake.findings.filter(belongsToIssue56);
  assert.deepEqual(inventory.findings.map(row => row.findingId).sort(), issueFindings.map(row => row.id).sort());
  for (const laterFinding of intake.findings.filter(finding => !belongsToIssue56(finding))) {
    assert(!inventory.findings.some(row => row.findingId === laterFinding.id), 'A later submission must not be counted as Issue 56 coverage.');
  }
  assert.equal(inventory.publicationAllowed, false);
  assert.equal(new Set(inventory.findings.map(row => row.findingId)).size, inventory.findings.length);
  for (const finding of inventory.findings) {
    assert(['PRODUCT', 'CONTENT', 'BOTH', 'WATCH'].includes(finding.classification));
    assert.equal(finding.metrics, null);
    assert(finding.studentUsefulness && finding.existingOverlap && finding.searchIntent);
    assert.equal(finding.livePublicationStatus, 'not-deployed-by-this-change');
    for (const proposed of finding.proposedUrls) {
      const article = content.articles.find(item => new URL(proposed).pathname === pathFor(item));
      assert(article, proposed);
      assert.equal(article.reviewedOn, '2026-11-27');
      assert(finding.evidence.length, article.slug);
      assert(finding.verifiedOn && finding.followUpOn);
    }
  }
});

test('editorial capture references exist, match retained byte hashes and include a cited primary source', async () => {
  const manifest = JSON.parse(await read('content/research-intake/evidence/issue56/retention-manifest.json'));
  const retained = new Map(manifest.files.map(file => [file.retainedPath, file]));
  let checked = 0;
  for (const finding of inventory.findings) {
    const citedUrls = [...new Set([...(finding.sourceUrls || []), ...(finding.evidence || []).map(item => item.url)])];
    for (const path of finding.researchCapturePaths || []) {
      assert.match(path, /^content\/research-intake\/evidence\/issue56\/[a-zA-Z0-9_./-]+\.json$/);
      assert(!path.split('/').some(part => part === '.' || part === '..'), path);
      const receipt = retained.get(path);
      assert(receipt, `${finding.findingId}: capture must be registered in the retention manifest: ${path}`);
      const bytes = await readFile(new URL(path, root));
      assert.equal(bytes.length, receipt.bytes, `${path}: retained byte count`);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), receipt.sha256, `${path}: retained byte hash`);
      const immutableName = path.match(/\/([a-f0-9]{64})\.json$/)?.[1];
      if (immutableName) assert.equal(immutableName, receipt.sha256, `${path}: immutable name binds to its retained bytes`);
      const capture = JSON.parse(bytes.toString('utf8'));
      const decoded = JSON.stringify(capture);
      assert(citedUrls.some(url => decoded.includes(url)), `${finding.findingId}: ${path} must contain one of its cited primary source URLs`);
      checked++;
    }
  }
  assert(checked > 0, 'The inventory retains actual research captures.');
});

test('time-sensitive guidance distinguishes historical awards, closed enrollment and conflicting official prices', () => {
  assert.match(body('ace-nccrs-and-accreditation'), /December 1, 2025 through November 30, 2026/);
  assert.match(body('ace-nccrs-and-accreditation'), /does not make a valid earlier completion or an already awarded institutional credit disappear/);
  assert.match(bySlug.get('purdue-global-exceltrack-and-professional-studies-subscription-costs').lede, /closed to new enrollments and reentries on July 1, 2026/);
  assert.match(body('purdue-global-exceltrack-and-professional-studies-subscription-costs'), /135 quarter credits/);
  assert.match(body('wgu-single-courses-prices-transfer-and-assessments'), /\$750–\$1,000/);
  assert.match(body('wgu-single-courses-prices-transfer-and-assessments'), /eligibility boundary/);
  assert.match(body('compare-transfer-credit-sources'), /\$599.*\$799|\$799.*\$599/);
  assert.match(body('compare-transfer-credit-sources'), /identity verification/);
  assert.match(body('maine-90-credit-applied-bachelors-degrees'), /121-credit/);
  assert.match(body('maine-90-credit-applied-bachelors-degrees'), /some employers and graduate programs require a 120-credit/);
  assert.match(body('umpi-yourpace-vs-umass-global-mypath-business'), /2025–26 competency-based transfer policy/);
  assert.match(body('umpi-yourpace-vs-umass-global-mypath-business'), /not independently confirmed against the applicable 2026–27 catalog/);
  assert.match(body('umpi-yourpace-vs-umass-global-mypath-business'), /separately limits combined bachelor’s CPL/);
});

test('weekly content is substantive and all actions stay within existing public tools or editorial routes', () => {
  for (const slug of inventory.changedArticleSlugs) {
    const article = bySlug.get(slug);
    assert(article, slug);
    assert(article.sections.length >= 5, slug);
    const readable = article.sections.flatMap(section => [...section.paragraphs || [], ...section.bullets || []]).join(' ');
    assert(readable.split(/\s+/).length >= 450, slug);
    assert(article.sources.some(source => source.checkedOn === '2026-11-27'), slug);
    assert.equal(safeEditorialHref(articleAction(article).href), articleAction(article).href);
    for (const section of article.sections) {
      assert(!section.planPreview, `${slug}: no held research degree is promoted as a template`);
      assert.doesNotThrow(() => renderEditorialSection(section, 0));
    }
    for (const related of article.related) assert(bySlug.has(related), `${slug}: ${related}`);
  }
});

test('the build renders inventory routes, dated official citations, canonical metadata and sitemap entries', async () => {
  const sitemap = await read('dist/sitemap.xml');
  for (const slug of inventory.changedArticleSlugs) {
    const article = bySlug.get(slug), path = pathFor(article), canonical = 'https://degreesteps.com' + path;
    const html = await read('dist' + path + 'index.html');
    assert(html.includes(`rel="canonical" href="${canonical}"`), canonical);
    assert(html.includes(`<meta name="description" content="`), slug);
    assert(sitemap.includes(`<loc>${canonical}</loc><lastmod>2026-11-27</lastmod>`), canonical);
    const schemas = [...html.matchAll(/<script type="application\/ld\+json">([^]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
    const schema = schemas.find(item => ['Article', 'BlogPosting'].includes(item['@type']));
    assert.equal(schema?.url, canonical);
    assert.equal(schema?.dateModified, '2026-11-27');
    assert.equal(schema?.author?.['@type'], 'Organization');
    assert(schemas.some(item => item['@type'] === 'BreadcrumbList'));
    for (const citation of article.sources.filter(source => source.checkedOn === '2026-11-27')) {
      assert(html.includes(citation.url.replaceAll('&', '&amp;')), citation.url);
    }
  }
});
