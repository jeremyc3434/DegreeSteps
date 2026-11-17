import { sqliteTable, text, integer, index, primaryKey, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const portalProfiles = sqliteTable('portal_profiles', {
  id:text('id').primaryKey(), alias:text('alias').notNull().default('Student'),
  createdAt:integer('created_at').notNull(), updatedAt:integer('updated_at').notNull()
}, t => [check('portal_profile_alias_length',sql`length(${t.alias}) BETWEEN 2 AND 60`)]);

export const portalPlans = sqliteTable('portal_plans', {
  id:text('id').primaryKey(), userId:text('user_id').notNull().references(()=>portalProfiles.id,{onDelete:'cascade'}),
  title:text('title').notNull(), school:text('school').notNull().default(''), degree:text('degree').notNull().default(''),
  stateJson:text('state_json').notNull(), revision:integer('revision').notNull().default(1),
  createdAt:integer('created_at').notNull(), updatedAt:integer('updated_at').notNull()
}, t => [
  index('portal_plans_owner').on(t.userId,t.updatedAt,t.id),
  check('portal_plan_title_length',sql`length(${t.title}) BETWEEN 1 AND 120`),
  check('portal_plan_school_length',sql`length(${t.school}) <= 120`),
  check('portal_plan_degree_length',sql`length(${t.degree}) <= 200`),
  check('portal_plan_state_limit',sql`length(CAST(${t.stateJson} AS BLOB)) <= 524288 AND json_valid(${t.stateJson})`),
  check('portal_plan_revision_positive',sql`${t.revision} > 0`)
]);

export const portalRateLimits = sqliteTable('portal_rate_limits', {
  userId:text('user_id').notNull().references(()=>portalProfiles.id,{onDelete:'cascade'}),
  action:text('action').notNull(), windowStart:integer('window_start').notNull(), count:integer('count').notNull()
}, t => [primaryKey({columns:[t.userId,t.action]}),
  check('portal_rate_action',sql`${t.action} IN ('save','profile','delete')`),
  check('portal_rate_positive',sql`${t.count} > 0`)
]);
