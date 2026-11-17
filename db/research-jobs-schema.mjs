import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { degreeTemplates } from './research-schema.mjs';

/** Durable dispatch metadata for public degree research. Queue messages contain only its ID. */
export const degreeResearchJobs=sqliteTable('degree_research_jobs',{
 id:text('id').primaryKey(),templateId:text('template_id').notNull().references(()=>degreeTemplates.id,{onDelete:'cascade'}),
 activeTemplateId:text('active_template_id'),userId:text('user_id').notNull(),authorizedAdmin:integer('authorized_admin').notNull().default(0),
 requestedRevision:integer('requested_revision').notNull(),optionsJson:text('options_json').notNull().default('{}'),
 status:text('status').notNull().default('queued'),attempts:integer('attempts').notNull().default(0),
 availableAt:integer('available_at').notNull(),leaseToken:text('lease_token'),leaseUntil:integer('lease_until'),providerStartedAt:integer('provider_started_at'),
 dispatchedAt:integer('dispatched_at'),finishedAt:integer('finished_at'),errorCode:text('error_code'),
 createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull()
},t=>[
 uniqueIndex('degree_research_job_active').on(t.activeTemplateId),
 index('degree_research_job_dispatch').on(t.status,t.availableAt,t.updatedAt),
 index('degree_research_job_owner').on(t.userId,t.createdAt,t.id),
 index('degree_research_job_template').on(t.templateId,t.createdAt,t.id),
 check('degree_research_job_status',sql`${t.status} IN ('queued','dispatched','running','retry','completed','dead')`),
 check('degree_research_job_active_scope',sql`${t.activeTemplateId} IS NULL OR ${t.activeTemplateId}=${t.templateId}`),
 check('degree_research_job_attempts',sql`${t.attempts} BETWEEN 0 AND 3`),
 check('degree_research_job_admin',sql`${t.authorizedAdmin} IN (0,1)`),
 check('degree_research_job_revision',sql`${t.requestedRevision}>0`),
 check('degree_research_job_options',sql`json_valid(${t.optionsJson}) AND length(CAST(${t.optionsJson} AS BLOB))<=4096`)
]);
