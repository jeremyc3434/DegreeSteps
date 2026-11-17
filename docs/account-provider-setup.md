# Connect email and Google accounts

The website and device-local builder can run without an authentication provider. Email and Google accounts are **not live** until the setup below is completed and tested. The public account page reads the provider status and must not pretend sign-in is available when configuration is missing.

## 1. Create the managed authentication project

Create a Supabase project under an account owned by DegreePath. Supabase manages passwords, confirmation mail, account recovery and the Google identity integration. DegreePath stores its private plans in the existing Sites D1 database, keyed to the verified Supabase user ID; a Supabase application database is not needed for plan storage.

In Supabase’s project settings, obtain the project URL and **publishable key** (or the older `anon` key). Do not use a `service_role` or `sb_secret_` key. The adapter rejects secret keys. No Supabase administrator key or Google client secret belongs in the DegreePath browser code.

Configure these production runtime variables through Sites, then deploy the saved version to apply them:

- `PORTAL_SUPABASE_URL`: the HTTPS project origin, such as `https://<project-ref>.supabase.co`.
- `PORTAL_SUPABASE_PUBLISHABLE_KEY`: that project’s publishable/anonymous key.

Keep the existing `COMMUNITY_ADMIN_EMAIL` and other runtime values intact. The publishable key is not a server administrator credential, but using runtime configuration avoids hard-coding the project identity and makes a future account-owner transfer easier.

## 2. Set the site and email redirect URLs

Current public origin:

`https://degreepath-open-2026.ccollins203.chatgpt.site`

In Supabase Authentication URL configuration:

- Site URL: `https://degreepath-open-2026.ccollins203.chatgpt.site`.
- Allowed redirect URL: `https://degreepath-open-2026.ccollins203.chatgpt.site/auth/complete`.

Enable email/password sign-in and email confirmation. PKCE signup requires confirmation to be enabled. Use a suitable minimum password policy; the DegreePath form requires at least 10 characters. Before public promotion, configure a verified sender/custom SMTP service and check Supabase’s current email restrictions, rate limits and deliverability guidance. The default sender is intended for limited testing, not a large student launch.

The email flow uses Supabase’s standard PKCE protocol. Students must open confirmation and reset links in the browser where they started the request, within the allowed time. The form and confirmation messages disclose this. Email links opened on a different device/browser fail safely and require a new request. This implementation does not claim automatic cross-device email-link completion.

When a custom DegreePath domain is selected, add its exact `/auth/complete` URL in Supabase before changing the production canonical origin. Keep the prior redirect URL during migration. Validate confirmation and recovery on the new domain; cookies belong to the domain that issued them.

## 3. Enable Google in Supabase

In a Google Cloud project owned by DegreePath, configure the OAuth consent screen and create a Web application OAuth client. Add the application origins needed by Google’s configuration. Use the **Supabase callback URL shown in its Google provider settings** as the authorized Google redirect URI, normally:

`https://<project-ref>.supabase.co/auth/v1/callback`

Enter the Google client ID and client secret directly in Supabase’s Google provider settings and enable the provider. Do not put the Google secret into DegreePath, source control or a chat message. Set the consent screen publishing/test-user status for the intended audience and complete any Google verification that Google requires.

The browser enters Google sign-in through DegreePath’s top-level `/auth/google` link. Supabase handles the Google callback and returns a one-use authorization code to DegreePath’s `/auth/complete`; DegreePath exchanges it with the HttpOnly PKCE verifier created in that browser.

## 4. Verify the finished account experience

On the actual production origin, check:

1. `/api/auth/status` reports `configured:true` and both `email` and `google` in `providers`.
2. Create an email account, confirm in the initiating browser, sign out, and sign in again.
3. Request a password reset, open it in the initiating browser, choose a new password, and sign in with it.
4. Sign in with Google using an allowed test user or a published consent-screen configuration.
5. Save a plan explicitly to account A; sign out and confirm account B cannot see, open, update or delete it.
6. Open a saved plan from a different device. A changed revision must produce a conflict rather than silently overwriting another device’s work.
7. Confirm sign-out clears the current browser session and that saved private learning is never published as a community preview automatically.

Provider verification has **not** been performed with live credentials in this implementation. Unit tests use a local fake provider response to verify the protocol, server authorization, cookies, errors and redirect boundaries. A fake provider is never enabled by a public request parameter or a production build setting.

## Server contract

- `GET /api/auth/status`: `{configured,providers,recovery,message?}`. Enabled providers come from Supabase’s public `/settings` response, not an assumption that adding a project key also enables Google.
- `POST /api/auth/signup`: `{email,password,returnTo?}`; returns an explicit email-confirmation message, or a verified session if the provider issues one.
- `POST /api/auth/login`: `{email,password,returnTo?}`; validates `/user`, sets cookies and returns a safe local return path.
- `POST /api/auth/forgot`: `{email,returnTo?}`; returns the same message for existing and unknown emails.
- `POST /api/auth/passwordchange`: `{password}`; requires a verified session, updates the password, revokes provider refresh sessions and clears local auth cookies.
- `POST /api/auth/logout`: `{}`; clears the current browser’s auth cookies even during a provider outage.
- `GET /auth/google?returnTo=/account.html`: top-level navigation to the enabled Google provider using PKCE.
- `GET /auth/complete?code=…`: server-only one-time code exchange. Signup returns `auth=confirmed`; recovery returns `mode=recovery` on `/account.html`. Errors return a bounded `authError` code.

Every JSON write requires the same-origin `Origin`, `Content-Type: application/json` and `X-Portal-Request: 1`. Request bodies are bounded to 16 KiB, provider responses to 100 KB, and each fully encoded session cookie to 4,000 bytes. An oversized session fails explicitly rather than claiming the browser saved it. Tokens stay in `__Host-` cookies with `Secure`, `HttpOnly`, `SameSite=Lax` and `Path=/`. They never appear in JSON responses, application localStorage or the saved degree plan. The server verifies each access token through Supabase `/user` and refreshes expired sessions through Supabase, without trusting unsigned JWT claims or client-supplied user IDs.

`resolvePortalIdentity(request,env)` returns `{configured,user,setCookies,accessToken?}` for trusted server integration. Apply its `setCookies` array to the eventual private API response. `accessToken` is server-only and must never be sent to the browser. A temporary provider outage returns `unavailable:true` without erasing an otherwise usable refresh cookie; an invalid refresh clears the session.

## Official protocol references

Verified against the official Supabase sources and documentation on November 1, 2026:

- [Supabase PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- [Supabase Google login](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase email/password authentication](https://supabase.com/docs/guides/auth/passwords)
- [Supabase production email guidance](https://supabase.com/docs/guides/auth/auth-smtp)
- [Official Auth client REST calls](https://raw.githubusercontent.com/supabase/auth-js/master/src/GoTrueClient.ts)
- [Official PKCE helpers](https://raw.githubusercontent.com/supabase/auth-js/master/src/lib/helpers.ts)
