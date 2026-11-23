# Pathway Factory

The Pathway Factory is a normalized, source-grounded way to author curriculum models. It sits **beside** the existing pipeline: it does not change `content/curricula/*.json`, `scripts/build-curriculum-registry.mjs` or the published model list. Its compiler emits documents in the existing curriculum model schema, and a round-trip test proves it reproduces `content/curricula/wgu.json` exactly.

Why: a legacy model repeats each provider course's identity, mapping record, conditions and evidence inside every option of every requirement (`wgu.json`: 689 options, 95 distinct provider courses, 23 distinct condition texts). Each new program or school needed its own importer. A kit writes each fact once and the compiler joins them.

```
content/pathway-kits/
  providers/<provider>.json          provider course identities, shared by every school
  <school>/school.json               school facts, defaults, policies, routes, sources
  <school>/equivalencies.json        ONE table: provider course -> receiving course, with scope
  <school>/programs/<slug>.json      program identity + requirement ledger (no options)
content/source-captures/<sha16>.txt  captured page text (+ <sha16>.json sidecar)
content/curricula/kits/<school>.json compiled output (generated, git-ignored)
```

| Command | What it does |
| --- | --- |
| `npm run factory:capture -- <url>` | Fetches a page (HTML, plain text or a PDF with a text layer), strips it to text, stores `content/source-captures/<sha256 prefix>.txt` and a sidecar with `url`, `finalUrl`, `fetchedAt`, `sha256`, `contentType`, `status`. |
| `npm run factory:verify [-- <school>] [--as-of YYYY-MM-DD] [--json]` | Hard gate. Exit code 1 on any error. Prints out-of-scope candidates. |
| `npm run factory:compile [-- <school>] [--out dir]` | Verifies, then compiles publishable programs to `content/curricula/kits/<school>.json`. Refuses on verification errors. |
| `npm run factory:report [-- <school>] [--json]` | "What to build next": directory programs with no kit, and per-program coverage by in-scope equivalencies. |
| `npm run factory:draft -- --school <school> --program-url <url>` | Captures a catalog page and, with `ANTHROPIC_API_KEY`, drafts `programs/<slug>.json` (status `draft`). |
| `npm run factory:draft -- --school <school> --batch --program-urls <file> [--summary <file.json>]` | Batch mode: captures up to 25 pages and drafts them all in one Message Batches request (half price). See Automated drafting. |
| `node scripts/pathway-factory/run-report.mjs --school <school> --summary <file.json>` | Markdown for a draft run's pull request: which drafts verify, their errors, and coverage by in-scope equivalencies. |
| `node scripts/pathway-factory/import-sophia-partner.mjs --school <id> --partner <sub> [--name …] [--credit-system …] [--check]` | Imports a Sophia partner page's course table as provider-published equivalency rows (see Sophia partner pages). |
| `node scripts/pathway-factory/freshness.mjs [--dry-run] [--url <part>] [--limit N]` | Re-fetches every captured source page and reports changed ones (see Freshness). `--dry-run` writes only the report. |
| `node scripts/pathway-factory/migrate-from-model.mjs content/curricula/<file>.json --school <id>` | Decomposes a legacy curriculum document into a kit and checks parity. |
| `node scripts/pathway-factory/migrate-liberty.mjs [--check]` | Decomposes Liberty's registry-compiled models into `content/pathway-kits/liberty` and checks parity (see Liberty on the factory). |

## File formats

All files are JSON objects with `kind` and `version: 1`. Dates are `YYYY-MM-DD`. Credit systems are `semester`, `quarter` or `competency-unit`. They are never converted: provider quantities (`sourceCredits` + `sourceCreditSystem`) and receiving awards (`credits` + `creditSystem`) are both kept.

### Source

Every source-bearing array (`sources` in school, program and provider files) uses the existing source shape, plus optional grounding fields:

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | Unique across the school kit, its programs and all provider files. |
| `url` | yes | |
| `checked` or `checkedOn` | yes | A real date that is not after the verification date. Capturing a page never changes it. |
| `capture` | no | Path (repo-relative) to a `content/source-captures/*.txt` file. Its sidecar hash must still match. |
| other | no | Existing fields such as `title`, `kind`, `roles`, `sha256`, `scope` are carried through verbatim. |

A **quote** is `{sourceId, text}` inside a `quotes` array on a requirement, an equivalency row, a policy or a program. `text` must appear in the source's capture after normalization (Unicode NFKC, curly quotes and dashes folded, whitespace collapsed, case-insensitive). The quote's `sourceId` must be among the claim's own `sourceIds` when the claim has them. Quotes stay in the kit; they are not emitted into compiled models.

### `providers/<provider>.json`

```json
{"kind":"pathway-kit-provider","version":1,"provider":"Sophia",
 "sources":[{"id":"sophia-soph-0083-current-offer","url":"…","checked":"2026-11-17"}],
 "courses":[{"code":"SOPH-0083","title":"Organizational Behavior","codeAliases":["BUSI2015"],
   "sourceCredits":3,"sourceCreditSystem":"semester","url":"https://www.sophia.org/…",
   "identitySourceIds":["sophia-soph-0083-current-offer"],"sourceCreditStatus":"verified", "…":"…"}]}
```

`code`, `sourceCredits` (> 0) and `sourceCreditSystem` are required. Optional identity fields are those in `identityFields` (`scripts/pathway-factory/lib.mjs`): `title`, `codeAliases`, `url`, `identitySourceIds`, `sourceCreditStatus`, `sourceCreditVerification`, `sourceCreditBasis`, `sourceUpper`, `providerCourseEffectiveDates`, `aceId`, `recommendationStart`, `recommendationEnd`, `recommendationPeriodSourceIds`, `providerCourseCode`, `identityReviewId`, `identityCheckedOn`, `courseVersion`, `providerCoursePassingPercent`. A provider identity is never a receiving award. Courses are written one per line.

### `<school>/school.json`

| Field | Notes |
| --- | --- |
| `id` | Directory school id (matches `schoolId` in `dist/data/program-catalog.json`). |
| `name` | Emitted as `model.school`. |
| `creditSystem` | Default program credit system. |
| `checkedOn` | Emitted as the compiled document's `checkedOn`. |
| `policies` | Normalized school-wide policies (below). Program `policies` override by name. |
| `programDefaults` | Model fields shared by every program, copied onto each compiled model (WGU: `format`, `modalities`, `coverage`, `completeExecutablePathway`, `paceModel`). |
| `programOrder` | Optional compiled model order (slugs). Unlisted programs follow by slug. |
| `routes` | Optional declared degree variants, emitted as the document's `routes` (same shape as today). |
| `sources` | School sources. |

**Policies** are `{value, creditSystem?, sourceIds, quotes?, basis?}`:

| Policy | Compiled to | Used by verify |
| --- | --- | --- |
| `transferMaxCredits` | `externalMaxCredits` | — |
| `alternativeMaxCredits` | `alternativeMaxCredits`, `alternativeCapSourceIds` | — |
| `oneAwardPerSourceCourse` | — | Permits one provider course to appear as an alternative in several requirements; without it that is a duplicate-award error. |

Richer legacy structures (residency, pacing, pricing, transfer rules, review records) are carried in program `modelFields` until they get normalized policies of their own.

### `<school>/equivalencies.json`

```json
{"kind":"pathway-kit-equivalencies","version":1,"school":"wgu",
 "conditionLibrary":{"wgu-one-original-course-may-satisfy-only":"One original course may satisfy only one WGU requirement; …"},
 "equivalencies":[
  {"id":"sophia-soph-0083-to-c715-business-management-bs","provider":"Sophia","code":"SOPH-0083","status":"published",
   "receivingCode":"C715","receivingTitle":"Organizational Behavior","credits":3,"creditSystem":"competency-unit",
   "sourceIds":["wgu-bsmgt-sophia-approved-7112-v186"],"evidence":"published","evidenceType":"official-receiving-school-equivalency",
   "creditOrigin":"alternative","sourceType":"alternative","conditionIds":["wgu-this-published-match-is-limited-to","wgu-one-original-course-may-satisfy-only"],
   "mappingChecked":"2026-11-17","mappingReviewId":"…","universityMapRecord":{"programId":240,"catalogTerm":"202605","agreementId":7112,"…":"…"},
   "scope":{"programs":["business-management-bs"]},
   "placements":{"business-management-bs":{"optionId":"sophia-soph-0083-bsmgt-current-c715","order":1}}}]}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Stable row id. |
| `provider`, `code` | yes | Must exist in a provider file. |
| `status` | yes | `published` (applied in scope) or `candidate` (never applied, reported). |
| `receivingCode` / `receivingTitle` | one | Join key. A row joins the requirement with the same `code`; failing an exact match, the one requirement whose code is equal after uppercasing and dropping spaces, hyphens and periods (`MGMT-110` joins `MGMT 110`; two such candidates join neither). When the school publishes no code, the requirement with no code and the same (normalized) title. |
| `credits`, `creditSystem` | yes | Receiving award in the program's units. |
| `scope` | yes | `{"programs":[slug,…]}` or `{"all":true, "catalogs"?:[…], "levels"?:[…]}`. This is the leverage: one row serves every program in scope. A row matching a program outside its scope becomes an **out-of-scope candidate**, never an option. |
| `sourceIds` | yes | Receiving-school evidence. |
| `evidence`, `evidenceType`, `creditOrigin`, `sourceType`, `conditionSourceIds`, `mappingChecked`, `mappingReviewId`, `universityMapRecord` | no | Copied verbatim onto compiled options. |
| `conditions` or `conditionIds` | no | Inline texts, or ids into `conditionLibrary`. |
| `quotes` | no | Grounding quotes for the award. |
| `placements` | no | Per program slug: `optionId` (default `<provider>-<code>-<requirementId>`), `order` (option order within the requirement; default provider then code), `requirementId` (explicit join when code/title cannot be used). A placement outside the row's scope is an error. |
| `identity`, `identityOmit` | no | Per-row deviations from the shared provider identity (migration only; e.g. a program that recorded an older identity review). |
| `mappingEvidence` | no | Only when it differs from the derived value (below). |
| `extra` | no | Any other legacy option fields, copied verbatim. |

`mappingEvidence` is derived when a row has `universityMapRecord`: `{schoolName, programName, level, modality (first program modality), catalogYear (universityMapRecord.catalogTerm), provider, providerCourseCode, receivingCode, credits, creditSystem, creditOrigin, sourceIds, programId, agreementId, mappingId}`. All 507 WGU mapping records derive exactly.

### `<school>/programs/<slug>.json`

| Field | Required | Notes |
| --- | --- | --- |
| `slug` | yes | File name and scope key. |
| `modelId` | no | Compiled `model.id` (default `curriculum-<school>-<slug>`). |
| `routeIds` | yes | Must exist in `dist/data/program-catalog.json`, `dist/data/pathways.json` or `school.routes`. |
| `title`, `level`, `catalog`, `totalCredits` | yes | `totalCredits` must equal the sum of requirement credits in the program's credit system. |
| `creditSystem` | no | Only when different from the school. |
| `format`, `modalities` | no | Override `programDefaults`. |
| `review` | yes | `{status:"draft"}`, `{status:"reviewed", reviewer, reviewedOn}`, or `{status:"migrated", source, reviewedOn}` (reviewed under the legacy pipeline). Only `reviewed` and `migrated` compile. |
| `sources`, `quotes`, `policies` | no | Program-level sources, grounding and policy overrides. |
| `modelFields` | no | Verbatim legacy model fields (pricing, residency, transfer rules, review records…). They win over defaults and normalized policies. |
| `requirements` | yes | `{id, code, title, credits, category, institutionalOnly, sourceIds, quotes?, …}`. Any other existing requirement fields (`group`, `transferEligibility`, `curriculumAreaEvidence`…) are carried through. No `options`. |
| `requirements[].institutionOptions` | no | Named courses taken at the receiving school (`{code, title, credits, upper?, sourceIds, url?}`), for example the baseline choice for an elective allocation. They compile to `University` options (`creditOrigin: "institutional"`), never exceed the requirement's credits, must be upper level on an upper-level requirement, and stay out of the compiled requirement itself. |

## Verification (`verify.mjs`)

Hard errors (compile refuses):

- **Credits**: requirement credits do not sum to `totalCredits`; a requirement, program or row has an unknown or different credit system (`mixed-units` — quarter and competency units are never treated as semester hours); a provider course lacks `sourceCredits` or `sourceCreditSystem`; a row awards more than its requirement (`over-award`).
- **Grounding**: a quote's text is not in its capture (`quote-not-found`); a quoted source has no capture; a capture file is missing or no longer matches its sidecar hash; a quote cites a source outside the claim's `sourceIds`.
- **Sources**: any referenced source id is unknown (provider identities are shared by every kit, so they are checked as each published row compiles them: the shared course plus the row's `identity` overrides); all `sourceIds`, `*SourceIds`, `sourceId`, `originalSourceId` keys anywhere in the kit count; a source has no checked date, an invalid one, or one after `--as-of`; a source id is defined twice.
- **Duplicate awards**: one provider course applied twice to a requirement; one provider course applied to several requirements of a program without an `oneAwardPerSourceCourse` policy; repeated option ids.
- **Scope**: a placement for a program outside the row's scope; unknown row statuses; rows without scope; options joined to an `institutionalOnly` requirement.
- **Identity/review**: unknown route ids; a reviewed program without reviewer or date; a draft requirement without a quote.

Not errors: out-of-scope rows that match a requirement by code/title are listed as **candidates** (grouped per provider course, with the programs where they are documented). Drafts produce a warning and are never compiled.

## Compilation (`compile.mjs`)

For each program whose review status is `reviewed` or `migrated`: start from `school.programDefaults`, set identity fields, apply normalized policies, then `modelFields`. Each requirement gets `options` = published, in-scope rows that join it, ordered by placement `order`, then provider, then code. Each option is the provider identity, then the row's identity overrides, then award fields, conditions, `extra` and `mappingEvidence`. The document is `{version, checkedOn, sources, models, routes}`; sources are the school's and programs' sources plus provider sources referenced by compiled models. The output has no timestamps other than source dates, so compiling twice gives byte-identical files.

## WGU round trip

`migrate-from-model.mjs` decomposed `content/curricula/wgu.json` into `content/pathway-kits/wgu` (20 programs), `content/pathway-kits/providers/{sophia,study-com,saylor,straighterline}.json` (95 courses, 57 provider sources) and one 689-row equivalency table. `pathway-factory.test.mjs` proves:

- `compile(kit)` deep-equals every one of the 20 models — model fields, requirement fields and credits, option ids, option order and every option field (provider, code, receivingCode, credits, sourceCredits/units, evidence, evidenceType, sourceIds, identitySourceIds, conditions, mappingEvidence…) — plus the document's sources (as a set), routes and `checkedOn`;
- the committed kit files equal a fresh migration of `wgu.json`, verify with zero errors, and compile deterministically.

What does not round-trip byte-for-byte: **JSON object key order** (the compiler writes options and models in a fixed field order; values are identical, and every consumer reads JSON by key) and **the order of the document's `sources` array** (school sources keep their original order; provider-owned sources follow, grouped by provider). Neither changes any value.

Size: `wgu.json` is 2,806,806 bytes / 64,187 lines. The kit (26 files) is 1,452,352 bytes / 20,132 lines: **48% fewer bytes, 69% fewer lines** (equivalencies 703 KB, programs 527 KB, school 110 KB, providers 112 KB). The remaining bulk is real per-program data: WGU publishes agreements per program, so each row carries its own `universityMapRecord` (no WGU award row is shared by two programs), and 191 KB of program review/policy metadata is carried verbatim in `modelFields`. The reduction comes from provider identities written once (95 instead of 689), 23 condition texts written once, derived `mappingEvidence`, and one-row-per-line tables.

Regenerate after the legacy WGU importer changes `wgu.json`:

```sh
node scripts/pathway-factory/migrate-from-model.mjs content/curricula/wgu.json --school wgu
node --test pathway-factory.test.mjs
```

## Drafting with Claude (`draft.mjs`)

`draft.mjs` always captures the page first. Without `ANTHROPIC_API_KEY` it prints the capture path and stops. With a key it sends the capture to `POST https://api.anthropic.com/v1/messages` (plain `fetch`, model `claude-opus-5-5`, `output_config.format` JSON schema, effort `high`) and asks for the ledger with one verbatim `quote` per requirement. It also opts into the server-side refusal fallback (`anthropic-beta: server-side-fallback-2026-07-01`, `fallbacks: "default"`); pass `--no-fallback` to turn that off. Refusals and `max_tokens` stops fail loudly, and an over-long capture is rejected instead of truncated.

The result is written as `programs/<slug>.json` with `review.status: "draft"`, a dated source pointing at the capture, the model's `gaps`, and route ids matched by exact catalog URL. It is verified immediately; any quote that is not in the capture is a hard error. A draft never overwrites a reviewed program and never compiles. A reviewer fixes it, adds equivalency rows if needed, then sets `review: {status: "reviewed", reviewer, reviewedOn}`.

## Automated drafting (`.github/workflows/factory-draft.yml`)

**How the owner runs it.** GitHub → **Actions** → **Pathway Factory draft run** → **Run workflow**. Enter:

- `school`: an existing kit id (`wgu`, `liberty`, `tesu`, `excelsior`, …) or a new lowercase id (`snhu`). A new id gets a skeleton `school.json` whose name reads "(official school name needed)" and whose credit system comes from the first draft; the reviewer completes it.
- `program_urls`: official catalog program pages, one per line or separated by spaces, https only, at most 25 per run.

One-time setup: the `ANTHROPIC_API_KEY` repository secret (already present), and Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests" (the workflow uses the default `GITHUB_TOKEN`; it declares `contents: write` and `pull-requests: write` and nothing else).

**What it does.** It checks out `main`, captures each page (`capture.mjs`), and runs `draft.mjs --batch`: every draft goes into **one** Message Batches request (`POST /v1/messages/batches`) with the same model, schema, effort and `max_tokens` as single mode. Batches are billed at 50% and cannot carry server-side `fallbacks`, so batch requests omit that parameter (and the beta header). Before submitting, the script prints an offline token estimate (≈3.5 characters per token plus the system prompt and schema) and a cost range. It polls every minute until `processing_status` is `ended`, reads the JSONL results keyed by `custom_id`, and writes each draft exactly as single mode does. A refusal, a `max_tokens` stop, an errored or expired request, or a failed capture fails only that page. A batch still running after 5.5 hours is cancelled (unprocessed requests are not billed) so the job ends inside GitHub's 6-hour limit. Then it runs `factory:verify` and `factory:report`, checks that the only changed files are this kit's drafts and new captures (every changed program must be `status: draft`), commits to `factory/<school>-<run id>` and opens a pull request to `main`.

**What the pull request means.** It proposes unreviewed drafts plus the captures they quote. The body lists every submitted URL: drafted or why not, the program file, whether it passes verification (with each error), and the share of its credits covered by in-scope equivalencies; the kit's leverage report is folded at the end. Merging it adds drafts to the repository and nothing else: drafts never compile, never reach `content/curricula` and never appear on the site. Publishing stays a separate human step: a reviewer fixes the errors, binds route ids, sets `review: {status: "reviewed", reviewer, reviewedOn}` and runs `npm run factory:publish` in a normal change. Close the pull request to discard the drafts. Pull requests opened with `GITHUB_TOKEN` do not start the Core checks workflow on their own; push a commit (or close and reopen the pull request) to run them.

**Cost.** Measured offline on real captures (Liberty Accounting A.A. degree completion plan: 6,180 characters, 19 requirements; Excelsior B.S. Psychology transfer guide: 19,373 characters, 29 requirements): about 2,600–6,500 input tokens per page including the ≈770-token prompt and schema, and roughly 1,000–1,500 tokens of ledger JSON plus adaptive thinking. At the batch rates for `claude-opus-5-5` ($2 input / $10 output per million tokens) a typical draft costs about **$0.05–0.08**, and no draft can exceed about $0.18 (the 16,000-token output cap). A full 25-page run is typically under $2. The pull request reports the tokens actually billed.

## Catalog PDFs: page ranges (`#pages=…`)

Some schools publish the whole catalog as one PDF (UMGC: 379 pages; Columbia Southern: 246 pages, two columns). A program URL may then name only the pages that hold that program, so the capture, the draft and its quotes cover that program and nothing else.

| Fragment | Meaning |
| --- | --- |
| `#pages=38-40` | PDF pages 38 to 40 (1-based PDF page numbers, not the printed page numbers). |
| `#pages=34-36,38-40` | Several ranges, read in the order written. Use this to put the shared general-education pages before the program's own pages. |
| `#pages=12` | One page. |
| `&columns=2` | Two-column layout: each page is read left column first, then right column. The gutter is found per page (the widest band in the middle of the text that almost no text crosses; running headers and rotated side tabs are ignored). A page with no gutter is read as one column. |

Rules: ranges must run forward, may not overlap, at most 20 ranges and 80 pages, and `#pages` only applies to PDFs. Invalid fragments are rejected by `parseUrlList`, so the draft workflow fails before capturing anything. The fragment is never sent to the server. The capture keeps the full URL with its fragment; its sidecar adds `pages`, `columns` and `documentSha256` (the hash of the whole PDF), while `sha256` remains the hash of the ranged text that quotes are grounded against. A URL without `#pages` (or with an ordinary in-page anchor) is captured exactly as before.

Freshness re-fetches a ranged source and compares only its own pages, so an edit elsewhere in the catalog flags nothing; ranged sources of the same PDF share one download per run.

Ready-to-run batches (verified page ranges, 2026-11-23): `docs/factory-batches/umgc.txt` (21 programs; school id `umgc`) and `docs/factory-batches/columbia-southern.txt` (17 programs; school id `columbia-southern`). Paste the URL lines into "Pathway Factory draft run".

## Sophia partner pages (`import-sophia-partner.mjs`)

```
node scripts/pathway-factory/import-sophia-partner.mjs --school <kit-id> --partner <sub> \
  [--name "<Official School Name>"] [--credit-system semester|quarter] [--check]
```

Sophia publishes a page per partner school (`https://<sub>.sophia.org/`) with a table of Sophia courses and the partner course each one transfers as: Sophia course, receiving course, ACE id (`SOPH-####`), credits. The importer captures that page (same text capture as `capture.mjs`), parses the table and merges rows into `content/pathway-kits/<kit-id>/equivalencies.json`. A new kit gets a `school.json` with the official name (`--name` is required for a new or placeholder-named kit) and the credit system (`--credit-system`, else the page's "Qtr/Sem Credits" header or the credits' ratio to Sophia's own semester credits). It adds no programs: program ledgers still come from the school's catalog (drafting) and join these rows by exact receiving code.

**Evidence tier.** Every row is `evidence: "conditional"`, `evidenceType: "provider-published-equivalency"`. Sophia, not the school, publishes the match, so a plan using it stays at **needs school confirmation** and carries the condition `sophia-partner-provider-published` ("Sophia publishes this course match on its <School> partner page … confirm it applies to your program and catalog year"). The source record is `<kit-id>-sophia-partner-page` (`kind: provider`, `publisher: Sophia Learning`).

**What becomes a published row** (scope `{all: true}`, quote grounded in the capture): receiving text naming exactly **one** course code (`ENG130 - Foundations of Written Communication`, `ACC-250 Financial Accounting`, `CMIT-200`, `Data Analytics I (CIS 362)`), awarded in the kit's own units. A parenthetical restriction without a number ("Lower Level Credit Only", "No lab") is kept as a row condition.

**What stays a candidate** (kept verbatim in `extra.partnerReceivingText` with `extra.candidateReason`; candidates never compile): "X OR Y", "//" and second-code choices (`choice-or-multiple`); electives, transfer buckets, categories and general-education areas (`elective-or-category`); placeholders such as `COMM-1XX` (`no-course-code`); code ranges (`code-range`); a parenthetical quantity that differs from the listed credits, such as "(5 Qtr Credits)" (`quantity-qualifier`); Sophia's own course codes shown in place of a school course (`sophia-own-course-code`); a plain "Credits" column that does not state award units (`award-units-unstated`), or states units other than the school's (`award-units-differ-from-school`, e.g. National University's page lists Sophia's semester credits for a quarter-unit school); and a row whose shared Sophia identity cites evidence no kit defines (`provider-identity-unverifiable`). SOPH codes with no identity in `providers/sophia.json` are skipped and reported; the "Sophia Courses Without Transfer Equivalency" table is ignored.

**Merging and re-runs.** Rows carry `mappingReviewId: sophia-partner-import-<sub>`; a re-run replaces only those rows and keeps every other row in the kit. A new row that duplicates an existing published award (same provider course and receiving course) is skipped and reported as an overlap. The pages show live review counts, so the source records a `tableSha256` of the parsed table: when the table is unchanged the earlier capture, checked date and rows are kept, and a re-run is a no-op. `--check` fetches and parses but writes nothing, and exits 1 when the kit would change. When a published row's shared Sophia identity cites a source another kit defines (for example a Sophia course page first captured for WGU), that source record is copied into this kit's `school.json` with `copiedFor`/`copiedFrom`, so the identity keeps its evidence.

**First import (2026-11-23)**, published / candidate rows: SNHU 43/16, UMGC 46/12, APUS 39/19, Bellevue 33/26, Champlain College Online 31/22, Strayer (quarter) 28/28, Columbia Southern 23/16, CSU Global 16/42, Purdue Global (quarter) 13/46, UAGC 11/48, SUNY Empire State 9/40, Capella (quarter) 8/51, Franklin 6/52, Charter Oak 3/10, National University (quarter) 0/36. These kits have no programs yet.

## Freshness (`freshness.mjs`, `.github/workflows/factory-freshness.yml`)

**When it runs.** Every Monday at 09:17 UTC, and by hand from **Actions** → **Pathway Factory freshness check** → **Run workflow**.

**What it checks.** Every URL with a capture: each `content/source-captures/*.json` sidecar and every kit or provider source with a `capture`. Requests are sequential, one second apart, with a `DegreeSteps-FreshnessCheck/1.0 (+https://degreesteps.com; …)` user agent and a 30-second timeout each. The page is converted to text exactly as `capture.mjs` does and its normalized text (the same normalization quote grounding uses, so whitespace and quote-style changes do not count) is hashed and compared with **the capture the kits cite** (an uncited sidecar is compared with its latest capture). A 403, other HTTP error or timeout is recorded as `unreachable` and never fails the run or counts as a change.

**What it writes.** `content/freshness/report.json`: for each changed source the URL, old and new normalized hash, old and new capture, the kits and programs that cite it (with their plan route ids) and every quote that no longer appears on the live page; plus the unreachable and unchanged lists. A changed page is stored as a new capture beside the old one. `dist/data/plan-freshness.json` maps each affected plan route id to `{status: "rechecking", since}` (`since` is the first detection date, kept while the same pull request stays open). Then `factory:verify --as-of <today>` runs against the cited captures and its result goes into the summary. No kit, `checked` date or published course list is edited.

**What the pull request means.** When anything changed, the workflow opens or updates **one** pull request, "Freshness: N sources changed", from `factory/freshness` (force-updated each week from `main`). It holds the report, the new captures, `plan-freshness.json` and the regenerated plan pages. Merging it only shows a neutral note — "Rechecking: the school updated a source page on <date>" — on the plan page, the finder card (`programs.html`) and the worksheet (`plan.html`) of each flagged plan. It is a signal for the reviewer, not a research change: read the changed page, point the kit source at the new capture, fix any quote listed as missing (the kit then verifies against the new capture), and remove the plan from `plan-freshness.json`. While a kit still cites an older capture than the live page, the next weekly run flags it again; once every flag is resolved, the next run proposes an empty `plan-freshness.json` ("Freshness: 0 sources changed (clear rechecking notes)"). Close the pull request without merging when a change is cosmetic. When nothing changed and no flags are outstanding, the run writes a job summary only. The report and verify log are also kept as a workflow artifact for 45 days.

Email plan alerts (`server/plan-alerts.mjs`) already fire when a saved plan's fingerprint changes (its plan-library index facts plus the published model's fingerprint). `plan-freshness.json` feeds neither, so freshness flags never send alerts; an alert follows only when a reviewer later publishes changed research.

## Leverage report (`report.mjs`)

Per school kit: directory programs (`dist/data/program-catalog.json`, same `schoolId`) with no kit program, and for each kit program the share of requirement credits covered by in-scope published rows, credits covered only by candidates, institution-only credits, open requirements, and "reuse candidates" (provider courses documented for the same receiving course in another program). WGU today: 47 of 66 directory programs have no kit; 32 cross-program reuse candidates exist among the 20 modeled programs.

## Publishing (WGU and Excelsior are live on the factory)

A school kit whose `school.json` has `publish.path` is the **source of truth** for that curriculum document. Since 2026-11-20 WGU publishes `content/curricula/wgu.json` from `content/pathway-kits/wgu`; `scripts/import-wgu-curricula.py` is retired.

- Edit the kit, then run `npm run factory:publish`. `npm run build` runs `compile.mjs --publish --check` in place of the old importer and fails if the published file is stale.
- After a publish, regenerate downstream artifacts in the usual order (`build-curriculum-registry.mjs`, `coverage:build`, research priorities, school batch) before `npm run build`.
- `content/pathway-kits/<school>/guards.mjs` (optional) exports `checks`: school-specific academic invariants that run against every compiled document. WGU's guards carry the importer's key policy assertions: CU ledgers that balance, institution-only courses with no outside options, 75% ceilings from the program total, capstone residency, the reviewed Business Management pricing and residency basket, per-term pricing and option evidence.
- Excelsior University (`content/pathway-kits/excelsior`, publishing `content/curricula/excelsior.json`) was authored directly as a kit: three bachelor's ledgers from the November 2026 catalog and program transfer guides, with outside options only from Excelsior's own Sophia, Study.com and StraighterLine equivalency guides (captured PDFs). Every requirement, equivalency row and policy quotes its capture; its `guards.mjs` asserts semester units, the 113-credit ceiling and 7-credit Excelsior-only floor, the 30-credit upper-level minimum, guide-only evidence and the unknown ACE/NCCRS ceiling. Its directory entries come from `content/research/excelsior-programs.json` through `scripts/merge-opportunity-catalog.mjs`.
- WGU publishes two documents (2026-11-23). `content/curricula/wgu.json` keeps the nine migrated models with `sources: "own"`, so its source list (and every published fingerprint) is unchanged. `content/curricula/wgu-pathway-kit.json` holds the eleven programs authored from WGU's current public API by `scripts/wgu-agreement-ledgers.mjs` (below), with `sources: false` and per-model `modelSourceIds`.
- `publish.sourceOrder` pins document source order. The registry copies document sources into each model, and source order is part of every published model fingerprint. Keeping it stable means saved student plans are not flagged as changed. The WGU switch left every publication fingerprint identical.

## Liberty on the factory

Since 2026-11-20 Liberty University's 13 registry-built models publish from `content/pathway-kits/liberty` into the same four files the registry already read: `content/curricula/liberty.json` (10 models), `liberty-history-online.json`, `liberty-online-expansion.json` and `liberty-residential-expansion.json`. The three standalone legacy models (`dist/data/liberty.json`, `dist/data/liberty-criminal-justice-{online,residential}.json`) stay on their old path.

**What the kit holds.** Liberty's registry build used to apply about a dozen Liberty-only stages on top of the raw files (named awards, DSST, Christian Leaders Institute, official guide mappings, verified basics, current evidence, accounting named choices, shared policies, shared-award composition, and same-school awards copied from the legacy models). The parity baseline is therefore the **registry output** (`dist/data/curricula/liberty*.json`, what students get), not the raw files. `scripts/pathway-factory/migrate-liberty.mjs` decomposes that output into the state the registry's *generic* compiler receives: every Liberty stage already joined in, and only the generic stages left to the registry (the generated University option with its grade notice, generic policy-review prompts, allocation bookkeeping, scoped research notices).

**How the registry treats it.** Published Liberty documents carry `"compiledBy": "pathway-factory"`. For such documents `build-curriculum-registry.mjs` skips every school augmentation stage (Liberty stages, reviewed course-listing identities, same-school and named/DSST injection), keeps its generic compilation, appends the grade notice only to the institutional option it generates itself, and only clears a `selectionRequired` that the document set. The approved shared-award bundle (`content/reuse/liberty-undergraduate-awards.json`) stays upstream evidence: the registry composes it onto each factory model again only as an audit that must change nothing, so a bundle update cannot silently diverge from the kit.

**Parity.** `liberty-pathway-kit.test.mjs` proves `compile(kit)` deep-equals the registry-input form of all 13 registry models, runs `build-curriculum-registry.mjs --check` (the published documents compile to exactly the committed outputs), and checks that a fresh migration reproduces the committed kit. At the switch, all 13 compiled models were canonically identical to the previous registry output, `curriculum-registry.json`, `curriculum-course-index.json`, `curriculum-coverage.json`, the academic registry revision, every baseline and every `publication-index.json` fingerprint were unchanged; only JSON key order inside `dist/data/curricula/liberty*.json` moved (fingerprints are key-sorted).

**Reuse.** 9,254 outside options become 875 equivalency rows (10.6 placements per row). 267 rows are institution-wide (`scope.all` with levels, modalities and catalogs) and serve 3,906 placements; a row is widened only when its provenance is school-wide (official transfer guide per delivery format, named/DSST/registrar award with its own `degreeLevels`/`modalities`, or a same-school award the registry already applied by format), its own conditions carry no context of the requirement it was observed in (an elective-block notice or that requirement's grade notice), **and** every migrated program in that scope that has the receiving course carries it; otherwise it lists its programs. Review records and review dates (`verifiedBasicsReview`, `officialMappingCheckedOn`…) stay in each migrated program rather than `programDefaults`, so new programs never inherit them. 9 placement modes and 67 condition texts are written once. Size: the registry outputs are 24.3 MB; the migrated kit is 3.2 MB in 16 files (`equivalencies.json` 1.8 MB, programs 1.2 MB, `school.json` 0.2 MB), plus 108 lines added to shared provider files and three new ones (CLEP, DSST, Christian Leaders Institute). The published documents are written compact (`publish.compact`).

**Guards** (`content/pathway-kits/liberty/guards.mjs`, from the retired importers and stage assertions): balanced 2026–27 semester ledgers of 60/120 credits; 25% Liberty residency, 75% outside cap and a major residency basis equal to the major's credits; C minimum on upper-level major courses with a cited source; no outside option on Liberty-only courses; awards that fit their requirement and cite model sources; named/DSST/registrar awards only within their documented undergraduate levels and formats; upper-level status from the receiving code; elective-block uses stay conditional unless the bundle reviewed that exact placement; shared-bundle lineage (award, rule, program, credits, receiving course); and the reviewed ledger totals of the History, Healthcare Administration and residential Psychology plans.

**Retired from the build:** `import-liberty-residential-expansion.mjs`, `import-liberty-online-expansion.py`, `import-liberty-history-online.py` (and `import-liberty-curricula.py`, not in the build) now carry a retirement notice. `add-liberty-official-mappings.mjs --check` now covers only the three legacy models. Named-award, DSST, CLI, current-evidence and shared-bundle checks stay: those documents are still upstream evidence (and the legacy models use them).

**New programs authored in the kit (2026-11-20).** Four online associate degrees were written by hand from captured 2026–27 degree completion plans and the captured approved online general-education list, each requirement with verbatim quotes, published to `content/curricula/liberty-pathway-kit.json` with their exact directory route IDs: Religion (A.A.), Apologetics (A.A.), Criminal Justice (A.A.) and Accounting (A.A.). Each 60-credit ledger takes UNIV 104 at its printed 0 credits and proposes general-education electives from the approved list (as the migrated A.A. ledgers do); a major course on that list carries its general-education category once (GOVT 220, BUSI 201). Only institution-wide rows in scope (online, associate, 2026–27) apply; where one provider course has several records the ledger lists one (`optionRows`: published evidence first, then a named award for the exact format). Awards documented only for other Liberty degrees (ACCT 211 by CLEP, BUSI 330 by Sophia and CLI) stay out-of-scope candidates. Institution-wide coverage: Criminal Justice 30/60, Religion, Apologetics and Accounting 24/60. Religion, Apologetics and Criminal Justice became available templates; none is publication-ready. Blocking findings: no reviewed alternative-credit policy for these programs (the shared online policy review lists its own programs and is not inherited), only conditional outside awards, the generic research notices the migrated A.A. ledgers also carry, same-school awards researched for another degree (Criminal Justice), and, until 2026-11-23, an undesignated "ACCT Elective". The ACCT Elective ("Choose any ACCT course not already required in the major") now proposes ACCT 311 Corporate Accounting from the captured ACCT course descriptions (offered online; its only prerequisite, ACCT 212, is in the degree), so Accounting (A.A.) is an available confirmation-tier plan too. History (A.A.) and Information Systems (A.A.) were left out: their printed general-education overlaps cannot be resolved to 60 credits from the approved list.

**Named elective choices for three migrated programs (2026-11-23).** Psychology (B.S.) residential, Computer Science (B.S.) General residential and Human Services (B.S.) online each had elective slots whose only option was "Choose a specific course", so no complete baseline existed and they were not in the plan finder. Each slot now carries one inline University option (`optionRows: [{inline: …}]`) chosen from the degree plan's own rule or list, offered in the plan's format, with every listed prerequisite already in the degree, cited to the captured 2026–27 course descriptions (new school sources `liberty-<subject>-courses-2026-2027-captured-2026-11-23`): PHED 208 Motor Learning for the 2-credit free-elective remainder; MATH 221, CHEM 121 (with the 0-credit CHEM 121L lab), CSCN 375 and CSCN 444 for Computer Science; PSYC 341, SOWK 432, PSYC 312, PSYC 371 and PSYC 320 for Human Services. Each option states that it is a proposed choice and that another eligible course may be chosen. The kit was re-normalized with `migrate-liberty.mjs` so a fresh migration still reproduces it.

## WGU programs authored from WGU's public API (2026-11-23)

Eleven WGU bachelor's programs that were in the registry but not the plan finder had ledgers copied from older program-guide PDFs: no WGU course codes, catalog editions marked "needs confirmation", and outside options taken from Sophia's marketing pages ("provider-partnership", no receiving code). No complete named baseline could be compiled, so research was `unavailable`. `scripts/wgu-agreement-ledgers.mjs` rebuilds them from WGU's own unauthenticated academic API, captured with `npm run factory:capture` (37 captures under `content/source-captures/`):

- **Ledger:** `program-data?pamsCodes=<CODE>;<catalog>` for the program's active, approved catalog record (`program/college/<BU|IT|HE>`, `inactiveProgram: 0`). Every requirement keeps the WGU course code, title, CUs and area of study, and quotes its raw API record. All eleven ledgers were cross-checked against the November 2026 institutional catalog PDF: same codes, CUs and totals (BSIT prints catalog 202604 there; its course list is identical to the active 202608 record).
- **Nontransferable courses:** `transfer-guidelines/programs?programsCode=<id>` (`transferArea: "Non-Transferable"`) set `institutionalOnly`.
- **Outside options:** only WGU's current partner agreements for the program's college (Sophia 7110/7111/7112, Study.com 4424/4426/4429, StraighterLine 547/550/1855, Saylor 668/670/671; record versions as captured on 2026-11-23, after WGU's March 2026 Sophia changes). A mapping becomes a program-scoped row only when one partner course alone satisfies the WGU course (`&`/`and`/`+` combinations are held) and the shared provider file has an independently verified identity whose recommendation window covers the review date. Every other approved code is listed in `transferEvidenceReview.providerCoverage` (`unknownSourceIdentityCodesHeld`, `multiSourceRequirementsHeld`). No title match, other program or older Sophia table is used.
- **Policies:** the 75% overall ceiling (November 2026 catalog), the upper-level rule covered by the complete named ledger, transfer recency sentences from the program's own notes (attached to the courses they name), and, where the ledger names exactly one nontransferable "Capstone" course, the active-program 25% residency rule plus that capstone (the same reading the business batch used). BSIT, BSSWE and BSCS name no capstone, so their institutional minimum stays an open question.
- **Prices:** for the eight programs that reached the reviewed bar, `content/estimates/plan-estimate-rates.json` gained per-degree entries from captured program pages (tuition per six-month term plus the $200 e-books and resources fee; the $65 application fee from the November 2026 catalog).

Run `node scripts/wgu-agreement-ledgers.mjs` after recapturing, then the usual publish chain; `npm run build` runs it with `--check`. The WGU MBA is not in this set: WGU's public API has no MBA program record, partner agreement or transfer guideline (see `docs/pathway-backlog.md`).

## First automated batch: Strayer, Champlain, APUS and Bellevue (2026-11-23)

The first `factory-draft.yml` runs drafted 77 programs (Strayer 9, Champlain College Online 23, APUS 23, Bellevue 22) from the official catalog or program pages. `scripts/pathway-factory/finalize-four-schools-2026-11-23.mjs` records the review:

- **Join fix.** Sophia tables write `MGMT-110` where catalogs write `MGMT 110`, so no Champlain row joined. `matchRequirement` now falls back to a unique punctuation-insensitive code match. Compiling WGU, Liberty, TESU and Excelsior before and after gives byte-identical documents.
- **Over-awards.** The fix exposed Sophia Calculus I (4 credits) listed against 3-credit courses (Champlain MATH-210, APUS MATH225). Those two rows are demoted to `candidate` with `candidateReason: "award-exceeds-receiving-course-credits"`. A re-run of the importer would restore them, so re-apply the demotion after any re-import.
- **School facts, captured and quoted.** Strayer: no more than 126 of 180 quarter hours (bachelor's) or 63 of 90 (associate) from transfer. Champlain: up to 90 (bachelor's) or 45 (associate) transfer credits. APUS: 90 / 45 academic credits, of which at most 60 / 30 non-traditional (ACE, CLEP). Bellevue: 30 (bachelor's) or 15 (associate) in-residence credits, 30 upper-level credits and 12 major credits in residence (21 upper-level for Accounting, Business Administration and Finance) from the 2025–2027 catalog's degree requirements table; Bellevue publishes no separate transfer ceiling, so the ceiling is the total minus residency.
- **Removed drafts.** Three drafts whose captured page leaves part of the credit total unexplained were removed (their drafts remain in the bot pull requests): Champlain B.S. Accounting (54-credit professional block lists 48), Champlain A.S. General Studies (57 of 60), Bellevue B.S. Psychology (41 major credits, 34 listed). Bellevue Supply Chain and Logistics stays a draft (major total given as both 54 and 57).
- **What published.** The plan finder needs a complete named baseline: one named course per requirement, with matching credits. 58 reviewed programs still carry general-education, concentration or elective blocks without a named course (355 requirements, about 45% of each degree's credits), so they stay drafts with a `heldReason`; their policies, catalog identity and routes are prepared and the finalize script publishes each one once its blocks are filled with named courses from the school's course catalog. 12 Bellevue and 2 APUS drafts also have no outside course joining any named requirement. **Strayer A.A. Information Technology** has every requirement named and publishes at the needs-school-confirmation tier.
- **Index budget.** `dist/data/academic-registry.json` must stay under 12 MiB because the Worker parses it whole. Main was at 11.0 MB; publishing all 59 reviewed programs measured 13.6 MB, and 28 of them 12.4 MB. Growing the library past roughly 30 more programs needs the index split (for example per school, loaded on demand) or a reviewed new budget. *(Superseded the same day: see Open slots and Registry shards below.)*

## PDF-catalog batch: UMGC and Columbia Southern (2026-11-23)

The `#pages` drafting runs (UMGC 21 programs, Columbia Southern 17) were reviewed with `scripts/pathway-factory/finalize-umgc-csu-2026-11-23.mjs`; 35 publish at needs school confirmation (finder 115 → 150). Reasons for the two held programs and the removed duplicate are in `docs/pathway-backlog.md`.

- **Shared engine.** The review logic now lives in `finalize-batch.mjs`; each batch script supplies only school config. Re-running the first batch through it leaves every kit byte-identical. New optional hooks: `extraSlotKinds` (codeless blocks of other categories that are open choices, or `override` a category's default kind), `capstoneAtSchool`, `levels.<level>.majorFraction` (published as `majorInstitutionFraction` + `majorResidencyBasisCredits` over the program's `major` credits) and `levels.<level>.upperResidency` (upper-level credits required at the school; met only when named 300–499 courses and upper-level-only choices with no outside option reach it, otherwise the program is held). Slot rules may carry `extraQuotes` from the school's own catalog.
- **School facts, quoted from page-ranged catalog captures.** UMGC 2026–2027 (PDF pp. 26, 30, 35): 90 (bachelor's) / 45 (associate) credits from all sources; at least 30 / 15 credits at UMGC; half the major at UMGC (not General Studies); 15 upper-level credits at UMGC, recorded in the transfer policy basis because the model's `residencyPolicy` field is reserved for WGU's capstone rule. Columbia Southern 2026–2028 (PDF pp. 25, 28, 200): 25% of an associate or bachelor's degree at CSU (no separate transfer ceiling, so 90 / 45) and capstones at CSU (`institutionalOnly`).
- **Slot rules.** UMGC: the Sophia table's "Elective" and discipline-elective awards (BMGT, COMM, SDEV, HUMN, PHIL) fill only open elective blocks; HUMN and PHIL electives also fill the Arts and Humanities choice because the catalog names HUMN and PHIL among its Arts and Humanities disciplines. The mixed "Remaining General Education and Elective Courses" block is a gen-ed choice that free-elective awards never fill. Columbia Southern: "Open Electives" fills only Open Electives blocks; "Program Electives" are list-restricted major-elective choices; "Humanities A/B" and "Humanities B" fill only a Group A or B humanities choice (never Group A only); "Natural Sciences", "Social and Behavioral Sciences" and the mathematics award fill only the unrestricted block of that name.
- **Prices.** UMGC: the $499 out-of-state standard undergraduate rate (the rate for students outside Maryland), $15 per credit technology fee, $50 application and $50 diploma fees; Maryland-resident ($337) and military ($250) rates are listed as not applied. Columbia Southern: $278 per credit, the $35 per-course technology fee spread as $11.67 per credit, and the $100 petition to graduate; 9-week terms are modeled as 2 months.

## Open slots (owner-approved 2026-11-23)

A sourced requirement block with no single named course ("General Education: Humanities, 6 credits", "Free electives, 12 credits") is an **open slot**: the student picks the course, and the worksheet keeps their choice with the plan.

- **Kit.** A program requirement declares `slot: {kind, label}` with `kind` one of `gen-ed`, `major-elective`, `free-elective`, `concentration`; the label is the source's quoted title. Verify requires a quote, no code, not `institutionalOnly`, and no `institutionOptions`/`optionRows`.
- **Compile.** A slot becomes one requirement per course-sized choice (3 semester credits, 4.5 quarter credits; a smaller remainder is the last choice), each with `allocationSlot: true`, `slot: {kind, label, choice, of, blockId, blockCredits}`, `freeElective` for free electives and `upper` when the label itself restricts the block to upper level. The registry adds the school's "choose a course" placeholder to each choice.
- **Category awards (`equivalencies.json` `slotPlacements`).** An outside course fills a slot only through an explicit rule: `{id, receivingText, slotKinds, labelPattern?, lowerDivision, sourceIds, quotes, condition, basis}`. `receivingText` must equal the provider table's printed category text exactly ("Elective Only", "General Elective (ELC 000)", "GEN-1XX"); `labelPattern` narrows a gen-ed rule to the slot whose own label names that category; lower-division awards never fill an upper-level-only slot; credits must equal the choice. Each eligible course is offered in exactly one choice of its block, so every course stays available without repeating per choice. Options keep `evidence: conditional`, `allocationType` (`free-elective-category` or `general-category`), `receivingCategory` and the rule's condition.
- **Gates.** `Planner.isOpenSlot` / `openSlotPlaceholder`. A slot planned as a course at the school is a complete baseline row; the planner's "choose a course" error becomes a blocking `open-course-choice` confirmation finding, so a plan with open slots stays at "needs school confirmation". Program-catalog readiness and the Worker's degree-link check accept slots.
- **Feasibility.** The plan treats an open elective as a course of unknown level. Where upper-level or major-residency minimums depend on the student's elective choices, the program stays a draft (nine Bellevue degrees on 2026-11-23).
- **Worksheet.** "Choose any approved <label> course — N credits"; the student records the course they pick or took (`state.sheet.slotChoices[program][requirement]`, additive and private); "Ask the community" opens the community composer with a prefilled, editable question in the `program:<model id>` context.

## Registry shards (2026-11-23)

The compact academic registry index no longer carries fact and finding summaries. They live in content-addressed per-school shards, `dist/data/academic-registry-shards/<sha256>.json` (a fact or finding whose programs span schools goes to the shared shard), each at most 8 MiB. The index lists them in `registryShards` with `factShards` and `findingShards` locators. The coverage workbench loads only what a request needs: one program's shards, one fact's shard plus its programs' shards, a source's programs' shards, or every shard for the overview, list and queue views. On 2026-11-23 the index is 4.8 MB and the largest shard 4.2 MB.

## TESU on the factory

Since 2026-11-20 Thomas Edison State University's five registry-built models (B.S.B.A. Accounting and Finance, B.A. English, Psychology and Liberal Studies) publish from `content/pathway-kits/tesu` into the files the registry already read: `content/curricula/tesu-{accounting,english,finance,liberal-studies,psychology}.json`. The legacy General Management model (`dist/data/tesu.json`, a `Catalog.modelFiles` entry with its own supplements `add-tesu-official-mappings.mjs`, `add-tesu-prerequisites.mjs`, `add-tesu-school-submitted-maps.mjs`, `complete-tesu-named-choices.mjs`) stays on its old path.

**Migration.** `scripts/pathway-factory/migrate-tesu.mjs` runs the Liberty decomposition (`migrate-liberty.mjs`, now parameterized by a school config) over `dist/data/curricula/tesu-*.json`. The registry's only TESU augmentation was the same-school stage: 1,726 outside options copied from the General Management model (exact receiving code, plus elective-block placements) became 101 equivalency rows, 3 placement modes and 89 condition texts. At the switch `compile(kit)` deep-equalled the registry input of all five models, the published documents compiled through the registry to canonically identical outputs (only key order inside `dist/data/curricula/tesu-*.json` moved), and `curriculum-registry.json`, the course index, coverage, the academic registry revision and every `publication-index.json` fingerprint were byte-identical. Shared provider files gained only the TESU-observed course identities; untouched provider files are no longer rewritten by a migration.

**Retired importers.** `import-tesu-*.mjs` no longer write `content/curricula`: their builders now act as a cross-check. `--check` (still run by `npm run build`) proves the kit-published document carries exactly the reviewed ledger built from the dated fact snapshots: route, academic model fields, every requirement (ignoring the registry's `selectionRequired:false` bookkeeping) and every named option (`scripts/tesu-kit-ledger-check.mjs`). Narrative notes may be reworded by later evidence reviews.

**TESU-submitted equivalencies (2026-11-20).** TESU publishes its institution-wide course equivalencies through ACE: an ACE National Guide course exhibit lists, under *Equivalencies*, "2026-2027 Thomas Edison State University <credits> <TESU course>". A sweep of every current ACE exhibit for Sophia (99), Study.com (244), StraighterLine (102) and CLEP (41) found TESU equivalencies only for 35 Sophia courses; TESU's current catalog no longer publishes its CLEP exam-to-course table (the listing page returns 404) and tesu.edu publishes no Study.com or StraighterLine table. The 22 Sophia exhibits whose TESU course is a requirement (or a copied elective award) in a kit program were captured and became authored rows (`"authored": true`, `mappingReviewId: tesu-ace-institution-equivalencies-2026-11-20`) scoped `{all, levels:[bachelor], modalities:[online], catalogs:[the current catalog]}`. Each quotes the exhibit's ACE ID/version, its TESU equivalency line and recommendation period, the captured catalog home ("Current Catalogs 2026-2027 Undergraduate Catalog", which binds "current" to 2026–2027), the Approved Provider Directory (Sophia "Provisionally Approved – Review Pending"), Sophia's TESU page (courses listed without an established agreement) and TESU's ACE policy ("The University reserves the right to determine how credit will apply to any of its degree programs."). They replace the copied General Management awards of the same Sophia course wherever TESU's named course is the requirement itself or a free-elective block (381 placements, keeping their option ids so saved selections still resolve) and add 8 placements no copy carried. A category substitution (Human Biology for EAS-1010) keeps its copied evidence. The rows stay `conditional` with a blocking provider-eligibility review: the receiving match is documented, enrollment eligibility is not. TESU's own policy sentence "Application to one degree does not imply application to any other degree" is why the remaining copied awards (other Sophia courses, Study.com, CLEP) are not widened.

**Guards** (`content/pathway-kits/tesu/guards.mjs`): balanced 120-credit semester ledgers of 40 requirements with 45 general-education credits; the reviewed program shapes (business core 42, area of study 18 and its Finance courses, free electives, the four required English courses); one course per requirement; resolvable, acyclic, sourced prerequisites; 15-credit residency, the 90-credit combined alternative cap and the derived 105 outside bound bound to their policy evidence, 18 upper-level credits; C minimums on composition, business core and area-of-study courses; SOS-1100 and the capstone without outside options; awards that fit their requirement and cite model sources; the business course-currency rule; provisionally approved providers (Sophia, StraighterLine, CLEP) keep a visible restriction; TESU-submitted matches stay conditional, name the 2026–2027 catalog and sit only in their own course's requirement or a free-elective block; authored institution-wide rows quote TESU's equivalency and the exact ACE identity.

### Kit extensions used by Liberty

| Where | Field | Meaning |
| --- | --- | --- |
| equivalency row | `scope.modalities` | With `all: true`, the program's modalities (`program.modalities` or the school default) must all be listed. |
| equivalency row | `optionId` | The compiled option id for every placement of the row (overridden by `placements[slug].optionId` or a placement entry's `optionId`). |
| equivalency row | `impliedCreditSystem` | Kit-only: the award's units are stated by the document it was researched in, not on the option (Liberty same-school awards, placed by the registry only where the source model's units matched). Never emitted. |
| equivalencies.json | `placementModes` | `{id: {set?, unset?, appendConditionIds?, placementEvidence?: {placementType, extraSourceIds?, citeInOption?}, idSuffix?: "requirement"}}`: what one placement adds to its row (an elective-block use, a derived `degreePlacementEvidence` for this model and requirement, a requirement-specific option id). |
| requirement | `optionRows` | Explicit, ordered placements: `"rowId"`, `"rowId@mode"`, `{row, mode?, optionId?}`, or `{inline: option}` for an institutional (University) option. When present, it replaces the code/title join for that requirement; in-scope rows that match but are not listed are reported as `not-placed` candidates. Rows must be published and in scope. |
| program | `modelSourceIds`, `sourceOverrides` | The model's own ordered `sources`; ids whose revision differs from a shared source (also allowed on `school.json`). |
| provider course | `sourceCredits: null` | The evidence establishes no original quantity (no `sourceCreditSystem` then). Omitting the field is still an error; null quantities are never emitted. |
| school.json | `publish.documents`, `publish.compiledBy`, `publish.compact` | Several published documents (`{path, programs?, checkedOn?, routes?, sources?: false \| "own"}`; one without `programs` takes the rest), the registry marker, and one-line output. `sources: "own"` keeps a document's sources to the school's sources, its own programs' sources and the provider sources its models cite (in pinned order), so programs published in another document never change it. |
| equivalency row | sources of scoped programs | A row scoped to `programs` may cite a source that every program in its scope defines in its own `sources` (for example a program-specific receiving-map capture); quotes on the row are checked against that capture. |

Verification also checks the identity each row actually emits (shared course + row overrides − omissions), so a kit is not blamed for another school's provider-course citations. In `migrated` ledgers, the legacy pipeline's alternative evidence records for one source course (`duplicate-award`) and an unset `institutionalOnly` are warnings; in `reviewed` ledgers they stay errors.

## Limitations

- WGU's awards are program-specific agreements, so WGU gains little from multi-program `scope`; the leverage shows up for schools with institution-wide equivalency tables (`scope: {all: true}`).
- Verification checks that quotes exist in captures, not that the quoted text supports the structured value; reviewers still compare them. Migrated WGU content has no quotes or captures yet: it is trusted as `migrated` and checked for structure, units, sources, dates, scope and duplicates only.
- Capture handles HTML, plain text and PDFs with a text layer (pdfjs-dist; one line per visual row, pages separated by a blank line). Scanned PDFs without text are rejected, not OCRed. Table cells that wrap in a PDF can interleave across lines, so quote contiguous runs and compare them with the rendered page. The weekly freshness check re-fetches captures and reports changed pages, but it never edits kits or advances `checked` dates; that stays a reviewer's decision. The freshness hash is of normalized page text, so a page whose rendered text changes every visit (a date or counter) is reported every week until its source is re-pointed or the noise is excluded.
- Normalized policies cover transfer and alternative-credit caps and single-award exclusivity; residency, pacing and pricing still travel as verbatim `modelFields`.
- The join is by exact receiving code, else exact normalized title; renamed or recoded courses need explicit `requirementId` placements.
- Drafts depend on the model following the schema; everything it returns is unreviewed until a human signs `review`.
