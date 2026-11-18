# One recommendation engine for setup and degree comparisons

The setup wizard previously showed the first three profile matches even when the student selected a cost or speed priority. It now uses the same remaining-course comparison engine as Compare plans, with the same original course collection, academic constraints and saved estimate assumptions. An exploration never replaces the active plan.

The first three matching plans remain prominent. Other eligible plans are available under **More matching plans**. Comparable known estimates may be ordered by cost or study time; plans without those estimates remain visible. No missing price becomes zero. A published university subscription rate is identified as a rate, rather than a complete degree price. Receiving competency units stay separate from original semester credits.

Automatic comparison scope includes every eligible plan evaluated, including plans outside the three visible cards and the current plan when applicable. An unpriced or unscheduled eligible plan prevents a lowest-cost or shortest-time winner claim. An explicitly selected comparison is scoped to those selected plans. Tuition-and-course estimates remain separate from estimates that include the recorded fee assumptions. Different degree levels are not ordered against one another by cost or time.

The setup calculation runs in the existing browser worker and can be cancelled. Broad searches explain that calculation can take a minute or longer and allow up to 90 seconds before offering the existing retry path. Exact workload scoring and a local greedy-score memo avoid repeated calculation without changing academic rules, optimization objectives or the final plan search budget. Superseded responses cannot replace a newer search. Recent searches are cached in memory, and returning to results preserves the original search. Calculation errors retain course choices and offer a retry. Updated course records trigger a fresh comparison. No student records are sent to an AI service for this operation.

## Evidence boundary

No new course equivalencies, academic rules or university prices were added in this release. WGU Business Management retains its existing reviewed November 2026 pricing; the app does not infer a universal paid-term count from a subscription rate.

UMPI remains unpublished as a complete pathway. The fresh research attempt did not establish new primary evidence. Current GLO course allocations, exact Management minor requirements and applicable BLS upper-level/minor residency rules still require authoritative sources. The 90-credit overall outside ceiling must remain separate from the published 30-credit CPL limit. This gap belongs to the platform's research queue.

## Validation

Direct interaction checks cover priority-dependent ordering, omitted unknown estimates, mixed degree levels, active-plan preservation, original credit units, Back, reload, cancellation, changed course collections, failed price loading and retry. Production build and the full core suite are required before publication. Browser geometry and visual QA are unavailable in this environment; no visual-browser verification is claimed.
