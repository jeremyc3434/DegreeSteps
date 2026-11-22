CREATE TABLE `lead_rate_limits` (
	`day` text NOT NULL,
	`visitor_hash` text NOT NULL,
	`kind` text NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`day`, `visitor_hash`, `kind`),
	CONSTRAINT "lead_rate_day_format" CHECK(length("lead_rate_limits"."day")=10 AND "lead_rate_limits"."day" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "lead_rate_hash_format" CHECK(length("lead_rate_limits"."visitor_hash")=64 AND "lead_rate_limits"."visitor_hash" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "lead_rate_kind" CHECK("lead_rate_limits"."kind" IN ('school_inquiry','plan_review')),
	CONSTRAINT "lead_rate_count_bounds" CHECK("lead_rate_limits"."count" BETWEEN 0 AND 1000)
);
--> statement-breakpoint
CREATE TABLE `plan_review_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`plan_id` text DEFAULT '' NOT NULL,
	`plan_title` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`offer_price` integer NOT NULL,
	`offer_currency` text NOT NULL,
	`offer_status` text NOT NULL,
	`consent_version` text NOT NULL,
	`consent_text` text NOT NULL,
	CONSTRAINT "plan_review_plan_format" CHECK("plan_review_requests"."plan_id"='' OR (length("plan_review_requests"."plan_id") BETWEEN 1 AND 128 AND "plan_review_requests"."plan_id" NOT GLOB '*[^a-z0-9-]*')),
	CONSTRAINT "plan_review_text_lengths" CHECK(length("plan_review_requests"."name") BETWEEN 1 AND 100 AND length("plan_review_requests"."email") BETWEEN 3 AND 254 AND length("plan_review_requests"."plan_title")<=200 AND length("plan_review_requests"."note")<=1000),
	CONSTRAINT "plan_review_offer" CHECK("plan_review_requests"."offer_price" BETWEEN 0 AND 10000 AND length("plan_review_requests"."offer_currency")=3 AND "plan_review_requests"."offer_status" IN ('waitlist','checkout')),
	CONSTRAINT "plan_review_consent" CHECK(length("plan_review_requests"."consent_version") BETWEEN 1 AND 40 AND length("plan_review_requests"."consent_text") BETWEEN 20 AND 600)
);
--> statement-breakpoint
CREATE INDEX `plan_review_requests_created` ON `plan_review_requests` (`created_at`);--> statement-breakpoint
CREATE TABLE `school_inquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`plan_id` text NOT NULL,
	`plan_title` text NOT NULL,
	`school` text NOT NULL,
	`first_name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`location` text NOT NULL,
	`start_timing` text NOT NULL,
	`prior_credit` text NOT NULL,
	`consent_version` text NOT NULL,
	`consent_text` text NOT NULL,
	CONSTRAINT "school_inquiry_plan_format" CHECK(length("school_inquiries"."plan_id") BETWEEN 1 AND 128 AND "school_inquiries"."plan_id" NOT GLOB '*[^a-z0-9-]*'),
	CONSTRAINT "school_inquiry_text_lengths" CHECK(length("school_inquiries"."plan_title") BETWEEN 1 AND 200 AND length("school_inquiries"."school") BETWEEN 1 AND 160 AND length("school_inquiries"."first_name") BETWEEN 1 AND 60 AND length("school_inquiries"."email") BETWEEN 3 AND 254 AND length("school_inquiries"."phone")<=40 AND length("school_inquiries"."location") BETWEEN 2 AND 80),
	CONSTRAINT "school_inquiry_start_timing" CHECK("school_inquiries"."start_timing" IN ('this-term','next-6-months','later')),
	CONSTRAINT "school_inquiry_prior_credit" CHECK("school_inquiries"."prior_credit" IN ('yes','no')),
	CONSTRAINT "school_inquiry_consent" CHECK(length("school_inquiries"."consent_version") BETWEEN 1 AND 40 AND length("school_inquiries"."consent_text") BETWEEN 20 AND 600)
);
--> statement-breakpoint
CREATE INDEX `school_inquiries_created` ON `school_inquiries` (`created_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_growth_daily_counts` (
	`day` text NOT NULL,
	`event` text NOT NULL,
	`context` text NOT NULL,
	`plan_id` text DEFAULT '' NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`day`, `event`, `context`, `plan_id`, `detail`),
	CONSTRAINT "growth_day_format" CHECK(length("__new_growth_daily_counts"."day")=10 AND "__new_growth_daily_counts"."day" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "growth_event_enum" CHECK("__new_growth_daily_counts"."event" IN ('landing_view','plan_previewed','course_saved','plan_started','account_plan_saved','first_task_completed','finder_used','guided_started','guided_results','plan_built','credits_worth_used','transfer_page_view','provider_click','school_email','share_link_copied','school_inquiry','plan_review_request')),
	CONSTRAINT "growth_context_enum" CHECK("__new_growth_daily_counts"."context" IN ('home','article','provider','school','degree-plan','workspace','transfer')),
	CONSTRAINT "growth_plan_scope" CHECK("__new_growth_daily_counts"."plan_id"='' OR (length("__new_growth_daily_counts"."plan_id") BETWEEN 1 AND 128 AND "__new_growth_daily_counts"."plan_id" NOT GLOB '*[^a-z0-9-]*')),
	CONSTRAINT "growth_detail_enum" CHECK("__new_growth_daily_counts"."detail" IN ('','Sophia','Study.com','StraighterLine','Saylor','CLEP','DSST','Christian Leaders Institute','other','open','copy','submitted')),
	CONSTRAINT "growth_count_bounds" CHECK("__new_growth_daily_counts"."count" BETWEEN 1 AND 1000000)
);
--> statement-breakpoint
INSERT INTO `__new_growth_daily_counts`("day", "event", "context", "plan_id", "detail", "count") SELECT "day", "event", "context", "plan_id", "detail", "count" FROM `growth_daily_counts`;--> statement-breakpoint
DROP TABLE `growth_daily_counts`;--> statement-breakpoint
ALTER TABLE `__new_growth_daily_counts` RENAME TO `growth_daily_counts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;