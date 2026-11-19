# Degree coverage workflow

Use **Manage DegreeSteps → Academic coverage → Research priorities** to choose the next mapping work. The deterministic backlog combines the existing directory, curriculum registry, quality report, school policies and staged inventory. It includes the **21 schools currently imported**, not every eligible college or current offering. It makes no AI calls, starts no research jobs and publishes no plans. These are platform research tasks, not work to hand back to students.

## Read the coverage levels correctly

| Level | What it establishes |
| --- | --- |
| Directory entry | A program is listed; its requirements and transfer route may still need research. |
| Curriculum model | A structured degree ledger exists. Its evidence or allocations may remain incomplete. |
| Available template | The registry enables a proposed course plan. This is separate from passing publication review. |
| Publication-ready | The exact model passes the current publication checks. The current report has **four**; this does not verify other degrees at those schools. |

A directory parent can be marked `covered-by-planning-variant` only through an **explicit parent ID** and available variants at the same school and degree level covering all of that parent's listed formats. Similar titles never establish coverage. This prevents duplicate research without copying a campus model into an unresearched online format or inheriting its policy limits.

## Research the opportunity, then the exact route

The queue groups work by sourced transfer potential, campus/online delivery, competency or self-paced format, and remaining evidence. Its 60-credit campus threshold is a triage heuristic, not proof that half of an exact degree transfers. Campus appeal should reflect the student's location and preferences plus documented attributes such as housing, athletics and program offerings. Do not invent popularity, ease, recognition or Niche-style scores.

Keep institutional, ACE, NCCRS and graduate channels separate. A total transfer ceiling is not an alternative-credit allowance. Also preserve campus/online rules, catalog, residency, major, upper-level and any licensure or regulatory restrictions. Bind each numeric policy to its applicable source and units; an unsupported maximum remains unknown.

**GCU example:** its total undergraduate transfer ceiling is **90**, with a separate shared **30-credit alternative-source cap**. The current proposed BSBA campus route maps **26 outside credits and 94 GCU credits**, not 90 mapped credits. Preserve original provider/issuer quantities and receiving awards: a three-credit source may satisfy the content of a four-credit GCU course while awarding only three credits. Any shortfall uses actual, named university coursework; never inflate source credits or create a generic balancing award.

## Monthly review and release

1. Recheck official catalogs, exact receiving-school awards and original provider records. Save extracts, applicable catalog/format, quantities, source URLs and genuine review dates. A fetch or rebuild does not refresh evidence. Staged inventory claims remain unreviewed until independently supported.
2. Correct the curated inputs or their scoped importers. Review changed fact fingerprints in the coverage workspace; a supported fact alone does not publish a template. The separate school capture workflow currently pilots Liberty; it does not automate cross-school extraction.
3. Regenerate in dependency order after reviewed input changes:

```sh
node scripts/merge-opportunity-catalog.mjs
node scripts/build-curriculum-registry.mjs
npm run coverage:build
node scripts/build-research-priorities.mjs
node scripts/build-research-priorities.mjs --check
node research-priorities.test.mjs
npm run review:pathways
npm run build
npm run test:core
```

Run the affected school's policy, credit-allocation and student-flow tests too. Review the resulting quality findings before releasing. The queue's two JSON artifacts retain immutable input fingerprints and source-derived dates, so changed dependencies require regeneration. See [monthly review](pathway-review-workflow.md), [academic coverage](academic-coverage-pipeline.md) and [school capture](school-research-batches.md).
