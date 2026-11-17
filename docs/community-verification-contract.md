# Community outcome evidence

Course-transfer targets exclude university-only requirements and the receiving university's own course options. A badge describes a particular outside-credit placement, not completion of home-university coursework.

These endpoints extend the shared D1 community API at `/api/community`. They store real, voluntary reports; no example evidence, users, votes, or approval badges are seeded. The schema adds only `community_evidence` and `community_evidence_flags`. Apply the new generated `drizzle/0001_*.sql` migration after the existing immutable `0000` migration. Requests never create or alter tables.

Every response is uncached JSON. All writes reuse trusted Sites identity, same-origin `Origin`, `X-Community-Request: 1`, Fetch Metadata checks, and JSON payload validation. Evidence create/edit/delete uses the existing 12/hour `publish` limit, flags use `report` (15/hour), and moderator reviews/removals use `moderation` (120/hour). Author identity and alias always come from the authenticated stored account; payload identity, reviewer, role, fingerprint, transcript, attachment, and unknown fields are rejected.

## Exact targets

```json
{"kind":"course","programId":"tesu-general-management","requirementId":"enc1010","courseId":"sophia-enc1010-3","catalogYear":"2026-2027"}
```

Course targets require that exact program, requirement, and option combination in the server's bundled public TESU or Liberty model. Base and conditional transfer-waiver requirements are both recognized. An ID from another program, a matching course title, a provider alias, a vote, or a source URL cannot widen that scope. Local previews and SQLite tests may supply the same public models as `env.COMMUNITY_CATALOGS`; the production Worker reads its bundled static assets and caches their parsed models. No external catalog service is called.

```json
{"kind":"plan","postId":"public-post-id","catalogYear":"2026-2027"}
```

A plan target must reference a live post with a deliberately published public `plan`. Unknown or deleted posts fail with 404; posts without a plan fail with 400. The server hashes the live plan's school/program IDs, total credits, and sorted course selections (requirement ID, course ID, provider, credits) using SHA-256. The resulting `curriculumFingerprint` partitions evidence. Changing an actual course, its credited amount/provider/requirement, the school/program, or total credits invalidates the old badge; changing post discussion text, course display labels, strategy, or course ordering does not. Old reports remain stored against the former fingerprint and do not appear or count under a changed curriculum. Submissions recheck that the public plan remained unchanged during the request and return 409 if it changed.

`catalogYear` accepts an exact `YYYY` or consecutive `YYYY-YYYY` pair between 1900 and 2199. There is no inferred “current” catalog. Years, schools, programs, requirement IDs, provider course IDs, posts, and plan fingerprints never share aggregates across scopes.

## Submit or replace the current account's report

`POST /evidence` accepts only:

```json
{
  "target":{"kind":"course","programId":"tesu-general-management","requirementId":"enc1010","courseId":"sophia-enc1010-3","catalogYear":"2026-2027"},
  "outcome":"success",
  "evaluatedOn":"2026-10-30",
  "details":"The school evaluated this course for this exact requirement. Personal information has been removed.",
  "evidenceUrl":"https://example.org/redacted-evaluation",
  "consent":true
}
```

`outcome` is `success`, `changed`, or `rejected`. `evaluatedOn` is a real UTC calendar date in `YYYY-MM-DD`, no earlier than 1900 and no later than today. Details are 1–1000 characters of plain text; control characters and HTML tags are rejected. `evidenceUrl` is optional/null and must be an HTTP(S) URL without credentials, at most 2048 characters. Localhost, private IPv4 ranges, IPv6 literals, local/internal/test/invalid hosts, and hosts without a public-style domain are rejected. The API does not fetch links or establish that their contents are authentic; a moderator must review supporting evidence.

The form must explain that `consent:true` confirms an actual school evaluation or degree conferral, consents to public publication, and confirms the submission and linked evidence are redacted. Do not publish transcripts, names, student numbers, credentials, private attachments, or private account/evaluation links. The service does not accept uploads.

The unique database key is account + exact target + catalog + curriculum fingerprint. Retrying or editing replaces that account's report; it never creates a second independent success. Every replacement resets review to `pending`, clears the old reviewer/note/date, records fresh consent, and restores an author's previously deleted report to pending. Reports are not merged across accounts based on an alias. Response: `{item: EvidenceReport}`, 201.

## Read reports and summaries

`GET /evidence` uses the exact target fields as query parameters, plus optional `limit` (1–50, default 20) and opaque `cursor`. Unknown or repeated query keys fail. It returns:

```json
{
  "target":{"kind":"plan","postId":"public-post-id","catalogYear":"2026-2027"},
  "curriculumFingerprint":"server-computed-64-character-hash",
  "summary":{"status":"unreported","reportCount":0,"recentSuccesses":0,"reviewedSuccesses":0,"recentConflicts":0,"oldReports":0,"latestEvaluatedOn":null},
  "items":[],
  "cursor":null,
  "own":null,
  "disclaimer":"Community evidence only. A reviewed report is not university approval, a transfer guarantee, or an automatic credit award. Confirm your own catalog and evaluation with the school."
}
```

Course fingerprints are `null`. Public `items` omit dismissed and deleted reports and sort newest by creation time and ID. `own` contains the signed-in account's report for this exact scope, including a dismissed report, or `null`. Aggregates cover the complete scope independently of pagination. Public reports include:

```text
{id,target,curriculumFingerprint,outcome,evaluatedOn,details,evidenceUrl,
 reviewStatus,author:{alias,isYou},createdAt,updatedAt,reviewedAt,
 canDelete,canFlag,flaggedByYou}
```

`reviewStatus` is `pending`, `reviewed`, or `dismissed`. Creation/update/review timestamps are Unix milliseconds; the school evaluation date remains a date string. Authors can see their own `reviewNote`. Moderators also receive `reviewNote`, `canReview`, and `flagCount`. Public responses never include account IDs, emails, reviewer IDs, consent timestamps, flag reasons, or flagger identities. Report IDs are public action identifiers. Render text with escaping/textContent, and render links with safe external-link attributes.

`GET /evidence/summary?programId=...&catalogYear=2026-2027` is a single worksheet request returning `{items:[{target,summary}],disclaimer}`. It includes only course targets with non-dismissed, non-deleted reports that still match an allowed course/requirement in that exact current program. Missing targets mean `unreported`; the response creates no empty evidence records. This avoids an HTTP request for every course row. No other query fields are supported.

Summary counts are computed in SQLite with distinct-account aggregates rather than loading personal report rows into Worker memory. The worksheet query restricts grouped target keys to the current model's finite course-option list using one JSON1 parameter, so it also stays below D1's bound-parameter limit. Individual reports use a separately bounded SQL page and an independent own-report lookup; pagination never truncates the aggregate counts.

## Badge calculation

“Recent” means evaluated on or after the same calendar date 12 months ago (clamped for leap years), using server UTC time. Deleted/dismissed reports do not count. Sets of account IDs, rather than report or vote totals, determine counts.

1. Any recent, non-dismissed `changed` or `rejected` report produces `mixed`, including a pending conflict.
2. Otherwise, at least two distinct accounts with recent `success`, moderator `reviewed` status, a public evidence URL, and no unresolved evidence flags produce `community-verified`.
3. Otherwise, any recent success produces `student-reported`; a pending success or success without a public URL cannot earn the verified badge.
4. Otherwise, existing older non-dismissed reports produce `outdated`.
5. No non-dismissed evidence produces `unreported`.

`reportCount` counts all active non-dismissed reports in the exact scope. `recentSuccesses`, `reviewedSuccesses`, and `recentConflicts` count distinct accounts under the rules above. `oldReports` counts reports older than the window; `latestEvaluatedOn` is the latest non-dismissed evaluation date. Likes, upvotes, editorial source mappings, and planner choices are never read by this calculation. A reviewed community badge never awards planner credits or guarantees university approval.

## Removal, flags, and review

| Endpoint | Authorization and payload | Response |
| --- | --- | --- |
| `DELETE /evidence/:id` | Author or moderator; no body | `{deleted:true}` |
| `POST /evidence/:id/flags` | Signed-in account other than the author; `{reason}` (plain text 3–1000) | `{flagged:true}`, 201 |
| `GET /moderation/evidence` | Moderator; optional `status=pending\|flagged\|reviewed\|dismissed`, `limit`, `cursor` | `{items,cursor}` |
| `PATCH /evidence/:id/review` | Moderator other than report author; `{status:"reviewed"\|"dismissed",note?:"plain text 1–1000"}` | `{item:EvidenceReport}` |

Deletion is soft and immediately removes the report from counts, public lists, and moderation queues. A flag is unique per account/report. Unresolved retries retain the original reason and do not add flags; after moderator resolution, a new flag reopens the same row with its new reason and date. Flag reasons are moderator-only. A flagged success stops counting toward the reviewed-success threshold until moderator review resolves its open flags. The default moderation queue includes pending reports and reports with unresolved flags. Moderator items add up to 50 open `flags:[{reason,createdAt}]`, with no flagger IDs or aliases; `flagCount` covers all open flags. A reviewer cannot review their own report. Review resolves flags, and dismissal removes the report from public evidence. Concurrent content edits cause review to return 409 rather than applying a stale decision.

Validation/authentication/errors reuse the API's 400/401/403/404/409/413/415/429/503 JSON behavior. Roles are stored server-side; there is no client role or review-status field on submissions. A school official is not implied by a moderator role.

## Local verification

`node server/community.test.mjs` runs 31 actual SQLite/D1-compatible API tests. Cases cover exact scope and catalog isolation, consent/privacy/CSRF, duplicate-account upserts, review requirements, self-review, conflicts and dismissal, stale dates, live plan fingerprints, votes independence, flags, removals, inherited rate limits, trailing-dot local URL rejection, paginated full-scope aggregates, and conditional waiver-course scope. The generated migration adds tables/indexes without changing the first migration or the existing `community_reports` target constraints. Production D1 application and trusted Sites identity dispatch are verified by the deployment workflow.
