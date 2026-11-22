# Beta deploy checklist

Deploys run from GitHub Actions (`.github/workflows/deploy.yml`), so no terminal is needed. The full launch procedure, covering accounts, data migration and the domain, is in [site-launch.md](site-launch.md).

## One-time setup (in the browser)

1. **Cloudflare API token.** In the Cloudflare dashboard go to My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template, then add **Account → D1 → Edit**. Restrict it to the DegreeSteps account. Copy the token.
2. **Claude API key.** In the Claude Console, create a key in its own workspace and set a monthly spend limit on that workspace.
3. **GitHub secrets.** In the repo, go to Settings → Secrets and variables → Actions → New repository secret, and add:
   - `CLOUDFLARE_API_TOKEN`: the token from step 1.
   - `ANTHROPIC_API_KEY`: the key from step 2.
4. **Optional approval step.** Under Settings → Environments → `production`, add yourself as a required reviewer. Production deploys then wait for your click.

## How deploys happen

- **Staging:** automatic after every merge to `main`. The workflow runs the source safety check, the build and the core tests, applies D1 migrations, deploys the `degreesteps-staging` Worker and sets `ANTHROPIC_API_KEY` on it.
- **Production:** go to Actions → Deploy → Run workflow, choose `production` and tick "I have verified the existing D1 data and encrypted-connection migration" (see site-launch.md step 4). The workflow then runs `scripts/check-production-config.mjs`, applies migrations, deploys `degreesteps` and sets the key.
- **Every run** writes a summary on its Actions page.

## After the first production deploy

1. On the admin page, click **Test connection**. It should say it is connected with the server secret.
2. Click **Disconnect saved key**, then revoke that old key in the Claude Console.
3. Smoke-test on a phone and a laptop:
   - the plan finder;
   - "Help me choose" → a plan → the worksheet;
   - "What are my credits worth?";
   - the transfer directory.

## Leave off for the first week

- **AI coach.** Leave `COACH_ENABLED` unset. To turn it on later:
  - add a `COACH_HASH_SALT` Worker secret (16+ random characters);
  - set `COACH_ENABLED=1`;
  - optionally set `COACH_DAILY_USD_CAP` (default `3`).
  - The coach uses Claude Haiku 5.5.
- **"Have [School] contact me" and the paid Plan review.** Both are off. Nothing is ever sent to a school or a payment provider automatically; requests wait on the admin page for you to download as CSV and forward by hand, and are deleted after 365 days.
  - Add a `LEADS_HASH_SALT` Worker secret (16+ random characters). It is used only for the daily per-visitor submission limit.
  - School contact requests: set the GitHub environment variable `SCHOOL_INQUIRIES_ENABLED` to `1` (Settings → Environments → staging or production → Environment variables), and list each school, by its exact name on DegreeSteps plans, in `content/monetization/schools.json`. With the list empty no student sees the button.
  - Plan review: set `PLAN_REVIEW_ENABLED` to `1` the same way. The price, currency, turnaround and status come from `content/monetization/plan-review.json` (status `waitlist`: no payment is taken).
  - The Deploy workflow passes these variables to both the build (disclosure copy on `/why-its-free/` and `/privacy/`, and the `/plan-review/` sitemap entry) and the Worker. Review `/why-its-free/` on staging before production.

## Rollback

Redeploy the previous Worker version from the Cloudflare dashboard (Workers → degreesteps → Deployments), or re-run the Deploy workflow on an earlier commit. Migration 0014 only adds tables, so it does not need to be rolled back. Migration 0016 adds the request tables and widens the growth counters' allowed events; it does not need to be rolled back either.
