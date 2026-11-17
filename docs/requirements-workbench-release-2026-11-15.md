# Private requirements workbench

Students can save an exact degree goal even when DegreePath does not yet have its course map. The plan page gives one next action: add the actual degree requirements. Changing away from a working plan requires an explicit choice and keeps the previous degree available in Compare plans.

## Student workflow

- Add or edit requirement rows directly. CSV and tab-separated spreadsheet imports remain optional.
- Save incomplete work and return to it. Unknown totals, credit units and policies stay unknown.
- Review the complete credit total and source before building a proposed plan. Imported requirements do not award credits or establish university approval.
- Keep online and campus requirements separate, including when the degree is not listed in the catalog.
- Reopen a previous custom degree with its exact school, title, level, credit units and catalog identity.

## Preservation and validation

Selecting a goal reads the latest private workspace before saving. Newer courses, evaluations, private notes, requirement drafts and checklists survive degree changes. Opening an older account plan combines private requirement drafts and imported curricula with the current device workspace. Conflicting immutable audit IDs and invalid or oversized data fail before replacing the device plan.

Spreadsheet parsing accepts common column labels, repeated headers and section headings. Summary rows are reported separately. Ambiguous choose-N groups, credit ranges, mismatched totals and malformed source references cannot produce a runnable model. A private imported model remains marked student-provided and conditional.

## Verification

Executable Node and VM journeys cover manual editing, partial saves, resume, exact-target separation, delayed catalog loading, concurrent course updates, unmapped-goal consent, custom-goal restoration, cloud merges, corruption, storage limits and atomic failure. Existing audit, catalog, state, journey, account, plan-home, checklist and Worker checks pass. The production build checks source supplements, curriculum registry consistency, public routes and API boundaries.

The real-browser audit suite was attempted but Chromium failed before opening a page: its Crashpad socket call was denied by the execution sandbox (setsockopt EPERM, SIGTRAP). This release has automated behavior checks; visual and browser-interaction verification could not be completed in this environment.

## Scope

This removes an unfinished-goal dead end. It does not claim that every catalog program now has a verified transfer map. A proposed plan based on student-entered requirements still needs school confirmation, and outside-course choices require separately sourced equivalencies.
