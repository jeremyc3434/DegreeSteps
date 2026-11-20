import { sqliteTable, text, integer, primaryKey, index, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Degree coach (beta). No IP addresses, names, emails or saved-course summaries are stored.
// Per-visitor daily caps: one row per salted one-way hash of (IP + user agent + day) or (account + day).
export const coachVisitorDays=sqliteTable('coach_visitor_days',{
  day:text('day').notNull(),visitorHash:text('visitor_hash').notNull(),count:integer('count').notNull().default(1)
},t=>[
  primaryKey({columns:[t.day,t.visitorHash]}),
  check('coach_visitor_day_format',sql`length(${t.day})=10 AND ${t.day} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`),
  check('coach_visitor_hash_format',sql`length(${t.visitorHash})=66 AND substr(${t.visitorHash},1,2) IN ('a:','u:')`),
  check('coach_visitor_count_bounds',sql`${t.count} BETWEEN 0 AND 1000`)
]);

// Global daily spend, in millionths of a US dollar, for the server-side spend cap.
export const coachSpendDays=sqliteTable('coach_spend_days',{
  day:text('day').primaryKey(),costMicroUsd:integer('cost_micro_usd').notNull().default(0),calls:integer('calls').notNull().default(0)
},t=>[
  check('coach_spend_day_format',sql`length(${t.day})=10 AND ${t.day} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`),
  check('coach_spend_bounds',sql`${t.costMicroUsd}>=0 AND ${t.calls}>=0`)
]);

// Learning loop: redacted question, tags, tools, plan ids, cost and optional rating. Deleted after 180 days.
export const coachQuestions=sqliteTable('coach_questions',{
  id:text('id').primaryKey(),createdAt:integer('created_at').notNull(),day:text('day').notNull(),
  question:text('question').notNull(),topicsJson:text('topics_json').notNull().default('[]'),toolsJson:text('tools_json').notNull().default('[]'),planIdsJson:text('plan_ids_json').notNull().default('[]'),
  askSchool:integer('ask_school').notNull().default(0),usedSaved:integer('used_saved').notNull().default(0),status:text('status').notNull(),model:text('model').notNull(),
  inputTokens:integer('input_tokens').notNull().default(0),outputTokens:integer('output_tokens').notNull().default(0),cacheWriteTokens:integer('cache_write_tokens').notNull().default(0),cacheReadTokens:integer('cache_read_tokens').notNull().default(0),
  costMicroUsd:integer('cost_micro_usd').notNull().default(0),answer:text('answer').notNull().default(''),
  rating:integer('rating'),ratingReason:text('rating_reason'),ratedAt:integer('rated_at')
},t=>[
  index('coach_questions_created').on(t.createdAt),
  check('coach_question_length',sql`length(${t.question}) BETWEEN 1 AND 1000`),
  check('coach_answer_length',sql`length(${t.answer})<=1500`),
  check('coach_rating_values',sql`${t.rating} IS NULL OR ${t.rating} IN (-1,1)`),
  check('coach_rating_reason_length',sql`${t.ratingReason} IS NULL OR length(${t.ratingReason})<=200`),
  check('coach_flags',sql`${t.askSchool} IN (0,1) AND ${t.usedSaved} IN (0,1)`)
]);
