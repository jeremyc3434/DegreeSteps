# School research batches

`node scripts/build-school-research-batch.mjs` builds the current Liberty directory research backlog in `content/research-batches/liberty-online.json`. It requires no AI calls or network access. `--check` checks that committed backlog against its exact input catalogs, public academic registry and compiled curricula.

Use `--school tesu`, `--school umpi`, or `--school wgu` for the other priority schools. `--modality online` is the default; `--modality campus` selects only recorded campus routes. The output is `content/research-batches/<school>-<modality>.json`. TESU and other kits can supply explicit compiled routes even when an imported program directory is absent. No online or campus delivery is inferred from the institution name, provider partnership, or a parent catalog listing. Exact variants retain their original route IDs, parent IDs, curriculum IDs and catalog identities. Concentrations remain variants. This covers the existing imported evidence, not every current offering.

The reusable `buildSchoolResearchBatch({..., selectedModelIds: [...]})` API limits discovery and capture to a production cohort before expanding sources or hashing model inputs. An empty selection is rejected. Sources for a selected model with recorded delivery are retained even if no exact directory route is linked. These models appear in `unlinkedModels`; they never receive a fabricated program URL. Models lacking delivery evidence remain explicit holds and do not gain a modality from the requested batch.

The batch deduplicates official document URLs across program models, preserves model-local source identities, and prioritizes shared academic policies, receiving-school transfer guides and general education sources. Existing unresolved policy fields, missing requirement IDs and academic-registry finding IDs make the remaining work explicit. A ready curriculum ledger is not called a verified plan.

## Bounded source capture

Run `node scripts/build-school-research-batch.mjs --school tesu --capture --resume --limit 5 --concurrency 2` to capture the next five eligible sources. Each invocation allows at most ten sources and four concurrent requests. The default timeout is twenty seconds per source; documents are limited to eight MiB, with a hard configurable ceiling of sixteen MiB. `--max-bytes` sets the per-source ceiling and `--byte-budget` sets the total allocation for that invocation, in bytes. By default the total is `limit × max-bytes`; the absolute ceiling is 160 MiB. Each attempt reserves its allowed maximum before starting, including attempts that fail, so concurrent requests cannot oversubscribe the budget. This is a maximum body-byte allocation, not an estimate of protocol overhead or an AI spending budget. No AI requests run.

Captured documents and the durable ledger are written beneath the ignored `outputs/research-batches/<school>-<modality>/` folder. `--output-dir` can choose a different durable directory. Reusing the same directory is necessary to resume. A different school or format cannot reuse that directory's ledger.

Resume is the default. A successful job is skipped only after its immutable receipt and actual raw body pass SHA-256 checks. Later jobs then advance instead of repeatedly fetching the first sources. `--retry-failed` explicitly retries failed jobs; failures otherwise remain visible while later queued work continues. `--refresh` explicitly recaptures completed sources, for example for a scheduled source review. It cannot be combined with `--resume`.

Per-job fingerprints bind the exact source, trusted school domains, delivery format, affected program/model inputs, capture contract, and optional policy/validator revisions. Unrelated model changes do not invalidate a selected cohort's captures. Relevant input changes queue a new attempt while preserving prior receipt references. A changed URL gets its own source identity; removed jobs are retained as retired history. Source bodies and per-attempt receipts are immutable. A changed capture never refreshes an academic review date.

The ledger uses atomic snapshots, a leased directory lock, owner tokens, and durable running-job records. Concurrent runners cannot claim the same batch. Expired abandoned leases recover; a running local process keeps its lease. A live lease on another host remains blocked until expiry. Corrupt state fails closed and is preserved for restoration rather than overwritten or treated as a new queue. A tampered body/receipt is never trusted as a completed capture. If a content-addressed file itself is damaged, its attempted replacement is held rather than silently overwriting the artifact.

Only HTTPS URLs on explicitly configured official school domains are allowed. Each request and redirect resolves the destination, rejects non-public IP addresses, pins the selected public address, and keeps TLS certificate and hostname validation enabled. Redirects cannot leave the configured official domains. Requesting document bytes never uses cookies or student credentials. Allowed response types are HTML, plain text, JSON and PDF. Failures stay in the receipt rather than silently appearing successful.

Institution trust is explicit in `schoolConfigurations`. Current configurations cover the four priorities and source-backed kits including Champlain, SNHU, Excelsior, Bellevue, APUS, Columbia Southern, Strayer, UMGC, Charter Oak, CSU Global, Purdue Global, and UAGC, plus GCU, ODU, and Phoenix. Provider domains, other tenants of a hosted catalog, and arbitrary directory URLs never expand this allowlist. A kit without recorded institution-host evidence remains unsupported for automatic capture until that host is reviewed and configured; it is not silently fetched through a broad domain exception.

When the execution environment requires an HTTPS proxy, the CLI uses installed `curl` with the checked destination IP, the original TLS hostname, bounded file size and the same cancellation deadline. Proxy settings stay in the process environment, and response cookies are discarded. Builds and coverage checks require neither network access nor curl.

`sourceContentHash` is the SHA-256 of the actual captured bytes. `capturedAt` is a retrieval timestamp, never a review timestamp. Metadata digests in the academic registry are a different field and cannot substitute for captured bytes. Successful retrieval sets `reviewStatus: unreviewed` and `evidenceEffect: none`; it does not close findings, verify equivalencies or publish templates.

## Following the queue

1. Capture shared evidence and discover explicit delivery variants on parent pages.
2. Extract proposed program requirements and school policies into scoped candidate facts, retaining the source-body hash and exact catalog/format.
3. Review each fact against the captured document in the coverage workspace. Reusable schoolwide rules still need documented scope; matching titles are insufficient.
4. Compile and solve the complete proposed curriculum, run research, execution and estimate checks separately, and publish only when the required academic facts and route constraints pass.
5. Compare the next capture hash with the reviewed snapshot. A changed body creates an impact/review task for dependent facts; it must never automatically refresh a review date.

The first delivery is the batch queue and real source capture. Automated extraction, approved schoolwide inheritance and source-diff scheduling are subsequent stages; this script does not pretend those stages have already run.

For controller integration, `captureBatch(manifest, options)` returns the existing capture receipt plus reuse, invalidation, recovery, remaining-work and budget counts. `readVerifiedSchoolCaptures(manifest, {outputDir})` returns only captures matching the current job fingerprints and verified receipt/body hashes. Each item includes exact source/final URLs, raw-body hash, capture time, source roles, raw bytes, and raw text for text document types. PDF text is `null`; the adapter does not pretend PDF bytes are extracted prose. Every item remains `reviewStatus: unreviewed` and `evidenceEffect: none`.
