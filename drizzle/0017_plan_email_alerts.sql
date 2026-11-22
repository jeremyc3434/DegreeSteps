CREATE TABLE `email_send_days` (
	`day` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "email_send_day_format" CHECK(length("email_send_days"."day")=10 AND "email_send_days"."day" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "email_send_count_bounds" CHECK("email_send_days"."count" BETWEEN 0 AND 100000)
);
--> statement-breakpoint
CREATE TABLE `plan_alert_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`portal_plan_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`email` text NOT NULL,
	`fingerprint` text NOT NULL,
	`summary_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`confirmed_at` integer NOT NULL,
	`last_change_email_at` integer,
	`last_reminder_at` integer,
	CONSTRAINT "plan_alert_fingerprint_format" CHECK(length("plan_alert_subscriptions"."fingerprint")=64 AND "plan_alert_subscriptions"."fingerprint" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "plan_alert_plan_format" CHECK(length("plan_alert_subscriptions"."plan_id") BETWEEN 1 AND 128 AND "plan_alert_subscriptions"."plan_id" NOT GLOB '*[^a-z0-9-]*'),
	CONSTRAINT "plan_alert_email_length" CHECK(length("plan_alert_subscriptions"."email") BETWEEN 3 AND 254),
	CONSTRAINT "plan_alert_summary_length" CHECK(length("plan_alert_subscriptions"."summary_json") BETWEEN 2 AND 2000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_alert_owner_plan` ON `plan_alert_subscriptions` (`user_id`,`portal_plan_id`);--> statement-breakpoint
CREATE INDEX `plan_alert_plan` ON `plan_alert_subscriptions` (`plan_id`);--> statement-breakpoint
CREATE TABLE `plan_alert_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `plan_alert_subscriptions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "plan_alert_token_hash_format" CHECK(length("plan_alert_tokens"."token_hash")=64 AND "plan_alert_tokens"."token_hash" NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE INDEX `plan_alert_tokens_subscription` ON `plan_alert_tokens` (`subscription_id`);--> statement-breakpoint
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
	CONSTRAINT "growth_event_enum" CHECK("__new_growth_daily_counts"."event" IN ('landing_view','plan_previewed','course_saved','plan_started','account_plan_saved','first_task_completed','finder_used','guided_started','guided_results','plan_built','credits_worth_used','transfer_page_view','provider_click','school_email','share_link_copied','alert_subscribed','alert_unsubscribed')),
	CONSTRAINT "growth_context_enum" CHECK("__new_growth_daily_counts"."context" IN ('home','article','provider','school','degree-plan','workspace','transfer','email')),
	CONSTRAINT "growth_plan_scope" CHECK("__new_growth_daily_counts"."plan_id"='' OR (length("__new_growth_daily_counts"."plan_id") BETWEEN 1 AND 128 AND "__new_growth_daily_counts"."plan_id" NOT GLOB '*[^a-z0-9-]*')),
	CONSTRAINT "growth_detail_enum" CHECK("__new_growth_daily_counts"."detail" IN ('','Sophia','Study.com','StraighterLine','Saylor','CLEP','DSST','Christian Leaders Institute','other','open','copy','settings','link','one-click')),
	CONSTRAINT "growth_count_bounds" CHECK("__new_growth_daily_counts"."count" BETWEEN 1 AND 1000000)
);
--> statement-breakpoint
INSERT INTO `__new_growth_daily_counts`("day", "event", "context", "plan_id", "detail", "count") SELECT "day", "event", "context", "plan_id", "detail", "count" FROM `growth_daily_counts`;--> statement-breakpoint
DROP TABLE `growth_daily_counts`;--> statement-breakpoint
ALTER TABLE `__new_growth_daily_counts` RENAME TO `growth_daily_counts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;