# DegreeSteps

Collaboration repository: [jeremyc3434/DegreeSteps](https://github.com/jeremyc3434/DegreeSteps). Pull-request CI validates source; it does not deploy the live application.

DegreeSteps helps students connect completed courses, affordable outside credit, and college requirements into a practical degree plan. The public website explains the options; the student workspace collects courses, compares available plans, and tracks the next step toward graduation.

The application uses preloaded, source-linked academic rules for normal planning. A student does not need a paid AI request to browse courses, compare researched pathways, or maintain a device draft. Optional Claude research and scan reading are separate, authenticated services with explicit limits. A university determines the student's final transfer award.

## Start here

Use **Node.js 24** and the committed npm lockfile. The build also uses Python 3 for reproducible academic-source checks. No production credentials are required for the build or core tests.

```bash
npm ci --ignore-scripts
node scripts/check-source-safety.mjs
node scripts/vendor-record-readers.mjs --check
node scripts/build-credit-import-template.mjs --check
npm run build
node scripts/test-core.mjs
```

`npm run build` generates public pages, checks the academic data and migrations, and produces both the Sites Worker package in `outputs/site/` and the owner-controlled Cloudflare build in `outputs/cloudflare/`. Run it before the Worker boundary tests. `dist/` contains application source and committed generated public assets; it is not a disposable build directory.

For a local preview, run `node server/dev.mjs` and use the loopback URL it prints. That preview uses local SQLite and a loopback-only synthetic sign-in. It does not reproduce a production Supabase account or a Cloudflare queue. Do not expose the development server publicly.

Copy `.env.example` when configuring a development environment. Set values through the selected runtime's environment mechanism; plain Node commands do not automatically load that file. Use a separate staging project for integration work. Never copy production student records into fixtures.

## Application structure

| Location | Purpose |
| --- | --- |
| `dist/portal.html`, `portal.js` | Guided setup and personal next actions |
| `dist/plan.html`, `sheet.js`, `course-plan-view.js` | Degree worksheet, course choices, and progress |
| `dist/courses.html`, `course-library-engine.js` | A course collection that survives changing degrees |
| `dist/import-courses.html`, `record-import-engine.js`, `record-file-reader.js` | PDF/Excel/CSV upload, editable batch review, and one explicit import |
| `dist/planner.js`, `guide-engine.js`, `plan-comparison-engine.js` | Allocation, policy guards, comparisons, and cost scenarios |
| `dist/data/`, `content/`, `scripts/` | Source-linked course and program data, research inputs, and reproducible generators |
| `scripts/build-public-site.mjs`, `home-content.mjs` | Public resources, school/source pages, marketing content, and SEO |
| `dist/brand.css`, `brand-tokens.json` | Shared DegreeSteps visual tokens |
| `server/` | Authentication, private account plans, community, research, and provider boundaries |
| `db/`, `drizzle/` | Schema declarations and immutable, ordered SQLite migration history |
| `supabase/migrations/`, `db/postgres/` | Private-portal Postgres migration, reviewed schema and rollback-only verification |
| `worker/index.mjs`, `scripts/build-community.mjs` | HTTP routing and the managed Sites Worker build |
| `wrangler.jsonc`, `scripts/check-production-config.mjs` | Gated owner-controlled Cloudflare deployment configuration |
| `server/research-jobs.mjs` | Durable research outbox, queue leases, bounded retries and dead-letter handling |
| `test-support/` | Synthetic fixtures and non-production test harnesses |

The managed deployment uses a Cloudflare Worker and D1 through Sites, plus Supabase authentication. Private-plan storage supports the owner-scoped Supabase Postgres backend selected by `PORTAL_STORAGE_BACKEND=supabase`; development and legacy fixtures can explicitly select `d1`. Confirm the deployed runtime flag when investigating account data. A Postgres failure never redirects private writes back into D1.

The owner-controlled Cloudflare build stores public assets separately from the Worker and supports a research Queue consumer and scheduled outbox replay. The Sites-compatible build retains embedded public assets and the existing request/SSE research path when a queue binding is absent. The checked-in Wrangler configuration contains placeholder account/database IDs: it is prepared configuration, not a provisioned environment or a capacity guarantee.

## Academic correctness

- A program-directory entry is not an executable transfer plan. The public planning catalog must distinguish available course maps from listings still being researched.
- Saved interests, work in progress, completed learning, and institution-confirmed awards are separate states.
- Preserve the original provider, course identity, credit amount, credit units, grade, and completion date. Quarter hours and competency units are not automatically semester hours.
- Retain source URLs, exact catalog/format scope, review dates, eligibility, recommendation windows, and exclusions. An ACE or NCCRS recommendation alone is not a university equivalency.
- Keep institution-credit minima, major residency, upper-level rules, duplicate awards, and career/licensure requirements explicit.
- Unknown cost or timing is not zero. Estimates must retain their assumptions and exclusions.

The reviewed curriculum registry in `dist/data/curriculum-registry.json` is the current coverage source. Do not hardcode a marketing count into a test or infer full coverage from the number of directory listings. Use `npm run review:pathways` for the dated research queue; it does not itself approve or publish a pathway.

## Student data and compatibility

Device drafts use the existing `degreepath-guide-v3` localStorage contract. Historical cookie names, event names, internal research-owner values, deployment IDs, and encryption identifiers are retained intentionally. The public product name is DegreeSteps. Blindly renaming technical identifiers can erase access to saved work or prevent existing credentials from decrypting.

Reading an account or signing in must not upload the device draft. Account saving requires explicit consent, ownership checks, and revision checks. Keep private learning records and notes out of public community previews. Uploaded transcript files are read locally unless the student explicitly chooses optional AI scan reading; DegreeSteps does not persist the original transcript document.

A custom-domain cutover changes the browser origin. Device-only drafts and host-only cookies do not move automatically. Keep the old address available until account backup/open and authentication have been verified on the new host. The public origin must only change after DNS, TLS, and callback configuration are ready.

## Tests and CI

`node scripts/test-core.mjs` discovers the repository's non-browser Node tests and gives each file a fresh process so its mocks cannot affect another file. It includes server authorization, revision conflicts, academic allocation, original-record guards, course imports, and the built Worker boundary. It reports failing files and returns a failure status if any fail; it never starts a preview server. Browser-dependent journeys are excluded and reported separately.

The GitHub Actions workflow installs locked dependencies with lifecycle scripts disabled, checks tracked source for common secret mistakes, verifies local vendor assets and the blank spreadsheet template, builds, and runs core tests. It needs no application secrets and does not deploy pull requests.

Browser journeys require a supported browser environment and synthetic data. Passing static, VM, or API tests does not certify mobile usability, accessibility, field performance, or production concurrency. Cloud capacity claims require representative staged load tests, operational monitoring, and verified provider limits.

For a reproducible local benchmark, run the following after building:

```bash
npm run benchmark:scale -- --students 1000 --posts 5000 --samples 100 --out outputs/benchmarks/scale-local.json
```

This runner uses synthetic SQLite/D1 data and mocked identity without external HTTP or paid AI. Its latency, query and correctness results describe that local environment. They exclude real network latency, provider rate limits and hosted database behavior; do not translate them into a supported production user count.

## Storage migration and recovery

The Postgres private portal preserves the existing account API, explicit-save consent and revision conflict checks. Its functions run with the authenticated student's permissions and row-level ownership policies. A private trigger helper enforces write limits and plan caps, including direct REST writes.

After activating the Postgres backend, the account page can show older D1 backups. **Move my saved plans** requires explicit consent and the reviewed source manifest/revisions. Migration is one target transaction, is idempotent for the same source, and refuses conflicting target copies. The D1 source remains available. A changed source requires reviewing and backing up both copies; it is not an instruction to overwrite a newer plan.

`db/postgres/verify-portal.sql` checks actual Postgres ownership isolation, snapshots, revision conflicts, plan caps and atomic migration. It requires a suitable pilot Auth user with no plans in the new store, and every synthetic write rolls back. Never run load tests against real student records.

Keep the selected private backend consistent during a rollback. Switching the flag to `d1` does not copy newer Postgres plans back into the old store. Roll back to a compatible Worker version that retains the same backend, or perform a separately verified data migration first. If deleting private portal data reports `deletion_incomplete`, retry the deletion to finish both stores and college-sharing cleanup; do not treat a partial failure as complete.

## Owner-controlled Cloudflare launch

The long-term deployment requires a Cloudflare account controlled by the project owner. It has not been activated merely by building this repository. Use a staging hostname and resources first.

Start with the [launch checklist](docs/site-launch.md), including owner account setup and domain/authentication cutover. Archived Sites DNS records are not deployment instructions for the owner-controlled Worker. Keep the existing live host available until the destination is verified.

`wrangler.staging.jsonc` selects the owner's isolated `degreesteps-staging` Worker, D1 database and research queues. Its wrapper blocks search indexing and disables HTTP caching. It omits paid CPU allowances, production domains and unattended outbox scheduling. Deploy it with `npm run deploy:staging` after authorizing the intended Cloudflare account. Configure Supabase URL/publishable key through Worker secrets; never copy a service-role key. This environment has no imported legacy/community records or Claude connection, and free-runtime limits do not certify production capacity. The guarded `deploy:cloudflare` command and its separate production manifest remain unchanged.

1. Create the account-owned D1 database, main research queue and dead-letter queue, then put the real account/database identifiers into `wrangler.jsonc`. The managed Sites `DB` binding is a logical name, not a database that a different Cloudflare account can access.
2. Apply the ordered SQLite schema and plan a verified export/import of existing D1 data. Preserve community posts, evidence, memberships, research state and any legacy account backups. Keep database exports in ignored `outputs/` storage and secure operator channels, never in GitHub or fixtures. Verify counts, ownership, revisions and representative records before switching traffic.
3. Apply the reviewed Supabase migrations to the intended project and run isolation/restore checks. Keep the existing Supabase project and user identities when moving hosts. Configure `PORTAL_STORAGE_BACKEND=supabase`, the project URL and publishable key in the runtime. The private data adapter uses the verified user's JWT rather than a service-role credential.
4. Configure runtime secrets and the server-only AI connection through approved operator tooling. Existing encrypted Claude rows require their matching master key and unchanged encryption identifier; copying ciphertext alone does not restore the connection. Verify the connection before accepting new research. Do not put secrets in `wrangler.jsonc`, source files, GitHub or command arguments.
5. Check queue behavior with synthetic research: one job per batch, low concurrency, lease fencing, reconnection and dead-letter recovery. The scheduled handler replays committed outbox messages after failed sends. Queue delivery is at least once; an uncertain paid-provider outcome is left for manual review rather than automatically charged again. Increasing a daily budget does not itself add provider throughput.
6. Run `npm run build` and `npm run check:production`. The production check intentionally fails while account IDs or migration verification are missing. Set `DEGREESTEPS_DATA_MIGRATION_VERIFIED=1` only after completing the destination data and connection checks, then run `npm run deploy:cloudflare`. The deployment command uses the explicitly pinned Wrangler 4.164.0 CLI; it may install that operator tool on demand. This repository's application dependency lockfile remains unchanged by that command.
7. Before routing students, verify hosted signup/login, email confirmation/reset, account save/open, legacy migration, community permissions, queued jobs and a backup restoration. Run representative staged traffic with latency, failure-rate, data-integrity and cost criteria. Check the actual hosting, database, authentication and AI quotas rather than assuming direct-provider defaults also apply to a managed host.
8. Change DNS and canonical URLs only after the new hostname has active TLS and its authentication callbacks are allowed. Keep the old host available while device drafts are saved/opened across the domain transition. Test the actual new-domain flow before redirecting the old hostname or the alternate `www` hostname.

For rollback, keep a known-good Worker deployment, a tested database restoration path, and the prior host available. Pause queue consumption/dispatch if needed while preserving the durable job/outbox records; do not clear them to hide a failed attempt. A backend rollback must preserve the newer private store and should not resume uncertain paid jobs automatically.

Monitor API latency and errors, auth-provider failures/limits, D1 rows read/written and size, Postgres storage/connection pressure, queue age/retries/dead jobs, and AI usage/spend. These operational signals and hosted load tests establish capacity; the local benchmark and deployment-readiness flag do not.

## Contributing and release

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change. Use a focused branch and pull request with the student-facing outcome, source evidence when academic data changes, and relevant validation. Repository access does not include access to student records or production secrets.

The existing `.openai/hosting.json` identifies the managed Site and storage bindings. Preserve that identity when updating the current deployment. Builds are not publications: source must be committed and pushed, the matching output saved as a Site version, and that saved version deployed through the established release workflow. A GitHub mirror or repository export is not automatically connected to production.

The GitHub repository is public, but no code license has been added as part of this preparation. Public visibility does not change third-party licenses or source attribution; retain them with their assets and choose the project's code license deliberately.
