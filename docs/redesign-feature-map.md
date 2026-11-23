# Redesign feature map (draft for owner approval, 2026-11-23)

Rule: **no feature is lost.** Every current feature has a home in the new design: on screen, one tap away, or merged into a stronger version of itself. Public SEO pages keep all of their content. Nothing here is built until the owner approves this map and the design canvas (https://claude.ai/artifact/AqqDNwFSng2ghzdnYvVywX).

Saved plans keep working: the `degreepath-guide-v3` key and saved shapes are unchanged, old links redirect, and the old `degreepath-v1` store is migrated, never dropped.

## The new structure

One header everywhere: **Degrees · Transfer courses · Community · My plan · Sign in**.

| Area | What it is | Replaces or merges |
|---|---|---|
| **Find a degree** | One search with filters (subject, school, level, online or campus, outside-credit share, credit source, needs-confirmation), sorts (lowest cost, most credits for less, **best for my credits**) and a **Compare** checkbox on cards (up to 3) | programs.html finder, portal "routes" step, compare-plans "Find my options", credits-worth ranking, sheet "Choose a ready-to-use plan", campus finder (becomes the "On campus" filter with campus features) |
| **1-minute quiz** | "Not sure what to study?" questions: purpose, career, level, field, format, priority | portal "Help me choose" intake, guided.html wizard |
| **Build my plan: 3 steps** | 1 Pick a degree · 2 Credits you have · 3 Your plan | portal setup flow (school, degree, about you, prior credits, military, priority) |
| **Step 2: credits you have** | One screen: none / type a few / upload a transcript or spreadsheet / military record | import-courses, sheet credits dialog, credits-worth "Add a course", courses "Add by hand", military questions |
| **My plan** | The checklist: To do / Done / All, grouped Take for less · Your pick · At [School] · Done, with a summary panel | plan.html worksheet (both views) |
| **My courses** | Your course records plus the course catalog search | courses.html (mine + browse) |
| **Community** | Feed, plans to copy, threads, school outcomes | community.html (unchanged features) |
| **Account** | Sign-in, saved plans, backups, alerts, delete data | account.html (unchanged features) |
| **My degree isn't listed** | One page with two tabs: paste the official link (AI research) or enter requirements yourself | request-plan.html + degree-audit.html |

## Where every plan feature goes (My plan)

| Feature today | New home |
|---|---|
| Course choice per row, "let the planner choose", show all, find an outside option | Tap a row: a sheet with options (cheapest first), "Choose for me" |
| Open slots (new) | "Your pick" rows: type your course, cheap suggestions, Ask the community |
| Record progress, school confirmation, placement, edit/remove record | Row sheet: "Mark done" and "Record school confirmation" |
| Private note, Discuss this course | Row sheet: Note, Discuss |
| Evidence, sources, checked dates, credit-sources panel | Row sheet: "Why this counts" (one tap); full list under More › Sources |
| Progress, at-a-glance, route overview | Summary panel: progress bar (done / for less / at school), credits |
| Cost & timing, personal assumptions, savings tracker, planning range | Summary panel: cost and time; tap for **Cost details** (assumptions, budget, pace, savings in one place) |
| What-if version + compare-plans "save as version" | More › **Versions** (save, compare, restore) |
| Momentum, checklist, add to calendar, next three steps | Summary panel: **Next steps** (checklist, calendar, guidance) |
| Plan checks (residency, exceptions) | Summary panel: "Before you enroll" checks |
| School email + copy, portal copy request, request information, have school contact me, plan review | One **Ask [School]** button: email the transfer office, request information, have them contact me (flag), plan review (flag) |
| Email alerts opt-in | Next steps: "Email me if this plan changes" (flag) |
| Freshness note, catalog-changed choices | Banner at the top of the plan (unchanged logic) |
| Course preferences, degree preferences, portal preferences (3 editors) | One **Preferences** sheet (priority, sources, proctoring, conditional matches, waivers, goal, format, military) |
| Change degree, change goal | Header: "Change degree" (opens Find a degree) |
| Download CSV, private backup, print, share to community | More menu (unchanged outputs) |
| Partner links, lead actions, coach | Unchanged components, restyled; coach stays a floating button |
| Save plan, save status, conflicts | Header Save button and status (unchanged logic) |

## Public SEO pages: keep all content, restyle, add structure

| Page type | Change |
|---|---|
| `/degree-plans/<plan>/` | New layout (canvas board "Public plan page"): search-style title, one-line answer, at-a-glance facts, table of contents, courses for less, courses at the school, transfer rules, cost, **questions**, sources, related plans. Add `EducationalOccupationalProgram` and `FAQPage` JSON-LD from our own data |
| `/degree-plans/` hub, `/transfer/*`, `/credit-sources/*`, `/schools/*` | Same content, new type scale and cards; add question blocks with `FAQPage` where we have sourced answers; `CollegeOrUniversity` on school pages |
| Home | Shorter: search first, 3 steps, one real example, cost calculator, guide cards, FAQ (kept) |
| `/compare/`, `/how-it-works/`, `/resources/`, `/guides/`, `/blog/`, `/faq/`, `/about/`, `/why-its-free/`, privacy, terms | Restyle only; URLs, titles, meta, canonical, Open Graph, sitemap and JSON-LD kept |
| programs.html | Becomes Find a degree; public `/degree-plans/` stays the indexable version |

## Retire safely (with redirects, no data loss)

| Item | Plan |
|---|---|
| `guided.html` (no inbound links) | Redirect to the quiz; migration code for old stores moves into the plan loader |
| `library.html` legacy workspace (`degreepath-v1`) | Policy search moves to school pages; on first visit migrate any `degreepath-v1` data into My plan, then redirect |
| `audit.html` | Keep the redirect |
| `dist/app.js`, `dist/main.js` | Confirm nothing loads them, then delete |
| Portal `view=review` / `view=school` | Folded into My plan (Before you enroll, Ask [School]); URLs redirect with their params |

## Functionality we add

- Open slots with your own course choices, and community help per slot.
- "Best for my credits" sort and Compare on every degree card.
- One place to add courses, used everywhere.
- Row sheet with all course actions on phone and desktop.
- Clearer progress (done / for less / at school) on every plan.
- Questions and answers and richer structured data on SEO pages.

## Build order (after open slots lands)

1. Shared header, type scale, buttons, cards and row sheet.
2. My plan restructure (biggest gain), keeping every dialog's logic.
3. Build my plan 3 steps + quiz; redirects.
4. Find a degree merge; Compare.
5. SEO page templates + structured data.
6. Retire legacy pages with redirects and data migration.

Each step ships behind the same tests plus new browser tests at 320, 390 and 1440 px, and a check that every feature in this map is still reachable.
