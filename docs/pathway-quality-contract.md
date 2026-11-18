# Pathway research quality contract

`scripts/pathway-quality.mjs` assesses already generated, fresh baseline plans. It does not run an optimizer, fetch evidence, approve a transfer, mutate a student plan, or change the existing Planner publication gate. The first rollout is an internal catalog quality report so its findings can be reviewed before any student-facing gate migration.

Every report keeps three independent axes:

1. **Template research:** exact school, degree, format and catalog identity; a balanced requirement ledger; named feasible baseline choices; reviewed policy and source references; and the actual selected course-map conditions. Status is `research-ready`, `conditional`, `needs-research`, or `unavailable`.
2. **Personal execution:** transcript submission, documented pre-approval, prerequisite assessments, passing grades and other individual steps. These are student tasks. They do not mean the published course claim is unresearched, and a researched template never awards the student's credit. A private `studentPlan` contributes only reported/confirmed row counts to this report.
3. **Estimate completeness:** complete or partial cost estimates, and declared timing scenarios. An unknown fee stays unknown. Incomplete costs have a null total; a complete estimate must reconcile university tuition, provider amounts and fees, and have no missing assumptions. A scenario is not a guaranteed graduation date or a tuition quote.

`research-ready` requires usable dated source references, complete named requirements, the existing academic allocation checks, and no blocking research or acceptance conditions. `conditional` retains material acceptance restrictions such as TESU's provisional provider status even when the exact receiving-course match has been documented. `needs-research` identifies missing policies, identities, applicability or evidence. `unavailable` indicates an incomplete ledger, baseline or academic allocation.

The separate `acceleration` axis determines eligibility for the accelerated library. A bachelor's or associate route qualifies through the actual feasible outside-credit share of the named baseline (default minimum 50%), not the school's advertised transfer ceiling or sum of candidate choices. A source-bound self-paced/competency pricing mechanism can qualify independently, including graduate pathways. Falling below this listing threshold does not turn established academic facts into missing research.

`publication.ready` is a proposed quality contract, not an activation command: the template must be research-ready, have an eligible acceleration mechanism, and avoid invalid cost/time claims. Partial estimates can be shown with their exact limitations. Existing app availability remains controlled by the existing academic validation and catalog implementation until a separate reviewed migration.

## Evidence and findings

`classifyModelFindings(model, {asOf, plan?})` produces flat, stable findings with `modelId`, `category`, `code`, `message`, `owner`, `blocking`, `scope`, `requirementIds`, `optionIds`, `sourceIds`, and optional `field`. Categories are `missing-research`, `conditional-policy`, `student-task`, and `estimate`. With a baseline it considers selected options; without one it inventories candidates. An unselected conditional option does not block a selected published baseline. Repeated occurrences of the same candidate merge their affected requirement IDs.

The assessor also consumes the Planner's structured validation errors, research notes and personal tasks. Legacy nonblocking warnings about missing original source identities or duplicate-award exclusions remain actual research gaps under the proposed complete-pathway contract; findings retain `legacyBlocking`, `derivedFrom` when applicable, and an explicit `publicationPolicy`. They cannot vanish merely because a ledger balances. Known untyped boilerplate scope statements may be reclassified narrowly; typed open policies and unrecognized notes remain research work.

Evidence status is evaluated per selected claim. A school-submitted receiving match is distinct from the provider's enrollment eligibility and the student's eventual award. Published metadata, source binding and a recent review date are governance evidence; this script does not independently read a website or authenticate the factual assertion. Source claims must be checked by the research workflow. Source dates are never advanced by report generation. Active evidence without a real date, with a future date, or at least 30 days old produces a review finding.

## Change control and validation

`requirementsFingerprint` in `scripts/review-pathways.mjs` hashes real academic constraints, including the actual major residency fields, upper groups, residency and waivers, liberal-arts allocation, credit exclusions, grade rules, currency restrictions and pricing facts. Routine recheck timestamps do not create a new academic revision. A source-bound current-catalog display-label recheck is likewise stable; changed requirements, limits, catalog URL or claim facts invalidate the fingerprint.

Run the focused checks with:

```sh
node --test --test-isolation=none pathway-quality.test.mjs pathway-review.test.mjs
```

Measure progress with counts of research-ready, conditional and needs-research templates; named feasible accelerated baselines; uncovered requirement credits; unresolved findings by owner and affected template; overdue active claims; and cost/timing completeness. Keep directory size, balanced ledgers, currently exposed templates, this quality contract, student-earned awards and all-in quotes as separate counts. Estimate completion work from distinct shared claims and program-specific ledger/mapping gaps, not a fixed minutes-per-degree assumption.
