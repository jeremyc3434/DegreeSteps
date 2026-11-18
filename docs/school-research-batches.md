# School research batches

`node scripts/build-school-research-batch.mjs` builds the complete current Liberty directory research backlog in `content/research-batches/liberty-online.json`. It requires no AI calls or network access. `--check` checks that committed backlog against its exact input catalogs, public academic registry and compiled curricula.

The pilot starts with the online format, but does **not** infer online delivery from a school name or a parent catalog listing. Every Liberty directory parent is queued for delivery discovery. Exact variants with explicit online delivery are listed separately, with their original route IDs, parent IDs, curriculum IDs and catalog identities. Concentrations remain variants. This is coverage of the existing imported directory, not a claim that every current offering has already been discovered or mapped.

The batch deduplicates official document URLs across program models, preserves model-local source identities, and prioritizes shared academic policies, receiving-school transfer guides and general education sources. Existing unresolved policy fields, missing requirement IDs and academic-registry finding IDs make the remaining work explicit. A ready curriculum ledger is not called a verified plan.

## Bounded source capture

Run `node scripts/build-school-research-batch.mjs --capture --limit 5 --concurrency 2` to retrieve the top five sources. Each invocation allows at most ten sources and four concurrent requests. The default timeout is twenty seconds per source; documents are limited to eight MiB, with a hard configurable ceiling of sixteen MiB. Captured documents and a receipt are written beneath the ignored `outputs/research-batches/liberty-online/` folder.

Only HTTPS URLs on explicitly configured official school domains are allowed. Each request and redirect resolves the destination, rejects non-public IP addresses, pins the selected public address, and keeps TLS certificate and hostname validation enabled. Redirects cannot leave the configured official domains. Requesting document bytes never uses cookies or student credentials. Allowed response types are HTML, plain text, JSON and PDF. Failures stay in the receipt rather than silently appearing successful.

When the execution environment requires an HTTPS proxy, the CLI uses installed `curl` with the checked destination IP, the original TLS hostname, bounded file size and the same cancellation deadline. Proxy settings stay in the process environment, and response cookies are discarded. Builds and coverage checks require neither network access nor curl.

`sourceContentHash` is the SHA-256 of the actual captured bytes. `capturedAt` is a retrieval timestamp, never a review timestamp. Metadata digests in the academic registry are a different field and cannot substitute for captured bytes. Successful retrieval sets `reviewStatus: unreviewed` and `evidenceEffect: none`; it does not close findings, verify equivalencies or publish templates.

## Following the queue

1. Capture shared evidence and discover explicit delivery variants on parent pages.
2. Extract proposed program requirements and school policies into scoped candidate facts, retaining the source-body hash and exact catalog/format.
3. Review each fact against the captured document in the coverage workspace. Reusable schoolwide rules still need documented scope; matching titles are insufficient.
4. Compile and solve the complete proposed curriculum, run research, execution and estimate checks separately, and publish only when the required academic facts and route constraints pass.
5. Compare the next capture hash with the reviewed snapshot. A changed body creates an impact/review task for dependent facts; it must never automatically refresh a review date.

The first delivery is the batch queue and real source capture. Automated extraction, approved schoolwide inheritance and source-diff scheduling are subsequent stages; this script does not pretend those stages have already run.
