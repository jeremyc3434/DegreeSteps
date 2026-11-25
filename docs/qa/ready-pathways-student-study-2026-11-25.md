# Ready-pathway student study

Status: **prepared, not conducted**. No real participants have been recruited or observed in this release. Automated browser journeys use synthetic records and intercepted account requests; they are separate evidence and cannot establish that an untrained student understands the product.

## Self-guided version to share

Send participants [the self-guided test](https://degreesteps.com/student-test.html) once this release is published. It supplies neutral tasks, a downloadable fictional course CSV, optional sign-in, and a local feedback download/copy. It asks for no name, email, student ID, actual transcript, or payment. The form sends no answers automatically; participants choose how to share their downloaded or copied response with their inviter. Responses are retained only in this tab's session storage until cleared or the browser session ends. This is an invitation/testing aid, not evidence that sessions have occurred.

Suggested invitation: “Could you spend about 10–15 minutes trying DegreeSteps? This page has the tasks and sample course records: https://degreesteps.com/student-test.html . Use it without asking me for directions, then send me the feedback file or copied notes it creates. If you already use DegreeSteps, use a private browser window and skip the sign-in task to keep sample courses out of your real plan. Otherwise sign-in is still optional. Please don't upload real records or buy anything. We are testing the website, not you.”

## Who to recruit

Five adults who are actually considering a degree. Seek variation in comfort with technology; do not recruit only existing DegreeSteps supporters. Each participant can cover more than one characteristic, but assign one primary situation so the sessions do not all test the same journey.

| Participant | Situation | Device |
| --- | --- | --- |
| P01 | Starting without college credit, budget and time constrained | Their usual phone |
| P02 | Returning adult with prior courses from more than one institution | Their usual laptop |
| P03 | Campus-bound student or parent who cares about the college experience | Their usual device |
| P04 | Military learner with training or college coursework | Their usual device |
| P05 | Returning planner who has changed their intended degree | Their usual phone or laptop |

Recruitment message: “We are looking for people considering a college degree to try a degree-planning website for 25–30 minutes. You do not need to know about transfer credits. We are testing the website, not you. We will provide sample course records; you do not need to share transcripts, passwords, financial details, or military records.” Send this message only through an authorized recruitment channel; this document does not authorize contacting anyone.

## Consent and setup

Explain that participation is voluntary, they may stop at any time, and their answers will not affect admissions or credit decisions. Ask permission before recording screen or audio. Offer notes-only participation. Use participant IDs in notes, not names, email addresses, student IDs, or service records. Use the supplied synthetic CSV/PDF fixtures, a clean browser profile, and a dedicated test account. Do not record a real Google sign-in, password, or personal transcript. A moderator should pause recording before any authentication step.

Say only: “Please tell me what you are looking for and what you think as you go. I will mostly stay quiet.” Do not explain the navigation, define the badges, mention expected buttons, or demonstrate a plan before the task. Use their normal browser size and accessibility settings. Record the site release/commit, device, browser, and starting URL.

## Tasks, without navigation hints

Give the participant their situation in one sentence. Ask for their intended school, degree, budget, timeline, and campus preference only if they already know them. Let “I don't know” stand. Do not turn uncertainty into a prerequisite for starting.

| Task | Neutral prompt | Success evidence | Time target |
| --- | --- | --- | --- |
| Find a route | “Find a degree you would consider that fits your situation. You can change your mind.” | Opens a relevant usable plan and can explain why it fits, including format and degree level | Within 3 minutes |
| Understand the trade-off | “Tell me what you think you would pay, what you would take outside the university, and what still happens at the university.” | Distinguishes a planning estimate from a quote, outside credits from finished credits, and proposed transfer from awarded credit | Within 2 minutes |
| Bring prior learning | P02/P04: “Here are sample records. Add the courses you have already taken.” P01: “Continue without past courses.” | Finds upload or zero-course route unaided, reviews imported rows, preserves original units and status | Within 3 minutes |
| Begin the work | “You have this plan now. What would you do first? Show me where you would do it.” | Identifies a named course or genuine prerequisite task, its source, and the next actionable control | Within 2 minutes |
| Save and return | “Keep your work so you can come back from another device. Then close this tab and come back to it.” | Deliberately saves to the test account, recognizes the saved state, and opens the same plan/courses again | Within 3 minutes, excluding authentication delivery |
| Correct an accident | “You accidentally marked this sample course finished. Put it back to the correct status.” | Reverts status, sees progress change, and understands that a personal completion entry is not a university credit award | Within 1 minute |
| Change direction | “You are now considering a different degree or school. Compare or change the plan and show me what happens to your saved courses.” | Can see applicability/unused courses, preserves original records, does not assume one school's approval follows another | Within 3 minutes |

P03 must attempt a campus route and explain the distinction between campus enrollment and online outside courses. P04 must locate the military learning route and explain that training and benefit eligibility are separate. P05 starts with a pre-existing saved plan. Do not suggest an unrelated online degree to make the test succeed. An honest unavailable-program result is a coverage failure for that task, not a successful pathway.

If someone is silent, ask “What are you thinking?” If they are stuck, ask “What would you try next?” After two minutes without progress, offer help only after recording **assisted** or **failed**. Log exactly what help was given. Stop a task rather than asking them to buy or enroll in a real course.

## What to record

For each task capture: unassisted/assisted/failed, elapsed active time, first click, wrong turns, important pauses, the participant's exact words, and confidence from 1 (“I don't know what to do next”) to 5 (“I know my next step”). Ask “What did you expect to happen?” after a surprise. Finish with only three questions:

1. “What would keep you from using this for your own degree?”
2. “What, if anything, felt unclear or hard to trust?”
3. “If you left now, what would you do next?”

Do not lead with “Was this easy?” or teach terminology while measuring comprehension. Record uncertainty about recognition, licensing, tuition, proctoring, or provider membership as a product/research gap rather than an uninformed-user problem.

## Release decisions

- Any loss of courses/notes, false account-save confirmation, mistaken credit award, unsupported cost promise, or inaccessible essential control is a release blocker even if only one participant encounters it.
- Fix a repeated navigation or comprehension failure seen in two participants before widening promotion. Inspect the route and task context; do not redesign from an isolated style preference.
- Aim for at least four of five relevant participants to find a usable plan and identify their first action without help. Report raw counts and cases: five sessions are directional usability evidence, not a statistically representative conversion estimate.
- Repeat failed tasks with fresh participants after fixes. Preserve the original observations and the release tested.

## Results template

No observations entered yet. Populate only after an actual session.

| ID | Release / device | Task | Unassisted / assisted / failed | Active seconds | First click / wrong turn | Exact quote | Confidence 1–5 | Severity / follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| — | — | — | Not run | — | — | — | — | — |

## Automated acceptance alongside the study

`ready-pathways-student-browser.test.cjs` uses the current publication index, synthetic course uploads and an in-memory account stub. It checks finding a reviewed plan, bulk course review/import, deliberate save and return, changing degree without losing source courses/notes, reversible completion, and a reachable first action at desktop and phone widths. It blocks external requests and never writes a real account. Its report identifies the exact ready-model IDs tested. Browser emulation does not cover physical devices, Safari, screen-reader use, university evaluations, real OAuth, or student comprehension.

November 25 automated results: the final current-branch browser run passed **all 16 synthetic student journeys** at 390px and 1440px, including imports, degree and school changes, original semester-credit preservation for WGU competency-unit plans, reversing Finished, account save/reopen, and a reachable next action. No uncaught application errors, unexpected private-data requests, or real account writes occurred. The feedback page separately passed **eight browser checks** at 320px, 390px and 1440px covering sample download, local answer recovery, feedback export, clipboard success/fallback, clear/cancel and tasks without JavaScript. Importer checks passed 46 focused tests. Initial PDF failures and their fixes remain in the audit history.

Evidence is held outside public site assets under `/workspace/audits/degreesteps-ready-pathways-2026-11-25/student-acceptance/report.json`, `pdf-acceptance-fixed/report.json`, and `school-switch-acceptance/report.json`. These results do not change the real-participant study status above. Repeat affected academic routes after later content changes; do not treat the previous live publication index as evidence for a newly added degree.

Run it against the owned local preview after the production build:

```sh
DEGREEPATH_TEST_URL=http://127.0.0.1:8136/ node ready-pathways-student-browser.test.cjs
```

Set `DEGREESTEPS_ACCEPTANCE_ARTIFACTS` to an absolute ignored directory for the JSON report and screenshots. Do not put synthetic session payloads or future participant recordings into public site assets.
