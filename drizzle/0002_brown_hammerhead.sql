CREATE TABLE `portal_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`school` text DEFAULT '' NOT NULL,
	`degree` text DEFAULT '' NOT NULL,
	`state_json` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `portal_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "portal_plan_title_length" CHECK(length("portal_plans"."title") BETWEEN 1 AND 120),
	CONSTRAINT "portal_plan_school_length" CHECK(length("portal_plans"."school") <= 120),
	CONSTRAINT "portal_plan_degree_length" CHECK(length("portal_plans"."degree") <= 200),
	CONSTRAINT "portal_plan_state_limit" CHECK(length(CAST("portal_plans"."state_json" AS BLOB)) <= 524288 AND json_valid("portal_plans"."state_json")),
	CONSTRAINT "portal_plan_revision_positive" CHECK("portal_plans"."revision" > 0)
);
--> statement-breakpoint
CREATE INDEX `portal_plans_owner` ON `portal_plans` (`user_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE TABLE `portal_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`alias` text DEFAULT 'Student' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "portal_profile_alias_length" CHECK(length("portal_profiles"."alias") BETWEEN 2 AND 60)
);
--> statement-breakpoint
CREATE TABLE `portal_rate_limits` (
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`user_id`, `action`),
	FOREIGN KEY (`user_id`) REFERENCES `portal_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "portal_rate_action" CHECK("portal_rate_limits"."action" IN ('save','profile','delete')),
	CONSTRAINT "portal_rate_positive" CHECK("portal_rate_limits"."count" > 0)
);
