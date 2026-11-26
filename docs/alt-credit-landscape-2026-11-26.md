# Alternative-credit transfer landscape, 2026-11-26

Research batch `content/research-batches/alt-credit-landscape-2026-11-26.json` (staging only; nothing here is published to students by itself).

## Method

- **universe:** Official partner directories: Sophia (125 partners, JSON-LD on sophia.org/partners), StraighterLine (161, straighterline.com partner colleges, full list), Saylor (28, rendered saylor.org partner page). Study.com directory returned HTTP 403 and is not used. Plus known high-transfer schools.
- **identity:** Names matched to College Scorecard (Most-Recent-Cohorts-Institution); accreditor field used for the regional-accreditation screen. Unmatched names are listed, not guessed.
- **sophiaDepth:** Each Sophia partner page parsed with the repo importer: transferRows = rows with a receiving course text; namedCourseRows = rows naming a single receiving course code.
- **demand:** College Scorecard Field-of-Study award counts (mean of the two most recent years) by OPEID6.
- **score:** 35*credits + 25*evidence + 20*demand + 10*cost + 10*gap; non-regionally-accredited x0.35. Credits use the explicit published transfer cap where captured; evidence ranks school-published tables over provider-published pages over policy-only.
- **rules:** Facts carry the exact quote and the page fetched on 2026-11-26. A provider-published match is not acceptance. Units kept as published. No value is inferred; ambiguities are recorded.

## Summary

- 125 Sophia partners, 161 StraighterLine partners, 28 Saylor partners; 168 institutions matched to College Scorecard, 132 regionally accredited; 62 directory names left unmatched (listed in the JSON).
- 36 schools deep-reviewed against official pages (exact quotes in the JSON). DegreeSteps had kits for 20 of the 168 before this batch.
- Kits added this batch (Sophia partner-page equivalencies, provider-published evidence only): davenport, herzing, indiana-tech, nichols, norwich, post, tiffin, umass-global, upper-iowa, wilmington. No programs yet, so no new student-facing plans.

## Top 30 by score

| # | School | Providers | Max transfer | Alt/PLA cap | Sophia named rows | DegreeSteps |
|---|---|---|---|---|---|---|
| 1 | Excelsior University | Saylor, Sophia, StraighterLine | 113 semester | — | 38 | kit, 3 models (0 publication-ready) |
| 2 | University of Phoenix-Arizona | Sophia, StraighterLine | 87 semester | — | 0 | gap |
| 3 | Walden University | Sophia, StraighterLine | 135 quarter | — | 5 | gap |
| 4 | Thomas Edison State University | Saylor, Sophia, StraighterLine | 105 semester | 90 semester | 0 | kit, 9 models (7 publication-ready) |
| 5 | The University of Arizona Global Campus | Saylor, Sophia, StraighterLine | — | — | 17 | kit, 0 models (0 publication-ready) |
| 6 | Liberty University | Sophia, StraighterLine | 90 semester | 30 semester | 35 | kit, 20 models (10 publication-ready) |
| 7 | University of Maryland Global Campus | Saylor, Sophia, StraighterLine | 90 semester | — | 63 | kit, 19 models (0 publication-ready) |
| 8 | Capella University | Sophia, StraighterLine | 135 quarter | — | 30 | kit, 0 models (0 publication-ready) |
| 9 | Southern New Hampshire University | Saylor, Sophia, StraighterLine | 90 semester | — | 59 | kit, 2 models (0 publication-ready) |
| 10 | Wilmington University | Saylor, Sophia, StraighterLine | 90 semester | — | 24 | new kit `wilmington` |
| 11 | Western Governors University | Saylor, Sophia, StraighterLine | — | — | 0 | kit, 27 models (27 publication-ready) |
| 12 | Herzing University-Madison | Sophia, StraighterLine | 90 semester | — | 45 | new kit `herzing` |
| 13 | University of Maine at Presque Isle | Sophia, StraighterLine | — | — | 0 | kit, 1 models (1 publication-ready) |
| 14 | Purdue University Global | Saylor, Sophia, StraighterLine | 75% | — | 16 | kit, 0 models (0 publication-ready) |
| 15 | Franklin University | Sophia, StraighterLine | 94 semester | — | 6 | kit, 0 models (0 publication-ready) |
| 16 | University of the Cumberlands | Sophia, StraighterLine | 75% | — | 3 | gap |
| 17 | Columbia Southern University | Sophia, StraighterLine | — | 25% | 24 | kit, 16 models (0 publication-ready) |
| 18 | American Public University System | Sophia, StraighterLine | 90 semester | 60 semester | 52 | kit, 23 models (0 publication-ready) |
| 19 | Bellevue University | Sophia, StraighterLine | — | — | 37 | kit, 11 models (0 publication-ready) |
| 20 | Strayer University-District of Columbia | Sophia, StraighterLine | — | — | 37 | kit, 8 models (0 publication-ready) |
| 21 | Empire State University | Saylor, Sophia, StraighterLine | 93 semester | — | 10 | kit, 0 models (0 publication-ready) |
| 22 | University of Massachusetts Global | Sophia, StraighterLine | — | — | 29 | new kit `umass-global` |
| 23 | Post University | Sophia | — | 25% | 47 | new kit `post` |
| 24 | DeVry University-Illinois | Sophia, StraighterLine | — | — | 37 | gap |
| 25 | Athens State University | Sophia, StraighterLine | — | — | 22 | gap |
| 26 | National University | Sophia, StraighterLine | — | — | 17 | kit, 0 models (0 publication-ready) |
| 27 | Norwich University | Sophia, StraighterLine | 90 semester | — | 68 | new kit `norwich` |
| 28 | Central Michigan University | Sophia | — | — | 0 | gap |
| 29 | Champlain College | Sophia | 90 semester | — | 36 | kit, 20 models (0 publication-ready) |
| 30 | Upper Iowa University | Sophia, StraighterLine | — | 30 semester | 33 | new kit `upper-iowa` |

## Ambiguities (owner call or school confirmation)

- **UMPI:** a 2026-11-20 forum report says upper-level alternative credit rules changed; no official UMPI page confirming it was found on 2026-11-26. Existing UMPI plan unchanged.
- **CSU Global:** “up to 60 credits from non-traditional sources such as credit-by-exam or prior learning experiences” — not stated whether ACE-recommended courses (Sophia, StraighterLine) count inside the 60. Not normalized.
- **Charter Oak:** non-regionally-accredited providers capped at 90 (bachelor’s) / 45 (associate) and accepted only where a provider agreement exists; the kit has no programs yet.
- **Tiffin:** Sophia credit capped at 30 and must be completed before enrolling, despite a 61-row single-course Sophia table.
- **Purdue Global:** one 75% cap covers all externally assessed prior learning combined (percent, not normalized).
- **Post:** 25% cap on certifications, PLA and test-outs; unclear whether ACE courses count (percent, not normalized).
- **Herzing:** the 90-credit figure is from the Legal Studies page only.
- **Wilmington:** “UP TO 90 UNDERGRADUATE” is a page headline; catalog rule not yet captured.
- **Peirce:** peirce.edu now redirects to lackawanna.edu (merger); StraighterLine/Sophia listings may be stale.
- **Upper Iowa:** transfer page blocks automated capture (HTTP 403); no normalized policy.

## Next batches

1. School-published tables into existing kits after the policy-field workstream merges: UAGC Sophia and Study.com transfer guides (captured: `content/source-captures/4e3e8abe87083054.txt`, `f48e2ac32159c48b.txt`), Capella (135 quarter cap, captured), Charter Oak (90/45 cap, captured), Empire State (93, captured), CSU Global (90, captured).
2. Walden (school-published alternative-credit guides; no kit), Phoenix (pre-evaluated partner lists), Davenport (catalog external-course table).
3. Program drafting for the ten new kits, starting with Norwich (68 named rows) and Tiffin, Nichols, Post, Herzing.
4. DeVry, Athens State, Central Michigan, Fort Hays State, Saylor public universities, and the unmatched directory names.
