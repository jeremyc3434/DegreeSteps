# Student checklist release

My Plan now starts with one next action and a folded checklist. Students can track preparation, school reviews, coursework, enrollment and graduation, or add private tasks with optional dates and notes. Each degree keeps its own task collection.

Course task status follows original learning records. Manual task completion does not award credits, confirm transfers or imply university approval. Academic plan changes reopen relevant reviews; price changes and private task edits do not. Valid existing review/request acknowledgements migrate without converting a sent request into approval.

Checklist saves reread the latest device state and reject stale academic contexts before writing. Opening an older cloud plan retains current device checklist collections, including intentional local deletions. Private task notes are excluded from public plan exports and worksheet CSV.

Course task links now open a course dialog with an actual progress control. The review action uses a supported task route. Dates are student-entered reminders; this release does not send notifications.

Validation completed:

- 17 focused engine checks and 12 independent acceptance checks passed.
- Existing account-client, Journey, Sheet and Worker test suites passed.
- Seven browser journeys passed: compact default and keyboard opening; keyboard completion/undo; waiting/date/notes persistence and escaped text; custom task lifecycle; usable course links; expanded 320px/390px layouts; preservation of concurrent checklist edits.
- Syntax and whitespace checks passed.

Browser limit: the final stale-academic browser journey was interrupted after the runner stopped responding. Its fail-closed behavior passed independent engine/acceptance checks. Later browser assertions for changing progress inside the course dialog, and screenshot capture, were authored but not completed in that run. No claim is made that those final browser assertions passed.
