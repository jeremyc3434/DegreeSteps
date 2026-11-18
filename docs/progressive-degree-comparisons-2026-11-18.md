# Degree comparisons show checked plans while the search continues

The degree builder previously withheld every option until the entire comparison finished. It now shows up to three individually checked course plans while the remaining matches are being compared. Students can open a checked plan immediately or choose **Check this plan** in the complete matching-degree list. Opening a plan cancels the background comparison and checks that selected degree against the latest saved records.

The count bar reports actual completed checks. Early cards are not the final ranking; their order may change. No cheapest, fastest or winner claim is available while a matching route is pending. The finished comparison still uses the entire eligible scope and keeps unknown estimates separate from zero cost. A checked plan remains a proposed degree allocation, not a university transfer award.

## Calculation and privacy boundaries

The existing browser worker emits a matching-route manifest followed by compact per-route summaries after the existing academic validation, collection allocation and remaining-cost calculations. Final result semantics are unchanged. Observer callbacks stay outside the cloned payload and cannot mutate or invalidate the calculation. Progress never extends the absolute timeout. Superseded, cancelled, timed-out and completed jobs ignore late progress.

Main-thread lists use profile eligibility and model metadata only. Joint inventory placement and all-route plan generation stay in the worker. Progress rendering appends checked cards and updates status fields without persisting the worksheet or rebuilding plans on the main thread. Keyboard focus remains on the same degree control when the final list replaces the early cards. Browsers without worker support retain the existing synchronous fallback; intermediate painting is not promised there.

Only finished comparisons enter the four-search memory cache. Changes to original records, scenario assumptions or private source curricula clear partials and restart the comparison. Search-local private-model composition removes deleted imports from new suggestions while preserving the active plan's recovery data. Missing or corrupt saved storage clears earlier results and cannot be overwritten by a late calculation or boot render.

Compare plans reports checked counts and removes previous result cards during recalculation, so an old winner badge cannot remain visible beside a new pending search.

## Exact planner optimizations

Generation reuses eligible menus by requirement object identity, initial proposal scores by requirement index and original option identity, and tuition assumptions by the fresh normalized input and program. These caches preserve distinct requirements/options even when their IDs collide. They do not change the search budget, objective, evidence eligibility, residency rules, source ceilings or credit units. There is no persistent plan cache, new service or runtime AI call.

## Local evidence

- Synthetic new student, broad undergraduate search: 33 matching plans; manifest at 138 ms, first checked plan at 955 ms, full comparison at 45.2 seconds. Input remained unchanged and no winner was invented across mixed levels/missing duration estimates.
- Synthetic student with ten original Sophia course records: first checked plan at 1.53 seconds. That benchmark stopped after the first checked plan and does not measure full-search completion.
- Paired Psychology degree generation: 14.74 seconds before versus 9.91 seconds after, with the complete returned plan equal. Healthcare measurements were noisier and showed a smaller gain.

These are shared-environment calculation timings, excluding network downloads and real browser rendering. They are not a performance guarantee or production capacity certification. Full comparisons can still take substantial time, particularly with many original records or options.

Targeted verification covers exhaustive optimizer checks, complete-plan parity, unknown fourth-route estimates, progress privacy, cancellation and late packets, focus, changed private curricula, actual boot completion and cross-tab record changes. Twelve production-catalog fixtures matched the preceding engine's final serialized output. Production build, core-suite and deployment receipts are recorded in the operator handoff; visual browser QA is unavailable in this environment.
