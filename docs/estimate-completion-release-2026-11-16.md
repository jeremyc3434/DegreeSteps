# Completing a student's cost estimate

The existing Add estimate action could name missing provider costs and fees without offering controls to enter them. The worksheet now offers the prices and confirmations relevant to the student's remaining courses, then returns to Compare plans when opened from there. The estimate summary uses the same tuition and provider calculations as comparison cards.

## Prices and progress

Students can enter a total remaining price for StraighterLine, Saylor, DSST and other selected providers, or override a published subscription estimate. Each custom price records the exact distinct remaining courses it covers, including shared exam bundles. A changed or partially completed course list requires that price to be reviewed again. Blank prices remain unknown; an explicit zero is accepted as a student estimate. Price references remain private assumptions and never establish transfer approval.

The form includes explicit fee, tax, exam-charge, voucher and campus-expense controls where applicable. A confirmation for one custom provider cannot confirm another provider's charges. Malformed custom prices require review or an explicit reset rather than disappearing into defaults. Optional study-pace inputs are retained.

Saving reads the latest private workspace, preserving courses and notes added in another tab. If the degree or quoted course list changed, the form refuses the outdated edit before writing. Closing the task does not save an old copy of the plan over newer work.

The next-step card now selects an in-progress course only when it is placed in the current degree. It links to that exact original record. Competency units with a known quantity are treated as known source facts; any destination evaluation remains separate.

## Evidence and verification

The 37 new regression cases cover scoped provider pricing, the rendered form through a real Journey/Comparison calculation, actual worksheet submit/cancel behavior, concurrent edits, invalid values and course progress. Existing allocation, checklist, comparison, savings and Worker checks pass. The production build includes the corrected manual response encoding, with a regression for browser JSON decoding.

The wider checks also identified old Liberty savings expectations. The unchanged pre-release planner already allocated 83 proposed outside credits rather than 80. Tests and methodology now reflect that existing allocation; the savings implementation was not altered. The public policy illustration directs students to their exact plan rather than embedding a course-map count that can become stale.

Browser geometry remains unverified because this environment's Chromium fails before opening a page. No new degree model is claimed in this release. A bounded source review recovered SNHU's BA Psychology marketing information, but its accessible detailed pathways were explicitly based on older catalogs. WGU's current partner-table request did not complete. Those gaps were preserved rather than converted into current transfer guarantees.
