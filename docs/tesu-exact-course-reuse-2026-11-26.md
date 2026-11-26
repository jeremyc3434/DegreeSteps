# TESU exact-course reuse review — November 26, 2026

The five existing TESU undergraduate ledgers now reuse 35 current, institution-submitted receiving-course awards. Thirty-three have three-credit receiving quantities and appear in 996 reviewed requirement placements across the five programs. These are 35 source-course awards, not 996 different courses or 996 degree plans. Thirteen awards are additions to the previous 22-course inventory. Final template availability still requires a feasible complete baseline and the existing publication gate.

## Separate evidence layers

1. The original ACE exhibit establishes the exact course code, organization course ID, version, original semester hours, original level and recommendation period.
2. Its TESU-submitted equivalency establishes the receiving code, receiving quantity and 2026–2027 receiving catalog.
3. The university's current curriculum and discipline list establish exact degree placement, free-elective capacity or the reviewed Liberal Studies allocation.
4. Provider-directory governance remains separate. Sophia stays provisionally approved, with `providerReviewPending: true` and `fullyApproved: false`. An exact current institution-submitted award resolves that course's receiving research; it does not change the provider's generic status, grant enrollment permission or award individual student credit.

The source bodies, hashes, quotes and decisions are retained in `course-specific-eligibility-review-2026-11-26.json`, `course-placements-review-2026-11-26.json` and `receiving-awards-additions-2026-11-26.json` within the TESU kit. Historical map retrieval dates remain November 20; the new scoped eligibility and placement reviews are dated November 26.

## Recommendation periods must bind the exact version

ACE's course page prints every period in its date selector. Selecting the newest printed date would incorrectly mark Managerial Accounting SOPH-0079 version 1 as current: its actual selected period ended October 31, 2026, while the first displayed option belongs to a different exhibit/version. Its older TESU award remains archived; current version 2 does not inherit that award.

All 36 institution-inventory exhibits were checked using the actual public HTML. Each complete recommendation-period `<select>` is retained as an explicitly labeled excerpt, including every option value and selected attribute, its source URL, actual retrieval date and full-response hash. The requested exhibit CID must match the selected option's CID and reviewed dates. Sources use `#recommendation-period-selection` so monthly freshness checks replay the same extraction rather than comparing an excerpt with an entire page.

## Original and receiving quantities can differ

- SOPH-0061 has one original semester hour and an explicit three-credit TESU SOS-1500 award. Both quantities are preserved independently.
- SOPH-0094 has three original semester hours and a one-credit APS-1000 receiving award. It is retained but cannot be forced into the existing three-credit positions.
- SOPH-0060 has four original and four receiving credits. It also remains unplaced in these three-credit ledgers; no artificial split or truncation is introduced.

The reviewed three-credit choices are offered only where actual degree capacity permits. Receiving codes are preserved in free-elective placements instead of inventing an equivalency to a proposed university fallback. The allocator still counts a receiving award and original learning only once. The two Scientific Knowledge featured positions accept only the independently listed BIO-1010 and CIS-1070 awards reviewed here; writing, mathematics and other general-education requirements are not made universally interchangeable. COS-1110 has an exact school award and free-elective placement, but receives no Liberal Studies area allocation from an unlisted classification.

All five academic ledgers retain 120 semester credits, 40 requirements, 15-credit standard residency, 90-credit combined alternative cap, 18 upper credits, published area-level rules and university-only Cornerstone/capstone. The Finance ledger retains its named three-credit MAT-1290 elective choice plus twelve flexible elective credits. UPI provider-published claims and unrelated legacy candidates remain conditional.

## Validation and reproduction

The three authoring stages are deterministic and do not publish a degree:

```sh
node scripts/tesu-receiving-additions.mjs --check
node scripts/tesu-course-eligibility.mjs --check
node scripts/tesu-course-placements.mjs --check
node --test --test-isolation=none tesu-receiving-additions.test.mjs tesu-course-eligibility.test.mjs tesu-course-placements.test.mjs
```

Fifteen tests cover actual capture integrity, the expired-first-option regression, independent source/receiving quantities, all 996 runtime eligibility predicates, unchanged provider governance, idempotence and negative mutations of identity, catalog, evidence, units, quantities, level, residency and allocation. All fifteen TESU kit guards pass. The five legacy reviewed builders also retain exact academic-ledger parity against the compiled kit documents. The global factory and publication pipeline remain responsible for validating and publishing complete plans.

The Accounting portal integration separately classifies its four exact historical execution/scope/estimate messages: two become source-bound student tasks, the retained provider/version scope becomes resolved information, and books/fees move to `pricingNotes`. This does not change any degree policy or course award. `scripts/tesu-accounting-notices.mjs --check` and four tests in `tesu-accounting-notices.test.mjs` verify a valid real planner baseline, retained personal conditions and continued blocking of unknown research, missing sources and unknown academic policies.

Primary research: [TESU institution-submitted ACE inventory](https://www.acenet.edu/National-Guide/Pages/Institution.aspx?iid=df3e7298-e35d-f111-a826-000d3a306e31), [TESU provider review policy](https://www.tesu.edu/admissions/methods-of-earning-credit/educational-provider-review.php), [TESU transcript instructions](https://www.tesu.edu/student-resources/transfer-credits/send-transcripts.php), and [current general-education course classification](https://www.tesu.edu/degrees-programs/courses/general-education/2021-and-after.php).
