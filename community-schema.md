# Shared community API

Course outcomes, plan outcomes, verification badges and their separate moderation queue are specified in [the community verification contract](docs/community-verification-contract.md). They are evidence records rather than likes or individual credit awards.

`server/community.mjs` exports `handleCommunity(request, env, ctx)`. Route `/api/community/*` to it from the Worker before serving static assets. `env.DB` is a Cloudflare D1 binding. Apply `db/schema.sql` as a schema-only migration during deployment, never inside a request. The schema creates no example members, posts, comments, or reactions.

Sites dispatch authenticates visitors and supplies `oai-authenticated-user-id` plus optional `oai-authenticated-user-email`. These headers must come from trusted Sites dispatch; do not expose this Worker through another entrypoint that accepts client-supplied identity headers. Sign-in uses a top-level anchor to `/signin-with-chatgpt?return_to=<same-origin-relative-path>`; dispatch owns sign-in and sign-out.

Anyone can read posts and context discussions. Writes require a signed-in identity, matching `Origin`, `Content-Type: application/json` for JSON payloads, and `X-Community-Request: 1`. The API also rejects cross-site Fetch Metadata. DELETE does not need a JSON body. Responses are non-cacheable JSON. Errors have `{error: "message"}` and an appropriate HTTP status (400, 401, 403, 404, 413, 415, 429, 503).

## Prepared starter material

[DegreeSteps starter discussions](docs/community-starter-library.md) are prepared editorial questions and guide answers, visibly labeled as examples. They use reserved non-login publishing profiles, with no synthetic reactions or transfer evidence. Public starter posts/comments add `origin: "degreesteps-starter"` and `author.kind: "degreesteps-guide"`; these markers come only from stored trusted author IDs. Posts expose separate `guideAnswers` and `studentComments` counts in addition to the compatible total `comments`. Feed `source=all|students|starters` defaults to student posts before starter examples, with source-aware cursors. Comment and evidence cursors retain their original format. Normal contextual summaries can add `starterDiscussions` to link to related prepared questions.

## Identity and moderation

Users begin with the alias `Community member`. Only their explicitly chosen alias is public; identity headers, email, internal user IDs, and reporter identities are never included in public posts/comments. `/session` and `/profile` return the current user's own ID, alias, and role.

Optional private runtime configuration `COMMUNITY_ADMIN_EMAIL` bootstraps an owner role when the trusted authenticated email matches. The resulting role belongs to the stable Site user ID and persists if the email environment variable is later absent. Never put this email in frontend code or the public hosting manifest. Additional moderators can be assigned through controlled database administration (`community_users.role = 'moderator'`); there is no client-provided role field. Owners and moderators can read the report queue and remove content. Authors can edit their own posts and remove their own posts/comments. Moderators cannot rewrite someone else's post.

## Contexts and records

Context IDs are stable, case-sensitive strings of the form `school:tesu`, `program:tesu-bsba`, `course:sophia-college-algebra`, `template:seed-tesu-business`, or `post:<post-id>`. The suffix accepts letters, numbers, `.`, `_`, `:`, `/`, and `-`, up to 160 characters. A `post:` context must refer to an existing public post. School, program, course, and editorial-template discussions do not need a placeholder post or fake author. Use the same context ID at every UI entrypoint that should share a discussion.

Post types are `question`, `plan`, and `template`. All text is plain text, with title 3–160 characters, body 1–6000, comment 1–3000, report reason 3–1000, and alias 2–40. Render user text with `textContent` or equivalent escaping. Optional link URLs must be complete HTTP(S) URLs without credentials, at most 2048 characters. No user HTML is accepted as executable markup. Alias markup and email-like aliases are rejected.

## Endpoints

| Method and path | Request | Response |
| --- | --- | --- |
| `GET /session` | — | `{user: {id,alias,role} \| null}` |
| `POST /profile` | `{alias}` | `{user: {id,alias,role}}` |
| `GET /feed` | Optional `context`, `kind`, `mine=1`, `limit`, `cursor` | `{items: Post[],cursor}` |
| `GET /posts/:id` | — | `{item: Post}` |
| `POST /posts` | Full public post payload below | `{item: Post}`, 201 |
| `PATCH /posts/:id` | Full replacement public post payload; author only | `{item: Post}` |
| `DELETE /posts/:id` | Author or moderator | `{deleted:true}` |
| `POST /posts/:id/reactions` | `{reaction:"like"\|"upvote",active:boolean}` | `{item: Post}` |
| `GET /context?context=…` | Context ID | `{context,likes,upvotes,liked,upvoted,comments}` |
| `POST /context/reactions` | `{context,reaction:"like"\|"upvote",active:boolean}` | Same context summary |
| `GET /comments?context=…` | Required context; optional `limit`, `cursor` | `{items: Comment[],cursor}` |
| `POST /comments` | `{context,body,parentId?}` | `{item: Comment}`, 201 |
| `DELETE /comments/:id` | Author or moderator | `{deleted:true}` |
| `POST /reports` | `{targetType:"post"\|"comment",targetId,reason}` | `{reported:true}`, 201 |
| `GET /moderation/reports` | Moderator only; optional `status=open\|reviewed\|dismissed`, `limit`, `cursor` | `{items: Report[],cursor}` |
| `PATCH /moderation/reports/:id` | Moderator only; `{status:"reviewed"\|"dismissed",removeTarget?:boolean}` | `{reviewed:true}` |

All paths in this table are relative to `/api/community`. Lists default to 20 records and accept 1–50. Pass the opaque `cursor` returned by one page to retrieve the next; records sort newest first by timestamp and ID. Query filters use exact context/kind matching, not arbitrary SQL or a global text search. Replies must share the parent's context and use one nesting level. `post:` context reactions use the post reaction table, so using either endpoint never double counts a vote. Editorial seed templates use their stable `template:seed-…` context for real reactions and comments.

`Post` is `{id,kind,context,title,body,url,plan,author:{alias,isYou},createdAt,updatedAt,likes,upvotes,comments,liked,upvoted,canEdit,canDelete}`. `Comment` is `{id,context,parentId,body,author:{alias,isYou},createdAt,updatedAt,canDelete}`. Times are Unix milliseconds. `Report` is visible only to moderators and includes `{id,targetType,targetId,reason,status,reporterAlias,createdAt,reviewedAt,target:{id,body,deleted}|null}`. Normal users cannot list other reporters or report reasons. Repeated reports from the same user against a target retain the first report and do not create duplicates.

## Explicit public plan publication

Ordinary questions and text templates publish `{kind,context,title,body,url?}`. Private drafts and wizard profiles are never stored by this API. A shared plan requires `kind:"plan"`, `publishPublicPlan:true`, and a deliberately constructed `plan` object. A template may optionally include the same public plan. Unknown payload/plan/course fields are rejected, rather than silently forwarding private data.

```json
{
  "kind": "plan",
  "context": "program:tesu-bsba",
  "title": "Business course sequence",
  "body": "A proposed route. Check the official evaluation before enrolling.",
  "publishPublicPlan": true,
  "plan": {
    "schoolId": "tesu",
    "schoolName": "Thomas Edison State University",
    "programId": "tesu-bsba",
    "programName": "BSBA",
    "strategy": "balanced",
    "totalCredits": 120,
    "courses": [{
      "requirementId": "written-communication",
      "requirement": "Written communication",
      "courseId": "english-composition-i",
      "title": "English Composition I",
      "provider": "Sophia",
      "credits": 3,
      "url": "https://www.sophia.org/"
    }]
  }
}
```

Course choices are limited to 1–100. Numeric credits must be finite (0–30 per course; 0–500 total). Publish only proposed curriculum choices. Do not pass a wizard state, learner profile, prior-learning ledger, completed-course transcript, notes, email, age, budget, dates, identity, or evaluation attachments. The allowlist accepts only the fields shown above (plus optional post `url` and optional course `url`). An explicit publish action should make this public scope clear before submitting. A plan is community content, not an official transfer evaluation or acceptance guarantee.

## Data integrity and operating limits

Reactions use explicit active/inactive state and database unique keys per user, target, and reaction. Retrying the same state cannot add duplicate votes. Posts/comments are soft deleted; public reads omit removed records, and a removed post's discussion is no longer exposed. Reporter submissions use a unique user/target key. The server authorizes every ownership/moderator operation using stored roles and the trusted Site identity, never payload identity fields.

Hourly write limits per user: 12 post create/edit/delete operations, 40 comment create/delete operations, 120 reaction operations, 15 reports, 12 alias changes, and 120 moderation actions. The database retains at most six rate rows per user; the current hourly bucket replaces the prior bucket. Limits count repeated reaction requests as requests even when the stored state does not change. The server does not call any third-party services or send notifications.

Local API verification: `node --test server/community.test.mjs` uses Node 24's actual SQLite database through a D1-compatible adapter. Hosted D1 schema/application and trusted identity dispatch still need to be verified through the deployment workflow.
