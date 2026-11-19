import { sqliteTable, text, integer, primaryKey, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// One counter per public event/day/context/allowlisted degree, never a visitor log.
export const growthDailyCounts=sqliteTable('growth_daily_counts',{
  day:text('day').notNull(),event:text('event').notNull(),context:text('context').notNull(),
  planId:text('plan_id').notNull().default(''),count:integer('count').notNull().default(1)
},t=>[
  primaryKey({columns:[t.day,t.event,t.context,t.planId]}),
  check('growth_day_format',sql`length(${t.day})=10 AND ${t.day} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`),
  check('growth_event_enum',sql`${t.event} IN ('landing_view','plan_previewed','course_saved','plan_started','account_plan_saved','first_task_completed')`),
  check('growth_context_enum',sql`${t.context} IN ('home','article','provider','school','degree-plan','workspace')`),
  check('growth_plan_scope',sql`${t.planId} IN ('','wgu-catalog-ecceaa488637ac83','liberty-business-residential','liberty-criminal-justice-online','liberty-criminal-justice-residential')`),
  check('growth_count_bounds',sql`${t.count} BETWEEN 1 AND 1000000`)
]);
