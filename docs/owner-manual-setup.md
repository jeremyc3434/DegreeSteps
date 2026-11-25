# Owner service setup

Google Search Console ownership for the `degreesteps.com` Domain property was confirmed by the owner on November 25, 2026. Record this as **owner-reported Google verification**. This is separate from an automated DNS observation and does not connect the Google API. Sitemap submission is pending the owner's confirmation; do not ask them to repeat ownership verification.

The trusted deployment setting `OWNER_GSC_VERIFIED_AT` records the confirmation time in epoch milliseconds. On the first authorized owner's Search Console GET, a valid past timestamp initializes settings only if no record exists, using that verified owner's ID. Later reads preserve existing settings, including subsequent corrections. This initialization is not seeded into schema migrations and cannot be triggered by client fields or query parameters.

## Search Console and sitemap

The property is `degreesteps.com`, covering its subdomains and protocols. The public sitemap is `https://degreesteps.com/sitemap.xml`. In Search Console, select this property, open **Sitemaps**, enter that complete URL, and select **Submit**. Check the resulting status. Submission does not guarantee indexing or rankings. [Google's sitemap instructions](https://support.google.com/webmasters/answer/7451001?hl=en).

If ownership needs to be restored later:

1. Open [Search Console](https://search.google.com/search-console), choose **Add property → Domain**, and enter `degreesteps.com`, without `https`, `www`, or a path.
2. Copy the entire `google-site-verification=...` TXT value supplied by Google. It is a public DNS verification record and can be shared for setup help.
3. In Cloudflare, select **degreesteps.com → DNS → Records → Add record**. Use **TXT**, name **@**, Google's exact value as the content, and **TTL Auto**. Add a separate record; preserve existing MX, SPF, DKIM, other verification records, and domain routes.
4. Return to Google and select **Verify**. Retry after DNS updates if necessary, and retain the TXT record after success.

DNS is hosted by Cloudflare (`arch.ns.cloudflare.com` and `liv.ns.cloudflare.com` in the current deployment record). Namecheap remains the registrar. This TXT record belongs in Cloudflare. A successful DegreeSteps DNS check means that the saved token is published; only Google decides whether ownership verification succeeds. [Domain properties](https://support.google.com/webmasters/answer/34592?hl=en), [verification and retained tokens](https://support.google.com/webmasters/answer/9008080?hl=en), [Cloudflare record creation](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/).

## Real search metrics without another OAuth project

The owner console initially supports private **CSV imports**, not a live Google API connection. In Google's Performance report, choose the date range and filters, then use **Export → CSV**. If Google downloads a ZIP, unzip it locally and import individual CSVs. Supported English export headers identify Date, Top queries/Query, Top pages/Page, Country, or Device, with Clicks and Impressions and optional CTR and Position. Each file is bounded to 2 MiB and 5,000 data rows; exceptionally large normalized records require a smaller export.

Record the exact reporting period, search type, filters, and export date with the import. Keep exports from different dimensions or overlapping periods separate. The console's headline figures use one latest imported Date report, never a sum of query, page, country, device, or multiple overlapping reports. An incomplete date window is labeled as imported rows rather than complete-period traffic. CTR uses total clicks divided by total impressions, not an average of percentages. Average position is impression-weighted only when the required data is known and remains approximate because exported averages may be rounded.

Literal `~`, `-`, empty, or unavailable markers remain unknown. Google's export may itself turn unavailable display values into zero; the importer cannot reconstruct those lost distinctions. A direct export can also be truncated to 1,000 representative rows, so a top-query/page file is not a complete traffic total. Do not extrapolate missing rows or invent zeros. [Google export limitations](https://support.google.com/webmasters/answer/12919797).

Future automation can use the [Search Console API](https://support.google.com/webmasters/answer/12919192?hl=en). Access is managed at **Settings → Users and permissions**; grant the access needed for the integration, without sharing passwords. The current manual import does not require an OAuth application or Google Analytics. [Google permissions](https://support.google.com/webmasters/answer/7687615?hl=en).

## Student accounts and owner administration

Student authentication and private plans continue to use the existing Supabase project, its publishable key, and the verified student's JWT. Do not replace `PORTAL_SUPABASE_PUBLISHABLE_KEY` with a service-role or secret key.

If the new owner console needs Supabase Auth Admin operations, connect a **separate server-only administrative secret** through its private, owner-only password field. Store it encrypted, return only connection status, and keep it out of browser bundles, logs, source files, URLs, and chat. Supabase server secrets can bypass Row Level Security; ordinary student requests must retain their existing user-scoped access. The admin connection must not be labeled connected until its server-side check succeeds. [Supabase key guidance](https://supabase.com/docs/guides/getting-started/api-keys).

## Email and marketing

Reuse the existing Resend account and Worker secret if already configured. The existing integration reads `RESEND_API_KEY`; its default sender is `DegreeSteps <plans@degreesteps.com>`. Alert sending also requires `EMAIL_ALERTS_ENABLED=1` and the configured `EMAIL_POSTAL_ADDRESS`. Inspect connection status before asking for another key. Repository-secret listing returned 403 for the current integration identity; that leaves actual Resend and admin-key configuration unknown and does not establish that either is absent. If the sender domain is not verified, copy only the DNS records Resend supplies into Cloudflare and preserve existing MX/SPF/DKIM records. Do not create a second SPF policy at the same hostname.

Transactional account/plan messages and marketing campaigns have separate purposes and consent requirements. A student signing in or saving a degree plan is not marketing consent. Campaign drafts do not send messages. Do not claim delivery is working solely because an API key is present: verify sender-domain status and a deliberate owner-authorized test before reporting delivery success. Never request email-service keys or passwords in chat.

GA4 is optional for broader website analytics and is not required for Search Console Domain verification. Until real analytics or spend data is connected or imported, the dashboard should show setup instructions or “No data,” never example traffic, spending, or revenue presented as actual results.
