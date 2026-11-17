# Public curriculum source discovery

`server/curriculum-discovery.mjs` exports `handleCurriculumDiscovery(request, env, options)` and the pure `parseCourseLeafHTML(html, context)` parser. The caller should serve an existing reviewed curriculum first. Discovery is a bounded fallback for a known catalog program whose detailed requirements are not already loaded.

## HTTP contract

`GET /api/curriculum?program=<exact catalog id>` accepts only an indexed program ID. An optional `variant=<server-derived id>` selects an actual university-linked delivery/concentration variant. It never accepts a caller-supplied URL. Other parameters, unknown programs, and non-GET methods are rejected before fetching.

A usable extracted ledger returns:

```json
{
  "version": 1,
  "status": "ready",
  "programId": "known-id",
  "model": { "id": "source-curriculum-<semantic hash>", "requirements": [] },
  "route": { "id": "known-id-source-<semantic hash>", "parentId": "known-id" },
  "source": {
    "url": "https://catalog.liberty.edu/graduate/.../",
    "hash": "<64 hexadecimal SHA-256 characters>",
    "requirementsHash": "<64 hexadecimal SHA-256 characters>",
    "algorithm": "sha256",
    "checkedOn": "YYYY-MM-DD",
    "reviewStatus": "automated-public-source"
  },
  "retrievedAt": "ISO timestamp",
  "expiresAt": "ISO timestamp",
  "cached": false
}
```

`ready` means that the public-source requirement ledger passed extraction checks. It does not mean university approval, current admission eligibility, human review, community verification, or an official transfer award. `model.policyReview` lists unverified academic rules so the planner does not describe those rules as checked. Model sources and requirements preserve university provenance.

Other normal outcomes are:

- `choose-variant`: `variants` contains exact university-link titles, modes when stated, source URLs, and stable IDs. No variant URL is guessed from a title.
- `needs-audit`: `reason` and structured `reasons` explain the specific missing proof. Where possible, `facts` reports the actual parsed and published credits. The caller can open its official-audit import flow while keeping the current degree and courses intact.
- HTTP 503 `cache_unavailable`: the cache binding/migration cannot be used. No private student plan is changed.

## Extraction boundaries

The initial adapter allows only HTTPS `catalog.liberty.edu` and `catalog.odu.edu` undergraduate/graduate/program paths. University-linked variants and redirects must remain on the same original official host. Incoming cookies, authorization and private student records are never forwarded.

The parser recognizes CourseLeaf `sc_courselist` rows and preserves actual receiving codes, course titles, numeric credit values, zero-credit obligations, and closed `or` alternatives. Footnote digits are excluded from course identities. Requirement subtotals and course-sequence grids are not additional courses. Course facts are never inferred from a degree title.

An explicit whole-degree total is preferred. A single-table total can serve as that proof only under a whole-program heading without evidence of omitted major/concentration/general-education sections. Implausibly short bachelor/associate extracts are rejected as partial extracts; the adapter never fills them with a generic 120/60 credits.

`ready` requires unique fixed-credit requirements whose allocation equals the sourced program total. Variable-credit courses, unresolved selection groups, anonymous credit buckets, duplicated requirement codes, unproven total credits, mismatched totals, and accreditation-specific residency needing section allocation return `needs-audit`. This conservative adapter intentionally does not claim to cover every CourseLeaf program.

Exact same-school receiving-course awards from `options.reviewedModels` may be attached as conditional accelerated options. Original public/community provenance and source references remain. Undergraduate evidence does not become graduate evidence. Graduate options require explicit institutional graduate-credit metadata and never inherit Sophia/Study.com/CLEP or other undergraduate alternative-credit acceptance. There are no automatic title-similarity equivalencies.

Every fetch is limited to eight seconds and one MiB. A discovery resolves at most three HTTP requests, including redirects. Larger or more complex sources produce a concrete audit outcome. No runtime AI service is used.

## Cache and immutable revisions

The caller supplies `options.catalog`, optional `options.reviewedModels`, and either `env.DB` or a cache adapter. An injected cache implements `get(key)` and `put(key, payload, ttlSeconds)`; stored payloads carry their own expiry timestamp.

The D1 adapter expects this table, provided by the application's migration:

```sql
CREATE TABLE curriculum_source_cache (
  cache_key TEXT PRIMARY KEY,
  program_id TEXT NOT NULL,
  source_url TEXT,
  payload_json TEXT NOT NULL,
  source_hash TEXT,
  checked_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
```

Latest ready/family responses expire after 30 days. Unsupported or ambiguous responses expire after one day. Ready payloads are also retained, without overwriting an existing revision, at `revision:<model.id>` for ten years. The source hash is exactly 64 hexadecimal characters.

The semantic model/route hash includes program identity, actual requirement/alternative facts, academic policies and attached equivalency facts. It excludes retrieval dates and unrelated HTML nonces. Changed requirements receive a new model and route ID, preserving the meaning of earlier saved plans and evidence references. The complete source-response hash remains separately available as provenance.

## Validation

Run `node curriculum-discovery.test.mjs` or `node --test curriculum-discovery.test.mjs`. The synthetic CourseLeaf fixtures cover balanced graduate ledgers, closed alternatives, footnotes, source totals, partial-major rejection, ambiguous groups/ranges, duplicate counting, cache expiry classes, immutable revisions, school/host limits, request and body limits, timeouts, exact family choices, graduate isolation and accreditation-specific residency. These tests make no external network requests and contain no student data.

Real catalog pages still require live adapter validation. Passing synthetic extraction tests is not evidence that every program on either university's site has been mapped.
