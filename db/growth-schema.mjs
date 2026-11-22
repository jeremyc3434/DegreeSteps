import { sqliteTable, text, integer, primaryKey, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// One counter per public event/day/context/published plan/fixed detail, never a visitor log.
// plan_id holds a plan id from the public plan library index (validated by the Worker) or ''.
// detail holds one fixed value: a provider name for provider_click, open/copy for school_email, or ''.
export const growthDailyCounts=sqliteTable('growth_daily_counts',{
  day:text('day').notNull(),event:text('event').notNull(),context:text('context').notNull(),
  planId:text('plan_id').notNull().default(''),detail:text('detail').notNull().default(''),count:integer('count').notNull().default(1)
},t=>[
  primaryKey({columns:[t.day,t.event,t.context,t.planId,t.detail]}),
  check('growth_day_format',sql`length(${t.day})=10 AND ${t.day} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`),
  check('growth_event_enum',sql`${t.event} IN ('landing_view','plan_previewed','course_saved','plan_started','account_plan_saved','first_task_completed','finder_used','guided_started','guided_results','plan_built','credits_worth_used','transfer_page_view','provider_click','school_email','share_link_copied')`),
  check('growth_context_enum',sql`${t.context} IN ('home','article','provider','school','degree-plan','workspace','transfer')`),
  check('growth_plan_scope',sql`${t.planId}='' OR (length(${t.planId}) BETWEEN 1 AND 128 AND ${t.planId} NOT GLOB '*[^a-z0-9-]*')`),
  check('growth_detail_enum',sql`${t.detail} IN ('','Sophia','Study.com','StraighterLine','Saylor','CLEP','DSST','Christian Leaders Institute','other','open','copy')`),
  check('growth_count_bounds',sql`${t.count} BETWEEN 1 AND 1000000`)
]);
