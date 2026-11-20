# Beta deploy checklist (2026-11-20)

The full launch procedure, covering accounts, data migration and the domain, is in [site-launch.md](site-launch.md). This page covers only what changed for the beta release on `claude/app-expansion-design-6g2n8u`.

## Before deploying

1. **Merge.** Merge `claude/app-expansion-design-6g2n8u` into `main` through a pull request.
2. **Build and test.** Run `npm run build` and `node scripts/test-core.mjs`. Both must pass; they do on the branch.
3. **Claude API key.** The key is stored only as a Worker secret (see site-launch.md step 5):
   - `npx wrangler@4.164.0 secret put ANTHROPIC_API_KEY --name degreesteps`
   - repeat with `--name degreesteps-staging` for staging.
   - Then, on the admin page, use **Disconnect saved key** and revoke the old key in the Claude Console.
4. **Database migrations.** Apply the D1 migrations, including the new `0014_coach_beta.sql`. It only adds three coach tables and is safe while the coach is off.
   - Staging first: `npx wrangler@4.164.0 d1 migrations apply degreesteps-staging-public --remote --config wrangler.staging.jsonc`.
   - Then production: `npx wrangler@4.164.0 d1 migrations apply degreesteps-public --remote`.

## Deploy

1. Deploy staging: `npm run deploy:staging`.
2. Smoke-test staging on a phone and a laptop:
   - the plan finder;
   - "Help me choose" → a plan → the worksheet;
   - "What are my credits worth?";
   - the transfer directory;
   - the admin page shows "Connected with the server secret".
3. Deploy production: `npm run deploy:cloudflare`. The production config check runs first.

## Leave off for the first week

- **AI coach.** Leave `COACH_ENABLED` unset. To turn it on later:
  - add `COACH_HASH_SALT` (any random text of 16 or more characters) as a secret;
  - set `COACH_ENABLED=1`;
  - optionally set `COACH_DAILY_USD_CAP` (default `3`).
  - The coach uses Claude Haiku 5.5 by default.

## Rollback

Redeploy the previous Worker version from the Cloudflare dashboard (Workers → degreesteps → Deployments). Migration 0014 is additive, so it does not need to be rolled back.
