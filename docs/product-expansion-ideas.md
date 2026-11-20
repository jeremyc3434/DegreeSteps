# DegreeSteps — where to take it next

Written 2026-11-20 after reviewing the codebase, the data pipeline and every public page.

## Where things stand

DegreeSteps has an unusually strong foundation:
- an optimizer that allocates credit correctly
- strict evidence rules
- transcript import
- account saving with conflict protection
- cost comparisons
- a community layer

The constraint is reach. **11 publication-ready plans out of 1,630 directory programs** means most visitors who arrive with a specific degree in mind leave without a plan. Most ideas below get stronger as the Pathway Factory increases coverage, so the factory is the first priority. The ideas are ordered so each one builds on the one before.

---

## 1. Turn coverage into distribution (Now)

**Programmatic, evidence-backed SEO pages.** Once each school has one equivalency table, every row can become a useful page:
- "Does Sophia's *Organizational Behavior* count at WGU?" → yes: it counts for C715 in these 6 programs, as of this date, with the source shown.
- "Cheapest way to finish a WGU Marketing degree" → generated from the baseline plan and its cost.
- "Every CLEP exam Liberty accepts", per school.

People search with exactly these long-tail questions, and nobody else answers them with citations. They can all be generated from the same compiled data that drives the planner, so they're accurate by construction and refresh when the data changes. Add `Dataset`/`FAQPage` structured data.

**Shareable "degree receipt."** When a plan is built, generate a share card: *"Marketing B.S. at WGU: 69 of 112 credits through outside courses · est. $X saved."* It's built for Reddit (r/WGU, r/CLEP), TikTok and Facebook groups, where this audience already compares routes. Link back to the public plan page.

## 2. Reverse search: "What are my credits worth?" (Now → Next)

Today the flow starts from a degree. Many visitors start from what they already have: 40 old community-college credits, a CCAF transcript, six Sophia courses. Flip the flow:

> Upload or enter what you have → see every researched degree **ranked by remaining cost and time**, with the gap for each.

The optimizer and course library already exist, so this mostly means running the baseline solver across all published models with the student's records. It becomes the product's signature moment, and it improves automatically as factory coverage grows.

## 3. Plan → finish: a pacing coach (Next)

Most alternative-credit students don't fail at planning. They stall halfway through. Add:
- **Subscription-aware scheduling.** "Do these 8 Sophia courses in 2 billing months ($198), then switch to Study.com for these 3." This optimizes the provider subscription calendar, not just course choice. It's unique, and the savings are concrete.
- **Weekly plan and nudges** (email/SMS/push) built on the existing task calendar and next-step actions.
- **Milestones that celebrate**, using the credit-split bar as a progress meter that fills as courses complete.

## 4. Source-change alerts as a trust feature (Next)

The factory stores captured source pages with hashes. Re-capture them on a schedule and diff them. When a school changes an equivalency or cap:
1. the research queue gets the item automatically (keeps data fresh without manual rechecks)
2. **students whose saved plans use that mapping get an alert** before they pay for a course that no longer counts

That protects students from wasted money. No competitor does this, and it's a natural paid feature.

## 5. Students as a verification network (Next)

The community verification contract already exists. Make it a flywheel:
- After a school evaluates their transcript, students upload the evaluation (or confirm line by line): "Sophia ENG1001 → ENGL 101 ✔ awarded 3."
- Confirmed awards become a new evidence tier ("confirmed by 14 students in 2026"). It sits alongside official sources and never replaces them.
- Disagreements between student results and the published table go straight into the research queue.

## 6. New audiences that already have this exact problem (Later)

| Audience | Why it fits | What to build |
| --- | --- | --- |
| **Employer tuition benefits** | Many employers cap at $5,250/yr (the IRS §127 limit). Workers need plans that fit inside the cap. | "Fit my plan to my benefit" mode, employer landing pages, B2B seats/reporting. The strongest revenue line. |
| **High school / dual enrollment parents** | Parents already build "college before college" with CLEP/Sophia. They plan years ahead and pay. | A parent dashboard and multi-year plan for a teen, with school-acceptance checks for target colleges. |
| **Military & veterans** | Joint Services Transcript credit is large and underused. There's already a guide. | JST PDF parser into My courses, TA/GI Bill cost modes, CCAF → bachelor routes. |
| **Counselors, workforce boards, nonprofits** | One advisor serves hundreds of learners. | An advisor workspace: caseload, shared plans (college-access exists), progress reporting. |

## 7. A grounded AI planning assistant (Later)

"Ask about my plan" chat that **answers only from compiled kit data and captured source text**, citing the quote every time. It should explain *why* a course counts, compare two schools, and draft the email to an admissions advisor. The factory's grounding rule (no quote, no claim) makes this safe to ship. An assistant without that grounding would be a liability here.

---

## Business model options (no conflicts with trust)

1. **Free planner, paid "Plan Plus"** (one-time or monthly): source-change alerts, pacing coach, subscription scheduler, export packet for the admissions office.
2. **Provider affiliate revenue** (Sophia, Study.com, StraighterLine have programs). Rule: **never rank by commission**. Disclose it plainly. The optimizer's ordering stays purely cost/fit.
3. **B2B seats** for employers, counselors and workforce programs.
4. **School partnerships**: qualified, consented transfer-ready applicants with a verified credit packet. The college-access boundary already exists.

## Suggested sequence

1. **Weeks 1–4:** Pathway Factory in production for WGU (wire compiled kits in), then Liberty, then 3–5 new schools with high transfer ceilings (TESU, Excelsior, Charter Oak, UMPI, SNHU, Purdue Global, Capella). Target: 100+ publication-ready plans.
2. **Weeks 3–6:** Programmatic SEO pages and share cards, generated from the same data.
3. **Weeks 5–10:** Reverse search ("what are my credits worth"), then the subscription-aware pacing coach.
4. **Quarter 2:** Source-change alerts plus student-verified awards (the trust flywheel), then the employer benefit mode.

## Metrics to watch

- **Coverage:** publication-ready plans, % of directory traffic landing on a program with a plan.
- **Activation:** visitors who see a personal plan with their own records.
- **Progress:** credits marked complete per active student per month. This is the real north star: degrees finished, not plans built.
- **Trust:** % of plan mappings confirmed by student evaluations, and alert-to-fix time.
