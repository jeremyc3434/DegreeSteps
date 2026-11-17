CREATE TABLE `degree_research_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`active_template_id` text,
	`user_id` text NOT NULL,
	`authorized_admin` integer DEFAULT 0 NOT NULL,
	`requested_revision` integer NOT NULL,
	`options_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` integer NOT NULL,
	`lease_token` text,
	`lease_until` integer,
	`provider_started_at` integer,
	`dispatched_at` integer,
	`finished_at` integer,
	`error_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `degree_templates`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "degree_research_job_status" CHECK("degree_research_jobs"."status" IN ('queued','dispatched','running','retry','completed','dead')),
	CONSTRAINT "degree_research_job_active_scope" CHECK("degree_research_jobs"."active_template_id" IS NULL OR "degree_research_jobs"."active_template_id"="degree_research_jobs"."template_id"),
	CONSTRAINT "degree_research_job_attempts" CHECK("degree_research_jobs"."attempts" BETWEEN 0 AND 3),
	CONSTRAINT "degree_research_job_admin" CHECK("degree_research_jobs"."authorized_admin" IN (0,1)),
	CONSTRAINT "degree_research_job_revision" CHECK("degree_research_jobs"."requested_revision">0),
	CONSTRAINT "degree_research_job_options" CHECK(json_valid("degree_research_jobs"."options_json") AND length(CAST("degree_research_jobs"."options_json" AS BLOB))<=4096)
);

--> statement-breakpoint
CREATE UNIQUE INDEX `degree_research_job_active` ON `degree_research_jobs` (`active_template_id`);
--> statement-breakpoint
CREATE INDEX `degree_research_job_dispatch` ON `degree_research_jobs` (`status`,`available_at`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `degree_research_job_owner` ON `degree_research_jobs` (`user_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `degree_research_job_template` ON `degree_research_jobs` (`template_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `community_posts_author` ON `community_posts` (`user_id`,`deleted_at`,`created_at`,`id`);
