import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const degreeTemplates = sqliteTable('degree_templates', {
  id:text('id').primaryKey(),canonicalKey:text('canonical_key').notNull(),schoolName:text('school_name').notNull(),programName:text('program_name').notNull(),
  level:text('level').notNull(),modality:text('modality').notNull(),catalogYear:text('catalog_year').notNull(),sourceUrl:text('source_url'),
  status:text('status').notNull().default('queued'),artifactJson:text('artifact_json'),unresolvedJson:text('unresolved_json').notNull().default('[]'),
  revision:integer('revision').notNull().default(1),checkedAt:integer('checked_at'),reviewedBy:text('reviewed_by'),reviewedAt:integer('reviewed_at'),reviewNotes:text('review_notes'),
  sourcesReviewed:integer('sources_reviewed').notNull().default(0),academicReviewed:integer('academic_reviewed').notNull().default(0),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull()
},t=>[uniqueIndex('degree_template_identity').on(t.canonicalKey),index('degree_template_ready').on(t.status,t.updatedAt,t.id),index('degree_template_source').on(t.sourceUrl,t.updatedAt,t.id),check('degree_template_status',sql`${t.status} IN ('queued','researching','draft','ready','rejected','failed')`),check('degree_template_artifact',sql`${t.artifactJson} IS NULL OR (json_valid(${t.artifactJson}) AND length(CAST(${t.artifactJson} AS BLOB)) <= 524288)`),check('degree_template_unresolved',sql`json_valid(${t.unresolvedJson})`),check('degree_template_revision',sql`${t.revision}>0`)]);

export const templateRequests = sqliteTable('template_requests', {
  id:text('id').primaryKey(),userId:text('user_id').notNull(),templateId:text('template_id').notNull().references(()=>degreeTemplates.id,{onDelete:'cascade'}),
  details:text('details').notNull().default(''),createdAt:integer('created_at').notNull()
},t=>[uniqueIndex('template_request_owner_degree').on(t.userId,t.templateId),index('template_request_owner').on(t.userId,t.createdAt,t.id),check('template_request_details',sql`length(${t.details}) <= 4000`)]);

export const templateResearchRuns = sqliteTable('template_research_runs', {
  id:text('id').primaryKey(),templateId:text('template_id').notNull().references(()=>degreeTemplates.id,{onDelete:'cascade'}),userId:text('user_id').notNull(),
  status:text('status').notNull(),model:text('model').notNull(),startedAt:integer('started_at').notNull(),finishedAt:integer('finished_at'),inputTokens:integer('input_tokens'),outputTokens:integer('output_tokens'),errorCode:text('error_code')
},t=>[index('template_run_spend_window').on(t.startedAt,t.status),index('template_run_owner_window').on(t.userId,t.startedAt),index('template_run_target').on(t.templateId,t.startedAt),check('template_run_status',sql`${t.status} IN ('running','completed','failed')`)]);
