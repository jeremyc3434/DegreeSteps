CREATE TABLE `coach_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`day` text NOT NULL,
	`question` text NOT NULL,
	`topics_json` text DEFAULT '[]' NOT NULL,
	`tools_json` text DEFAULT '[]' NOT NULL,
	`plan_ids_json` text DEFAULT '[]' NOT NULL,
	`ask_school` integer DEFAULT 0 NOT NULL,
	`used_saved` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cache_write_tokens` integer DEFAULT 0 NOT NULL,
	`cache_read_tokens` integer DEFAULT 0 NOT NULL,
	`cost_micro_usd` integer DEFAULT 0 NOT NULL,
	`answer` text DEFAULT '' NOT NULL,
	`rating` integer,
	`rating_reason` text,
	`rated_at` integer,
	CONSTRAINT "coach_question_length" CHECK(length("coach_questions"."question") BETWEEN 1 AND 1000),
	CONSTRAINT "coach_answer_length" CHECK(length("coach_questions"."answer")<=1500),
	CONSTRAINT "coach_rating_values" CHECK("coach_questions"."rating" IS NULL OR "coach_questions"."rating" IN (-1,1)),
	CONSTRAINT "coach_rating_reason_length" CHECK("coach_questions"."rating_reason" IS NULL OR length("coach_questions"."rating_reason")<=200),
	CONSTRAINT "coach_flags" CHECK("coach_questions"."ask_school" IN (0,1) AND "coach_questions"."used_saved" IN (0,1))
);
--> statement-breakpoint
CREATE INDEX `coach_questions_created` ON `coach_questions` (`created_at`);--> statement-breakpoint
CREATE TABLE `coach_spend_days` (
	`day` text PRIMARY KEY NOT NULL,
	`cost_micro_usd` integer DEFAULT 0 NOT NULL,
	`calls` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "coach_spend_day_format" CHECK(length("coach_spend_days"."day")=10 AND "coach_spend_days"."day" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "coach_spend_bounds" CHECK("coach_spend_days"."cost_micro_usd">=0 AND "coach_spend_days"."calls">=0)
);
--> statement-breakpoint
CREATE TABLE `coach_visitor_days` (
	`day` text NOT NULL,
	`visitor_hash` text NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`day`, `visitor_hash`),
	CONSTRAINT "coach_visitor_day_format" CHECK(length("coach_visitor_days"."day")=10 AND "coach_visitor_days"."day" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "coach_visitor_hash_format" CHECK(length("coach_visitor_days"."visitor_hash")=66 AND substr("coach_visitor_days"."visitor_hash",1,2) IN ('a:','u:')),
	CONSTRAINT "coach_visitor_count_bounds" CHECK("coach_visitor_days"."count" BETWEEN 0 AND 1000)
);
