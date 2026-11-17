-- DegreePath community. Schema only; applied by the deployment migration runner.
CREATE TABLE IF NOT EXISTS community_users (
  id TEXT PRIMARY KEY,
  alias TEXT NOT NULL DEFAULT 'Community member' CHECK(length(alias) BETWEEN 2 AND 40),
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member','moderator','owner')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS community_posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES community_users(id),
  context TEXT NOT NULL CHECK(length(context) BETWEEN 3 AND 180),
  kind TEXT NOT NULL CHECK(kind IN ('question','plan','template')),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 3 AND 160),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 6000),
  url TEXT,
  plan_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS community_posts_feed ON community_posts(deleted_at, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS community_posts_context ON community_posts(context, deleted_at, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS community_posts_kind ON community_posts(kind, deleted_at, created_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS community_reactions (
  post_id TEXT NOT NULL REFERENCES community_posts(id),
  user_id TEXT NOT NULL REFERENCES community_users(id),
  reaction TEXT NOT NULL CHECK(reaction IN ('like','upvote')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(post_id, user_id, reaction)
);
CREATE INDEX IF NOT EXISTS community_reactions_user ON community_reactions(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS community_context_reactions (
  context TEXT NOT NULL CHECK(length(context) BETWEEN 3 AND 180),
  user_id TEXT NOT NULL REFERENCES community_users(id),
  reaction TEXT NOT NULL CHECK(reaction IN ('like','upvote')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(context, user_id, reaction)
);
CREATE TABLE IF NOT EXISTS community_comments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES community_users(id),
  context TEXT NOT NULL CHECK(length(context) BETWEEN 3 AND 180),
  parent_id TEXT REFERENCES community_comments(id),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 3000),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS community_comments_context ON community_comments(context, deleted_at, created_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS community_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES community_users(id),
  target_type TEXT NOT NULL CHECK(target_type IN ('post','comment')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 3 AND 1000),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewed','dismissed')),
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  reviewed_by TEXT REFERENCES community_users(id),
  UNIQUE(user_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS community_reports_queue ON community_reports(status, created_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS community_rate_limits (
  user_id TEXT NOT NULL REFERENCES community_users(id),
  action TEXT NOT NULL CHECK(action IN ('publish','comment','reaction','report','profile','moderation')),
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL CHECK(count > 0),
  PRIMARY KEY(user_id, action)
);
CREATE TABLE IF NOT EXISTS community_evidence (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES community_users(id),
  target_kind TEXT NOT NULL,
  target_key TEXT NOT NULL,
  program_id TEXT,
  requirement_id TEXT,
  course_id TEXT,
  post_id TEXT REFERENCES community_posts(id),
  catalog_year TEXT NOT NULL CHECK(length(catalog_year) IN (4,6,9)),
  curriculum_fingerprint TEXT NOT NULL DEFAULT '',
  outcome TEXT NOT NULL CHECK(outcome IN ('success','changed','rejected')),
  evaluated_on TEXT NOT NULL CHECK(length(evaluated_on) = 10),
  details TEXT NOT NULL CHECK(length(details) BETWEEN 1 AND 1000),
  evidence_url TEXT,
  consent_at INTEGER NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','reviewed','dismissed')),
  review_note TEXT CHECK(review_note IS NULL OR length(review_note) BETWEEN 1 AND 1000),
  reviewed_at INTEGER,
  reviewed_by TEXT REFERENCES community_users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE(user_id,target_key,catalog_year,curriculum_fingerprint),
  CHECK((target_kind = 'course' AND program_id IS NOT NULL AND requirement_id IS NOT NULL AND course_id IS NOT NULL AND post_id IS NULL AND curriculum_fingerprint = '') OR (target_kind = 'plan' AND program_id IS NULL AND requirement_id IS NULL AND course_id IS NULL AND post_id IS NOT NULL AND length(curriculum_fingerprint) = 64))
);
CREATE INDEX IF NOT EXISTS community_evidence_scope ON community_evidence(target_key,catalog_year,curriculum_fingerprint,deleted_at);
CREATE INDEX IF NOT EXISTS community_evidence_program ON community_evidence(program_id,catalog_year,deleted_at);
CREATE INDEX IF NOT EXISTS community_evidence_queue ON community_evidence(review_status,deleted_at,created_at,id);
CREATE TABLE IF NOT EXISTS community_evidence_flags (
  evidence_id TEXT NOT NULL REFERENCES community_evidence(id),
  user_id TEXT NOT NULL REFERENCES community_users(id),
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 3 AND 1000),
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  PRIMARY KEY(evidence_id,user_id)
);
CREATE INDEX IF NOT EXISTS community_evidence_flags_queue ON community_evidence_flags(resolved_at,evidence_id);
