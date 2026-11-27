# Phoenix graduate CBE cohort — 27 November 2026

Four existing, fully named graduate models now carry reviewed current program,
admission, pace and price evidence. They pass the unchanged publication
assessment with an all-at-Phoenix baseline. This is a CBE acceleration route,
not an undergraduate alternative-credit transfer route and not an individual
admission approval.

| Exact program | Required units | Billing | Full-baseline published tuition scenario |
| --- | --- | --- | --- |
| MBA-CB | 33 semester credits / 11 courses | $300 per credit | $9,900 |
| MIS-CB | 36 semester credits / 12 courses | $300 per credit | $10,800 |
| MHA-CB | 36 semester credits / 12 courses | $300 per credit | $10,800 |
| Psychology MSP-DA | 36 competency units / 12 courses | $2,749 per 12-week term | $8,247–$16,494 over 3–6 paid terms |

The estimates precede aid, taxes and personal costs. They are not guaranteed
completion dates or individual enrollment quotes. The catalog excludes resource
fees for CB/DA; program pages state no application fee. CB course groups use
16-week periods. DA permits two to four three-CU courses per 12-week term, at
most 12 CUs per term and 39 graduate CUs per twelve months. It is not unlimited
subscription coursework.

## Published eligibility retained

- MBA and MIS preserve the catalog's two admission routes: a related degree and
  three years of recent qualifying experience, or another approved degree and
  five years. The program page's shorter marketing description is not used to
  erase that second route. The 2.5 conferred-degree transcript GPA rule remains.
- MHA requires an approved degree, 2.5 GPA, three recent full-time equivalent
  years of healthcare leadership/management including staff oversight, and
  employment in or access to a healthcare setting for assignments.
- MSP-DA requires a degree, 2.5 GPA and three recent full-time equivalent years of
  work. It does not prepare psychologists for professional licensure and is not
  eligible for Title IV federal financial aid; the latter is structured as
  `financialAid.federalAidEligible: false` as well as visible discovery facts.
- All four retain individual admission and state availability as student tasks.
  No state eligibility is invented, and no actual student's admission is granted.

The existing `programRequirements` renderer receives prominent degree/experience,
workplace-access and financing/licensure facts from the exact scoped Phoenix
packet. No UI renderer was changed.

## Evidence and integration

Canonical academic review:
`content/curricula/snapshots/cbe/phoenix-graduate-review-2026-11-27.json`.
The captured current 2026–2027 institutional catalog has the November 1 update;
actual November 27 HTTP retrieval receipts and body/document hashes are kept.
Four program pages, program-specific two-page ledgers, catalog cover, price and
fee tables, and DA policies/annual limits are independently bound. Some MBA PDF
lines interleave the left/right columns; the complete capture is retained, and
code/quantity/title evidence is checked without removing inconvenient text.

Source writer: `scripts/import-cbe-curricula.py` with
`scripts/phoenix_graduate_review.py`. The two held undergraduate models are
semantically identical to the pre-cohort source. Their provider URLs and aliases
are pinned explicitly because re-reading today's generated course index changed
some aliases and even supplied another school's receiving-guide URL in place of
a provider course URL. These pins preserve existing conditional content; they
are not new reviews or transfer approvals.

Run after other school rate writers finish:

```sh
node scripts/phoenix-graduate-metadata.mjs --apply-rates
```

This additively merges only the four exact reviewed entries from
`content/estimates/phoenix-graduate-rates-2026-11-27.json` into the shared rates.
It refuses a conflicting existing degree-price owner. Root then performs the
cohort's normal factory refresh, release acceptance, build and deployment.

Focused verification:

```sh
node --test --test-isolation=none phoenix-graduate-expansion-2026-11-27.test.mjs
python scripts/phoenix-graduate-review.test.py
```

Both passed (five Node checks and four Python checks). They cover the existing publication gate, zero
outside awards, exact costs and term caps, operative 21-credit CB / 24-CU DA
capstone sequencing, prominent scoped eligibility, failed edition/unit matches,
source receipt/hash tampering, source authoring reproducibility and preservation
of the two existing held undergraduate models. No academic gate was softened.

The existing finder receives explicit, source-bound CBE and self-paced facts for all four graduate models. Combined CBE/self-paced filters find all four; billing remains per-credit for the three CB programs and subscription for MSP-DA. Learning-source dates and capture IDs are retained. These classification fields do not change academic rules or pricing.
