CREATE TABLE `growth_daily_counts` (
	`day` text NOT NULL,
	`event` text NOT NULL,
	`context` text NOT NULL,
	`plan_id` text DEFAULT '' NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`day`, `event`, `context`, `plan_id`),
	CONSTRAINT "growth_day_format" CHECK(length("growth_daily_counts"."day")=10 AND "growth_daily_counts"."day" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "growth_event_enum" CHECK("growth_daily_counts"."event" IN ('landing_view','plan_previewed','course_saved','plan_started','account_plan_saved','first_task_completed')),
	CONSTRAINT "growth_context_enum" CHECK("growth_daily_counts"."context" IN ('home','article','provider','school','degree-plan','workspace')),
	CONSTRAINT "growth_plan_scope" CHECK("growth_daily_counts"."plan_id" IN ('','wgu-catalog-ecceaa488637ac83','liberty-business-residential','liberty-criminal-justice-online','liberty-criminal-justice-residential')),
	CONSTRAINT "growth_count_bounds" CHECK("growth_daily_counts"."count" BETWEEN 1 AND 1000000)
);
