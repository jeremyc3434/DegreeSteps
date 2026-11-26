# Bulk pathway production

DegreeSteps grows by reviewing reusable academic facts, then compiling complete
programs. A successful fetch, an AI draft, or a new directory listing does not
make a degree plan ready. The existing academic and publication checks remain
the release authority.

## One workflow

Preview the next cohort without network requests, AI calls, or file changes:

```sh
npm run factory:batch -- --target 20
npm run factory:batch -- --target 20 --schools liberty,tesu,umpi,wgu
```

Create a research workspace using retained source captures, without fetching or
spending AI tokens:

```sh
npm run factory:batch -- --run --target 20 --output outputs/factory-batch
```

Capture the next five official sources, resuming the same workspace:

```sh
npm run factory:batch -- --run --capture --target 20 \
  --limit 5 --concurrency 2 --max-bytes 33554432 \
  --output outputs/factory-batch
```

The capture limit and byte budget apply across the invocation's schools.
Completed jobs are skipped only after their inputs, receipt, and actual body
hash verify. Failed jobs are deferred until `--retry-failed`. Use `--no-resume`
for an intentional refresh of captured sources. A changed trust configuration,
source identity, or relevant academic input invalidates affected jobs. The
workflow does not reset a source's academic review date.

Read the output files:

| File | Purpose |
| --- | --- |
| `plan.json` | Selected additional programs, every represented dependency, unrepresented holds, shared source groups, and input fingerprints. |
| `run.json` | Run state, counts, cache use, and failures. `run-complete` means this bounded invocation finished; it does not mean research or a plan is complete. |
| `schools/<school>-<delivery>/capture-ledger.json` | Durable source job state, attempts, invalidation history, and immutable receipt/body locations. |
| `components.json` | Source-bound component drafts, exact quotes, gaps, and rejected claims. |
| `review-tasks.json` | Scoped review tasks with matching draft component references and explicit source/configuration failures. |
| `components-cache/` | Content/version-keyed extraction results reused across degree consumers. |

Artifacts stay inside `outputs/` and are ignored by Git. Keep a workspace intact
to resume it. Its ledger uses exclusive leases, and the controller rejects a
second runner for that output folder. Separate output folders are separate jobs;
do not use them to bypass a shared provider/AI budget.

## How the cohort is chosen

The planner compares complete dependency bundles by the number of whole
programs covered per additional scoped task and distinct source work group.
It is a deterministic heuristic, not an optimality or researcher-hour claim.
It prefers candidates with established accelerated-study value, excludes
already-ready plans, and retains explicit legacy/superseded identities outside
additional-degree targets. It never migrates a student's saved plan.

Shared tasks retain the existing exact school, catalog, degree level, delivery,
unit, provider version, receiving award, and placement constraints. A common URL
saves capture work; it does not merge academic claims. Semantic page-range and
recommendation-period fragments stay distinct in source-work identities.
Program-specific prerequisite and capstone exceptions remain independent.

`potentialReady` means every currently known publication hold is represented in
the selected research dependencies. It assumes all that research succeeds and
the complete plan passes a fresh publication assessment. It is not a promise of
approval or the number of newly ready plans. Unrepresented acceleration or
other holds are listed separately, including candidates that cannot yet count
as potential completions.

## Source components and optional Claude extraction

The default run uses deterministic extraction from retained public source
bodies. It supports policy, course identity, prerequisite, named choice pool,
receiving-award, program-ledger, family-delta, and pricing drafts. Every accepted
claim needs its own verbatim evidence span and a compatible source role.
Source quantities and receiving quantities remain separate. Unstated credit
units, ambiguous prerequisite expressions, and contradictory facts remain gaps.
No component becomes reviewed or publishable through extraction.

For nuanced pages, explicitly opt into the existing server-side Claude key:

```sh
npm run factory:batch -- --run --target 20 --allow-ai \
  --model YOUR_CONFIGURED_MODEL --ai-limit 5 \
  --output outputs/factory-batch
```

`ANTHROPIC_API_KEY` must be supplied in the server environment, never in a
committed file or browser. No model is guessed. At most five uncached calls are
allowed by default; `--ai-limit` accepts 1–25. A budget stop preserves completed
cache entries for the next invocation. This is an authoring cost, not an AI call
for every visiting student. The cache includes the exact source identity/text,
role and extraction/schema/prompt/model versions. Changed content or extraction
semantics require a new draft; corrupt cached evidence fails closed.

## Reusable named university choices

`institutionChoicePools` are reviewed university-course fallback choices, not
outside-credit approvals. The Champlain pilot binds each program/category to its
own retained primary catalog and exact named course/credit tuples. It resolves
generic choice gaps without inferring that Sophia, Study.com, or another provider
satisfies those requirements. Existing outside options and all remaining
transfer, residency, prerequisite and acceleration holds remain in force.

Use `node scripts/pathway-factory/reviewed-choice-pools.mjs --check` to check the
adoption packet and its canonical opt-ins; see the module's CLI for supported
write behavior. Do not copy pools into another school, catalog, category, or
delivery without its own reviewed evidence.

## Data-driven onboarding pilot

`content/factory-manifests/tesu.json` is the reviewed eight-program TESU family
pilot. One explicit roster now feeds the existing authoring, metadata, and
placement stages, replacing repeated program/path lists. It binds source hashes,
catalog/units, major requirements, exceptions, rates, and context records.
Manifest registration never changes academic readiness. The other schools are
still supported by their current canonical kits; absence from this pilot is not
a publication hold. New catalogs and families require their own reviewed basis.

Check the pilot with `npm run factory:manifests`. Run the relevant existing
writer checks after an entry changes. Never infer missing catalog, price,
provider, prerequisite or course-award facts from a title.

## Review and release once per finished cohort

1. Resolve review tasks against original sources; put reviewed facts into the
   canonical provider, school, scoped award, named-pool, and program ledgers.
2. Run focused verifier, manifest, writer, and cohort checks while authoring.
3. Run `npm run factory:refresh` after canonical facts are frozen. This compiles
   reviewed inputs and rebuilds dependent academic, publication and course
   indexes in order. Drafts cannot be promoted by the batch controller.
4. Build and run release QA. The independent released-45 acceptance fixture
   protects academic identities, totals, units, outside-credit minima, historical
   award/source versions, and student saved-course behavior. Additional ready
   plans must pass the existing complete publication assessment.
5. Review the complete diff, then deploy through the normal staging/production
   workflow. Count distinct newly usable degrees separately from drafts,
   catalogs, directory entries, routes, and provider variants.

This avoids repeating research and full rebuilds for every degree. The remaining
constraint is obtaining and reviewing missing primary evidence, rather than
copying the same spreadsheet rows into more files.
