# Liberty evidence and course-plan completion

The release fills missing course choices, reviews existing transfer awards against their exact delivery guides, and keeps independent provider recommendations separate from receiving-school credit.

| Liberty route | Degree credits | Proposed outside credits | Liberty credits | Current result |
| --- | ---: | ---: | ---: | --- |
| Residential Business, Interdisciplinary Business | 120 | 83 | 37 | Research checks pass |
| Criminal Justice, online | 120 | 72 | 48 | Research checks pass |
| Criminal Justice, residential | 120 | 74 | 46 | Research checks pass |
| Interdisciplinary Studies A.A., online | 60 | 42 | 18 | Every baseline course named; other research remains |
| Psychology A.A., online | 60 | 39 | 21 | Every baseline course named; other research remains |
| Healthcare Administration B.S., online | 120 | 66 | 54 | Four new sourced outside choices; other research remains |

All rows describe fresh proposed plans with zero awarded student credits. Published prices remain partial estimates and no new guaranteed graduation dates are introduced. Research-check status is an internal source and academic-feasibility gate; institutions still determine individual awards.

## Changes

- Inherited course candidates must match the target delivery format. Residential guide evidence cannot enter an online plan merely because the receiving institution is the same.
- The complete Sophia/Study.com online guide packet records 299 individual awards and five held composite awards. It preserves actual guide hashes, pages, original provider identifiers, receiving quantities and restrictions. A receiving guide alone does not establish an independent ACE source quantity or period. New research candidates require explicit opt-in; they do not automatically displace the curated baseline.
- Ten current Sophia identities and two Criminal Justice Study.com identities have independent ACE versions, original semester quantities, passing standards and recommendation windows. Health/Fitness/Wellness uses the current version through January 2027; its future version remains distinct. Older individually confirmed school awards retain the existing GuideEngine override.
- Healthcare adds Health 301, 302, 303 and 308 against BUSI 302, 304, 311 and 419. The real optimizer replaces twelve Liberty credits while retaining the complete degree and residency constraints. Health 305 remains held for a receiving-title ambiguity.
- The A.A. baselines use distinct, real university fallback courses. Interdisciplinary's two-credit allocation becomes two one-credit rows for INFT 102/103, preserving its 24-credit major ledger and six-credit university-major residency. Psychology elective prerequisites are sourced from the current course catalog.
- Criminal Justice separates personal transcript/registration tasks, retained baseline waivers, optional optimization research and unresolved selected alternatives. Current university prerequisite blocks and delivery-specific receiving-guide references close the researched baseline gaps.
- The complete 2026–2027 undergraduate catalog supplies the residency and duplicate-credit paragraphs absent from the current overview pages. Its actual captured SHA and physical/printed PDF page numbers are retained. No separate aggregate alternative-credit limit is invented for models that still lack that evidence.

## Reproduce

Run these commands in order after changing the reviewed inputs:

```sh
node scripts/add-liberty-official-mappings.mjs
node scripts/liberty-current-evidence.mjs
node scripts/build-curriculum-registry.mjs
npm run coverage:build
npm run research:school
npm run build
npm test
```

`liberty-current-evidence.mjs` is build-only composition; it does not call an AI provider or access student records. The build rejects stale source overlays and generated artifacts. Focused tests exercise the real optimizer, original-credit recommendation windows, confirmed historical school awards, course uniqueness, exact scope, idempotence and academic totals.

The compact registry omits redundant placement/reference arrays. Full evidence, fingerprints and provenance remain in content-addressed files and hydrate for exact fact review. The unchanged 12 MiB index and 1 MiB evidence-file limits remain enforced.
