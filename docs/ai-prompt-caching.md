# Provider-native prompt caching

DegreeSteps uses Anthropic Messages API calls. This rollout targets only `POST /api/learning/projects/:id/run` when the project kind and action are both `study` (homework/concept help). The provider, `claude-sonnet-5-5`, structured output schema, adaptive thinking, medium synthesis effort, ownership checks, entitlements and output formats remain in place. The optional guidance changes are evaluated separately from caching.

## Why this workflow

Independent homework questions share meaningful instructions and examples but have different private context. The current Claude API minimum for Sonnet 5.5 is 512 tokens. A concise guide naturally exceeds that threshold; no padding or giant document corpus is needed. Source inspection does not establish production traffic or a profitable hit rate. The initial live measurements are bounded synthetic examples.

The degree coach already has an explicit system breakpoint. It is not a newly implemented cache in this release.

## Controls

| Setting | Effect |
| --- | --- |
| `LEARNING_HOMEWORK_EXAMPLES_ENABLED=1` | Adds the reviewed, versioned homework guide and original synthetic examples. |
| `LEARNING_HOMEWORK_EXAMPLES_ENABLED=0` | Keeps the base course-workspace instructions without the new homework examples. |
| `LEARNING_HOMEWORK_CACHE_ENABLED=1` | Requests native caching only after the prefix meets the model threshold. |
| `LEARNING_HOMEWORK_CACHE_ENABLED=0` | Sends the same selected guidance without a cache breakpoint. It does not disable homework help. |

The two switches are independent. GitHub environment variables can override checked-in defaults. The guarded Deploy workflow also offers `homework_examples` and `homework_cache` choices (`configured`, `enabled`, `disabled`). Explicit owner-dispatched choices take precedence for that deployment. Student requests cannot override these settings.

Example staging ablation (no credentials in command arguments):

```sh
gh workflow run deploy.yml --repo jeremyc3434/DegreeSteps --ref codex/homework-prompt-cache-nov28 -f target=staging -f homework_examples=enabled -f homework_cache=disabled
```

To enable caching for the same guidance, use `-f homework_cache=enabled`. Production retains the existing migration/deployment gate; do not dispatch until applicable hosted checks pass. Payments remain independently disabled.

## Prefix and privacy

The server constructs stable text blocks from the existing course-coach instructions, the versioned student-writing/assignment guidance, and the selected homework guide. The final reusable block receives `cache_control: {type: 'ephemeral', ttl: '5m'}`. No top-level automatic breakpoint is added.

The dynamic user message remains after the breakpoint: the current question, syllabus, assignment, rubric, notes, current search results, drafts and private course memory. They are not interpolated into the shared instructions, native token-verification messages, telemetry or feedback themes. Uploaded material remains subject to the existing access controls and provider processing terms.

Prompt caching reuses a provider KV prefix; it does not train or fine-tune the model, cache an answer for reuse, establish correctness, or guarantee a detector result. Changed shared instructions, examples, schema, model, thinking or effort can invalidate a prefix and must be evaluated/versioned deliberately.

## Minimum-length verification

`server/ai-prompt-cache.mjs` prepares the explicit breakpoint. Before enabling it, two bounded, free native Count Tokens requests compare the static prefix against an identical constant nonprivate-message baseline. A 64-token overhead margin is subtracted to obtain a conservative eligibility count. The current minimum is 512 for the supported rollout model.

Verification is keyed by model, prompt version, prefix digest, output/thinking settings and API version in a bounded single-flight memory cache. This cache contains eligibility results, not student content and not the provider's KV entry. An unsupported model, insufficient prefix or token-count failure falls back to the same ordinary uncached prompt. No padding is appended and study generation is not refused solely because caching is unavailable.

The provider's actual creation/read counters are the definitive proof that caching occurred. A locally verified prefix or an explicit marker alone is not a cache hit.

## Warm-up policy

There is no reliable homework-demand burst signal in the current app. The first real student request warms the prefix; a following different question can reuse it. No isolate-startup loop, cron or paid synthetic warming is introduced. The research outbox's two-minute cron predicts research work, not student homework demand.

The five-minute lifetime starts when a request starts and is refreshed by a read. The cache becomes available after the first response begins. Test sequentially within that lifetime. A zero-output prewarm is not a compatible shortcut for this route's structured-output format. If a real burst signal is introduced later, prewarming must preserve the full model/settings/prefix configuration and receive its own budget/usage accounting.

## Operational evidence

Existing D1 learning-run records already contain input/output/cache-write/cache-read counters and costs. Additive migration `0022_learning_cache_telemetry.sql` extends those records with server-owned workflow, prompt version, cache configuration, measured prefix eligibility, nullable timing and fixed-choice feedback. It does not introduce another database, cache service or student-content log.

The caller-owned run receipt is returned by normal run/project/history routes. The owner summary groups by workflow, model and prompt version. Both use the existing verified account identity; a client-supplied account ID, version or cache flag cannot select data or authority.

Record these distinct values:

- Uncached input: `usage.input_tokens`.
- Written input: `usage.cache_creation_input_tokens`.
- Read input: `usage.cache_read_input_tokens`.
- Output: `usage.output_tokens` (including billed reasoning as reported).
- Total input: the sum of all three input categories.
- Provider request duration and ordinary app request duration separately.
- TTFT: unavailable/null for the existing non-streamed Messages calls. Response-header timing is not TTFT.

Cache status `verified` means the static prefix passed the eligibility check. Derive actual write/read outcomes from positive provider counters. Preserve conservative treatment of unknown usage. Do not call a rate-card estimate an invoice or ignore cache-write charges.

Current Sonnet 5.5 rates per million tokens are $2 uncached input, $2.50 five-minute cache writes, $0.10 cache reads and $10 output. The cache-read multiplier is 5%, not the legacy 10%. A second read can reduce shared-prefix input cost substantially, but output and dynamic student context remain billable. Overall savings and latency improvements must come from measured workloads.

## Feedback and reviewed updates

Students may mark a completed homework result helpful or not helpful, change/clear that rating, and optionally choose a fixed reason. Reasons cover incorrect answers, unclear steps, missing the question, sources, unnatural writing and other feedback. No question, answer, rubric, draft or free-text comment enters this telemetry.

The Owner Console's Course help view shows cache counters and aggregate themes. Use recurring themes to choose a synthetic evaluation case. Reproduce the problem, verify the corrected answer, review the shared instructions/examples and publish a new prompt version through normal source review. Do not automatically promote private student text, unreviewed model output or isolated thumbs-down events into shared guidance.

## Assignment quality and student review

Shared student-style instructions preserve the student's actual ideas, request natural language at the course's required level, and avoid generic filler. They do not promise detector evasion or manufacture a student's experiences. Assignment format is resolved separately from the rubric, assignment and syllabus, with instructor instructions taking precedence. APA 7 and MLA 9 Word exports apply real document settings and retain the actual selected saved version; missing personal or bibliographic information is not invented.

Research search results are discovery hints. Only fresh readable text actually retrieved by the server may enter the synthesis evidence list. Student-pasted passages and previously saved retrieval receipts cannot establish new online evidence. Bounded HTTPS retrieval reads up to eight candidate URLs with three concurrent requests, eight-second deadlines, and a 512 KiB body limit. Redirects are revalidated and confined to the original host or its www alias; cookies and authorization are not forwarded. This reader relies on the Worker's public egress restrictions, not a claim that lexical validation pins public DNS. Do not give it private-network bindings. Receipts distinguish a complete response from a truncated prefix, record the exact used passage and hashes, and leave claim support and publication currency explicitly unverified. Binary PDFs remain excluded until a bounded PDF evidence path is validated. Source identity failures reject the generated result rather than merely attaching a warning. Reading a source adds no paid model-fetch request; Claude still performs search and synthesis.

Conceptual homework, quizzes and flashcards trigger bounded research when readable evidence is not already available. A deliberately narrow vocabulary/input check skips web research for self-contained calculation exercises; unknown, mixed, current, medical and legal questions take the research path. This routing check does not certify an answer's correctness. Source research has three search uses and up to eight candidate fetches per run. Partial retrieval successes are retained while failed assigned readings can trigger bounded alternative discovery. Required research without readable evidence receives a specific review action and instructions to provide a method or the evidence gap rather than unsupported external assertions. Research requests reserve $1.50 conservatively; supported linear checks reserve $1 to allow a bounded correction, and other source-free calculations retain the $0.50 reservation. These are temporary preflight holds, not student charges or provider invoice guarantees. Actual settlement uses reported usage, and existing account/global spending limits remain in force.

The private result's `review` field contains bounded, actionable issues such as conflicting format instructions, missing required personal input, an unmet explicit word count, incomplete citations, and requested links that could not be read. Review actions inspect the actual paper, including an earlier saved draft, rather than the length of the AI's review report. Each issue links to the relevant notes, sources, format or result. Healthy calculations do not receive generic verification chores; optional extra practice is not a blocker. An absence of detected issues is called ready for student review, not guaranteed correct or ready to submit.

Live evaluation found two responses with correct worked algebra but contradictory opening answers; prompt instructions alone did not resolve this. Supported single-variable linear equations therefore receive an independent exact-rational check in dynamic context. A detected conflict permits one bounded quality-correction call with the same model/settings/prefix, with both calls included in usage and the existing reservation. Unknown or failed provider usage is not automatically retried. If the corrected response still conflicts, the student receives a deterministic checked solution and a specific explanation-review action. Unsupported problem types do not receive a calculation-verification claim. This narrow guard is additional evidence, not a general accuracy or learning certificate.

## Evaluation and publication

1. Run the current unseeded route on the three held-out exercises with the bounded `scripts/learning-cache-live-smoke.mjs --allow-live-ai --mode baseline` runner.
2. Deploy examples enabled/cache disabled. Run the same exercises in `seeded` mode. This evaluates the instruction/examples change, not caching.
3. Keep those instructions, schema and model settings identical; enable caching. Run `cached` mode's two different sequential questions. Require a positive first native write and positive second native read inside five minutes. Optionally use a second synthetic account to prove that the shared prefix does not cross private account boundaries.
4. Review arithmetic, assumptions, relevance, checks and clarity against the fixture's independent rubrics. Deterministic answer matching and agent review are not a human usability study or a representative accuracy rate.
5. Inspect per-run counters, costs, persistence, feedback undo, failures, cache-disabled behavior and absence of student content in telemetry. Delete synthetic courses/sessions/users afterward; retain only private synthetic receipts and operational accounting.
6. Run required Core/browser checks and guarded staging/production probes. Record exact commits, workflow links and live evidence in the release PR. Do not announce commercial readiness based only on cache hits.

The initial unseeded staging baseline ran three real homework requests on 2026-11-28. All requested answers and six selected deterministic checks were correct on these fixed cases; agent review confirmed the algebra, dilution and probability calculations. The three observed own-account cost deltas totaled $0.067122 at the application's rate card; mean completed-request duration was 14,392 ms. Per-run token receipts were unavailable on that older deployment and remain null. This is not provider-console reconciliation, a broad accuracy estimate or TTFT evidence. Seeded/cache-enabled live receipts remain separate gates.

At commit `eae4d88f09b7c62fd5540df639cbd523351bf967`, the final guidance/checking comparison passed three fixed cases with caching disabled ($0.078778 total at the rate card). Two different normal-route questions then demonstrated 4,714 actual native write tokens followed by 4,714 actual read tokens across separate synthetic accounts. The measured eligibility lower bound was 3,617 tokens, above the 512-token minimum. Uncached input/output tokens were 636/1,665 on the write and 611/1,346 on the read. Both responses passed agent review; cross-account private reads returned 404, persistence/replay passed, and synthetic courses/sessions were removed. The two-run rate-card total was $0.044861, including the cache-write premium. TTFT remains unmeasured. These are bounded synthetic cases, not a production hit-rate, representative accuracy, or paired latency benchmark. Subsequent HTTPS acquisition changes leave the shared prompt/cache helper/model settings unchanged.

A separate long-writing test returned a 1,162-word condensed draft for a 2,500-word request with incomplete source passages. That test did not pass. Writing evidence/completeness must be corrected or clearly gated before a full writing release; successful homework caching does not resolve it. Payments remain off until real merchant/sandbox acceptance and full-use pricing benchmarks pass.

## Next migrations

Direct test-question/quiz help can reuse the helper with its own reviewed examples and evaluation. Writing/research synthesis follows after verified-evidence, format and completeness gates work, using a separately reviewed guide. The existing degree-coach cache can then adopt shared controls, version tags and timing/feedback accounting. Template/factory research needs cache counters preserved in its run records. Transcript/image extraction is a weaker initial candidate because most input is unique private material.

No other live model provider was found. Add a native provider adapter and verify its own usage fields only when such a provider is actually introduced; no speculative cross-provider cache implementation is included.

## Primary references

- https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- https://platform.claude.com/docs/en/api/http/messages/count_tokens
- https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- https://platform.claude.com/docs/en/build-with-claude/thinking
- https://platform.claude.com/docs/en/about-claude/pricing
