# Contributing to DegreeSteps

Start with a specific student problem, a reproducible defect, or an exact academic mapping that needs improvement. Keep changes focused enough for another contributor to review without the conversation that produced them.

## Development

1. Use Node.js 24, Python 3, and `npm ci --ignore-scripts` with the committed lockfile.
2. Create a branch for the change. Keep the active production source remote and deployment identity intact.
3. Use synthetic courses, transcripts, accounts, and provider responses. Never add real transcripts, student details, tokens, cookies, or production database exports.
4. Run the checks in the README. Build before running Worker boundary tests. Add a meaningful regression test for changes to allocation, ownership, data preservation, migration, or paid-provider behavior.
5. Open a pull request describing the concrete trigger, resulting behavior, and validation. Include screenshots only when obtained from an actual supported browser using synthetic data.

## Academic contributions

A transfer claim needs evidence for the exact receiving school, program, catalog, learning format, original course/version, credit quantity, and applicable conditions. Link the primary source and record its review date. Forums and community outcomes are useful leads, but they do not become an official equivalency simply by being popular.

Update authoritative research inputs and their generated artifacts together. Run the relevant generator in check mode. Do not alter academic quantities, remove exclusions, or promote uncertain work to confirmed credit to make an example balance. Do not edit immutable source snapshots or old migration files to make a test pass.

## Data and security boundaries

- Preserve original source facts and separate them from receiving-school awards.
- Preserve owner-scoped access, explicit account-save consent, compare-and-swap revisions, and private/public data separation.
- Keep credentials server-side. Publishable Supabase keys and public client IDs are not privileged secrets; secret/service-role keys are.
- Retain existing storage keys, cookies, events, and authenticated-encryption identifiers unless the change includes a tested compatible migration.
- Use bounded requests, pagination, retry limits, and explicit cost controls. Do not run production stress tests or paid AI calls as an incidental unit test.

For a suspected vulnerability, use the repository owner's private security-reporting channel. If GitHub private vulnerability reporting is enabled, use it. Do not disclose exploit details or real academic records in a public issue.

## Dependencies and generated files

Pin dependency versions and include the lockfile. Review licenses and install behavior before adding a package. Local PDF/Excel readers must remain fixed, same-origin assets; a runtime CDN must not receive student files. Vendor changes need updated hashes and licensing artifacts.

Treat `dist/` as source plus generated public content. Do not delete it as though it were a disposable build output. Keep local build outputs, screenshots, archives, local databases, and credentials out of commits.

## Reviews and releases

Use the pull request template. A passing CI job does not replace academic review, browser checks, security review, or staged capacity verification where those apply. Production publishing remains a separate owner-controlled action. No pull-request workflow receives production credentials or publishes automatically.
