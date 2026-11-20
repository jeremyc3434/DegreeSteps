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

## Leverage report (`report.mjs`)

Per school kit: directory programs (`dist/data/program-catalog.json`, same `schoolId`) with no kit program, and for each kit program the share of requirement credits covered by in-scope published rows, credits covered only by candidates, institution-only credits, open requirements, and "reuse candidates" (provider courses documented for the same receiving course in another program). WGU today: 47 of 66 directory programs have no kit; 32 cross-program reuse candidates exist among the 20 modeled programs.

## Publishing (WGU and Excelsior are live on the factory)

A school kit whose `school.json` has `publish.path` is the **source of truth** for that curriculum document. Since 2026-11-20 WGU publishes `content/curricula/wgu.json` from `content/pathway-kits/wgu`; `scripts/import-wgu-curricula.py` is retired.

- Edit the kit, then run `npm run factory:publish`. `npm run build` runs `compile.mjs --publish --check` in place of the old importer and fails if the published file is stale.
- After a publish, regenerate downstream artifacts in the usual order (`build-curriculum-registry.mjs`, `coverage:build`, research priorities, school batch) before `npm run build`.
- `content/pathway-kits/<school>/guards.mjs` (optional) exports `checks`: school-specific academic invariants that run against every compiled document. WGU's guards carry the importer's key policy assertions: CU ledgers that balance, institution-only courses with no outside options, 75% ceilings from the program total, capstone residency, the reviewed Business Management pricing and residency basket, per-term pricing and option evidence.
- Excelsior University (`content/pathway-kits/excelsior`, publishing `content/curricula/excelsior.json`) was authored directly as a kit: three bachelor's ledgers from the November 2026 catalog and program transfer guides, with outside options only from Excelsior's own Sophia, Study.com and StraighterLine equivalency guides (captured PDFs). Every requirement, equivalency row and policy quotes its capture; its `guards.mjs` asserts semester units, the 113-credit ceiling and 7-credit Excelsior-only floor, the 30-credit upper-level minimum, guide-only evidence and the unknown ACE/NCCRS ceiling. Its directory entries come from `content/research/excelsior-programs.json` through `scripts/merge-opportunity-catalog.mjs`.
- `publish.sourceOrder` pins document source order. The registry copies document sources into each model, and source order is part of every published model fingerprint. Keeping it stable means saved student plans are not flagged as changed. The WGU switch left every publication fingerprint identical.

## Liberty on the factory

Since 2026-11-20 Liberty University's 13 registry-built models publish from `content/pathway-kits/liberty` into the same four files the registry already read: `content/curricula/liberty.json` (10 models), `liberty-history-online.json`, `liberty-online-expansion.json` and `liberty-residential-expansion.json`. The three standalone legacy models (`dist/data/liberty.json`, `dist/data/liberty-criminal-justice-{online,residential}.json`) stay on their old path.

**What the kit holds.** Liberty's registry build used to apply about a dozen Liberty-only stages on top of the raw files (named awards, DSST, Christian Leaders Institute, official guide mappings, verified basics, current evidence, accounting named choices, shared policies, shared-award composition, and same-school awards copied from the legacy models). The parity baseline is therefore the **registry output** (`dist/data/curricula/liberty*.json`, what students get), not the raw files. `scripts/pathway-factory/migrate-liberty.mjs` decomposes that output into the state the registry's *generic* compiler receives: every Liberty stage already joined in, and only the generic stages left to the registry (the generated University option with its grade notice, generic policy-review prompts, allocation bookkeeping, scoped research notices).

**How the registry treats it.** Published Liberty documents carry `"compiledBy": "pathway-factory"`. For such documents `build-curriculum-registry.mjs` skips every school augmentation stage (Liberty stages, reviewed course-listing identities, same-school and named/DSST injection), keeps its generic compilation, appends the grade notice only to the institutional option it generates itself, and only clears a `selectionRequired` that the document set. The approved shared-award bundle (`content/reuse/liberty-undergraduate-awards.json`) stays upstream evidence: the registry composes it onto each factory model again only as an audit that must change nothing, so a bundle update cannot silently diverge from the kit.

**Parity.** `liberty-pathway-kit.test.mjs` proves `compile(kit)` deep-equals the registry-input form of all 13 registry models, runs `build-curriculum-registry.mjs --check` (the published documents compile to exactly the committed outputs), and checks that a fresh migration reproduces the committed kit. At the switch, all 13 compiled models were canonically identical to the previous registry output, `curriculum-registry.json`, `curriculum-course-index.json`, `curriculum-coverage.json`, the academic registry revision, every baseline and every `publication-index.json` fingerprint were unchanged; only JSON key order inside `dist/data/curricula/liberty*.json` moved (fingerprints are key-sorted).

**Reuse.** 9,254 outside options become 875 equivalency rows (10.6 placements per row). 267 rows are institution-wide (`scope.all` with levels, modalities and catalogs) and serve 3,906 placements; a row is widened only when its provenance is school-wide (official transfer guide per delivery format, named/DSST/registrar award with its own `degreeLevels`/`modalities`, or a same-school award the registry already applied by format), its own conditions carry no context of the requirement it was observed in (an elective-block notice or that requirement's grade notice), **and** every migrated program in that scope that has the receiving course carries it; otherwise it lists its programs. Review records and review dates (`verifiedBasicsReview`, `officialMappingCheckedOn`…) stay in each migrated program rather than `programDefaults`, so new programs never inherit them. 9 placement modes and 67 condition texts are written once. Size: the registry outputs are 24.3 MB; the migrated kit is 3.2 MB in 16 files (`equivalencies.json` 1.8 MB, programs 1.2 MB, `school.json` 0.2 MB), plus 108 lines added to shared provider files and three new ones (CLEP, DSST, Christian Leaders Institute). The published documents are written compact (`publish.compact`).

**Guards** (`content/pathway-kits/liberty/guards.mjs`, from the retired importers and stage assertions): balanced 2026–27 semester ledgers of 60/120 credits; 25% Liberty residency, 75% outside cap and a major residency basis equal to the major's credits; C minimum on upper-level major courses with a cited source; no outside option on Liberty-only courses; awards that fit their requirement and cite model sources; named/DSST/registrar awards only within their documented undergraduate levels and formats; upper-level status from the receiving code; elective-block uses stay conditional unless the bundle reviewed that exact placement; shared-bundle lineage (award, rule, program, credits, receiving course); and the reviewed ledger totals of the History, Healthcare Administration and residential Psychology plans.

**Retired from the build:** `import-liberty-residential-expansion.mjs`, `import-liberty-online-expansion.py`, `import-liberty-history-online.py` (and `import-liberty-curricula.py`, not in the build) now carry a retirement notice. `add-liberty-official-mappings.mjs --check` now covers only the three legacy models. Named-award, DSST, CLI, current-evidence and shared-bundle checks stay: those documents are still upstream evidence (and the legacy models use them).

**New programs authored in the kit (2026-11-20).** Four online associate degrees were written by hand from captured 2026–27 degree completion plans and the captured approved online general-education list, each requirement with verbatim quotes, published to `content/curricula/liberty-pathway-kit.json` with their exact directory route IDs: Religion (A.A.), Apologetics (A.A.), Criminal Justice (A.A.) and Accounting (A.A.). Each 60-credit ledger takes UNIV 104 at its printed 0 credits and proposes general-education electives from the approved list (as the migrated A.A. ledgers do); a major course on that list carries its general-education category once (GOVT 220, BUSI 201). Only institution-wide rows in scope (online, associate, 2026–27) apply; where one provider course has several records the ledger lists one (`optionRows`: published evidence first, then a named award for the exact format). Awards documented only for other Liberty degrees (ACCT 211 by CLEP, BUSI 330 by Sophia and CLI) stay out-of-scope candidates. Institution-wide coverage: Criminal Justice 30/60, Religion, Apologetics and Accounting 24/60. Religion, Apologetics and Criminal Justice became available templates; none is publication-ready. Blocking findings: no reviewed alternative-credit policy for these programs (the shared online policy review lists its own programs and is not inherited), only conditional outside awards, the generic research notices the migrated A.A. ledgers also carry, same-school awards researched for another degree (Criminal Justice), and an undesignated "ACCT Elective" (Accounting stays unavailable). History (A.A.) and Information Systems (A.A.) were left out: their printed general-education overlaps cannot be resolved to 60 credits from the approved list.

## TESU on the factory

Since 2026-11-20 Thomas Edison State University's five registry-built models (B.S.B.A. Accounting and Finance, B.A. English, Psychology and Liberal Studies) publish from `content/pathway-kits/tesu` into the files the registry already read: `content/curricula/tesu-{accounting,english,finance,liberal-studies,psychology}.json`. The legacy General Management model (`dist/data/tesu.json`, a `Catalog.modelFiles` entry with its own supplements `add-tesu-official-mappings.mjs`, `add-tesu-prerequisites.mjs`, `add-tesu-school-submitted-maps.mjs`, `complete-tesu-named-choices.mjs`) stays on its old path.

**Migration.** `scripts/pathway-factory/migrate-tesu.mjs` runs the Liberty decomposition (`migrate-liberty.mjs`, now parameterized by a school config) over `dist/data/curricula/tesu-*.json`. The registry's only TESU augmentation was the same-school stage: 1,726 outside options copied from the General Management model (exact receiving code, plus elective-block placements) became 101 equivalency rows, 3 placement modes and 89 condition texts. At the switch `compile(kit)` deep-equalled the registry input of all five models, the published documents compiled through the registry to canonically identical outputs (only key order inside `dist/data/curricula/tesu-*.json` moved), and `curriculum-registry.json`, the course index, coverage, the academic registry revision and every `publication-index.json` fingerprint were byte-identical. Shared provider files gained only the TESU-observed course identities; untouched provider files are no longer rewritten by a migration.

**Retired importers.** `import-tesu-*.mjs` no longer write `content/curricula`: their builders now act as a cross-check. `--check` (still run by `npm run build`) proves the kit-published document carries exactly the reviewed ledger built from the dated fact snapshots: route, academic model fields, every requirement (ignoring the registry's `selectionRequired:false` bookkeeping) and every named option (`scripts/tesu-kit-ledger-check.mjs`). Narrative notes may be reworded by later evidence reviews.

**Guards** (`content/pathway-kits/tesu/guards.mjs`): balanced 120-credit semester ledgers of 40 requirements with 45 general-education credits; the reviewed program shapes (business core 42, area of study 18 and its Finance courses, free electives, the four required English courses); one course per requirement; resolvable, acyclic, sourced prerequisites; 15-credit residency, the 90-credit combined alternative cap and the derived 105 outside bound bound to their policy evidence, 18 upper-level credits; C minimums on composition, business core and area-of-study courses; SOS-1100 and the capstone without outside options; awards that fit their requirement and cite model sources; the business course-currency rule.

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
| school.json | `publish.documents`, `publish.compiledBy`, `publish.compact` | Several published documents (`{path, programs?, checkedOn?, routes?, sources?: false}`; one without `programs` takes the rest), the registry marker, and one-line output. |

Verification also checks the identity each row actually emits (shared course + row overrides − omissions), so a kit is not blamed for another school's provider-course citations. In `migrated` ledgers, the legacy pipeline's alternative evidence records for one source course (`duplicate-award`) and an unset `institutionalOnly` are warnings; in `reviewed` ledgers they stay errors.

## Limitations

- WGU's awards are program-specific agreements, so WGU gains little from multi-program `scope`; the leverage shows up for schools with institution-wide equivalency tables (`scope: {all: true}`).
- Verification checks that quotes exist in captures, not that the quoted text supports the structured value; reviewers still compare them. Migrated WGU content has no quotes or captures yet: it is trusted as `migrated` and checked for structure, units, sources, dates, scope and duplicates only.
- Capture handles HTML, plain text and PDFs with a text layer (pdfjs-dist; one line per visual row, pages separated by a blank line). Scanned PDFs without text are rejected, not OCRed. Table cells that wrap in a PDF can interleave across lines, so quote contiguous runs and compare them with the rendered page. Captures are not refreshed automatically and do not advance `checked` dates.
- Normalized policies cover transfer and alternative-credit caps and single-award exclusivity; residency, pacing and pricing still travel as verbatim `modelFields`.
- The join is by exact receiving code, else exact normalized title; renamed or recoded courses need explicit `requirementId` placements.
- Drafts depend on the model following the schema; everything it returns is unreviewed until a human signs `review`.
