# Usability and QA report — plan library, finder and plan pages (2026-11-20)

## What was tested

| Method | Coverage |
| --- | --- |
| Persona walkthroughs (2 rounds, independent tester, no source access) | Working adult on desktop, veteran on desktop, 19-year-old on iPhone 13 emulation, keyboard-only user |
| Self-contained accessibility checks (desktop + phone) | Labels, button/link names, duplicate IDs, heading order, target size, contrast of new components, horizontal scroll — on the plan library (default, filtered, empty), plan pages (default, searching), credit sources, guides, plan finder and its dialog |
| Browser behaviour checks | Filters, sorting, URL state, copy link, empty states, phone filter sheet, no-JS fallbacks, keyboard order and focus return |
| Automated suite | `node scripts/test-core.mjs` — 246 files passing |

Limits: Chromium emulation, not real iOS Safari; no screen-reader run; simulated personas are not real students. A full axe-core scan was not run because downloading the external script was blocked in this environment.

## Fixed in this round

- Open questions on plans awaiting school confirmation are concrete asks (e.g. "what is the most ACE- or NCCRS-recommended credit you accept toward this degree?").
- The finder quotes the same planning estimate as the plan library and plan pages; the baseline is labelled "Starting route"; a legend explains "Reviewed plan" vs "Needs school confirmation".
- Step bar: reachable right after the site navigation, visible while focused, counts "N of M" ("Section N of M" for screen readers), skips sections hidden by a search, and anchor targets clear it.
- Plan pages: course rows become labelled cards on phones (no sideways scroll), filtered-out groups hide, and surprising-but-sourced matches (e.g. Macroeconomics for WGU D266) say the school's published transfer guidance accepts them.
- Plan library: "Outside credit" labels, outside-credit filter second, "Copy link to this list", "5 of 11 plans match" wording, and a visible link to the full finder.
- Accessibility: filter-count contrast, heading outline in the flat list, 24px checkbox target.

## Known issues — follow-ups (not fixed here)

1. **Worksheet drops StraighterLine for some plans (P1, pre-existing).** Plans whose starting route uses StraighterLine (both Excelsior plans so far) open in the worksheet with fewer outside credits than the starting route: Excelsior Business 81 vs 87, Psychology 75 vs 78. Reviewed WGU and Liberty plans match exactly. Cause: when a plan is opened, the worksheet's course sources only merge the starting route's providers for GCU (`usePublicPlan` in `dist/portal.js`, the `if(gcu)` branch), and the default scenario providers in `dist/sheet-state.js` are Sophia, Study.com and CLEP. Fix carefully: saved student provider choices must not be overridden silently.
2. **The guided planner shows a different cost figure (P1, pre-existing).** Portal results show e.g. "$20,209" for Liberty Criminal Justice online, outside the $21,559–$23,030 planning range shown elsewhere, and say fees are excluded. Unify with the plan-estimate engine or label it as a different measure.
3. **Open questions are not carried into the planner setup screen** for plans awaiting school confirmation.
4. **Guided-planner wizard friction (pre-existing):** no Psychology subject; the military question is hidden in a collapsed tip; a stale "Finding course plans…" banner; the goal question is asked again after choosing a degree; the portal logo goes to plan.html.
5. **Plan pages list unrelated sources** (217 on WGU Marketing, including other programs' guides) and repeat the degree title under the H1.
6. **Local preview logs a 404 for `/api/growth/events`.** Check the production route.

## Real user test script (≈30 minutes per participant, 5 participants)

Recruit adults actually considering a degree: at least one with prior college credit, one veteran, one who mostly uses a phone. Ask them to think aloud; don't help unless they are stuck for 2 minutes.

1. "You want an affordable online business degree. Find a plan that fits you." — Watch: do they find Degree plans, the subject filter, the outside-credit filter?
2. "Which of these would cost you the least, and why?" — Watch: do they trust and understand the planning estimate and outside-credit share?
3. "Open the plan and tell me which courses you'd take first and where." — Watch: course search, provider filter, evidence links.
4. "Some plans say 'Needs school confirmation'. What would you do before paying for a course?" — Watch: do they understand the open question and feel confident asking the school?
5. "Save this plan so you can come back later." — Watch: account/save flow.
6. "Send this list to a friend." — Watch: copy link.

After each session record: task success (yes / with help / no), time, the exact words they used when confused, and a 1–5 confidence rating for "I know what to do next". Fix anything that blocks two or more participants before launch.

## Round 6 follow-up (2026-11-20)

Fixed after the round-6 walkthrough:

- **Guided planner → worksheet credits agree end to end.** The screen between a guided card and the worksheet now quotes the starting route for a new visitor ("78 proposed transfer credits on this plan’s starting route" for Excelsior Psychology, previously 75). Card, preview and worksheet now read 78 / 78 / 78 (Excelsior), 78 / 78 / 78 (Liberty) and 72 / 72 / 72 (TESU).
- **Worksheet cost wording matches the finder.** Plans awaiting confirmation with no reviewed estimate (e.g. TESU B.A. Psychology) show "Cost needs confirmation"; the older savings figure stays below it, labelled "Tuition-only comparison".
- **Finder cards keep published tuition** when no full estimate exists (e.g. Phoenix: "$2,749 per 12 weeks · Published tuition only · full cost needs confirmation").
- **Credits page speed.** Production already serves data pre-compressed (`worker/index.mjs`); the local preview did not, which made the slow-network test look far worse. The preview now compresses JSON, JS, CSS and HTML like production. Fast 3G time to first results after adding one course: 186 s → 15 s (wgu.json 4.7 MB → 0.49 MB on the wire).

Checked and not a bug: Sophia Introduction to Psychology does not count toward TESU B.A. Psychology because TESU's sourced plan lists PSY-1010 as a TESU course only. A Sophia match would need a published TESU source first.

Still open (P3): highlight the courses replaced after a provider change; "Fewest credits left" needs a degree-level filter; `programs-browser.test.cjs` expects every directory school in the finder's school list, and fails the same way on the code from before this work.

## Beta release gate (2026-11-20, commit e68d208)

- Build passes; core suite 258/258 files.
- Browser suite 30/30 files (29 journeys files plus the coach panel), up from 3/29 at the start of this work. Stale tests were rewritten to check current behaviour; real bugs found on the way were fixed (320px overflows, duplicate variant labels, finder first-tap, coach status request left open, community question context).
- Starting-route consistency: 38/38 plans' worksheets match their published starting route.
- Accessibility checks: clean on all checked pages, desktop and phone.
- Not covered: real devices and Safari, screen readers, real students, live Claude calls (the coach ships off), and the production deploy pipeline itself (deploy staging first; see docs/beta-deploy-checklist.md).
