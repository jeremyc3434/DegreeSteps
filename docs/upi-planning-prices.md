# UPI standalone course-purchase estimate

The selected-course estimate supports a narrowly scoped `per-course` billing type. UPI is its first reviewed provider: 22 exact current ACE course identities each have a separately published paid course offer in the provider's own course-page structured data and visible purchase panel, retrieved November 25, 2026. A publicly displayed standalone purchase is separate from the provider's eligibility-limited memberships.

The course quotes live in `content/estimates/plan-estimate-rates.json`; the normal rate builder reproduces `dist/data/plan-estimate-rates.json`. `upi-pricing-review-2026-11-25.json` retains scope, source snapshots and the exact identity-review packet. Each individual quote cites the actual retained provider page and independent ACE exhibit through the same source identities used by the course catalog. Existing provider and university rates are unchanged.

A planned course matches a quote only when the canonical original course code, explicit course version, original credits, original credit system and recommendation start/end all agree. The provider-level record has no `amount` fallback. Unknown identities, versions or units leave an explicit partial estimate; they cannot silently inherit $250, become an exam fee or appear free. When any source in a provider basket lacks an exact quote, that provider basket is excluded from the known total and clearly identified as unpriced. Courses already reported or confirmed are not purchased again. A source course reused through a valid receiving bundle is still one purchase, regardless of receiving allocations.

Environmental Science illustrates why original credit quantities are independent: the provider's page carries a three-credit marketing total, but its ACE recommendation is one semester credit and its NCCRS claim is separate. Its ACE quote binds the original one-credit course without changing the receiving degree requirement or converting one original credit into three. The separate mapping validator governs which receiving placements are valid.

This scenario uses published individual-course purchases. It does not infer eligibility for the $99 general membership, $89 TESU-student membership, or any restricted bundle, referral or student discount. Selecting a target school does not establish current student status. The provider's $20 direct transcript request and $25 unlimited-request option are sourced but are not automatically charged: the required transcript route and previously paid charges are separate. Applicable taxes, transcript charges, promotions and future changes remain outside the course-purchase quote.

The result's provider `priceLabel` and notes identify the standalone scenario and explain that eligible memberships or bundles may cost less. The engine returns a qualified planning range with `complete: false`, preserving all academic conditions. This is neither a final checkout quote nor a graduation-date commitment.

The same reviewed quote is attached at build time to each matching UPI identity through `scripts/upi-course-pricing.mjs` and the shared TESU identity helper. A narrowly scoped runtime check in `Planner.costModel` verifies the original identity, price scope, source references and recommendation window before treating a UPI basket as priced. The cost optimizer then compares that standalone purchase against native tuition and shared memberships. A valid source action is charged once across receiving allocations. An explicit student basket quote retains precedence. The branch-and-bound search uses compatible lower bounds, including a partly unpriced UPI basket; it does not mistake the published fee for a membership or institutional-credit source.

Focused checks:

```sh
node --test --test-isolation=none upi-plan-estimate.test.cjs plan-estimate-engine.test.cjs tesu-plan-estimate.test.cjs provider-offers.test.cjs
```

Initial pricing/offers regression result: 50 passed. The first combined run caught an identity-packet hash changing while its owner finished capture-format compatibility work; source references and review hash were refreshed only after that packet was frozen, then the complete focused set passed.

Optimizer integration verification adds `upi-optimizer-pricing.test.cjs` alongside the existing oracle, native-tuition, comparison and provider-quote regressions. Its final combined run passed 85 checks, including fully enumerated synthetic UPI assignments, shared memberships, conserved split allocations, future versions, malformed price metadata, original-source preservation and no repurchase of completed coursework. These are overlapping focused runs, not 135 distinct tests or a replacement for the full core/build and browser release checks.
