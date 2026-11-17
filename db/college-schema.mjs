import { sqliteTable, text, integer, index, primaryKey, unique, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const collegeOrganizations = sqliteTable('college_organizations', {
  id:text('id').primaryKey(),name:text('name').notNull(),website:text('website').notNull(),
  status:text('status').notNull().default('pending'),revision:integer('revision').notNull().default(1),
  createdBy:text('created_by').notNull(),verifiedBy:text('verified_by'),verifiedAt:integer('verified_at'),
  createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull()
}, t => [index('college_organizations_status').on(t.status,t.createdAt,t.id),
  check('college_org_name_length',sql`length(${t.name}) BETWEEN 2 AND 160`),
  check('college_org_website_length',sql`length(${t.website}) BETWEEN 8 AND 1500`),
  check('college_org_status',sql`${t.status} IN ('pending','verified','revoked')`),
  check('college_org_revision',sql`${t.revision} > 0`)]);

export const collegeMemberships = sqliteTable('college_memberships', {
  organizationId:text('organization_id').notNull().references(()=>collegeOrganizations.id),
  userId:text('user_id').notNull(),role:text('role').notNull(),status:text('status').notNull().default('active'),
  grantedBy:text('granted_by').notNull(),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull()
}, t => [primaryKey({columns:[t.organizationId,t.userId]}),index('college_memberships_user').on(t.userId,t.status,t.organizationId),
  check('college_member_role',sql`${t.role} IN ('advisor','admin')`),check('college_member_status',sql`${t.status} IN ('active','revoked')`)]);

export const collegeInterestRequests = sqliteTable('college_interest_requests', {
  id:text('id').primaryKey(),userId:text('user_id').notNull(),organizationId:text('organization_id').notNull().references(()=>collegeOrganizations.id),
  contactName:text('contact_name').notNull(),contactEmail:text('contact_email').notNull(),
  programInterest:text('program_interest').notNull().default(''),studyFormat:text('study_format').notNull().default('either'),startTiming:text('start_timing').notNull().default(''),
  consentVersion:text('consent_version').notNull(),consentText:text('consent_text').notNull(),consentedAt:integer('consented_at').notNull(),withdrawnAt:integer('withdrawn_at'),
  createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull()
},t=>[unique('college_interest_student_org').on(t.userId,t.organizationId),
  index('college_interest_lead_scope').on(t.organizationId,t.withdrawnAt,t.consentedAt,t.id),
  index('college_interest_student').on(t.userId,t.updatedAt,t.id),
  check('college_interest_name_length',sql`length(${t.contactName}) BETWEEN 2 AND 100`),
  check('college_interest_email_length',sql`length(${t.contactEmail}) BETWEEN 3 AND 254`),
  check('college_interest_program_length',sql`length(${t.programInterest}) <= 200`),
  check('college_interest_start_length',sql`length(${t.startTiming}) <= 120`),
  check('college_interest_format',sql`${t.studyFormat} IN ('online','campus','either')`),
  check('college_interest_consent_version',sql`length(${t.consentVersion}) BETWEEN 1 AND 80`),
  check('college_interest_consent_text',sql`length(${t.consentText}) BETWEEN 1 AND 2000`)]);

export const collegeAccessAudit = sqliteTable('college_access_audit', {
  id:text('id').primaryKey(),actorId:text('actor_id').notNull(),action:text('action').notNull(),
  targetId:text('target_id').notNull(),note:text('note').notNull().default(''),organizationId:text('organization_id').references(()=>collegeOrganizations.id),createdAt:integer('created_at').notNull()
},t=>[index('college_access_audit_org').on(t.organizationId,t.createdAt,t.id),
  check('college_access_audit_note_length',sql`length(${t.note}) <= 500`),check('college_access_audit_action',sql`${t.action} IN ('create','verify','revoke','grant-member','revoke-member','consent','withdraw','read-leads')`)]);

export const collegeAccessRateLimits = sqliteTable('college_access_rate_limits', {
  userId:text('user_id').notNull(),action:text('action').notNull(),windowStart:integer('window_start').notNull(),count:integer('count').notNull()
},t=>[primaryKey({columns:[t.userId,t.action]}),check('college_access_rate_action',sql`${t.action} IN ('interest','admin','read')`),check('college_access_rate_count',sql`${t.count}>0`)]);
