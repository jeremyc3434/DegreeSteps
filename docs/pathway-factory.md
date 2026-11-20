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
| `npm run factory:capture -- <url>` | Fetches a page, strips it to text, stores `content/source-captures/<sha256 prefix>.txt` and a sidecar with `url`, `finalUrl`, `fetchedAt`, `sha256`, `contentType`, `status`. |
| `npm run factory:verify [-- <school>] [--as-of YYYY-MM-DD] [--json]` | Hard gate. Exit code 1 on any error. Prints out-of-scope candidates. |
| `npm run factory:compile [-- <school>] [--out dir]` | Verifies, then compiles publishable programs to `content/curricula/kits/<school>.json`. Refuses on verification errors. |
| `npm run factory:report [-- <school>] [--json]` | "What to build next": directory programs with no kit, and per-program coverage by in-scope equivalencies. |
| `npm run factory:draft -- --school <school> --program-url <url>` | Captures a catalog page and, with `ANTHROPIC_API_KEY`, drafts `programs/<slug>.json` (status `draft`). |
| `node scripts/pathway-factory/migrate-from-model.mjs content/curricula/<file>.json --school <id>` | Decomposes a legacy curriculum document into a kit and checks parity. |

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
| `receivingCode` / `receivingTitle` | one | Join key. A row joins the requirement with the same `code`; when the school publishes no code, the requirement with no code and the same (normalized) title. |
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

## Verification (`verify.mjs`)

Hard errors (compile refuses):

- **Credits**: requirement credits do not sum to `totalCredits`; a requirement, program or row has an unknown or different credit system (`mixed-units` — quarter and competency units are never treated as semester hours); a provider course lacks `sourceCredits` or `sourceCreditSystem`; a row awards more than its requirement (`over-award`).
- **Grounding**: a quote's text is not in its capture (`quote-not-found`); a quoted source has no capture; a capture file is missing or no longer matches its sidecar hash; a quote cites a source outside the claim's `sourceIds`.
- **Sources**: any referenced source id is unknown (all `sourceIds`, `*SourceIds`, `sourceId`, `originalSourceId` keys anywhere in the kit); a source has no checked date, an invalid one, or one after `--as-of`; a source id is defined twice.
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

## Leverage report (`report.mjs`)

Per school kit: directory programs (`dist/data/program-catalog.json`, same `schoolId`) with no kit program, and for each kit program the share of requirement credits covered by in-scope published rows, credits covered only by candidates, institution-only credits, open requirements, and "reuse candidates" (provider courses documented for the same receiving course in another program). WGU today: 47 of 66 directory programs have no kit; 32 cross-program reuse candidates exist among the 20 modeled programs.

## Publishing (WGU is live on the factory)

A school kit whose `school.json` has `publish.path` is the **source of truth** for that curriculum document. Since 2026-11-20 WGU publishes `content/curricula/wgu.json` from `content/pathway-kits/wgu`; `scripts/import-wgu-curricula.py` is retired.

- Edit the kit, then run `npm run factory:publish`. `npm run build` runs `compile.mjs --publish --check` in place of the old importer and fails if the published file is stale.
- After a publish, regenerate downstream artifacts in the usual order (`build-curriculum-registry.mjs`, `coverage:build`, research priorities, school batch) before `npm run build`.
- `content/pathway-kits/<school>/guards.mjs` (optional) exports `checks`: school-specific academic invariants that run against every compiled document. WGU's guards carry the importer's key policy assertions: CU ledgers that balance, institution-only courses with no outside options, 75% ceilings from the program total, capstone residency, the reviewed Business Management pricing and residency basket, per-term pricing and option evidence.
- `publish.sourceOrder` pins document source order. The registry copies document sources into each model, and source order is part of every published model fingerprint. Keeping it stable means saved student plans are not flagged as changed. The WGU switch left every publication fingerprint identical.

## Limitations

- WGU's awards are program-specific agreements, so WGU gains little from multi-program `scope`; the leverage shows up for schools with institution-wide equivalency tables (`scope: {all: true}`).
- Verification checks that quotes exist in captures, not that the quoted text supports the structured value; reviewers still compare them. Migrated WGU content has no quotes or captures yet: it is trusted as `migrated` and checked for structure, units, sources, dates, scope and duplicates only.
- Capture handles HTML and plain text; PDF catalogs are rejected (save their text by hand for now). Captures are not refreshed automatically and do not advance `checked` dates.
- Normalized policies cover transfer and alternative-credit caps and single-award exclusivity; residency, pacing and pricing still travel as verbatim `modelFields`.
- The join is by exact receiving code, else exact normalized title; renamed or recoded courses need explicit `requirementId` placements.
- Drafts depend on the model following the schema; everything it returns is unreviewed until a human signs `review`.
