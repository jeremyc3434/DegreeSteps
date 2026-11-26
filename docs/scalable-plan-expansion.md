# Expanding reviewed degree plans

DegreeSteps maintains shared school policies and exact receiving-course awards once, then compiles their permitted placements into program-specific degree plans. Catalog year, delivery format, degree level, credit units, original provider identity and exact agreement scope remain part of every decision. A course accepted at a school does not automatically meet every major, general education or residency requirement.

## One refresh command

After reviewing and updating canonical files in `content/pathway-kits/` and retained evidence in `content/source-captures/`, run:

```sh
node scripts/refresh-plan-factory.mjs --plan
node scripts/refresh-plan-factory.mjs
npm run build
npm run test:core
```

The refresh compiles all published school kits, then rebuilds the curriculum registry, research references, academic evidence registry, quality report, shared research queue, plan library and course indexes, provider coverage, research priorities, school research batch and coach index. It runs sequentially and stops on the first failure. It prints actual elapsed timings for each step and a final receipt. A failed run may have updated earlier generated files; fix the issue and rerun before reviewing or deploying the resulting tree.

To validate committed generated artifacts without refreshing them:

```sh
node scripts/refresh-plan-factory.mjs --check
```

`--plan --check` prints the validation commands without executing any generator. `--check` is passed to every generator, including the factory compiler. These commands make no AI calls and do not publish a deployment.

## Research once, verify each permitted use

1. Capture the official policy, exact program requirements and receiving-school transfer guide. Retain the source body, timestamp and hash. A newer review creates a new capture; an old source date is not relabeled as current evidence.
2. Add independent provider-course identity, credit quantity and credit units separately from the receiving-school award. Preserve conditional approvals, agreement program IDs and course versions.
3. Reuse a receiving award only within its explicit school, catalog, format, degree level and program scope. A shared school-wide fact can serve many degrees; a program-specific restriction continues to override it.
4. Supply exact major requirements and approved named university choices. The new `institutionChoicePools` mechanism can share reviewed choice lists with explicit scopes and source-bound names, credits and levels. It excludes fixed required courses and assigns a course only once, including overlapping broad and narrow blocks. No real choice pool is adopted in the initial release; this is a guarded facility for subsequent reviewed batches.
5. Refresh and inspect `dist/data/pathway-quality-report.json`. Only publication-ready plans should be presented as complete templates. Use the Owner Console's shared research tasks to resolve the highest-impact repeated questions, then rerun all affected plans.
6. Preserve the independent golden-baseline acceptance checks in `scalable-expansion-acceptance.test.mjs`. Add exact totals, institutional requirements, provider-course identity and unit assertions for each new degree family. Full build and core QA remain release requirements.

The research queue groups repeated work; it grants no automatic approval. Its scope and per-program contexts remain attached to each task. It includes no private student records and runs without per-student AI costs. For large batches, resolve one shared policy or course fact and let the compiler re-evaluate every affected degree rather than editing generated plans individually.

## November 25 expansion boundaries

The starting catalog had 156 academic models and 22 publication-ready plans. The rebuilt catalog has 162 models and 30 ready plans: five additional exact WGU degrees or tracks, Liberty's online Interdisciplinary A.A. and residential Psychology B.S., and UMPI's YourPace organizational leadership master's. All 22 previous plans remain ready. The generated quality report remains the source of truth for final readiness.

The resulting shared queue turns 3,046 blocking finding occurrences into 914 scoped research tasks across 162 models. Resolving a task still requires evidence and a new validation run; grouping repeated findings does not approve any plan.

TESU Liberal Studies gains a conditional 84-credit outside-course scenario. It is not a newly verified template: exact receiving awards still require the missing evidence. UMPI's graduate plan contains 36 credits taken at UMPI and uses self-paced competency-based delivery; undergraduate ACE limits do not apply. WGU cloud tracks qualify through self-paced competency-based delivery, with 34 outside CUs, rather than a claim of 50% transfer.

An indexed requirement join measured about 28 times faster on the WGU matching benchmark. That measures one compiler operation, not total research or end-to-end compilation. Retained source review and exact program exceptions remain the main work. The queue and shared mappings reduce duplicated research while preserving those checks; they do not turn unsupported catalog entries into verified degree plans.
