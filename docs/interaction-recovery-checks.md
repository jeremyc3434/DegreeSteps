# Student interaction and recovery checks

The November 19, 2026 follow-up began with a real student report: a course marked Finished could not be changed back. Forward completion checks existed, but the worksheet’s completed state and data helper both prevented reversal. The correction keeps the original course record and separates a student progress correction from an ordinary completion update.

Changes in this release:

| Action | Recovery and conservation requirement |
| --- | --- |
| Finished → In progress or Not started | Keep the original course ID, source quantity, unit and notes. Recalculate progress and remove completion-dependent awards. Acknowledge any recorded school-confirmed placements first. Cancel leaves progress unchanged. |
| Course library → View saved | Open the existing saved record. Keep removal confirmation; never delete a completed or evaluated course by treating the button as a bookmark toggle. |
| Next step → Update my progress | Open a course editor with an explicit progress choice; save the student's chosen progress with the original source details. |
| Change a filtered course | Keep keyboard position, or explain why it disappeared and focus Clear filters. |
| Correct imported course rows | Keep keyboard position through validation and table refreshes, including Tab navigation and rows leaving an attention filter. |
| Remove an import file | Confirm the named file before discarding its unsaved review rows. Cancel keeps corrections and saved courses remain unchanged. |
| Delete a custom checklist task | Confirm the named task. Keep task cancels without changing its notes, due date or unsaved form edits. Changes to the task or degree invalidate the confirmation. |
| Delete a saved plan version | Distinguish deletion from closing a comparison column. Confirm and recheck the exact version before deleting; keep the active plan and course collection. |
| Switch plans with 20 saved versions | Offer version management or an explicit switch without another backup when existing per-program settings remain intact. Never silently delete an old version. |
| Remove every optional comparison | Respect the intentionally empty selection. Show suggestions is an explicit action. |
| Return to the setup wizard after changing comparisons | Search eligible degrees independently; keep the student's manual comparison choices unchanged. |
| Failed requirements check | Restore the retry control and retain the comparison. |
| Save a version | Exercise the actual control, including model loading, rather than only the snapshot engine. |

Saved comparisons must always apply current course records. A historical snapshot must not resurrect Finished credits after the student corrects the source course to In progress or Not started.

Regression tests exercise the production worksheet and course/comparison handlers with synthetic data. Cases include cancellation, stale confirmations, failed storage, late async results, degree changes, imported courses, shared exam awards, and GCU’s actual three-credit source/four-credit content matches. Checklist, degree and account records remain separate; these actions do not modify university transcripts.

Run focused interaction checks, then build and run the full core suite. The relevant entry points are `progress-correction.test.cjs`, `course-controls-reversal.test.cjs`, `import-courses-ui.test.cjs`, `checklist-delete-confirmation.test.cjs`, `comparison-worker-ui.test.cjs` and `plan-comparison-engine.test.cjs`. Release receipts in ignored `outputs/handoff/interaction-recovery-release.json` distinguish synthetic interaction checks from live HTTP and authenticated browser verification.
