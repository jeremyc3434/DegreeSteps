# DegreeSteps owner console

The private business workspace is `/owner.html`. Every business API independently checks the verified owner; hiding the navigation is not the access boundary. The student portal and college workspace retain their separate permissions.

## Eight sections

| Section | Working controls and data | Main endpoints/workspaces |
| --- | --- | --- |
| Home | Operating summary, outstanding work, internal tasks | `GET /api/owner/overview`; `/api/owner/tasks` |
| Students & support | Read-only account directory, portal support replies, follow-up for existing consented requests | `/api/owner/students`, `/api/owner/support`, `/api/owner/leads` |
| Degrees & courses | Academic coverage, degree research and college access administration | Existing `/coverage.html` and `/admin.html` workspaces, embedded in the console and protected by the owner API guard |
| Community | Existing moderation and editorial starter-guide management | Existing moderation API; `/api/owner/content/starters` |
| Marketing & content | Articles, FAQs, campaign drafts, manual Search Console imports and aggregate site activity | `/api/owner/content/{articles,faqs,campaigns}`; `/api/owner/search-console`; existing `/growth.html` |
| Partners & revenue | Private partner records, reviewed student offers, manual financial ledger | `/api/owner/partners`, `/api/owner/content/offers`, `/api/owner/finance` |
| AI & operations | Existing AI connection controls, runtime configuration checks and business audit history | Existing `/admin.html`; `GET /api/owner/operations`; `GET /api/owner/activity` |
| Settings & security | Separate administrative directory connection and owner security status | `/api/owner/connections`; `GET /api/owner/settings` |

These are operational tools with actual persisted records. Campaigns are drafts only: they cannot send messages or publish. Partner and follow-up changes do not contact or share with anyone. Finance is a manual ledger of revenue, expenses and invoices; it does not charge cards, reconcile payments or calculate recurring revenue. Provider balances remain unknown unless a future verified integration supplies them.

## Bind the one verified owner

Configure `OWNER_CONSOLE_SUBJECT_SHA256` in the trusted staging and production Worker environments. Its value is the SHA-256 hexadecimal digest of the **entire exact canonical verified subject**, including the `sb-` prefix. Do not use an email address, a bare UUID, an alias, a role or client metadata. Never put the actual subject, hash or credentials in repository examples or chat.

An operator can calculate the digest in a local terminal with a hidden prompt:

```sh
python3 -c 'import getpass, hashlib; subject = getpass.getpass("Full verified sb- subject: "); print(hashlib.sha256(subject.encode("utf-8")).hexdigest())'
```

Use the canonical lowercase `sb-` subject exactly; the server does not trim or normalize it. Store the resulting 64-character lowercase digest through the deployment configuration, then verify with that account using `GET /api/owner/session`.

The Worker must supply `PORTAL_USER` from fresh server-verified authentication. The console checks the trusted digest before reading business data. Anonymous access returns 401; a missing or invalid owner binding returns 503 `owner_binding_required`; another verified account returns 403 `owner_required`. Community owner/moderator roles never grant business access.

After a digest match, the first authorized request pins that subject in the singleton `business_owner` row. A different existing pin returns 403 `owner_binding_conflict`. Changing the environment digest alone cannot transfer ownership; any transfer requires a deliberate operator-controlled change to both trusted configuration and the persisted pin. Keep community moderation and college organization scopes separate from this business boundary.

`authorizeConsoleOwner(request, env)` also gates reused legacy business APIs. Every `/api/owner/**` route, including unknown routes, passes the same guard. Owner writes require same-origin JSON and `X-Portal-Request: 1`; versioned edits reject stale revisions with 409. Audit records accompany successful mutations without storing credentials.

## Database and deployment

Apply the generated D1 migration `drizzle/0019_owner_business_console.sql` through the existing reviewed deployment workflow before enabling the console. The migration introduces owner-console, work, content and search records; the complete operator snapshot registry now describes **57 application tables**. Keep the generated migration, Drizzle snapshot/journal and D1 snapshot registry together. Back up and validate the database using the repository's existing operator process. Runtime requests do not create or alter tables.

The core owner tables are `business_owner`, `business_audit`, `business_connections`, `business_owner_limits`, `business_student_directory` and `business_student_sync`. Other section tables are defined in the owner-work, owner-content and owner-search schema fragments. Build the private owner bundle after server changes; deployment configuration must inject the owner digest and the existing public-data/offer-policy callbacks.

## Connect the account directory safely

Student private plans continue to use `PORTAL_SUPABASE_URL`, the publishable key and the student's verified JWT under RLS. The business directory uses a **separate server-only administrative key** for Auth Admin reads. It never replaces the portal publishable key, receives the student JWT as an administrator, or reads plan/transcript contents.

Use Settings & security → Connections to enter the administrative key in the owner-only password field. Saving first validates a read-only Auth Admin request against the configured project. A publishable/anon key is rejected. The saved key is encrypted with AES-GCM using the existing server `AI_CONNECTIONS_MASTER_KEY` (64 hexadecimal characters), with a fresh IV and authentication binding to the owner and project origin. Responses and audit details omit the key, ciphertext and IV. An optional server secret `OWNER_SUPABASE_ADMIN_KEY` takes precedence over encrypted storage. Removing saved encrypted credentials does not remove that environment secret. Never paste keys into chat or browser source.

The connection test is read-only. Configured and successfully tested are distinct states; changing an environment key does not inherit an older saved key's verification time. A project-origin change cannot decrypt a credential bound to the previous project.

Directory endpoints are `GET /api/owner/students`, `GET /api/owner/students/:id` and `POST /api/owner/students/sync`. Each sync request reads at most two 100-account pages and returns the next page until complete. Retry or resume incomplete scans; a full page with an absent/null provider total is not completion. Only a completed generation removes stale cached directory entries. Search and a filtered total require a completed cached scan. Without the separate connection, account totals are unknown rather than inferred from community profiles.

The source is Supabase Auth. The directory excludes the owner, the eight exact `ds-guide-*` editorial identities, explicitly configured `OWNER_EXCLUDED_ACCOUNT_IDS` and trusted provider `app_metadata.degreesteps_test_account === true` accounts. Names containing “Test” are not excluded. `OWNER_EXCLUDED_ACCOUNT_IDS` is an operator-only comma-separated list of exact canonical subjects or provider UUIDs; refresh the directory after changing it. The account directory is read-only: no account creation, password reset, banning, deletion or email changes are implemented here. A complete count is a directory snapshot, not a live billing or conversion metric.

## Student support and consent

Students use `/help.html`. Authenticated routes under `/api/support/tickets` expose only that student's tickets and public replies. They require same-origin `X-Support-Request: 1` on writes. Owner-only internal notes and contact/account metadata are omitted from student responses. Diagnostics are allowlisted and require explicit consent; private plan snapshots and transcript files are not included.

Anonymous sign-in help uses `POST /api/support/login-help`: contact consent, a honeypot, bounded JSON and a salted daily trusted-IP limit are required. It returns only a receipt; it cannot retrieve history or reveal an account's existence. It fails closed when the required trusted IP or hashing secret is unavailable. Support replies remain in the portal; these controls send no email. Existing follow-up requests can enter the business pipeline only while their recorded consent is active and available, and are rechecked when accessed.

## Publish content deliberately

Articles, FAQs and offers follow save → preview → review exact revision → publish. Writes use `expectedRevision`; editing clears the review. A published snapshot remains live until an explicitly reviewed replacement is published or the record is archived. Articles and FAQs require reviewed sources. Published article URLs are fixed.

Public publication is limited to `/insights/:slug/`, `/api/content/articles`, `/api/content/faqs`, the article sitemap contribution and the reviewed `/data/student-offers.json` overlay. Offer overrides are validated against the existing reviewed provider registry and allowed hosts. The console does not change degree requirements, transfer equivalencies, planner rankings or public private-user data. Starter edits preserve the editorial guide identity and ordinary moderation controls. Campaign publication and sending are disabled.

Search Console settings, DNS checks and CSV imports live under `/api/owner/search-console`. Recorded owner verification, observed DNS TXT status and an API connection are separate facts. The current integration uses manual CSV imports, not continuous Google API synchronization. Summaries avoid adding overlapping reports or incompatible dimensions. Existing growth counters are aggregate events, not unique students or conversion rates.

## Check the release

Run focused checks from the repository root:

```sh
node server/owner-console.test.mjs
node server/owner-console-boundary.test.mjs
npm run test:core
```

Core tests use real SQLite migrations with synthetic identities and mocked provider responses; they are not evidence of a live external connection. Also verify the browser gate while signed out, with a different account and with the bound owner. Confirm that unconfigured services show an unavailable/setup state, students cannot access other tickets, stale edits show a conflict and no provider credentials appear in browser responses. Runtime AI/email configuration does not prove delivery or an available provider balance.

Supabase references: [Auth Admin account listing](https://supabase.com/docs/reference/javascript/auth-admin-listusers), [server and publishable API keys](https://supabase.com/docs/guides/getting-started/api-keys), [changelog](https://supabase.com/changelog.md).
