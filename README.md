# DegreeSteps

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

`npm run build` generates public pages, checks the academic data and migrations, and produces the Sites Worker package in `outputs/site/`. Run it before the Worker boundary tests. `dist/` contains application source and committed generated public assets; it is not a disposable build directory.

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
| `worker/index.mjs`, `scripts/build-community.mjs` | HTTP routing and the managed Sites Worker build |
| `test-support/` | Synthetic fixtures and non-production test harnesses |

The current managed deployment uses a Cloudflare Worker and D1 through Sites, plus Supabase authentication. Runtime adapters and deployment configuration must be activated and tested explicitly; source code alone does not provision production capacity. See the configuration and integration tests for the selected backend before a storage or queue cutover.

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

## Contributing and release

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change. Use a focused branch and pull request with the student-facing outcome, source evidence when academic data changes, and relevant validation. Repository access does not include access to student records or production secrets.

The existing `.openai/hosting.json` identifies the managed Site and storage bindings. Preserve that identity when updating the current deployment. Builds are not publications: source must be committed and pushed, the matching output saved as a Site version, and that saved version deployed through the established release workflow. A GitHub mirror or repository export is not automatically connected to production.

The repository has not added an open-source license as part of this preparation. Sharing with invited contributors does not by itself grant public redistribution rights. Keep third-party licenses and source attribution with their assets; choose a code license deliberately before a public release.
