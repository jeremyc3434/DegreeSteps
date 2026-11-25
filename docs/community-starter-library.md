# DegreeSteps starter discussions

The library supplies 200 example student situations and 400 prepared guide answers. Eight branded DegreeSteps guide profiles publish this editorial material. They are non-login publishing identities, not students, employees with claimed credentials, or invented customers. No reactions, outcome reports, student histories, or verification badges are manufactured.

The feed and thread label starter content. Guide answers and student replies have separate counts. Real student posts precede starter material; the source filter can show either collection. Existing reply, reaction, report, and moderator controls apply. An exact school/course context can also expose a link from an otherwise empty contextual discussion to related starter questions.

## Content and publication

The three `content/community/starters-*.json` files contain school pathways (80), credit sources (60), and student situations (60). `starter-profiles.json` defines the eight branded aliases. Each question identifies its fictional scenario, has two practical responses, and links to an existing DegreeSteps destination or an official source. Prepared guidance does not create a completed course, university acceptance, or a ready degree template.

Run `node scripts/build-community-starters.mjs` after reviewing edits. The generator validates the content and produces `starter-library.sql` and `starter-library-report.json`. `npm run build` checks that both outputs match their reviewed sources. Hashed publication IDs keep source identities stable and interleave topics rather than presenting an entire school batch first.

The deployment workflow publishes the SQL to the selected D1 database **after** deploying the Worker and configuring its secrets. This ensures the attribution-aware API is running before the starter posts appear. There is no Supabase account creation, password provisioning, new account-data tables or columns, or content insertion inside web requests. A covering comment index adds the author ID to the existing chronological index so guide/student counts avoid loading comment bodies. Normal test databases remain empty; dedicated tests explicitly load the editorial library.

Guarded upserts only correct matching, active, guide-authored material when its public content changed. They preserve original creation dates, unchanged update dates, real reactions, student replies, and moderator removals. Identical re-publication adds no records or activity. Guide identities are blocked before authentication/owner bootstrap and cannot submit transfer evidence. Members cannot claim the reserved guide aliases or grant themselves the guide marker.

## Review and moderation

Correct a source claim in the JSON and regenerate the reviewed SQL. A changed body is an actual editorial revision; it does not refresh the creation date. Use the normal moderation controls to remove an obsolete thread or answer. Subsequent deployments leave that removal intact. Removing an item only from a source file does not remove its published copy; deliberately moderate that copy as well. Never reset all community tables or replace student records to update this library.

Check factual scope against the linked school, provider, exact course version and receiving requirement. Prefer current plan/source links over hardcoded promotions, tuition amounts, completion promises, or universal transfer rules. The publication date describes the editorial release, not a new review of every linked university policy.

Verification covers all 200/400 records, SQL idempotence and corrections, moderation tombstones, collisions with student records, trusted attribution, source-aware pagination, authenticated contributions, and the mobile/desktop feed and thread UI. These are synthetic QA cases, not evidence of real student adoption.
