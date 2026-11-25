# Academic coverage pipeline

This release creates a shared research workflow over the existing curriculum models. It does not increase the number of verified degrees merely by importing their metadata.

## Build and review

1. Curated curricula and documented receiving-school awards remain the academic inputs. `npm run coverage:build` compiles exact, scoped facts from every registered model.
2. Each fact keeps its institution, program/catalog/format, receiving units, original source quantities, conditions, source references and evidence fingerprint. A matching course title or provider partnership does not establish an equivalency. Potential cross-program reuse stays a candidate until its applicable scope is documented.
3. The quality report evaluates research, student execution and estimates independently. It uses one fresh optimizer run per model with no completed student records. A partial price quote does not become missing transfer research, and a transcript submission task does not become an unverified school policy.
4. **Manage DegreeSteps → Academic coverage** shows programs, the research queue and the exact evidence behind a fact. Reviewer decisions are saved separately in D1 with an atomic audit event and optimistic revision control. Changing evidence invalidates the previous fingerprint's applicability. Supporting a fact does not publish a template or override its academic conditions.
5. Corrections enter the curated inputs, regenerate through `npm run coverage:build`, pass the production checks, and ship as a reviewed release. No student needs to assemble this research workflow.

See [the quality contract](pathway-quality-contract.md), [school batch capture](school-research-batches.md) and [monthly review](pathway-review-workflow.md).

## Planning-price coverage

The quality report keeps legacy exact-total checks separate from the source-bound planning ranges used by the student worksheet. `estimates.planning` is calculated for the same exact model, catalog, format and selected baseline through `plan-estimate-engine.js`. The coverage workbench shows the known-charge range, price sources, omissions and study assumptions. A partial provider range stays partial; a planning range is never a complete price quote or proof of academic readiness.

The academic assessment date uses the latest genuinely recorded source review, without changing individual course or catalog review dates. Fetch timestamps do not refresh evidence, and future review dates fail validation. Missing course scope remains a separate finding even when provider review is pending.

Academic evidence dates and pricing review dates remain independent. A price-only review does not advance academic source dates or change the publication index. Current selected price sources are required for the reported range. Calendar duration is shown only as an assumption-based range when the estimator establishes a term duration; a campus term count does not imply a promised finish date. These build-time reports contain no private learning records.

## Runtime boundaries

- The academic registry is public reference data. Account records, uploads, private learning records and reviewer notes are not compiled into it.
- The admin API authenticates the session and verifies the platform role before loading the evidence index. College access alone does not grant review access. API responses use private/no-store and noindex policies.
- A compact index has a hard 12 MiB build limit. Full evidence lives in content-addressed files of at most 1 MiB, grouped by program. Overview/list/queue requests do not hydrate those files. A detail request is bounded to 32 files and 8 MiB, with one evidence file retained in the isolate cache. File hashes and fact fingerprints are checked before details are used.
- Existing degree-link baseline calculations run at build time. The runtime checks release input digests, planner source, registry assets, chosen course identities and source-reference applicability before returning a saved baseline. A cache miss falls back to the existing research flow; it never silently accepts a stale plan. Personalized planning still uses the student's current records in the existing planner.
- Builds reject stale registry, evidence, quality report, baseline and school-batch artifacts. Capturing a page never changes a source review date or approves its claims.

## Deployment

Apply D1 migration `0012_academic_fact_reviews.sql` before enabling the new API. It adds fact reviews and their event history; it does not migrate or modify private Supabase plans. The operator snapshot registry includes both new tables, bringing the managed schema to 29 tables. Apply the migration before taking a snapshot with the new schema definition.

The workbench is `/coverage.html`, reached from the admin page after verified admin access. Google/email sign-in can return there; the page stays out of search and browser caches. Public degree resolution does not load the research graph or call an AI provider.

## Next expansion stages

The Liberty batch includes every currently imported parent listing, explicit online variants and deduplicated official sources. The first live capture retrieves shared transfer guides and general education evidence without paid AI calls. The batch is a backlog, not a claim of complete Liberty coverage.

Approved composition now separates provider identity, receiving-school awards and degree placements. `content/reuse/liberty-undergraduate-awards.json` is reproducible from retained official guide, catalog and independent provider packets. The compiler applies it only within the reviewed catalog, delivery format, degree level and program scope. Exact named requirements and genuine unrestricted electives remain separate; source quantities, restrictions and existing option IDs are retained. `dist/data/shared-award-composition.json` records additions, reconciliations and held conflicts. Candidate similarity groups in the academic registry remain unapproved.

The WGU business adapter normalizes retained official agreement captures once and applies each program's own approved receiving claims to its exact reviewed ledger. Independent provider identities are reused without copying one program's awards into another. Run `python scripts/import-wgu-curricula.py` before the curriculum/academic/quality builders. Its source packet is `content/reuse/wgu-business-awards.json`; unknown provider versions and unresolved capstone rules stay held. Typed research notices distinguish supported scope statements from real missing evidence, and the compiled notes are shared by publication checks and the student planner.

The reviewed provider pools now include Sophia, Study.com, Saylor and StraighterLine. Each pool binds original course quantities and current recommendation records independently of the university agreement. A reusable identity does not establish a receiving award. Compound requirements that need two source courses remain held until the planner can represent both original courses; individual constituents cannot each receive the full award. Per-program coverage metadata records captured claims, verified identities, selectable placements and held gaps, with `allPossibleSourcesGloballyReviewed: false`. Exams, certifications, military learning and institutional courses still need their own exact program mappings. Unknown provider charges remain explicit partial estimates rather than zero-cost assumptions.

This is a build-time production workflow. General automatic extraction from arbitrary sites, continuous source-diff scheduling, reviewer approval automation and automatic live publication are not implemented. Subsequent adapters should provide source-backed data to these contracts, pass their scope/exception tests, and rerun the same solver and publication gates rather than add program-specific promotion code.

The current bounded file index is suitable for this catalog and isolated admin traffic. Before expanding past its enforced size limit, move searchable claim indexes into indexed database tables or institution partitions; do not raise memory limits or load the entire future catalog into a Worker. Student volume should continue to use CDN assets, cached baselines and the existing private-data boundary. Capacity still requires load testing against real provider quotas and expected traffic.
