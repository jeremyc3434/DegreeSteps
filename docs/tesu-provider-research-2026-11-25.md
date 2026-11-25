# TESU pathway evidence review — November 25, 2026

The six current TESU degree ledgers are not six publication-ready transfer plans. This recheck creates **zero newly school-verified receiving awards and zero publication promotions**. It updates a real, school-published provider-status fact across the five factory degree models and the legacy General Management model.

The live [TESU Approved Provider Directory](https://www.tesu.edu/admissions/methods-of-earning-credit/provider-directory.php), captured November 25, still lists Study.com as approved. Sophia, StraighterLine, Saylor Academy and CLEP appear under Provisionally Approved – Review Pending. The retained text, capture hash, real fetch time and structured review are committed at `content/source-captures/c8006b53ea7a4598.*` and `content/pathway-kits/tesu/provider-review-2026-11-25.json`.

Every modeled candidate from these providers now carries a structured, source-bound provider-status review. The distinction matters: a conditional CLEP or Sophia course previously could be described only as an unresolved course match even when its provider status was the independent blocker. Study.com's approved provider status is established, while its conditional receiving-course evidence stays conditional. The [Educational Provider Review policy](https://www.tesu.edu/admissions/methods-of-earning-credit/educational-provider-review.php), separately captured November 25 at `content/source-captures/3d731765e918fb1e.*`, expressly separates provider approval from course-equivalency evaluation. Neither source establishes enrollment permission or an enrollment prohibition. `providerReviewPending` records an outstanding review; no `eligibleToStart` permission flag is generated. The recheck does not advance any receiving-map date, ACE recommendation period, catalog identity, price, course quantity or degree-placement claim.

## Current source limits

- [Study.com's general-education collection](https://study.com/college/school/thomas-edison-state-university/general-education-collection.html) lists 14 TESU equivalencies, but the publisher is the provider. It is a research lead, not school-submitted approval. Each source identity, version, quantity, receiving award and exact degree placement still needs its own evidence.
- ACE English 104 (SDCM-0057 version 5, March 1, 2026–February 28, 2029) establishes three lower-division source credits. Its server-rendered Equivalencies section does not provide a TESU receiving row. A recommendation is not an institutional award.
- The provider's Statistics 101 table claims four receiving credits. Do not copy that quantity into TESU's three-credit STA-2010 requirement or assume it equals the original source credit quantity.
- Current Sophia school-submitted ACE matches retain their documented named receiving course and catalog. They do not supersede TESU's separate provisional provider status.

## Completion order

1. Recover the current TESU-submitted receiving-award data for approved-provider courses, preserving the exact version, source quantity, receiving code, catalog and degree placement.
2. Prefer a fully supported, feasible baseline when one exists, while retaining accurately labeled conditional alternatives for students who have explicit individual school approval.
3. Run the actual allocation solver against the whole degree. Candidate credits across alternatives are not a feasible transfer total.
4. Promote only models that meet the existing publication gate. A longer catalog or balanced ledger does not resolve missing transfer evidence.

No student is asked to recreate this evidence review. The remaining research belongs to DegreeSteps. Individual transcript evaluation, passing grades and admission eligibility remain distinct student execution steps.

Validation: `node --test --test-isolation=none tesu-provider-review.test.mjs` verifies the intact source, each modeled provider status, idempotence, unchanged award facts and mutation-based rejection of false provider promotions.

## Bounded English 104 alternative

The retained native public-web extraction of Study.com’s TESU general-education collection now supports one additional provider-published candidate in all six degree plans: English 104 / SDCM-0057 version 5 → ENC-1010, three semester credits. The separately retained ACE record establishes the original three-credit source identity and the March 1, 2026–February 28, 2029 recommendation period. The provider mapping remains conditional; neither source establishes an official TESU-submitted receiving award.

The source metadata explicitly identifies the native rendered extraction, records `rawBodyCaptured: false`, and makes no claim of HTTP 200 from the provider origin. The independent ACE capture did return HTTP 200. No Statistics or Psychology award is inferred from this limited change. The receiving ledger, standard residency, noncollegiate cap and duplicate-learning rules stay unchanged.

`tesu-study-english104.test.mjs` covers the source/capture distinction, all six placements, the exact version window, source units, minimum grade, reported-versus-confirmed credit, idempotence and prevention of unrelated requirement placement.
