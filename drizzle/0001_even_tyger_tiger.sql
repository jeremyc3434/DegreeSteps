CREATE TABLE `community_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_key` text NOT NULL,
	`program_id` text,
	`requirement_id` text,
	`course_id` text,
	`post_id` text,
	`catalog_year` text NOT NULL,
	`curriculum_fingerprint` text DEFAULT '' NOT NULL,
	`outcome` text NOT NULL,
	`evaluated_on` text NOT NULL,
	`details` text NOT NULL,
	`evidence_url` text,
	`consent_at` integer NOT NULL,
	`review_status` text DEFAULT 'pending' NOT NULL,
	`review_note` text,
	`reviewed_at` integer,
	`reviewed_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `community_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`post_id`) REFERENCES `community_posts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `community_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "community_evidence_target" CHECK(("community_evidence"."target_kind" = 'course' AND "community_evidence"."program_id" IS NOT NULL AND "community_evidence"."requirement_id" IS NOT NULL AND "community_evidence"."course_id" IS NOT NULL AND "community_evidence"."post_id" IS NULL AND "community_evidence"."curriculum_fingerprint" = '') OR ("community_evidence"."target_kind" = 'plan' AND "community_evidence"."program_id" IS NULL AND "community_evidence"."requirement_id" IS NULL AND "community_evidence"."course_id" IS NULL AND "community_evidence"."post_id" IS NOT NULL AND length("community_evidence"."curriculum_fingerprint") = 64)),
	CONSTRAINT "community_evidence_outcome" CHECK("community_evidence"."outcome" IN ('success','changed','rejected')),
	CONSTRAINT "community_evidence_date_length" CHECK(length("community_evidence"."evaluated_on") = 10),
	CONSTRAINT "community_evidence_catalog_length" CHECK(length("community_evidence"."catalog_year") IN (4,9)),
	CONSTRAINT "community_evidence_details_length" CHECK(length("community_evidence"."details") BETWEEN 1 AND 1000),
	CONSTRAINT "community_evidence_review_status" CHECK("community_evidence"."review_status" IN ('pending','reviewed','dismissed')),
	CONSTRAINT "community_evidence_review_note_length" CHECK("community_evidence"."review_note" IS NULL OR length("community_evidence"."review_note") BETWEEN 1 AND 1000)
);
--> statement-breakpoint
CREATE INDEX `community_evidence_scope` ON `community_evidence` (`target_key`,`catalog_year`,`curriculum_fingerprint`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `community_evidence_program` ON `community_evidence` (`program_id`,`catalog_year`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `community_evidence_queue` ON `community_evidence` (`review_status`,`deleted_at`,`created_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `community_evidence_user_scope` ON `community_evidence` (`user_id`,`target_key`,`catalog_year`,`curriculum_fingerprint`);--> statement-breakpoint
CREATE TABLE `community_evidence_flags` (
	`evidence_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	PRIMARY KEY(`evidence_id`, `user_id`),
	FOREIGN KEY (`evidence_id`) REFERENCES `community_evidence`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `community_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "community_evidence_flag_reason_length" CHECK(length("community_evidence_flags"."reason") BETWEEN 3 AND 1000)
);
--> statement-breakpoint
CREATE INDEX `community_evidence_flags_queue` ON `community_evidence_flags` (`resolved_at`,`evidence_id`);