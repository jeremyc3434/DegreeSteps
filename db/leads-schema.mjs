import { sqliteTable, text, integer, primaryKey, index, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Opt-in revenue features (off unless SCHOOL_INQUIRIES_ENABLED=1 / PLAN_REVIEW_ENABLED=1).
// Only what a student typed into the form, with the exact consent wording shown to them. No IP addresses or
// plans are stored. Rows are deleted 365 days after they are created (scheduled cleanup in server/leads.mjs).
// Nothing here is sent to a school or anyone else automatically: the owner exports and forwards by hand.

// "Have [School] contact me": one row per submission, for a school on the allowlist.
export const schoolInquiries=sqliteTable('school_inquiries',{
  id:text('id').primaryKey(),createdAt:integer('created_at').notNull(),
  planId:text('plan_id').notNull(),planTitle:text('plan_title').notNull(),school:text('school').notNull(),
  firstName:text('first_name').notNull(),email:text('email').notNull(),phone:text('phone').notNull().default(''),
  location:text('location').notNull(),startTiming:text('start_timing').notNull(),priorCredit:text('prior_credit').notNull(),
  consentVersion:text('consent_version').notNull(),consentText:text('consent_text').notNull()
},t=>[
  index('school_inquiries_created').on(t.createdAt),
  check('school_inquiry_plan_format',sql`length(${t.planId}) BETWEEN 1 AND 128 AND ${t.planId} NOT GLOB '*[^a-z0-9-]*'`),
  check('school_inquiry_text_lengths',sql`length(${t.planTitle}) BETWEEN 1 AND 200 AND length(${t.school}) BETWEEN 1 AND 160 AND length(${t.firstName}) BETWEEN 1 AND 60 AND length(${t.email}) BETWEEN 3 AND 254 AND length(${t.phone})<=40 AND length(${t.location}) BETWEEN 2 AND 80`),
  check('school_inquiry_start_timing',sql`${t.startTiming} IN ('this-term','next-6-months','later')`),
  check('school_inquiry_prior_credit',sql`${t.priorCredit} IN ('yes','no')`),
  check('school_inquiry_consent',sql`length(${t.consentVersion}) BETWEEN 1 AND 40 AND length(${t.consentText}) BETWEEN 20 AND 600`)
]);

// Paid "Plan review" demand test: a request to be contacted. No payment is taken.
export const planReviewRequests=sqliteTable('plan_review_requests',{
  id:text('id').primaryKey(),createdAt:integer('created_at').notNull(),
  name:text('name').notNull(),email:text('email').notNull(),planId:text('plan_id').notNull().default(''),planTitle:text('plan_title').notNull().default(''),
  note:text('note').notNull().default(''),offerPrice:integer('offer_price').notNull(),offerCurrency:text('offer_currency').notNull(),offerStatus:text('offer_status').notNull(),
  consentVersion:text('consent_version').notNull(),consentText:text('consent_text').notNull()
},t=>[
  index('plan_review_requests_created').on(t.createdAt),
  check('plan_review_plan_format',sql`${t.planId}='' OR (length(${t.planId}) BETWEEN 1 AND 128 AND ${t.planId} NOT GLOB '*[^a-z0-9-]*')`),
  check('plan_review_text_lengths',sql`length(${t.name}) BETWEEN 1 AND 100 AND length(${t.email}) BETWEEN 3 AND 254 AND length(${t.planTitle})<=200 AND length(${t.note})<=1000`),
  check('plan_review_offer',sql`${t.offerPrice} BETWEEN 0 AND 10000 AND length(${t.offerCurrency})=3 AND ${t.offerStatus} IN ('waitlist','checkout')`),
  check('plan_review_consent',sql`length(${t.consentVersion}) BETWEEN 1 AND 40 AND length(${t.consentText}) BETWEEN 20 AND 600`)
]);

// Submissions per salted one-way hash of (IP + day) and form, like the coach's daily caps. Kept for two days.
export const leadRateLimits=sqliteTable('lead_rate_limits',{
  day:text('day').notNull(),visitorHash:text('visitor_hash').notNull(),kind:text('kind').notNull(),count:integer('count').notNull().default(1)
},t=>[
  primaryKey({columns:[t.day,t.visitorHash,t.kind]}),
  check('lead_rate_day_format',sql`length(${t.day})=10 AND ${t.day} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`),
  check('lead_rate_hash_format',sql`length(${t.visitorHash})=64 AND ${t.visitorHash} NOT GLOB '*[^0-9a-f]*'`),
  check('lead_rate_kind',sql`${t.kind} IN ('school_inquiry','plan_review')`),
  check('lead_rate_count_bounds',sql`${t.count} BETWEEN 0 AND 1000`)
]);
