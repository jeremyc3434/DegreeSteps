# TESU and SNHU pathway evidence

This release adds supported course choices and execution guidance without claiming universal transfer approval.

## TESU

Two conditional provider-published Study.com options now support the named MAN-3310 and MAN-3720 requirements: Business 306 / SDCM-0071 and Business 308 / SDCM-0054, each three source semester credits and a three-credit upper-level receiving candidate. Candidate coverage is 99 credits, while the feasible combined alternative-credit ceiling remains 90. The model's 120-credit ledger and institutional-residency assumption remain intact.

Current policy evidence supports C minima for the 14 professional-business core, six area-of-study and two composition requirements. Sophia remains conditional: the current partner page lists courses without established transfer equivalencies, and TESU's directory describes provisional review. Verified recommendation windows are scoped to specific reviewed versions; Business 308 dates remain unknown. Provider course passing percentage is separate from an exam-score threshold.

The transcript step now displays provider-specific instructions from the program's cited sources. Sophia uses Credly, Study.com and StraighterLine send provider transcripts directly, and TESU rejects Study.com ACE transcripts for review. Instructions are filtered to providers in the student's records or plan.

- [TESU transfer policy](https://tesu.smartcatalogiq.com/current/undergraduate-catalog/methods-of-learning-and-earning-credit/transfer-credit/)
- [Provider directory](https://www.tesu.edu/admissions/methods-of-earning-credit/provider-directory.php)
- [Transcript delivery instructions](https://www.tesu.edu/student-resources/transfer-credits/send-transcripts.php)
- [Study.com General Management table](https://study.com/college/thomas-edison-state-university/degrees/tesu-bachelor-of-science-in-general-management.html)

## SNHU

The two existing curricula retain 80 requirement rows and 240 total credits. Six Study.com mappings and four Sophia alternatives add provider breadth; the importer now preserves parallel courses sharing a receiving code. External option occurrences increase from 621 to 701, including restored alternatives. Provider-published evidence stays conditional and does not convert to a student award.

The matcher enforces the sourced C-minus transfer floor while respecting an identified original SNHU university course. Other institutions or explicitly alternative sources cannot gain this exemption by using a University label. The existing stronger major/requirement grade rules still apply. The models retain 30 university credits and now enforce 12 credits in the major at SNHU. Published 2026–27 online undergraduate tuition of $354 per credit supplies tuition subtotals; remaining fees and materials remain unknown. The source's $100 conferral fee is disclosed in pricing notes, not treated as the entire fee total.

- [SNHU transfer policy](https://www.snhu.edu/admission/transferring-credits)
- [Online tuition](https://www.snhu.edu/tuition-and-financial-aid/online)
- [Study.com SNHU mappings](https://study.com/college/school/southern-new-hampshire-university/general-education-collection.html)
- [Sophia SNHU table](https://snhu.sophia.org/)

## Existing approved records and source gaps

An explicit confirmed evaluation for the exact current program and requirement can retain an older source award when a current provider-version window changes. An unconfirmed projection, reported placement, or approval for another destination cannot. This exception does not bypass grade or exam-score rules, and original records remain intact.

UMPI's current source confirms a September 2026 general-education change for new entrants, but the full current BLS/Management minor allocation remains unverified. The 2019–20 archived minor list was not imported as current. WGU's relevant current partner tables were not recovered; no new WGU course guarantees were published. A newly located SNHU Computer Science pathway has conflicting 2023–24 body and 2026–27 filename dates; it was not promoted into a current degree model.

Validation: nine regression suites passed, including inventory assignment, curriculum acceptance, source evidence, transfer-only grades, approved older awards, and source preservation. Generation checks, JavaScript syntax, whitespace and the production build passed. Browser QA remains unverified: system Chromium fails its restricted socket operation, and official Headless Shell installation could not complete because the sandbox could not access its inherited network proxy. No browser pass or real-student study is claimed.
