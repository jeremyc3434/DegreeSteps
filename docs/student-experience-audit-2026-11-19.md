# Student experience audit — November 19, 2026

This pass reviewed the public website and student flows from the perspective of an adult starting from zero, a learner bringing old courses, a campus-bound student and parent, a military learner, a graduate learner, and a returning account holder. Findings came from source-traced journeys and synthetic interaction tests. This was not a student interview study or a visual browser session.

The main problem was task hierarchy: visitors read explanations of transfer planning before seeing a degree plan. Account saving also used several storage terms for the same student task, and a browser autosave indicator could be mistaken for an account save.

| Student situation | Change | Acceptance condition |
| --- | --- | --- |
| “I need an affordable degree but don’t know where to start.” | Real course worksheet and planned-credit allocation in the homepage opening; fewer entry choices. | A visitor can see courses from outside providers contributing to an actual degree and identify one starting action. |
| “I know my school or degree.” | Researched plans appear before school policy detail. Schools without an available template keep their school context when opening degree-link research. | A school-specific action must not silently show unrelated colleges or imply that an unavailable plan is ready. |
| “I already took courses.” | Transcript entry stays visible; the wizard has a plain “Use my past courses” start. | Records remain in My courses when a degree changes. A saved course is not counted as completed. |
| “I want the campus experience.” | The actual Liberty campus example stays explicit; campus discovery remains accessible. | The example’s 83 outside credits and 37 Liberty credits are proposed allocations, never personal completion or an admission promise. |
| “I served in the military.” | Military training is easier to notice in setup; record-import actions retain military context. | Service learning, institution-issued courses, and benefit eligibility remain separate. |
| “I’m exploring graduate study.” | The graduate article opens degree-link research rather than a broad undergraduate-heavy self-paced search. | The link matches the promise; graduate programs do not inherit undergraduate alternative-credit rules. |
| “I’m back to keep working.” | Account plans get a direct Continue action; active coursework can precede nonblocking evaluation reminders. | Genuine academic blockers still come first, while routine evaluations remain on the checklist. |
| “Is my plan saved?” | Familiar Save plan / Save changes actions and a receipt-based status. | Only an acknowledged matching account snapshot can show Saved to your account. Failed saves and another account cannot inherit that status. |

Supporting website changes include visual instructions, earlier article actions, scannable provider facts, and optional policy/source detail. WGU graphics retain competency units. ASU provider links use the indexed provider identity. Providers without indexed individual courses lead to degree planning rather than an empty course search.

The complete course worksheet, comparisons, source evidence, transcript import, cost calculator, private notes, and course progress remain available. Account saving preserves explicit upload consent, ownership checks, revision conflicts, and course/notes merge protection. The old two-model audit screen redirects to the current planner without reading or deleting saved work.

Release evidence and exact content counts are recorded in the ignored `outputs/handoff/student-ux-release.json` and `student-experience-content-audit.json` artifacts. The count measures initially unexpanded main-page text, not SEO word count or a rendered viewport. The remaining validation gap is a firsthand desktop/mobile visual pass and observation of real students completing these tasks. Broader degree and provider mapping remains a separate coverage effort.
