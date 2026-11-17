# DegreeSteps launch on owner-controlled Cloudflare

Confirmed November 17, 2026: Cloudflare Workers for the website, APIs and research workers; the existing Supabase project for sign-in and private plans; GitHub for reviewed source and collaboration. The domain `degreesteps.com` is registered at Namecheap. No Vercel deployment is part of this launch.

## Owner's first step

Create a Cloudflare account at <https://dash.cloudflare.com/sign-up> and verify its email. Account creation does not require changing Namecheap DNS or activating a paid Workers subscription. Keep the domain registration at Namecheap. Do not send passwords or API tokens in chat.

Next comes secure deployment authorization and a staging deployment. An Account ID identifies the destination but is not deployment authorization. Wrangler can use the owner's browser login on their own computer; CI can use a scoped token stored as a deployment secret. Do not grant access to unrelated accounts or domains.

## Current state

| Area | Verified on November 17, 2026 | Needed for the new host |
| --- | --- | --- |
| Existing website | Public Sites version 51 at `https://degreepath-open-2026.ccollins203.chatgpt.site` | Keep available during migration and recovery |
| Cloudflare build | Separate Worker/assets; isolated owner-account staging is configured in `wrangler.staging.jsonc`; production IDs remain placeholders | Verify staging, complete the data/secret migration and set the production destination |
| Private accounts | Existing Supabase Auth and deployed Postgres storage; runtime selects `supabase` | Retain project and identities; allow the exact new callback |
| Remaining database | Existing Sites D1 contains 27 application tables | Consistent private export, import and comparison |
| GitHub | Owner's repository is `jeremyc3434/DegreeSteps`; source publication uses its existing history | Confirm complete source and passing CI on the latest pushed commit |
| Domain | Registered at Namecheap; old Sites custom-domain requests pending | Connect the verified destination after testing |
| Research workers | Queue and scheduled-recovery code prepared | Create/bind queues, test recovery, activate consumption |

This is a dated status record. No new account, data migration, hosting activation or DNS change has completed through this preparation. The production readiness command intentionally fails while destination IDs or migration verification are missing.

## Operator sequence

1. **Publish source.** Follow [the source handoff](github-source-handoff.txt). Verify GitHub contains `package.json`, `worker/`, `server/`, `dist/`, migrations and tests. A README-only repository cannot build the application. CI needs no production secrets. Repository access does not grant access to student records.
2. **Authorize Cloudflare.** Use [Wrangler login](https://developers.cloudflare.com/workers/wrangler/commands/general/) on the owner's computer or a scoped operator credential. Select the intended account. Review quotas/billing before enabling the configured runtime. A free account is not approval to activate paid services; the checked-in 60,000 ms CPU allowance is a paid-runtime setting.
3. **Provision staging.** Create a D1 database and separate main/dead-letter research queues. Preserve `DB`, `ASSETS`, `RESEARCH_QUEUE` and `RESEARCH_DEAD_LETTER_QUEUE` binding names. Set the actual destination IDs in `wrangler.jsonc`. Use an isolated staging hostname and database, without routing `degreesteps.com`.
4. **Move and verify data.** Establish a consistent source export with writes paused or reconciled. Preserve all application tables, ownership, revisions, moderation, memberships/leads, research state, legacy backups and encrypted connections. Replay the reviewed schema using one documented migration method and import data without duplicating schema or migration history. Compare schema, per-table counts and representative records; check foreign keys and integrity and test restoration. Bounded table reads alone are not a transactionally consistent backup. Keep exports and verification evidence private, outside GitHub.
5. **Configure credentials.** Retain the existing Supabase project/users. Set `PORTAL_STORAGE_BACKEND=supabase`, project URL and publishable key. Keep privileged secrets server-side. Existing encrypted Claude rows require the matching `AI_CONNECTIONS_MASTER_KEY` and unchanged encryption identity, or explicit Claude reconnection. Verify connection configuration without paid research calls merely to test deployment. Never put secret values in logs, manifests or source.
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
- Keep the old site available for students to explicitly save/export their drafts and open account copies. Host-only cookies and device localStorage do not move across domains automatically.
- After the domain works, build with `DEGREEPATH_PUBLIC_ORIGIN=https://degreesteps.com` to regenerate consistent canonical, Open Graph, structured-data and sitemap URLs. Preserve historical storage/cookie/encryption identifiers.

## Search, maintenance and capacity

Public resources are generated HTML. Personal portals/accounts remain excluded from the public sitemap and carry no-store/noindex policy. Submit the verified domain's sitemap in Google Search Console after cutover; indexing and rankings are not guaranteed.

Hosting does not perform academic source review. Refresh policies, prices, eligibility and exact mappings through the existing review process. Change review dates only after reviewing source content. Monthly maintenance and operational alerts still need actual scheduling and ownership.

Monitor auth failures, API latency/errors, D1 work/storage, Postgres usage, queue age/retries/dead jobs and AI spend. Expand based on measured behavior. Passing tests or deploying a Worker does not establish readiness for millions of simultaneous students.
