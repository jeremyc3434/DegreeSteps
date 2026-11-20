import { sqliteTable, text, integer, index, primaryKey, unique, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('community_users', {
  id: text('id').primaryKey(),
  alias: text('alias').notNull().default('Community member'),
  role: text('role').notNull().default('member'),
  createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull()
}, t => [check('community_user_alias_length',sql`length(${t.alias}) BETWEEN 2 AND 40`),check('community_user_role',sql`${t.role} IN ('member','moderator','owner')`)]);

export const posts = sqliteTable('community_posts', {
  id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),
  context:text('context').notNull(),kind:text('kind').notNull(),title:text('title').notNull(),body:text('body').notNull(),
  url:text('url'),planJson:text('plan_json'),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),deletedAt:integer('deleted_at')
},t=>[index('community_posts_feed').on(t.deletedAt,t.createdAt,t.id),index('community_posts_context').on(t.context,t.deletedAt,t.createdAt,t.id),index('community_posts_kind').on(t.kind,t.deletedAt,t.createdAt,t.id),index('community_posts_author').on(t.userId,t.deletedAt,t.createdAt,t.id),check('community_post_context_length',sql`length(${t.context}) BETWEEN 3 AND 180`),check('community_post_kind',sql`${t.kind} IN ('question','plan','template')`),check('community_post_title_length',sql`length(${t.title}) BETWEEN 3 AND 160`),check('community_post_body_length',sql`length(${t.body}) BETWEEN 1 AND 6000`)]);

export const reactions = sqliteTable('community_reactions', {
  postId:text('post_id').notNull().references(()=>posts.id),userId:text('user_id').notNull().references(()=>users.id),reaction:text('reaction').notNull(),createdAt:integer('created_at').notNull()
},t=>[primaryKey({columns:[t.postId,t.userId,t.reaction]}),index('community_reactions_user').on(t.userId,t.createdAt),check('community_reaction_kind',sql`${t.reaction} IN ('like','upvote')`)]);

export const contextReactions = sqliteTable('community_context_reactions', {
  context:text('context').notNull(),userId:text('user_id').notNull().references(()=>users.id),reaction:text('reaction').notNull(),createdAt:integer('created_at').notNull()
},t=>[primaryKey({columns:[t.context,t.userId,t.reaction]}),check('community_context_reaction_context_length',sql`length(${t.context}) BETWEEN 3 AND 180`),check('community_context_reaction_kind',sql`${t.reaction} IN ('like','upvote')`)]);

export const comments = sqliteTable('community_comments', {
  id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),context:text('context').notNull(),parentId:text('parent_id').references(()=>comments.id),body:text('body').notNull(),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),deletedAt:integer('deleted_at')
},t=>[index('community_comments_context').on(t.context,t.deletedAt,t.createdAt,t.id),check('community_comment_context_length',sql`length(${t.context}) BETWEEN 3 AND 180`),check('community_comment_body_length',sql`length(${t.body}) BETWEEN 1 AND 3000`)]);

export const reports = sqliteTable('community_reports', {
  id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),targetType:text('target_type').notNull(),targetId:text('target_id').notNull(),reason:text('reason').notNull(),status:text('status').notNull().default('open'),createdAt:integer('created_at').notNull(),reviewedAt:integer('reviewed_at'),reviewedBy:text('reviewed_by').references(()=>users.id)
},t=>[unique('community_reports_user_target').on(t.userId,t.targetType,t.targetId),index('community_reports_queue').on(t.status,t.createdAt,t.id),check('community_report_target_type',sql`${t.targetType} IN ('post','comment')`),check('community_report_reason_length',sql`length(${t.reason}) BETWEEN 3 AND 1000`),check('community_report_status',sql`${t.status} IN ('open','reviewed','dismissed')`)]);

export const rateLimits = sqliteTable('community_rate_limits', {
  userId:text('user_id').notNull().references(()=>users.id),action:text('action').notNull(),windowStart:integer('window_start').notNull(),count:integer('count').notNull()
},t=>[primaryKey({columns:[t.userId,t.action]}),check('community_rate_action',sql`${t.action} IN ('publish','comment','reaction','report','profile','moderation')`),check('community_rate_positive',sql`${t.count}>0`)]);

export const evidence = sqliteTable('community_evidence', {
  id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>users.id),
  targetKind:text('target_kind').notNull(),targetKey:text('target_key').notNull(),
  programId:text('program_id'),requirementId:text('requirement_id'),courseId:text('course_id'),postId:text('post_id').references(()=>posts.id),
  catalogYear:text('catalog_year').notNull(),curriculumFingerprint:text('curriculum_fingerprint').notNull().default(''),
  outcome:text('outcome').notNull(),evaluatedOn:text('evaluated_on').notNull(),details:text('details').notNull(),evidenceUrl:text('evidence_url'),
  consentAt:integer('consent_at').notNull(),reviewStatus:text('review_status').notNull().default('pending'),
  reviewNote:text('review_note'),reviewedAt:integer('reviewed_at'),reviewedBy:text('reviewed_by').references(()=>users.id),
  createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),deletedAt:integer('deleted_at')
},t=>[
  unique('community_evidence_user_scope').on(t.userId,t.targetKey,t.catalogYear,t.curriculumFingerprint),
  index('community_evidence_scope').on(t.targetKey,t.catalogYear,t.curriculumFingerprint,t.deletedAt),
  index('community_evidence_program').on(t.programId,t.catalogYear,t.deletedAt),
  index('community_evidence_queue').on(t.reviewStatus,t.deletedAt,t.createdAt,t.id),
  check('community_evidence_target',sql`(${t.targetKind} = 'course' AND ${t.programId} IS NOT NULL AND ${t.requirementId} IS NOT NULL AND ${t.courseId} IS NOT NULL AND ${t.postId} IS NULL AND ${t.curriculumFingerprint} = '') OR (${t.targetKind} = 'plan' AND ${t.programId} IS NULL AND ${t.requirementId} IS NULL AND ${t.courseId} IS NULL AND ${t.postId} IS NOT NULL AND length(${t.curriculumFingerprint}) = 64)`),
  check('community_evidence_outcome',sql`${t.outcome} IN ('success','changed','rejected')`),
  check('community_evidence_date_length',sql`length(${t.evaluatedOn}) = 10`),
  check('community_evidence_catalog_length',sql`length(${t.catalogYear}) IN (4,6,9)`),
  check('community_evidence_details_length',sql`length(${t.details}) BETWEEN 1 AND 1000`),
  check('community_evidence_review_status',sql`${t.reviewStatus} IN ('pending','reviewed','dismissed')`),
  check('community_evidence_review_note_length',sql`${t.reviewNote} IS NULL OR length(${t.reviewNote}) BETWEEN 1 AND 1000`)
]);

export const evidenceFlags = sqliteTable('community_evidence_flags', {
  evidenceId:text('evidence_id').notNull().references(()=>evidence.id),userId:text('user_id').notNull().references(()=>users.id),
  reason:text('reason').notNull(),createdAt:integer('created_at').notNull(),resolvedAt:integer('resolved_at')
},t=>[primaryKey({columns:[t.evidenceId,t.userId]}),index('community_evidence_flags_queue').on(t.resolvedAt,t.evidenceId),check('community_evidence_flag_reason_length',sql`length(${t.reason}) BETWEEN 3 AND 1000`)]);

export * from '../server/portal-schema.mjs';
export * from '../server/curriculum-schema.mjs';

export * from './college-schema.mjs';
export * from './research-schema.mjs';
export * from './ai-connections-schema.mjs';
export * from './research-progress-schema.mjs';
export * from './transcript-import-schema.mjs';
export * from './research-jobs-schema.mjs';
export * from './academic-coverage-schema.mjs';
export * from './growth-schema.mjs';
export * from './coach-schema.mjs';
