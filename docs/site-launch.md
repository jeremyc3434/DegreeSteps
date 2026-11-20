# DegreeSteps launch on owner-controlled Cloudflare

Launch verified November 18, 2026: Cloudflare Workers for the website, APIs and research workers; the existing Supabase project for sign-in and private plans; GitHub for reviewed source and collaboration. The domain `degreesteps.com` is registered at Namecheap. No Vercel deployment is part of this launch.

## Current launch state

The owner account, deployment authorization, production database and research queues are set up. Final application-data migration and credential-overlay checks are complete. The old source API is frozen to prevent new source writes, while its public pages remain available for device-draft recovery. Existing Supabase identities and private account data are retained.

The owner confirmed the Workers Paid upgrade, added the two exact Supabase callbacks and completed owner sign-in and Claude reconnection. The saved-key test audit verifies decryption with the new master. Cloudflare accepted the configured 60,000 ms CPU allowance. The domain's Free Website plan is separate.

The full student portal is live at <https://degreesteps.com/portal.html>. The temporary Worker address remains available during the transition. The production runtime, research consumer and two-minute outbox schedule are active. The temporary bootstrap entry point is no longer deployed. Worker preview aliases are disabled, and the temporary hostname is excluded from search. Public canonical URLs and the sitemap use `https://degreesteps.com`.

Final data verification is complete: two snapshots taken after the source API freeze matched, all source research jobs were idle, and the reviewed three-table credential overlay exactly matched the existing destination. All 27 tables are preserved, with 19 destination records including the new connection audit records. This is an intentional credential overlay, not raw source parity; another database import was unnecessary. The same destination master secret remains in place.

DNS delegation is complete. The active Cloudflare zone uses `arch.ns.cloudflare.com` and `liv.ns.cloudflare.com`; registration stays with Namecheap. Both `degreesteps.com` and `www.degreesteps.com` are bound to the owner-controlled Worker. Nine live checks verified HTTPS, the `www` and HTTP redirects, public canonical/indexing behavior, private cache boundaries, email/Google availability and the exact Google return URL. The five Namecheap forwarding MX records and SPF record remain in public DNS. Actual mail delivery was not tested.

The owner reported a successful Google login on the official domain. Google consent-screen branding and its optional branded authentication hostname are separate follow-ups; see [Google sign-in branding](google-sign-in-branding.md). Email confirmation and password reset on the final domain still need an actual user-flow check. Never send account passwords or API keys in chat.

## Current state

| Area | Verified on November 18, 2026 | Remaining follow-up |
| --- | --- | --- |
| Existing website | Public Sites pages remain available; application APIs are frozen to prevent new source writes; operator export is disabled | Retain device-draft recovery; reconcile production activity before any rollback |
| Cloudflare build | Full production runtime deployed; main queue consumer and recovery cron active; staging remains isolated | Monitor the active custom domains and runtime |
| Private accounts | Existing Supabase Auth/Postgres identities and plans retained; owner sign-in on the new host reported working; email/Google advertised | Finish Google branding; exercise email confirmation and reset on the final domain |
| Remaining database | Complete source preserved with the reviewed fresh credential overlay; hosted rollback/FK checks and exact final destination checksum passed | Maintain private backups and record any later schema changes |
| GitHub | Owner's repository is `jeremyc3434/DegreeSteps`; source publication uses its existing history | Confirm complete source and passing CI on the latest pushed commit |
| Domain | Active in the owner's Free Cloudflare zone; apex and www Worker bindings verified | Preserve email records and recovery hosts; old Sites requests remain unused |
| Research workers | Main consumer and recovery schedule active; real delivery, missing-job lookup and duplicate acknowledgement passed without Claude generation or database changes | Controlled hosted fixtures are still needed for full execution, lease failure and dead-letter recovery checks |

This is a dated status record. Production application traffic now uses the official domain; the temporary Worker URL remains available for transition and device-draft recovery. The operator migration assertion is now backed by the final frozen-source and credential-overlay checks. The source freeze stays enabled; do not clear it or send writes back to the old database without reconciling newer production activity.

The preceding recommendation release passed all 148 core test files and GitHub CI. Current release verification is recorded in the operator handoff receipts. Live checks cover public/portal pages, sign-in configuration, private cache boundaries, canonical metadata, gzip/identity consistency and the queue smoke path. They do not establish capacity for millions or successful paid research for every degree.

## Operator sequence

1. **Publish source.** Follow [the source handoff](github-source-handoff.txt). Verify GitHub contains `package.json`, `worker/`, `server/`, `dist/`, migrations and tests. A README-only repository cannot build the application. CI needs no production secrets. Repository access does not grant access to student records.
2. **Authorize Cloudflare.** Use [Wrangler login](https://developers.cloudflare.com/workers/wrangler/commands/general/) on the owner's computer or a scoped operator credential. Select the intended account. Review quotas/billing before enabling the configured runtime. A free account is not approval to activate paid services; the checked-in 60,000 ms CPU allowance is a paid-runtime setting.
3. **Verify destination resources.** Staging and production have separate D1 databases and main/dead-letter queues. Preserve `DB`, `ASSETS`, `RESEARCH_QUEUE` and `RESEARCH_DEAD_LETTER_QUEUE` binding names. Verify the configured account and database IDs before each deployment. Keep staging on its isolated hostname and database, without routing `degreesteps.com`.
4. **Move and verify data.** Establish a consistent source export with writes paused or reconciled. Preserve all application tables, ownership, revisions, moderation, memberships/leads, research state, legacy backups and encrypted connections. Replay the reviewed schema using one documented migration method and import data without duplicating schema or migration history. Compare schema, per-table counts and representative records; check foreign keys and integrity and test restoration. Bounded table reads alone are not a transactionally consistent backup. Keep exports and verification evidence private, outside GitHub.

   The internal `POST /api/operations/snapshot` route accepts no table/SQL filters. It requires a 64-character random operator key in `X-DegreeSteps-Export-Key`, its SHA-256 in server secret `OPERATOR_EXPORT_TOKEN_SHA256`, an exact HTTPS `OPERATOR_EXPORT_ORIGIN`, and ISO `OPERATOR_EXPORT_EXPIRES_AT` no more than one hour ahead. It is disabled when these entries are absent or expired. Ordinary account cookies and administrator roles do not authorize it. The fixed-table read batch exports complete cells, decimal-string integers, schema metadata and content digests; oversized or changed schemas fail rather than returning a partial backup. This endpoint performs no write freeze.

   Verify with `node scripts/d1-snapshot.mjs --verify /private/snapshot.json --expect-origin https://degreepath-open-2026.ccollins203.chatgpt.site`. Generate a parameterized plan with `--plan /private/snapshot.json --out /private/import-plan.json`. These tools restore only against trusted repository migrations; they do not execute snapshot SQL or contact live services. Import plans are private data and refuse tracked/deployable output paths. The actual cloud applier must enforce destination emptiness inside the same atomic batch; plan flags are not enforcement. Prove rollback on an empty destination using known synthetic rows before the real import, including deferred foreign-key failure at commit, and compare a complete destination snapshot afterward. Remove all three operator export entries and redeploy after use. Known provider migration-history tables, including `__appgarden_migrations`, are excluded; unexpected application tables still fail verification. If the source changes after a rehearsal, use a reviewed reconciliation or a fresh empty destination; do not replay INSERTs into a populated database. Keep the source available; do not set the final cutover flag solely because a rehearsal matches.
5. **Configure credentials.** Retain the existing Supabase project/users. Set `PORTAL_STORAGE_BACKEND=supabase`, project URL and publishable key. Keep privileged secrets server-side. Existing encrypted Claude rows require the matching `AI_CONNECTIONS_MASTER_KEY` and unchanged encryption identity, or explicit Claude reconnection. Verify connection configuration without paid research calls merely to test deployment. Never put secret values in logs, manifests or source.

   **Claude API key.** Store it only as the Worker secret `ANTHROPIC_API_KEY` (`npx wrangler secret put ANTHROPIC_API_KEY`, and again with `--config wrangler.staging.jsonc` for staging, or Cloudflare dashboard → Workers → degreesteps → Settings → Variables and Secrets). The secret takes precedence over any key saved on the admin page. Saving keys on the admin page is off unless `AI_CONNECTIONS_ALLOW_MANAGED=1`. After the secret is set, use **Disconnect saved key** on the admin page and revoke that old key in the Claude Console. Create the key in its own Console workspace with a monthly spend limit as a hard cost backstop.
6. **Build and deploy staging.** Use Node.js 24, `npm ci --ignore-scripts`, `npm run check:source`, `npm run build` and appropriate tests. `npm run check:production` checks configuration and requires an operator migration assertion; it does not perform or prove a migration. Set `DEGREESTEPS_DATA_MIGRATION_VERIFIED=1` only after actual destination checks. The guarded `npm run deploy:cloudflare` uses pinned Wrangler. Automatic GitHub production deployment is not configured.
7. **Verify hosted behavior.** Check Google/email sign-in, confirmation/reset, explicit account save/open, conflicts, legacy migration, imports, community permissions and college access. Exercise queue/outbox recovery using synthetic jobs, including leases, duplicate delivery and dead letters. Do not automatically retry an uncertain paid-provider result. Verify restoration and staged load with latency, failure, data-integrity and cost criteria. Local timings are not a production capacity guarantee.
8. **Connect the domain last.** Complete the domain sequence below after staging passes. Keep the old host and a compatible deployment for rollback. Switching the private backend to D1 does not copy newer Postgres plans.

See [README](../README.md#owner-controlled-cloudflare-launch) for runtime, migration and monitoring details. Do not bypass its gate to make an empty environment appear ready.

## Domain and sign-in cutover

Workers Custom Domains require an active Cloudflare zone. Add `degreesteps.com` to the owner's account, inspect imported DNS records and preserve email/verification records. Follow the account's assigned nameservers and onboarding instructions at Namecheap. Do not transfer registration or guess DNS targets. Configure the Worker Custom Domain after the destination is verified, using only records Cloudflare actually returns. See [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) and [zone setup](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/).

The [archived Sites DNS CSV](archive/degreesteps-namecheap-sites-dns.csv) belongs to the earlier managed-host setup. It is historical reference, not instructions for the new account. Do not apply it to launch the owner-controlled Worker. Do not remove existing records or pending bindings as a side effect of preparation.

Before routing students:

- Confirm TLS and the chosen apex/`www` behavior. Redirect the alternate hostname after the primary works.
- Allow exact `https://degreesteps.com/auth/complete` in Supabase, plus other hostnames actually served. Keep the old callback during transition. Google's OAuth callback remains `https://xajvembwdteqauwithgo.supabase.co/auth/v1/callback` while this project remains the provider.
- Verify Google, email/password and confirmation/reset on the actual new host. Update Google consent branding, homepage, privacy links and authorized origins where appropriate.
- Device drafts remain on their original host; preserve/export them before leaving. Account copies use the retained Supabase backend on the new host. Host-only cookies and device localStorage do not move across domains automatically, and the old source API remains frozen.
- After the domain works, build with `DEGREEPATH_PUBLIC_ORIGIN=https://degreesteps.com` to regenerate consistent canonical, Open Graph, structured-data and sitemap URLs. Preserve historical storage/cookie/encryption identifiers.

## Search, maintenance and capacity

Public resources are generated HTML. Personal portals/accounts remain excluded from the public sitemap and carry no-store/noindex policy. Submit the verified domain's sitemap in Google Search Console after cutover; indexing and rankings are not guaranteed.

Hosting does not perform academic source review. Refresh policies, prices, eligibility and exact mappings through the existing review process. Change review dates only after reviewing source content. Monthly maintenance and operational alerts still need actual scheduling and ownership.

Monitor auth failures, API latency/errors, D1 work/storage, Postgres usage, queue age/retries/dead jobs and AI spend. Expand based on measured behavior. Passing tests or deploying a Worker does not establish readiness for millions of simultaneous students.
