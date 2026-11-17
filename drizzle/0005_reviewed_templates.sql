CREATE TABLE `degree_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical_key` text NOT NULL,
	`school_name` text NOT NULL,
	`program_name` text NOT NULL,
	`level` text NOT NULL,
	`modality` text NOT NULL,
	`catalog_year` text NOT NULL,
	`source_url` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`artifact_json` text,
	`unresolved_json` text DEFAULT '[]' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`checked_at` integer,
	`reviewed_by` text,
	`reviewed_at` integer,
	`review_notes` text,
	`sources_reviewed` integer DEFAULT 0 NOT NULL,
	`academic_reviewed` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "degree_template_status" CHECK("degree_templates"."status" IN ('queued','researching','draft','ready','rejected','failed')),
	CONSTRAINT "degree_template_artifact" CHECK("degree_templates"."artifact_json" IS NULL OR (json_valid("degree_templates"."artifact_json") AND length(CAST("degree_templates"."artifact_json" AS BLOB)) <= 524288)),
	CONSTRAINT "degree_template_unresolved" CHECK(json_valid("degree_templates"."unresolved_json")),
	CONSTRAINT "degree_template_revision" CHECK("degree_templates"."revision">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `degree_template_identity` ON `degree_templates` (`canonical_key`);--> statement-breakpoint
CREATE INDEX `degree_template_ready` ON `degree_templates` (`status`,`updated_at`,`id`);--> statement-breakpoint
CREATE TABLE `template_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`template_id` text NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `degree_templates`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "template_request_details" CHECK(length("template_requests"."details") <= 4000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `template_request_owner_degree` ON `template_requests` (`user_id`,`template_id`);--> statement-breakpoint
CREATE INDEX `template_request_owner` ON `template_requests` (`user_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `template_research_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text NOT NULL,
	`model` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`input_tokens` integer,
	`output_tokens` integer,
	`error_code` text,
	FOREIGN KEY (`template_id`) REFERENCES `degree_templates`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "template_run_status" CHECK("template_research_runs"."status" IN ('running','completed','failed'))
);
--> statement-breakpoint
CREATE INDEX `template_run_spend_window` ON `template_research_runs` (`started_at`,`status`);--> statement-breakpoint
CREATE INDEX `template_run_owner_window` ON `template_research_runs` (`user_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `template_run_target` ON `template_research_runs` (`template_id`,`started_at`);