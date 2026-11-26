# DegreeSteps pathway expansion — November 26, 2026

## Status and scope

The current generated publication index contains **43 ready degree editions: 30 preserved, five additional TESU undergraduate editions, and eight additional WGU editions**. The WGU additions include five bachelor's programs and three MBA programs. These counts describe complete proposed starting plans that pass the publication gate, not individual student transfer awards or all programs in the discovery directory.

Release and validation evidence is maintained in [pull request 42](https://github.com/jeremyc3434/DegreeSteps/pull/42), its [core checks](https://github.com/jeremyc3434/DegreeSteps/actions/workflows/ci.yml), and the [deployment workflow](https://github.com/jeremyc3434/DegreeSteps/actions/workflows/deploy.yml). The source-data snapshot in this handoff is separate from the deployment status recorded there.

The generated sources of truth are `dist/data/pathway-quality-report.json`, `dist/data/publication-index.json`, `dist/data/baseline-index.json` and `dist/data/plan-library-index.json`. The broader registry contains research-stage programs; its size must not be reported as the count of ready plans.

## Newly ready editions

Outside quantities below are those of the currently selected, validated published baseline. They are not advertised transfer ceilings or proof that no better combination exists. TESU uses semester credits; WGU uses competency units (CUs). Original provider quantities and receiving quantities remain independent.

| School and degree | Exact model ID | Catalog identity | Degree units | Selected outside units |
| --- | --- | --- | ---: | ---: |
| TESU — B.A. English | `curriculum-tesu-ba-english` | Reviewed current undergraduate catalog | 120 | 60 |
| TESU — B.A. Humanities, Liberal Studies | `curriculum-tesu-ba-liberal-studies` | Reviewed current undergraduate catalog | 120 | 72 |
| TESU — B.A. Psychology | `curriculum-tesu-ba-psychology` | Reviewed current undergraduate catalog | 120 | 69 |
| TESU — B.S.B.A. Accounting | `curriculum-tesu-bsba-accounting` | Reviewed current undergraduate catalog | 120 | 63 |
| TESU — B.S.B.A. Finance | `curriculum-tesu-bsba-finance` | Reviewed current undergraduate catalog | 120 | 63 |
| WGU — B.S. Accounting | `curriculum-wgu-catalog-358f1e10651bf3d8` | `202503` | 121 | 72 |
| WGU — B.S. Information Technology Management | `curriculum-wgu-catalog-bf14bd14e87ae7aa` | `202609` | 112 | 64 |
| WGU — B.S. Computer Science | `curriculum-wgu-bs-computer-science-reviewed` | `202611` | 121 | 51 |
| WGU — Software Engineering | `curriculum-wgu-catalog-3a9fedcacbfcccae` | `202610` | 120 | 61 |
| WGU — Information Technology | `curriculum-wgu-catalog-d734fb4b04eded7c` | `202608` | 110 | 47 |
| WGU — MBA | `curriculum-wgu-catalog-b2a8a37d4fbedabd` | `201404` | 34 | 0 |
| WGU — MBA Information Technology Management | `curriculum-wgu-catalog-b83ee97289a0732a` | `201408` | 35 | 0 |
| WGU — MBA Healthcare Administration | `curriculum-wgu-catalog-c4a7efe739d67a5c` | `202507` | 36 | 0 |

The MBA baselines use institutional competency-based coursework. Their acceleration mechanism is self-paced study, not outside-credit transfer. Their exact published catalog codes remain intact instead of being replaced with a presumed current-year label.

The five TESU editions retain the stable identity label `Current undergraduate catalog · checked November 18, 2026`. Their catalog identities now separately record the actual November 26 re-review, prior review date, exact primary degree URL, source ID, retained capture and SHA-256 hash. The new review does not backdate current evidence or silently rename a historical identity.

## What makes this expansion reusable

TESU now has **35 current institution-submitted receiving-course awards**. Thirty-three three-credit awards support **996 explicitly reviewed placements** across the five degree ledgers. These are 35 course awards and 996 applicability relationships, not 996 different courses or plans. The other two awards retain their real one- and four-credit quantities; the generator does not force them into three-credit slots.

The reusable evidence contract keeps four decisions separate:

1. Exact original course identity, ACE version, recommendation period, original credits and units.
2. Exact receiving-school award, receiving code, quantity, catalog and delivery scope.
3. Degree-specific placement, elective capacity, required level and duplicate-learning rules.
4. A feasible named baseline satisfying the complete ledger, residency, major and upper-level constraints.

Receiving-code matches may be reused where all these boundaries hold. General electives and general education do not become unrestricted title-based matches. Provider-wide policy research can be grouped by the same retained policy body and exact scope while preserving every program/course context; grouping never approves individual course awards or resolves program exceptions automatically.

See [TESU exact-course reuse review](tesu-exact-course-reuse-2026-11-26.md) for source inventories, recommendation-period extraction, quantity differences and reproducible authoring checks.

## Source and metadata safeguards

- The original 30 ready editions retain their exact degree totals, catalog identities, credit systems and minimum outside-credit gains. New baselines contain proposed courses, with no reported, confirmed or awarded student credits.
- TESU's current provider governance remains separate from exact receiving awards. A course-specific reviewed award does not turn a provisionally approved provider into a fully approved provider or establish a personal transfer award.
- Recommendation periods bind the actual selected ACE exhibit/version. An expired version does not inherit dates from a different option in the page's version selector. In particular, the old SOPH-0079 Managerial Accounting award does not automatically apply to the newer version.
- Newly established healthcare CLEP-0039 original credit is pinned to its independent ACE capture: three semester hours, version 2, January 1, 2023–December 31, 2028. The legacy residential-business original quantity remains explicitly unknown.
- All eight WGU additions have exact model/catalog/unit/degree-size price bindings, current retained tuition evidence, a $200 resource fee per six-month term and a separately sourced $65 application fee before any waiver. Pace ranges are planning assumptions, not completion or cost guarantees. The held AI Engineering program receives no ready-program price binding.
- WGU assessment context remains a school-policy statement that requirements vary. MBA admission facts are bound only to the three exact graduate program sources; they are not applied to undergraduate degrees.
- Each TESU contextual review requires its exact degree binding and fresh current-catalog source identity. Standard online coursework has sourced weekly scheduling, participation and varied-assessment context. e-Pack, TECEP, prior learning assessment and accelerated sections retain their separate pacing and availability. No all-program no-proctoring, attendance-free, admission-GPA or licensing claim is inferred.
- TESU savings and what-if comparison bindings follow the exact November 26 catalog re-review while retaining their separate November 18 tuition source dates and source IDs. Rebinding a current catalog does not refresh a price review or change a rate; stale catalog bindings remain rejected by the existing savings engine.
- Discovery facts and filters do not change academic requirements, receiving awards, publication decisions or personal progress. Actual retained bodies and sidecars are checked against their hashes in the focused acceptance tests.
- Compiled registry entries retain their actual degree level, so associate, bachelor and master filters include the complete matching plan set.
- The finder, guided setup, comparison picker and worksheet recommendations offer only publication-ready plans, with one choice per academic model. The current public set is 43 plans across four schools. Research drafts stay outside these choices; incoming aliases, existing private plans and deliberately saved comparison versions remain recoverable. Custom degree-link and scratch builders remain accessible.
- All 299 distinct outside-course identities in ready models have explicit assessment metadata. Unmatched legacy Study.com labels remain unknown and outside reviewed starting plans; current source-backed Sophia choices have their provider assessment policy attached.
- Shared original CLEP evidence survives older receiving-guide display overrides. The 40 affected Liberty rows keep their receiving awards and conditions while retaining the independent original-credit proof. Already-pinned sources also retain their transitive evidence dependencies.
- Returning untouched drafts can adopt the exact reviewed starting choices only when their publication receipt, fingerprints and checksum still match. Existing records, explicit choices, notes and progress prevent automatic replacement.
- Twenty unversioned copied suggestions are no longer placed beside their exact reviewed replacements. Their research rows remain archived; distinct versions, grade conditions and ineligible placements are not coalesced. The five published TESU outside-credit totals remain unchanged.

The Liberal Studies transfer comparison was checked separately: the published baseline has 72 outside credits. Removing only UPI from the 87-credit conditional candidate leaves 81 outside credits, but the additional nine still depend on unresolved Sociology, Ancient Greek Philosophers and Business 324 choices. The unchanged research gates reject that candidate; a higher numerical total is not treated as a verified route.

## Research retained without publication

**UMPI undergraduate discovery:** the public receiving matrix has 858 displayed rows, including 93 Sophia rows and 237 Study.com rows. It also has 27 rows requiring detail, nine marked not accepted and nine incomplete receiving rows. These rows are internal receiving evidence, not 858 approved current placements. The table includes historical and current courses without enough version/date/catalog detail to establish current applicability.

The new 2026–2027 GEC must be mapped to its governing cohort and actual course list. Historical GLO/core labels are not silently mapped into the new eight-outcome GEC. Current major maps and a 2025 proposal provide useful components but do not substitute for a complete current curriculum. The active 90-credit Applied Psychology offering also remains distinct from the 120-credit version. **No new UMPI undergraduate ready plan is claimed by this batch.** The existing ready UMPI MAOL preserves its graduate-only transfer and residency rules.

**WGU AI Engineering:** a current 40-course, 121-CU ledger is retained internally. Primary evidence identifies E090 Applied AI Engineering as a required capstone while the exact receiving guideline categorizes it under Additional Transfer. This conflicts with the supported university-only capstone model. The source conflict remains open; the program is absent from ready templates, and the generator refuses a fabricated nontransferability override.

## Validation handoff

Focused checks completed before this handoff:

- `tesu-discovery-metadata-2026-11-26.test.mjs`: five passing tests, including retained body integrity, mismatched source/catalog/delivery rejection, and actual Savings/Comparison bindings for all five programs.
- `wgu-expansion-metadata-2026-11-26.test.mjs`: three passing tests for eight exact rate/requirement bindings and price mismatch rejection.
- `degree-fit-metadata.test.mjs`: seven passing tests covering all currently published editions, independent prices and learning facts, exact source bindings and private-record boundaries.
- `undergrad-batch-acceptance.test.mjs`: four passing tests preserving the 30 released editions and correct degree-level filters; one explicit skip because no production TESU/UMPI shared named-university-choice pool has been adopted. No coverage for such a production pool is claimed.
- All 16 public-adoption browser journeys and three returning-plan browser journeys pass against the integrated release data. These use synthetic records, block real account writes, and do not represent real-student usability or real OAuth testing.
- The local release build passes; the native Worker is below its 1 MiB budget. Source safety checks cover 3,416 tracked files with zero findings.

Run authoring, generated-artifact consistency, the complete core suite, browser QA and deployment checks for each release; the pull request and workflow records above contain the final results. Re-run registry, quality, baseline and library generation after any canonical identity or source change; do not update output counts by hand.

## Next evidence work

1. Complete the governing current UMPI undergraduate curriculum and new GEC course lists, then join exact current original-provider versions to receiving awards. Resolve restricted/detail rows and the separate alternative-credit policy scope before generating undergraduate baselines.
2. Expand TESU from proven receiving awards into more exact program ledgers. Resolve new versions and non-three-credit placements from primary evidence; retain grade, area, upper-level and residency boundaries during reuse.
3. Resolve WGU AI Engineering's capstone conflict through authoritative receiving/program evidence. Do not publish by renaming the capstone role or inventing a university-only exception.
4. Continue provider coverage where it can improve a complete baseline, including exact Study.com, Christian Leaders, StraighterLine, examination and other eligible institutional or alternative awards. Provider acceptance alone is insufficient for degree placement; distinguish school policy, course award and specific degree allocation.
5. Measure each batch by additional complete usable plans and improved outside-credit baselines, alongside preserved source integrity and student flows. Directory entries, cached research rows and duplicate placement relationships are separate operational metrics.
6. Before automating recurring source acquisition, retain repeated retrieval observations separately from immutable capture metadata. Re-fetching an unchanged content hash should preserve the earlier observation used by an existing review.
