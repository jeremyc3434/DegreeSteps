# TESU business pathway expansion — November 26, 2026

## Published starting-plan scope

The generated publication index has **45 complete starting plans: the previous 43 plus two TESU editions**. Deployment and final validation status belong to the pull request and [deployment workflow](https://github.com/jeremyc3434/DegreeSteps/actions/workflows/deploy.yml); this document describes the source-data snapshot.

| New edition | Model | Published outside credits | TESU credits | Total |
| --- | --- | ---: | ---: | ---: |
| B.S.B.A. in Human Resources/Organizational Management | `curriculum-tesu-bsba-human-resources-organizational-management` | 66 | 54 | 120 |
| B.S. in General Management | `curriculum-tesu-bs-general-management` | 66 | 54 | 120 |

Both editions have 40 named requirement rows and a complete published-only starting selection. Source review establishes proposed course applicability; it does not report a student's completion or grant personal transfer credit. These outside-credit totals describe the current supported selections, not a proof that every possible optimization has been exhausted.

The new General Management route is `tesu-bs-general-management`. Its named major courses span Management, Finance and Marketing. This satisfies the current three-discipline selection rule without adding the Accounting course whose prerequisite would consume a free-elective slot. The old `tesu-general-management` model and its legacy data path remain available for existing private plans; saved plans are not silently migrated.

## Reusable structure and evidence

`scripts/tesu-business-blocks.mjs` reuses the 29 general-education/business-core requirements and five named free-elective alternatives only after the new degree's own primary body independently proves the same course lists and 45/42/18/15-credit structure. Degree-specific major courses, classifications and prerequisites remain separate. An old degree's transfer outcome is never copied as proof for another degree.

The existing **35 current TESU receiving awards** remain unchanged. The placement review now has **1,297 explicit applicability relationships**, including the unchanged 996 for the prior five editions and 301 for the three newly authored business ledgers. Of the additions, 99 belong to each ready edition and 103 to the held Marketing edition. These are applicability relationships, not new awards or additional ready plans.

The new ledgers retain the 90-credit combined alternative-credit cap, standard nonmilitary 15-credit eligible TESU course residency, required university cornerstone/capstone, applicable C grade minima and business-course currency rules. Upper-level constraints independently enforce at least 12 area credits and at least 18 credits within the business core/area union, including the capstone. Upper-level free electives cannot substitute for the additional upper-level work required within that union.

The baseline does not count one learning action twice. University alternatives also contain 40 distinct named receiving-course codes. Existing student records, notes, units, selections and progress are covered separately by the frozen 43-plan reference and adoption browser checks.

## Primary source capture and maintenance

`content/pathway-kits/tesu/business-course-sources-2026-11-26.json` retains 20 university course bodies and the current General Management degree body. The already-retained HR and Marketing degree bodies were retrieved November 25 and reviewed November 26; their retrieval dates are not rewritten.

The new connected-web captures honestly record an unknown origin HTTP status. Their actual tool-response receipts are committed under `content/source-captures/retrievals/`. `scripts/pathway-factory/connected-web.mjs` verifies the receipt's pinned hash, exact primary URL and citation, actual observation time, and every line from the first page heading through the declared page end. It reconstructs the retained body exactly. The academic source review independently pins the receipt, so jointly editing a body and sidecar cannot manufacture new evidence. This transport is not a substitute for the separate receiving-award or original ACE-version proof gates.

`storeCapture` preserves the first body and sidecar. Re-fetching the same URL with unchanged content records a separate retrieval receipt. Changed content creates a different capture. Corrupt, incomplete or differently identified existing evidence is rejected instead of overwritten; a different URL with identical content requires an explicit separate capture directory. Retrieval alone never advances a claim's review date or approves a transfer.

## Deliberately withheld research

The Marketing degree has a complete 120-credit curriculum and a numerical 63-outside/57-university candidate. Its current MKT-4410 page formally lists `MAR-3060`; the advisory mentions `MKT-3060`, but an advisory does not establish an alias or waive the formal prerequisite. The university-linked syllabi do not resolve this. The authored model retains a blocking academic notice and remains outside public starting-plan search and matching.

The separate Study.com research packets retain candidate original-credit evidence and provider claims. They establish no new university-authoritative receiving awards. In particular, generic provider approval does not guarantee a specific equivalency, original quantity or upper-level award. Conflicting source levels remain explicit. Operations, UMPI undergraduate and WGU AI Engineering holds from earlier research are not resolved by this batch.

## Pricing and reproducible builds

New rate profiles and fit/context reviews bind to each exact model and catalog. The previously retained November 25 TESU tuition and fee sources keep their dates and amounts. Course delivery lists describe methods, not guaranteed sections; individual e-Pack or accelerated offerings do not make every course self-paced or unproctored.

The factory refresh now regenerates reviewed rates before academic quality, library and matching indexes. This prevents a new degree from getting a missing billing filter or stale savings estimate merely because its pricing artifact was refreshed after the library. Invalid prices stop downstream generation. The site build also checks all three new business authoring/metadata writers for reproducibility.

Use the normal coordinated workflow after canonical changes:

```sh
node scripts/tesu-business-programs.mjs --check
node scripts/tesu-general-management-program.mjs --check
node scripts/tesu-business-metadata.mjs --check
npm run factory:refresh
npm run build
npm run test:core
```

`tesu-business-expansion-acceptance.test.mjs` preserves the prior 43 plans and exercises actual policy/sequence/publication boundaries. `undergrad-expansion-browser.test.cjs` covers the prior 13 adoption fixtures plus HR and General Management, with 20 desktop/mobile journeys. `tesu-business-staging-browser.test.cjs` adds four live-asset HR/General Management adoption checks. Browser QA uses synthetic state, mocked account APIs and blocked real writes; it is distinct from real OAuth or uncoached student usability testing.
