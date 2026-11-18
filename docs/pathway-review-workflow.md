# Monthly pathway review

Run `npm run review:pathways` for a read-only coverage and review summary. Run `npm run review:pathways:snapshot -- --as-of YYYY-MM-DD` to save the detailed queue under `content/reviews/`. Both commands use all models in the current compiled registry and the wider directory. They make no network requests and never edit public course choices or student plans.

Run `npm run coverage:build` after changing academic inputs. This generates a shared claim registry, bounded evidence files, a quality report, and zero-record baseline plans. `npm run coverage:check` checks reproducibility; the production build also rejects stale artifacts. Build dates are never substituted for source-review dates. The report distinguishes unfinished platform research, student-specific execution tasks, and incomplete price or timing estimates. See [the quality contract](pathway-quality-contract.md).

Platform administrators can open **Manage DegreeSteps → Academic coverage**. Each evidence decision binds to the exact fact fingerprint, source metadata and scope. A changed fact starts a new review. Reviews have optimistic concurrency control and an append-only event history in the public application's database, separate from private student records. A supported review does not itself publish a plan, award credit, or clear a university restriction. Incorporate supported corrections into the curated academic inputs and regenerate before a reviewed release.

The queue lists:

- Programs missing an exact requirement model, with their official directory link.
- Unresolved requirement allocations and undergraduate requirements without researched outside options.
- Academic policy questions that still need exact degree-specific evidence.
- Model evidence checks due after 30 days, plus shared source URLs that are stale, undated or have future dates.

The initial priority schools are Liberty, TESU, SNHU, WGU and UMPI. This is an operations priority, not a filter on student access or an assertion that every listed degree qualifies for alternative credit. Source URLs shared by several models are grouped so a reviewer can reuse an official source check across the appropriate programs. One newly checked reference does not conceal an older or undated reference elsewhere.

For each monthly pass:

1. Read the current official catalog and program-specific transfer policies. Record the applicable cohort, format, catalog and units. Preserve source extracts and dates in `content/curricula/snapshots/`.
2. Check exact provider-to-receiving-course awards. Keep source credits separate from receiving credits or competency units. Generic provider acceptance, community reports and course-title similarity do not establish a current equivalency.
3. Update the curated model or a catalog-bound overlay and its importer. Preserve unresolved items; do not fill missing requirements with invented totals or transfer choices.
4. Regenerate the curriculum registry and run the relevant evidence, policy and allocation tests. A changed curriculum needs an explicit compatibility review before reusing earlier approvals or model identities.
5. Save the dated review queue and publish the reviewed release. Do not update evidence dates merely because a build or report ran.

The `requirementsFingerprint` identifies academic/pricing facts for comparison between monthly snapshots. A source recheck timestamp does not change it. A balanced requirement ledger is separate from a complete accelerated pathway. Candidate outside-credit coverage is a research measure, not a feasible transfer total: combined limits, residency, overlapping awards and individual school decisions still apply.
