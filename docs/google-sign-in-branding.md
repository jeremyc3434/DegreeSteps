# DegreeSteps Google sign-in branding

Google login works on `https://degreesteps.com`. The displayed Google app identity and the Supabase authentication hostname are separate settings. Renaming the Supabase project or the OAuth client's internal label does not configure Google's public branding.

## App name and logo

Use the Google Cloud project and OAuth client already connected to Supabase. Open [Google Auth Platform → Branding](https://console.cloud.google.com/auth/branding) and review these values:

| Setting | Value |
| --- | --- |
| App name | DegreeSteps |
| Homepage | https://degreesteps.com |
| Privacy policy | https://degreesteps.com/privacy/ |
| Terms of service | https://degreesteps.com/terms/ |
| Authorized domain | degreesteps.com |
| Logo | The approved DegreeSteps logo |

Keep the existing working OAuth client, credentials and callback. Retain the project's existing verified support/developer contacts or choose the intended business contact in the dashboard. Add the official domain alongside existing required domains.

Follow [Verification](https://console.cloud.google.com/auth/verification), including domain ownership when prompted. Supabase documents that verified branding shows the app name and logo rather than the project ID on the consent screen. Google review is not automatic and may take a few business days. For a public consumer application, also review **Audience**: external students must be eligible, and a project still in Testing is restricted to its test users. Review any Google requirements before switching publication status.

This branding work does not require purchasing Supabase's custom-domain add-on. It does not rewrite the underlying authentication hostname, which can still be visible in parts of the login flow.

## Optional branded authentication hostname

`auth.degreesteps.com` would replace the generic Supabase callback hostname. Supabase currently charges **$0.0137/hour (approximately $10/month)** for a custom domain, in addition to an eligible paid Supabase plan (Pro, Team or Enterprise). No paid add-on has been enabled or approved by this change.

1. Configure the custom domain in this Supabase project's settings. Use only the exact DNS records supplied by Supabase; do not guess a CNAME or verification value.
2. Verify ownership and wait for its certificate. Preserve unrelated website and email records.
3. Before activation, retain the existing Google OAuth callback `https://xajvembwdteqauwithgo.supabase.co/auth/v1/callback` and add `https://auth.degreesteps.com/auth/v1/callback` to the same client.
4. Activate the Supabase custom domain and test a complete Google login from the official website. Supabase immediately advertises the new callback after activation; its original API URL remains operational.
5. Keep `https://degreesteps.com/auth/complete` in Supabase's Redirect URLs. Review the production Site URL separately from the provider callback.

Rollback retains the original callback: revert any optional application URL change, deactivate the custom domain in Supabase, verify login via the original callback, then remove unused DNS/callback entries. Do not replace the working authentication flow with an unverified reverse proxy.

## Private account names

DegreeSteps accepts an optional display name from the provider-verified Supabase user profile. A chosen private nickname takes precedence. Default profiles use the sign-in name without writing over saved aliases; accounts without a name see a neutral welcome. Names are not inferred from email addresses, used for authorization, or copied into public community aliases.

## Sources

- [Supabase: Google consent-screen branding](https://supabase.com/docs/guides/auth/social-sign-in/auth-google#setup-consent-screen-branding)
- [Supabase: Custom domains](https://supabase.com/docs/guides/platform/custom-domains)
- [Supabase: Custom-domain usage and pricing](https://supabase.com/docs/guides/platform/manage-your-usage/custom-domains)

Documentation reviewed November 18, 2026. Hosted Google branding, verification and audience settings require the owner's Google Cloud access and have not been independently inspected.
