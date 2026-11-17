# DegreePath monthly data review

Owner: the person maintaining the published catalog. This is a manual monthly workflow, not a scheduled job or a claim of continuous monitoring.

Catalog assembly reviewed: **2026-10-31**. Next planned review: **2026-11-30**. The assembly date does not mean every linked page was live-checked on that date. Each source's `checkedOn` and `type` retain its actual evidence status.

## 1. Preserve the release and evidence

- Save the current `dist/data/pathways.json`, `liberty.json` and `tesu.json` and record the site/repository revision being reviewed.
- Create a dated research folder and keep the official catalog/PDF/page snapshot used for each changed claim, subject to source access rules. Record URL, title, retrieval time, page/section locator and a content hash or stable revision when available.
- For every policy claim, record the exact program, modality, catalog year, student category and **effective date**. If the source does not state an effective date, record it as unknown; a download date is not a policy-effective date.
- Preserve earlier evidence and earning windows. A changed rule can affect new applicants without invalidating a student's older catalog or previously completed learning.

## 2. Recheck receiving-school rules first

For each active pathway, open the exact current program and receiving-school policy sources. Check that the school, degree title, concentration/track and delivery format still exist. Then verify:

- Admission, prior-degree, age, geography and student-status eligibility.
- Degree total and unit system; source-specific caps; total transfer ceiling; institutional, major and upper-level minima; grades, age/recency and duplicate rules.
- Flexible choices, laboratory pairings, prerequisites, permitted overlap and required institutional assessments or artifacts.
- Enrollment, transcript-receipt, initial-term transfer cutoff, placement, capstone and graduation deadlines.
- Tuition, paid-term rules, fees, materials, benefit eligibility and housing where relevant. Save the applicable quote and date before introducing a price. No current complete prices are supplied by this catalog.

Review these known high-impact questions explicitly: UMPI's applicable Fall 2026 GEC and institutional subsets; TESU's combined ACE/NCCRS limit, source-origin distinctions, military residency and Edison Accelerate fee/renewal wording; WGU's current catalog and prestart transfer cutoff; Liberty's program-specific waivers, replacement credits, grade-policy discrepancy, major residency and residential sequencing; Pierpont's conflicting historical residency figures; and current ExcelTrack/BAAS program eligibility.

For teaching, law, aviation and health routes, recheck the intended licensing/admission authority and exact approved program. Keep academic degree completion separate from professional preparation, clinical/flight practice and admission to practice. Verify supported local placements and student location before turning a guide into a personalized offer. For graduate/doctoral routes, check admission credentials, actual graduate transfer, research obligations, supervision and minimum paid registration separately from undergraduate rules.

## 3. Recheck proposed learning and full ledgers

- Confirm each external course/credential's identity, version, recommendation window, availability and receiving-school award. An ACE/NCCRS recommendation alone does not establish university acceptance.
- Check provider prices and subscription rules only when used in a modeled scenario. Include transcripts, exams, proctoring, evaluation, institutional terms and final-project charges once each.
- Compare current requirements against every mapped output, including bundle splits, duplication, actual destination units, level, subject and accepted-but-unused credit. Recompute totals independently of community table totals.
- Keep unavailable providers out of new-learning recommendations while retaining historical earned credit for evaluation. Never infer that a transcript intermediary changes original source classification.
- Request official clarification for conflicts that can change a recommendation. Record the question and affected pathway while retaining an honest partial guide. Leave unknown numeric facts `null`; do not convert missing evidence into an approval or a required university course.

Only the two existing model IDs, `liberty-business-residential` and `tesu-general-management`, currently link to course ledgers. A new pathway requires a complete catalog-compatible requirement model, source-backed mappings and an independent audit before receiving a course-model link. A researched milestone guide must remain distinguishable from an executable course plan.

## 4. Update the data without resetting evidence dates

- Update individual claims and source records with the actual check date. Use `official-reviewed` only after reading the relevant official text. A known official URL awaiting review remains `official-reference` with `checkedOn: null`.
- `community-research` records retain the reviewed snapshot date and remain discovery evidence. A new community edit is not a receiving-school approval.
- Verify JST/CCAF procedures, DANTES eligibility/funding and VA program/modality details from current official resources. Keep military status and institution-specific exceptions separate. Do not apply a military exception through the standard civilian TESU model.
- Record additions, removed options, effective-date changes, unresolved conflicts and affected saved-plan assumptions in a dated release note. Do not silently overwrite an older student's catalog or approvals.
- When the review is complete, increment `version`, set `reviewedOn` to the assembly-review date and set `nextReviewOn` to the next planned monthly date. Do not change all sources' dates to match the assembly date.

## 5. Validate and review the release

From the site directory, run `node planner.test.cjs` and `node verify.cjs`, plus the current wizard/engine checks documented in the repository. Confirm that JSON parses, IDs are unique, required fields/enums are valid, source references resolve, dates are valid, unknown facts remain null and every `modelId` resolves to its exact existing model.

Exercise the wizard with no prior credit, an undecided major, any eligible degree, an exact target, campus-only study, online study, each military status, graduate entry, and teacher/lawyer/pilot/health goals. Confirm that professional goals keep their actual career stages, online clinical routes explain in-person practice, and a coverage gap does not produce an irrelevant business recommendation. Check the two mapped ledgers for credit conservation, duplicate/bundle handling, residency, prerequisites, unresolved choices and honest coverage labels.

Serve `dist/` locally for a desktop/mobile and keyboard review. Verify source links, review dates, selected-route persistence and exported plan provenance. Review the complete data diff and the generated output before publishing through the project's authorized release process. Keep the last working snapshot available for a reversible data rollback.
