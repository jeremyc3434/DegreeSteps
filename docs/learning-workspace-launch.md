# Learning workspace launch runbook

Status: implementation and local acceptance are in progress on 2026-11-28. This document is an operator checklist, not evidence that the workspace is live, that payments work, or that a particular academic result is achievable. Keep learning and payment flags off until the corresponding checks below are recorded against the deployed revision.

## Release boundary

The checkout contains `/learn.html`, `dist/learn.js`, `dist/learning-client.js`, course-workspace navigation, the lazy Worker entry point `server/learning-workspace.mjs`, API implementation `server/learning.mjs`, source checks in `server/learning-sources.mjs`, and private-course/project/run schema in `db/postgres/learning.sql`. Billing integration and acceptance checks are still being assembled. Record their final flags, migration, and local test receipts below before enabling the feature. Existing Supabase sign-in and the existing server-side Claude account are reused; this release does not require provisioning another service.

| Implemented surface | Current scope |
| --- | --- |
| Course workspace UI | Create/edit/delete a course and its syllabus; organize course projects; reopen saved results and earlier completed steps. Persistence uses the verified student's Supabase JWT through `server/learning-storage.mjs`, without a D1 or browser-local private-content fallback. Server bounds are 50 courses, 100 projects, and 25 MiB of workspace data per account. |
| Course-material input | Paste a syllabus or extract readable text from a `.txt`/text PDF on the device. The UI rejects files over 10 MB, scanned/image-only PDFs, and extracted syllabus text over 24,000 characters. It does not run OCR or save the original file. |
| Project UI | Writing, study, quiz, flashcards, presentation, and discussion project kinds; prompt/rubric/student notes; up to eight source entries in the project form. Writing/presentation/discussion flows collect student ideas before draft-style output. |
| Claude assistance | The backend uses `claude-sonnet-5-5` with structured output. Writing/presentation/discussion actions can perform a separate bounded research call with up to three web searches, then a generation call; previously found sources are reused when the relevant inputs are unchanged, unless more research is requested. Study actions produce explanations/practice materials. Every requested action, including research, contributes to its usage; a paper is not a single final-output call. |
| Reviewable output | Escaped text rendering, practice cards/questions, sources, check findings, and next steps; download text, Markdown, or a project JSON backup. No native document or slide export. |
| Recovery | Save/reopen, revision-aware updates, request identifiers, explicit saved-result check/retry UI, and visible unavailable/sign-in states. Backend and hosted recovery acceptance remain separately gated below. |

This inventory describes the checked-in surfaces, not a claim that their live API dependencies have passed acceptance.

The initial commercial hypotheses are **$15 for a writing project** and **$9 for a pack of 50 study questions**. They are unvalidated prices, not measured willingness to pay, recurring subscriptions, guaranteed margins, or promises that any assignment can be completed within one purchase. The exact included actions, revision limits, and treatment of failed requests must be visible before purchase and must agree with server-side entitlements.

The implemented server catalog defines these units:

| Offer | Actual included unit |
| --- | --- |
| `writing-project`, $15 USD once | One writing, discussion, or presentation project, with **12 successful AI steps total**, including its initial plan and related follow-ups. |
| `study-pack`, $9 USD once | **50 study projects**, each with up to **12 successful AI steps total** for explanations, practice, and related follow-ups. This can represent as many as **600 successful steps per pack**, subject to daily limits; it is not 50 model responses. |

The first request holds a project unit; a failed first request restores that unit, while known provider cost or a conservative unknown-cost estimate remains in the spend ledger. Follow-ups within an activated project use its remaining steps rather than another project unit. Pack balances are one-time purchased allowances; the separate monthly pilot grant is not subscription revenue. The full pack's permitted follow-up usage must be included in the margin decision before these prices launch.

Not included in this release unless separately implemented and verified: licensed or comprehensive plagiarism checking, access to a proprietary academic corpus, plagiarism-free or originality guarantees, AI-writing detection, native mobile/desktop apps, audio transcription or generation, native slide-deck editing/export, or a complete replacement for specialist student tools. A generated text outline is not a native presentation. Source-check findings are limited to the inputs and checks actually performed.

The implemented source checker compares supplied excerpts and, when requested, readable public HTML/plain text from an exact host allowlist. It checks `[S1]`-style source markers, unlisted source URLs, and verbatim runs of at least eight words, with nearby quotation/citation hints. Retrieval has size/time limits, does not follow redirects, and does not read signed-in content or PDFs. It reports retrieval/provided-excerpt provenance and unverified cases separately. This is not a web-wide search, a semantic plagiarism detector, bibliographic verification, or evidence that a source supports a claim. Review matching common phrases as possible false positives.

## Release evidence

| Check | Evidence | State |
| --- | --- | --- |
| Reviewed revision and deployment target | Record commit/build identifier and isolated staging host | Pending |
| Implemented pages, APIs, flags, and migration | Record final source paths below | Pending |
| Existing Supabase schema and database verification | Migration `20261128013204`; real rollback-only verification and security-advisor review detailed below | Passed on 2026-11-28 |
| Local source/build checks | Exact commands and results below | Pending |
| Authenticated browser acceptance | Real browser with synthetic accounts and controlled API responses | Pending |
| Worker/API acceptance | Actual built Worker with controlled auth, storage, and provider fixtures | Pending |
| Hosted two-account isolation and persistence | Staging receipts with synthetic data | Pending |
| Real Claude response and complete usage accounting | Dated, bounded internal-pilot receipt | Pending |
| Measured workload and cost benchmarks | Results table below, with provider usage reconciliation | Pending |
| Payment checkout, webhook, and entitlement reconciliation | Real configured test environment; no placeholder success | Pending |
| Public commercial activation | All applicable launch gates passed | Blocked |

Passing mocked/browser tests does not establish source accuracy, learning efficacy, paid-provider access, production capacity, or payment processing. Do not turn a pending row into a pass based on another row.

Local receipt reported by the source-check implementer on 2026-11-28: `node --test --test-isolation=none --test-reporter=spec server/learning-sources.test.mjs` — **17 tests passed, 0 failed**. These controlled fixtures cover the source helper; they are not a build, production, web-wide plagiarism, or live-provider receipt.

### Applied database receipt

The release operator applied the additive course-workspace schema successfully to the existing Supabase project `xajvembwdteqauwithgo` through Supabase MCP. The canonical remote migration is copied locally as [`supabase/migrations/20261128013204_course_learning_workspace.sql`](../supabase/migrations/20261128013204_course_learning_workspace.sql). Its SHA-256, independently matched against the local copy, is `912ea05c0e338bb3901a829603a16e3d2651fccaccb00fecbedcd82725a68936`. Supabase CLI 3.4 was blocked by its read-only home directory; this is a successful MCP migration receipt, not a claim that the CLI migration path ran.

The real [`db/postgres/verify-learning.sql`](../db/postgres/verify-learning.sql) passed on that destination: two-user RLS, forged-actor rejection, compare-and-swap revisions, active-run leases, completed-request replay, the 50-course quota, the 25 MiB direct-REST storage guard and reclaimed-byte accounting, and account/profile deletion cascade. All synthetic writes were rolled back, with no verification Auth accounts left behind. All three new public learning tables have RLS enabled.

The security-advisor review found no new public-table RLS issues. Its remaining findings were expected `INFO` for RLS without policies in a non-exposed schema and a pre-existing `WARN` for disabled leaked-password protection. This receipt verifies the applied database behavior; hosted browser/HTTP acceptance, billing, build checks, live Claude usage, and commercial activation retain their own gates.

## Configuration and deployment prerequisites

1. Preserve the current production service and accounts. Follow [the site launch procedure](site-launch.md) for the existing Cloudflare and Supabase configuration; do not change the private-plan backend or create a new Supabase project to enable this feature.
2. Confirm the implementation's final feature flags and environment names against `.env.example`, the deployment workflow, and the actual Worker handler. Record them below. Unset flags must leave the feature unavailable server-side. Any visible course-help entry point must render its unavailable state without permitting generation or purchase.
3. Confirm that only the existing Supabase publishable key can reach public configuration. Claude and payment secrets remain server-side. A feature entitlement must be checked against the verified account identity; a client-supplied user ID or editable profile claim is not authorization.
4. The existing-project schema application and real verification are recorded above; do not replay the non-idempotent schema merely to prepare a deployment. For another destination, review the canonical migration and `db/postgres/learning.sql`, apply through that project's authorized migration procedure, then run `db/postgres/verify-learning.sql` with an authorized operator and record the result. Its synthetic identities and writes roll back. Also verify new entitlements/usage through their own backend and test two signed-in synthetic accounts through HTTP, not just SQL or page links.
5. Confirm the existing server-side Claude connection without replacing it or sending its value to the browser. Keep bounded live generation separate from connection verification. Check the account-level spending backstop and the workspace's request, token, and dollar controls before the internal pilot.
6. Payment routes must fail closed if real credentials, verified webhook configuration, or product/price mapping are absent. A checkout return URL, a client-side flag, or a simulated success response must never grant a paid entitlement. Leave payments disabled for an unconfigured environment.
7. Record the exact build and deployment revision, migration receipt, flag values, and rollback version. Do not put credentials or student documents in this document, logs, or Git.

### Final configuration inventory

The Worker gate is `LEARNING_ENABLED=1`; absent or any other value returns `{enabled:false}` from `GET /api/learning/status` and refuses other learning API routes. `/learn.html` is a private/noindex page with an unavailable state. The client uses `/api/learning/status`, `/api/learning/courses[/<id>]`, `/api/learning/projects[?courseId=<id>]`, `/api/learning/projects/<id>`, and `POST /api/learning/projects/<id>/run`. Earlier results are available through `GET /api/learning/projects/<id>/history[/<requestId>]`. The API also implements `GET /api/learning/export` and `DELETE /api/learning/data` (the latter requires the exact confirmation `DELETE MY COURSE WORKSPACE`). The normal storage adapter requires `PORTAL_SUPABASE_URL`, `PORTAL_SUPABASE_PUBLISHABLE_KEY`, and the verified student's access token. It rejects a secret/service-role key for that path.

The current model is fixed in `server/learning.mjs`, rather than selected by a learning model environment variable. It resolves the existing server-side Claude connection through the Worker, with `ANTHROPIC_API_KEY`/existing connection handling described in [the site launch procedure](site-launch.md). Generation caps are 4,000 output tokens for a plan, 16,000 for other writing-style project actions, and 6,000 for study actions; the separate research call caps output at 2,000 tokens and three searches. These are per-call bounds, not an assertion that every complete project fits a particular dollar budget. `LEARNING_AI_CONFIGURED`, `LEARNING_RESOLVE_KEY`, and provider/data fetch adapters are server-created integration/test values, not browser-supplied identity or production-secret configuration.

The reviewed Supabase schema/verification files are listed in the applied database receipt above. The independent D1 billing schema is `db/learning-billing-schema.mjs`, with additive migration `drizzle/0021_learning_billing.sql`. Its tables contain account allowances, project/run reservations and usage, and order/payment metadata; private prompts, sources, syllabi, and artifacts stay in Postgres. D1 migration execution is not established by the Supabase receipt.

| Billing control | Implemented behavior |
| --- | --- |
| `LEARNING_PILOT_ENABLED=1` | Grants each eligible signed-in account one writing project and ten study projects per UTC month. It is a host-wide grant flag, **not an account allowlist**. Leave unset outside an intentional pilot environment. |
| `LEARNING_DAILY_USD_CAP` | Global daily spend/reservation cap; default **$10 USD**. Configure explicitly for the pilot. |
| `LEARNING_ACCOUNT_DAILY_USD_CAP` | Per-account daily spend/reservation cap; default **$4 USD**. Configure explicitly for the pilot. |
| Step/request bounds | Twelve successful AI steps per project; fifty reserved AI requests per account per day. A request can include both research and generation provider calls. |
| Conservative reservation | Backend reserves **$3 per writing-style step** or **$0.50 per study step** before provider execution. These reservations are safeguards, not measured costs or promised project margins. |
| Unknown usage | Missing/uncertain usage settles conservatively at at least the full reservation and remains marked estimated; a failed first project can restore its allowance without erasing that cost exposure. Reconcile estimated rows against the provider before treating them as measured spend. |
| Usage/admin routes | `GET /api/learning/billing/status` exposes offers/own allowance; `GET /api/learning/billing/owner-summary` requires the validated owner. The owner summary reports daily usage and all-time purchase/refund totals; it does not calculate ARR or annual revenue. |

The code's model/cache/search rate card was checked by the release operator against the official [Anthropic pricing documentation](https://platform.claude.com/docs/en/about-claude/pricing) on 2026-11-28. Current Sonnet 5.5 cache hits are $0.10 per million tokens and Opus 5.5 hits are $0.20 (5% of their input rates). Do not substitute older-model cache assumptions. An application rate-card estimate still needs provider-console reconciliation and a dated receipt.

Pending final implementation names: payment flag, Stripe secrets/environment mode, checkout/webhook routes and operational refund behavior. Replace that remaining inventory after reviewing `server/learning-payments.mjs`; setting a flag does not configure its dependencies.

## Acceptance before the internal pilot

Use synthetic assignments and two separate test accounts. Do not submit real student work to a live provider for an infrastructure smoke test.

- [ ] With all new flags unset, direct API calls cannot create a provider job or checkout; existing planning remains usable.
- [ ] Signed-out users are asked to sign in. An expired session fails without losing unsaved text or granting anonymous access.
- [ ] Account A can create, reopen, update, and delete its project; account B cannot list, read, edit, spend, or delete it, even using its known ID. Verify persistence after refresh and a fresh sign-in.
- [ ] The workspace identifies the actual course/project context without claiming that the course's transfer or a student's final acceptance is guaranteed.
- [ ] Supported inputs show clear size/type limits. Unsupported, oversized, empty, or malformed documents fail visibly without a paid generation or silent truncation.
- [ ] Writing support and study responses remain reviewable by the student. The UI accurately identifies supported output formats and source-check scope.
- [ ] A question and related clarification have an explicit, consistently enforced pack-consumption rule. Failed validation does not consume a question. Replaying a completed request returns its saved result without another provider call or allowance deduction.
- [ ] A writing project has an explicit included-action/revision limit. A new project or a scope increase cannot silently spend another entitlement.
- [ ] Source checks show which supplied sources or passages were checked. Missing evidence, unverified sources, and failed checks are distinguished from verified findings. No global originality or plagiarism-free assertion is displayed.
- [ ] A slow request shows a recoverable state. Timeout, provider rejection, invalid model output, loss of connection, and storage failure do not report a completed result or start an invisible automatic paid retry.
- [ ] Concurrent submissions and retried requests cannot bypass entitlements, double-charge a question, or launch unbounded generation. Confirm reconciliation when provider work may have completed but the client did not receive it.
- [ ] Budget refusal is visible before another provider call. Missing provider usage is treated as unknown cost, not zero cost or free headroom.
- [ ] Keyboard navigation, labels, errors, focus, and narrow-screen layout work on the implemented page. Generated text cannot inject executable markup or change instructions through source documents.
- [ ] Sign-out and project deletion behave as described. Document what content, operational usage, and payment records are retained and why; do not imply deletion beyond implemented behavior.

### Payment acceptance, separately gated

- [ ] The displayed offer, currency, one-time purchase terms, and consumption rules match the server's configured product mapping. The $15/$9 hypotheses are not advertised as subscriptions or automatically renewed.
- [ ] An authenticated customer can start only a configured checkout for an allowlisted offer. Caller-supplied price, entitlement quantity, or account ID is ignored or rejected.
- [ ] A verified provider webhook, not a browser return page, grants the entitlement to the intended account.
- [ ] Wrong/absent signatures, replayed events, duplicate delivery, delayed delivery, cancelled checkout, and out-of-order events have tested outcomes. Grants and refunds are reconciled exactly once.
- [ ] Purchases and usage reconcile to an operator-readable record. Refund/reversal and spent-entitlement handling are documented and tested before accepting money.
- [ ] If a real configured payment test has not passed, checkout remains disabled; an internal pilot is not proof of payment readiness.

## Measured usage and cost QA

Do not substitute estimated token counts or a rate-card spreadsheet for measured execution. For every provider request retain an operational usage record with account/project/request identifiers, action, attempt/idempotency identifier, status, model, timestamps, reported input/output tokens, cache categories when applicable, billed reasoning treatment, tool/search calls, and the rate-card version used for the estimate. Record unknown/missing usage explicitly. Keep prompts, student work, and secrets out of routine cost logs.

Reconcile the implementation's available fields with this checklist. Any missing field is an instrumentation gap to resolve or explicitly bound before the corresponding paid feature launches. Capture OCR, document processing, and audio as separate costs only if those features actually execute; they are not assumed to exist.

For a project, aggregate **all** attempts, research, source processing, reviews, follow-ups, and retries. For a pack, measure all 50 consumed questions plus the included clarifications. Report the median and expensive cases separately; one cheap response is not a cost estimate for a customer.

| Workload | Controlled input and pass criterion | Requests/tokens/tools | Measured provider cost | Support/other cost | State |
| --- | --- | --- | --- | --- | --- |
| One writing project | Fixed synthetic 10-page-equivalent assignment with a declared word count, reference set, and every included review action; outputs reopen and limits hold | Not measured | Not measured | Not measured | Pending |
| One 50-question pack | Fifty study projects with short/document-grounded questions and included clarifications; report initial-response and complete-follow-up costs separately, and cover the permitted **50 × 12 = 600 successful-step** stress case. Exactly the documented units are consumed, including at the boundary | Not measured | Not measured | Not measured | Pending |
| Ten writing projects | Ten full supported workflows, not ten isolated final drafts; aggregate costs and per-project variation | Not measured | Not measured | Not measured | Pending |
| Heavy/retry case | Maximum supported document/context, allowed review rounds, parallel submit, timeout, retry, and provider-success/storage-failure fixtures; no duplicate grant or uncontrolled paid attempt | Not measured | Not measured | Not measured | Pending |
| Budget boundary | Exhaust one configured per-user and global limit; next call is refused before provider execution | Not measured | Not measured | Not measured | Pending |

Use a provider mock for deterministic failure/idempotency tests. A mocked result can prove request accounting behavior; it cannot populate real cost cells. Run a small, explicitly bounded live sample on the existing account only after the controls pass. Compare recorded usage to the provider console; retain a private receipt with workload version, date, revision, account environment, rate source, discrepancies, and observed latency. Do not claim a real 50-question or ten-project benchmark unless it was actually executed.

Inspect generated results for citation existence, claim-to-source agreement, source-check false positives/negatives, truncation, and the usefulness of study explanations. A provider's successful HTTP response is not a quality pass. Confirm the assignment's stated AI-use rules and preserve student review; no benchmark establishes a grade or a learning outcome.

## Commercial decision and two-person operating capacity

Treat the $15 writing-project and $9 study-pack prices as hypotheses to test against measured paid usage. Do not restore a blanket $3–4 monthly AI allowance for paper-heavy users. Cost the complete project and include expensive users; prior scenario arithmetic is not a measured forecast.

In particular, do not price the study pack as fifty isolated responses while selling fifty projects with twelve steps each. The full allowed usage, source/context growth, retries, and daily-budget interruptions must be visible in the cost and customer-experience review. A cheaper study model, such as Haiku, is a later routing experiment: evaluate factual accuracy and teaching quality first, then compare measured cost. Sonnet remains the implemented default unless the code and acceptance receipts explicitly change.

Use the following units consistently:

- **Net revenue per purchase:** cash collected minus refunds, discounts, and payment fees; record taxes separately from revenue where applicable.
- **Contribution per project/pack:** net revenue minus measured provider/tool costs, variable hosting/storage, and support time valued at an explicit hourly rate. Fixed platform work and both founders' time still matter to the business.
- **Monthly paid-user revenue:** recognized revenue in the month divided by that month's paying users. State the cohort and whether occasional buyers are included. It is not recurring revenue merely because it can be divided by months.
- **Actual annual revenue/collections:** report the actual period and distinguish accounting revenue from cash collections. One-time project and question-pack purchases are not ARR. Annualizing a strong month does not account for pauses, seasonal course starts, graduation, or refunds.
- **Support capacity:** `paid accounts × tickets per account × minutes per ticket / 60`, plus `projects × manual-exception rate × minutes per exception / 60`. Include citation disputes, failed requests, billing/refund work, exports, and account problems. Record actual minutes during the pilot; do not assume support is free because a founder performs it.

Before widening sales, choose and record minimum contribution, maximum daily spend, maximum support hours per week, quality acceptance, and the maximum tolerable unresolved-error age. Set these from the team's available cash/time, not from the $1M aspiration. Revenue arithmetic alone does not establish enough qualified buyers, a profitable usage mix, or a two-person support capacity.

## Internal pilot and promotion gate

1. Keep public learning/payments disabled while recording local and hosted controlled-fixture results. Do not claim a restricted pilot exists unless the implementation actually enforces account-level access; a hidden page is not an allowlist.
2. Use a small named internal cohort with synthetic or explicitly volunteered materials. Record each person's start, purchased/test-granted units, actual work, cost, failures, support minutes, and willingness to purchase again. Distinguish test grants from revenue and paid purchases from stated interest.
3. Observe the full project/pack lifecycle, including reopening, allowance exhaustion, deletion, and the documented refund/recovery path. Do not expose checkout until payment acceptance passes independently.
4. Review the measured workload table and unresolved issues together. Record the launch decision, revision, cohort boundary, budget, named incident owner, and next review date. No public claim should exceed the verified scope.
5. Expand gradually only when observed quality, contribution, and support fit the chosen limits. Completion/learning improvements require a separate student-outcome evaluation; this operational pilot cannot prove them.

## Stop, reconcile, and rollback

Immediately disable new learning/provider requests for cross-account access, uncontrolled spend, repeated unaccounted provider calls, or materially incorrect entitlement deductions. Disable checkout for incorrect pricing, unverifiable payment events, duplicate grants, or reconciliation failures. Preserve the request/payment IDs and operational evidence without copying student work into incident logs.

Turn the relevant server flag off first, verify direct API calls are blocked, then remove public entry points. Keep existing private data and the previous compatible deployment available. An additive migration does not need destructive rollback merely to disable the feature. Reconcile uncertain provider calls and payment events before retrying; do not automatically repeat an operation that may already have incurred cost or granted credit.

Record affected accounts, remaining allowances, corrective credits/refunds, responsible operator, and resolution. Re-enable only against a dated receipt showing that the specific failure and its duplicate/retry path now pass.
