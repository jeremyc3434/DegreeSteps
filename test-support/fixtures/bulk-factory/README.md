# Independent release oracle

`released-45-83eb4ad.json` was frozen directly from the published artifacts at
commit `83eb4ad8d6769e0cd09af8c276e541ff864e1b0b`, before the reusable batch factory
or the first shared Champlain choice pools were generated. Its academic revision
is `academic-v1:05a13de7931842f440df5a568520a6d6508a249cebd96c6b909748cef606ef07`.

It preserves 45 published model identities and 1,596 selected option contracts:
school, catalog, level, original unit system, degree total, requirement count,
published outside-credit minimum, incoming routes, receiving awards, original
source quantities, bundle identities and recommendation versions where known.
An omitted source quantity remains unknown; it is not inferred from receiving
credits. These are proposed baseline choices, never a student's awarded credit.

Do not regenerate this oracle from factory output. A better baseline may select
new choices while preserving old option identities and the established minimum
outside-credit result. New public coverage is measured from actual publication
receipts; a research cohort target does not change this historical count.

Run the independent acceptance checks from the repository root:

```sh
node --test --test-isolation=none bulk-factory-acceptance.test.mjs
```

The tests also exercise real durable capture ledgers, component-cache reuse,
global capture and AI budgets, run locking, data-only program registration,
exact-scope review candidates and the first source-reviewed named university
pools. HTTP and paid AI calls are mocked; no student accounts are written.
