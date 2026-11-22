import { sqliteTable, text, integer, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Email plan alerts (off unless EMAIL_ALERTS_ENABLED=1). One row per student opt-in for one saved account plan.
// email is the verified account email at subscribe time (the only address alerts are sent to). plan_id is the
// public plan-library route the saved plan follows; fingerprint/summary_json describe that public plan when the
// student last heard about it. Unsubscribe tokens are random and stored only as SHA-256 hashes (see below).
export const planAlertSubscriptions=sqliteTable('plan_alert_subscriptions',{
  id:text('id').primaryKey(),userId:text('user_id').notNull(),portalPlanId:text('portal_plan_id').notNull(),planId:text('plan_id').notNull(),
  email:text('email').notNull(),fingerprint:text('fingerprint').notNull(),summaryJson:text('summary_json').notNull(),
  createdAt:integer('created_at').notNull(),confirmedAt:integer('confirmed_at').notNull(),
  lastChangeEmailAt:integer('last_change_email_at'),lastReminderAt:integer('last_reminder_at')
},t=>[
  uniqueIndex('plan_alert_owner_plan').on(t.userId,t.portalPlanId),
  index('plan_alert_plan').on(t.planId),
  check('plan_alert_fingerprint_format',sql`length(${t.fingerprint})=64 AND ${t.fingerprint} NOT GLOB '*[^0-9a-f]*'`),
  check('plan_alert_plan_format',sql`length(${t.planId}) BETWEEN 1 AND 128 AND ${t.planId} NOT GLOB '*[^a-z0-9-]*'`),
  check('plan_alert_email_length',sql`length(${t.email}) BETWEEN 3 AND 254`),
  check('plan_alert_summary_length',sql`length(${t.summaryJson}) BETWEEN 2 AND 2000`)
]);

// Each email carries its own random unsubscribe token so every link that was ever sent keeps working until the
// subscription is removed. Only SHA-256 hashes are stored; rows are deleted with their subscription.
export const planAlertTokens=sqliteTable('plan_alert_tokens',{
  tokenHash:text('token_hash').primaryKey(),
  subscriptionId:text('subscription_id').notNull().references(()=>planAlertSubscriptions.id,{onDelete:'cascade'}),
  createdAt:integer('created_at').notNull()
},t=>[
  index('plan_alert_tokens_subscription').on(t.subscriptionId),
  check('plan_alert_token_hash_format',sql`length(${t.tokenHash})=64 AND ${t.tokenHash} NOT GLOB '*[^0-9a-f]*'`)
]);

// Global daily send counter for the EMAIL_DAILY_CAP safety cap. No addresses or identifiers.
export const emailSendDays=sqliteTable('email_send_days',{
  day:text('day').primaryKey(),count:integer('count').notNull().default(0)
},t=>[
  check('email_send_day_format',sql`length(${t.day})=10 AND ${t.day} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`),
  check('email_send_count_bounds',sql`${t.count} BETWEEN 0 AND 100000`)
]);
