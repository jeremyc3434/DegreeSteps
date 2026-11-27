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
	CONSTRAINT "growth_event_enum" CHECK("__new_growth_daily_counts"."event" IN ('landing_view','plan_previewed','course_saved','plan_started','account_plan_saved','first_task_completed','finder_used','guided_started','guided_quiz_started','guided_results','plan_built','credits_worth_used','transfer_page_view','provider_click','school_email','share_link_copied','school_inquiry','plan_review_request','alert_subscribed','alert_unsubscribed')),
	CONSTRAINT "growth_context_enum" CHECK("__new_growth_daily_counts"."context" IN ('home','article','provider','school','degree-plan','workspace','transfer','email')),
	CONSTRAINT "growth_plan_scope" CHECK("__new_growth_daily_counts"."plan_id"='' OR (length("__new_growth_daily_counts"."plan_id") BETWEEN 1 AND 128 AND "__new_growth_daily_counts"."plan_id" NOT GLOB '*[^a-z0-9-]*')),
	CONSTRAINT "growth_detail_enum" CHECK("__new_growth_daily_counts"."detail" IN ('','Sophia','Study.com','StraighterLine','Saylor','CLEP','DSST','Christian Leaders Institute','other','open','copy','submitted','settings','link','one-click')),
	CONSTRAINT "growth_count_bounds" CHECK("__new_growth_daily_counts"."count" BETWEEN 1 AND 1000000)
);
--> statement-breakpoint
INSERT INTO `__new_growth_daily_counts`("day", "event", "context", "plan_id", "detail", "count") SELECT "day", "event", "context", "plan_id", "detail", "count" FROM `growth_daily_counts`;--> statement-breakpoint
DROP TABLE `growth_daily_counts`;--> statement-breakpoint
ALTER TABLE `__new_growth_daily_counts` RENAME TO `growth_daily_counts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;