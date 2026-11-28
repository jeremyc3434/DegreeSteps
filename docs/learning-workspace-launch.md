# Learning workspace launch runbook

Status on 2026-11-28: implementation is complete in [PR #66](https://github.com/jeremyc3434/DegreeSteps/pull/66), reviewed remote head `00b7ff`. The source/client checks and nine Chromium flows passed; the local full build and Editorial checks passed. Core checks remain in progress. Staging is the next verification environment. Production learning and payments remain gated on the live checks below; passing fixtures does not establish live provider quality, cost, or payment readiness.

## Release boundary

The release contains `/learn.html`, `dist/learn.js`, `dist/learning-client.js`, course-workspace navigation, the lazy Worker entry point `server/learning-workspace.mjs`, API implementation `server/learning.mjs`, source checks in `server/learning-sources.mjs`, and private-course/project/run schema in `db/postgres/learning.sql`. Billing and hosted Checkout are implemented in `server/learning-billing.mjs` and `server/learning-payments.mjs`. Existing Supabase sign-in and the existing server-side Claude account are reused; no additional service was provisioned for this implementation.

| Implemented surface | Current scope |
| --- | --- |
| Course workspace UI | Create/edit/delete a course and its syllabus; organize course projects; reopen saved results and earlier completed steps. Persistence uses the verified student's Supabase JWT through `server/learning-storage.mjs`, without a D1 or browser-local private-content fallback. Server bounds are 50 courses, 100 projects, and 25 MiB of workspace data per account. |
| Course-material input | Paste a syllabus or extract readable text from a `.txt`/text PDF on the device. The UI rejects files over 10 MB, scanned/image-only PDFs, and extracted syllabus text over 24,000 characters. It does not run OCR or save the original file. |
| Project UI | Writing, study, quiz, flashcards, presentation, and discussion project kinds; prompt/rubric/student notes; up to eight source entries in the project form. Writing/presentation/discussion flows collect student ideas before draft-style output. |
| Claude assistance | The backend uses `claude-sonnet-5-5` with structured output. Writing/presentation/discussion actions can perform a separate bounded research call with up to three web searches, then a generation call; previously found sources are reused when the relevant inputs are unchanged, unless more research is requested. Study actions produce explanations/practice materials. Every requested action, including research, contributes to its usage; a paper is not a single final-output call. |
| Reviewable output | Escaped text rendering, practice cards/questions, sources, check findings, and next steps; download text, Markdown, or a project JSON backup. No native document or slide export. |
| Recovery | Save/reopen, revision-aware updates, request identifiers, explicit saved-result check/retry UI, and visible unavailable/sign-in states. Backend and hosted recovery acceptance remain separately gated below. |
| Billing | Server-owned project allowances, atomic usage reservations/settlement, confirmed versus estimated cost totals, one-time hosted Checkout, and verified receipt-driven grants/revocations. Payment configuration and live verification remain required. |

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
| Reviewed implementation | [PR #66](https://github.com/jeremyc3434/DegreeSteps/pull/66), reviewed application head `897b2f79`; final release receipts are maintained in that PR | Complete |
| Existing Supabase schema and database verification | Migration `20261128013204`; real rollback-only verification and security-advisor review detailed below | Passed on 2026-11-28 |
| Local full build | `npm run build`, reported successful by the release operator | Passed |
| GitHub source/client checks | `node --test --test-isolation=none server/learning*.test.mjs learning-client.test.cjs` — **91 passed** at the reviewed head | Passed |
| GitHub Chromium acceptance | `node learning-workspace-browser.test.cjs` — **9 flows passed**, actual shipped UI with synthetic account/API responses | Passed |
| Editorial checks | GitHub Editorial workflow — **56 passed** at the reviewed head | Passed |
| Built-Worker regressions | `node --test --test-isolation=none learning-worker.test.mjs` — **18 passed** after the final rebuild, across both deployment bundles | Passed |
| Full Core regressions | All 420 test files ran at `897b2f79`; 419 passed and one outdated four-item navigation assertion failed. That test now checks all five destinations and passes all 10 local checks. A full rerun is required. | Final CI pending |
| D1 billing migration deployment | `drizzle/0021_learning_billing.sql` on the actual target | Pending receipt |
| Hosted staging HTTP, sign-in, isolation and persistence | Two synthetic signed-in accounts on the deployed staging revision | Pending |
| Real Claude response and complete usage accounting | Dated, bounded internal-pilot receipt | Pending |
| Measured workload and cost benchmarks | Results table below, with provider usage reconciliation | Pending |
| Real Stripe sandbox reconciliation | Configured test credentials, actual webhook delivery, checkout/grant/refund reconciliation | Pending |
| Public commercial activation | All applicable launch gates passed | Blocked |

Passing mocked/browser tests does not establish source accuracy, learning efficacy, paid-provider access, production capacity, or payment processing. Do not turn a pending row into a pass based on another row.

The GitHub receipts above were reported by the release operator. The nine browser flows cover signed-out access, student contributions and reload, same-ID recovery, terminal-failure/new-ID recovery, all project kinds, limited source coverage and exports, inert generated markup, confirmed deletion, and desktop/phone layout. Screenshots are stored in the `course-workspace-browser` CI artifact from `outputs/learning/browser`. The source suite includes deterministic storage, source, AI, billing, payment, and client checks. These passes do not substitute for the still-running Core workflow or real network/provider checks.

### Staging versus production activation

These are the required deployment settings, not a claim that either hosted environment has already been verified:

| Environment | Learning | Pilot allowance | Payments | Gate |
| --- | --- | --- | --- | --- |
| Staging | `LEARNING_ENABLED=1` | `LEARNING_PILOT_ENABLED=1` | `LEARNING_PAYMENTS_ENABLED=0`, `LEARNING_STRIPE_MODE=test` | Finish Core checks, deploy the reviewed build/D1 migration, then perform bounded hosted verification. |
| Production release candidate | `LEARNING_ENABLED=1` | `LEARNING_PILOT_ENABLED=1` | `LEARNING_PAYMENTS_ENABLED=0` | These checked-in values take effect only on deployment. Do not dispatch production until Core, hosted HTTP/isolation, a real Claude quality check and bounded live cost accounting pass. Paid checkout additionally requires the full pricing benchmarks and real Stripe acceptance. |

The pilot flag grants allowances to eligible signed-in accounts on its host; it does not restrict access to a named cohort. Keep test activity on staging, identify the internal participants, and monitor the shared budget. In `.github/workflows/deploy.yml`, GitHub environment variables override the learning flags, including explicit `0`; configure the intended environment and verify returned status after deployment. A dashboard-only flag change can be overwritten by the next deploy. The release operator cannot manage GitHub production environment variables through the current integration (403), so the reviewed pilot configuration is versioned here; the existing guarded production workflow remains the activation step. Staging and production deployments are distinct, and committing this release candidate does not publish it. For the first real Stripe sandbox check, temporarily enable payments **only on staging**, with matching test credentials and a working webhook, then return the flag to `0` unless continued testing is intentional.

### Long-request session reliability

Generation requests require at least 300 seconds of remaining access-token lifetime before private storage or paid work begins. The existing Auth provider verifies the identity; decoded expiry is only a refresh hint. A proactive rotation must preserve that identity and provide sufficient lifetime. Failed rotation refuses the request before reserving usage or calling Claude. Ordinary course reads and existing sign-in routes retain their previous refresh behavior. The targeted Auth suite passed 32 checks, and the sign-in regression suite passed 6 checks including both plan and course-workspace return flows. All 18 rebuilt-Worker checks passed across the two deployment bundles, including proactive refresh, failed-refresh refusal before any spending, and unchanged ordinary reads. Final full CI retains its separate release gate.

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
6. Payment routes fail closed without the flag and matching key/mode/signing-secret configuration. Credential-format checks are not proof of a working connection. The server catalog owns prices; a checkout return URL or client-side success never grants an entitlement. Leave payments disabled until the real sandbox receipt passes.
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

Payment configuration is implemented in `server/learning-payments.mjs`:

| Setting or route | Implemented contract |
| --- | --- |
| `LEARNING_PAYMENTS_ENABLED` | Exactly `1` is required; leave `0` for production and normal staging pilot use. Learning must also be enabled for its billing routes. |
| `LEARNING_STRIPE_MODE` | `test` or `live`; must match the API-key prefix and every retrieved receipt's mode. Use `test` for sandbox verification. |
| `LEARNING_STRIPE_SECRET_KEY` | Server secret; accepts the matching restricted or secret key. Prefer a restricted key whose required checkout/receipt permissions have been verified in the sandbox. Never put it in source or public configuration. |
| `LEARNING_STRIPE_WEBHOOK_SECRET` | Server secret for the exact environment's webhook endpoint. Both Stripe secrets are supported by the deployment workflow's secret step. |
| `LEARNING_PAYMENT_ORIGIN` | Optional reviewed HTTPS origin override. Otherwise return URLs use the allowlisted canonical/staging Worker host. Nonstandard hosts require explicit configuration; the override must also be wired into that deployment. |
| `POST /api/learning/billing/checkout` | Signed-in, same-origin request with `X-Learning-Request: 1`; server-catalog offer and idempotent purchase UUID. Writing purchases require an owned project. Only an HTTPS `checkout.stripe.com` URL is returned. |
| `POST /api/learning/billing/webhook` | Raw-body signature/timestamp verification, mode validation, and Stripe receipt re-fetch before granting or revoking units. A browser return never fulfills a purchase. |

The adapter uses Stripe API `2026-11-18.endive`. Configure delivery for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `refund.updated`, `charge.dispute.created`, and `charge.dispute.funds_withdrawn`. Completed/async-success events grant only after the re-fetched session is paid and its amount, currency, owner, product, project, and order match. Duplicates do not replenish spent units. Failed/expired unpaid sessions do not grant access.

Any verified positive refund currently revokes the order's remaining units and projects activated from that order, including for a partial refund; a verified dispute event revokes the order as well. Saved work is retained, but further generation is blocked for revoked projects. The adapter receives these events; it does not initiate refunds. Confirm this scope against the published purchase/refund terms and test partial/full refunds before commercial activation.

## Hosted staging acceptance still required

The passed source/client suite establishes controlled identity/storage boundaries, validation, request/allowance accounting, conservative unknown-cost behavior, and payment-event handling. The passed Chromium flows establish the interface behavior listed in the release receipt. The real SQL receipt establishes the applied database boundaries. The remaining acceptance is specific to the deployed system:

- [ ] Record the staging revision and D1 migration result; verify `/api/learning/status` and billing status reflect the intended flags without exposing secrets or private content. Confirm production learning/pilot/payment flags remain `0`.
- [ ] Sign in through the existing Supabase flow with two synthetic accounts. Create/reopen/update/delete a project, refresh and sign in again, and prove account B cannot read/edit/spend account A's IDs through direct HTTP requests. Verify sign-out and whole-account deletion match the published retention copy.
- [ ] Run a bounded synthetic assignment through the real Claude connection. Check persisted output, source provenance and claim support, reported usage, and provider-console reconciliation. Review actual PDF/text input and output downloads on the deployed page.
- [ ] Exercise hosted recovery without an invisible paid retry: slow/failed request, duplicate submit, saved-result recovery, allowance exhaustion, and budget refusal. Separate confirmed costs from estimated/unreconciled outcomes.
- [ ] Review real generated writing/study/quiz/flashcard/presentation/discussion results and keyboard/phone use. Preserve student review and assignment-policy constraints; a successful response does not establish accuracy, grades, transfer acceptance, or learning efficacy.

Use synthetic assignments for infrastructure verification. Real volunteered student materials belong only in the explicitly scoped pilot, with no expansion beyond the configured budget.

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

1. Keep production learning/pilot/payment flags at `0`. Use staging learning/pilot flags at `1` for the bounded verification described above, with payments `0` except during an intentional configured sandbox test. Do not claim account-restricted access: the pilot flag is host-wide and a hidden page is not an allowlist.
2. Use a small named internal cohort with synthetic or explicitly volunteered materials. Record each person's start, purchased/test-granted units, actual work, cost, failures, support minutes, and willingness to purchase again. Distinguish test grants from revenue and paid purchases from stated interest.
3. Observe the full project/pack lifecycle, including reopening, allowance exhaustion, deletion, and the documented refund/recovery path. Do not expose checkout until payment acceptance passes independently.
4. Review the measured workload table and unresolved issues together. Record the launch decision, revision, cohort boundary, budget, named incident owner, and next review date. No public claim should exceed the verified scope.
5. Expand gradually only when observed quality, contribution, and support fit the chosen limits. Completion/learning improvements require a separate student-outcome evaluation; this operational pilot cannot prove them.

## Stop, reconcile, and rollback

Immediately disable new learning/provider requests for cross-account access, uncontrolled spend, repeated unaccounted provider calls, or materially incorrect entitlement deductions. Disable checkout for incorrect pricing, unverifiable payment events, duplicate grants, or reconciliation failures. Preserve the request/payment IDs and operational evidence without copying student work into incident logs.

Turn the relevant server flag off first and verify direct API calls are blocked. These flags also gate the webhook, so record pending Stripe events and reconcile them before re-enabling payment processing. Keep existing private data and the previous compatible deployment available. An additive migration does not need destructive rollback merely to disable the feature. Reconcile uncertain provider calls and payment events before retrying; do not automatically repeat an operation that may already have incurred cost or granted credit.

Record affected accounts, remaining allowances, corrective credits/refunds, responsible operator, and resolution. Re-enable only against a dated receipt showing that the specific failure and its duplicate/retry path now pass.
