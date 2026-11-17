-- Preserve evidence and moderation flags while widening catalog identity to six-digit monthly versions.
-- Both tables are copied before replacement so foreign-key enforcement stays enabled throughout.
CREATE TABLE `__new_community_evidence` (
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
	CONSTRAINT "community_evidence_target" CHECK(("__new_community_evidence"."target_kind" = 'course' AND "__new_community_evidence"."program_id" IS NOT NULL AND "__new_community_evidence"."requirement_id" IS NOT NULL AND "__new_community_evidence"."course_id" IS NOT NULL AND "__new_community_evidence"."post_id" IS NULL AND "__new_community_evidence"."curriculum_fingerprint" = '') OR ("__new_community_evidence"."target_kind" = 'plan' AND "__new_community_evidence"."program_id" IS NULL AND "__new_community_evidence"."requirement_id" IS NULL AND "__new_community_evidence"."course_id" IS NULL AND "__new_community_evidence"."post_id" IS NOT NULL AND length("__new_community_evidence"."curriculum_fingerprint") = 64)),
	CONSTRAINT "community_evidence_outcome" CHECK("__new_community_evidence"."outcome" IN ('success','changed','rejected')),
	CONSTRAINT "community_evidence_date_length" CHECK(length("__new_community_evidence"."evaluated_on") = 10),
	CONSTRAINT "community_evidence_catalog_length" CHECK(length("__new_community_evidence"."catalog_year") IN (4,6,9)),
	CONSTRAINT "community_evidence_details_length" CHECK(length("__new_community_evidence"."details") BETWEEN 1 AND 1000),
	CONSTRAINT "community_evidence_review_status" CHECK("__new_community_evidence"."review_status" IN ('pending','reviewed','dismissed')),
	CONSTRAINT "community_evidence_review_note_length" CHECK("__new_community_evidence"."review_note" IS NULL OR length("__new_community_evidence"."review_note") BETWEEN 1 AND 1000)
);
--> statement-breakpoint
INSERT INTO `__new_community_evidence`("id", "user_id", "target_kind", "target_key", "program_id", "requirement_id", "course_id", "post_id", "catalog_year", "curriculum_fingerprint", "outcome", "evaluated_on", "details", "evidence_url", "consent_at", "review_status", "review_note", "reviewed_at", "reviewed_by", "created_at", "updated_at", "deleted_at") SELECT "id", "user_id", "target_kind", "target_key", "program_id", "requirement_id", "course_id", "post_id", "catalog_year", "curriculum_fingerprint", "outcome", "evaluated_on", "details", "evidence_url", "consent_at", "review_status", "review_note", "reviewed_at", "reviewed_by", "created_at", "updated_at", "deleted_at" FROM `community_evidence`;--> statement-breakpoint
CREATE TABLE `__new_community_evidence_flags` (
 `evidence_id` text NOT NULL REFERENCES `__new_community_evidence`(`id`),
 `user_id` text NOT NULL REFERENCES `community_users`(`id`),
 `reason` text NOT NULL,
 `created_at` integer NOT NULL,
 `resolved_at` integer,
 PRIMARY KEY (`evidence_id`,`user_id`),
 CONSTRAINT "community_evidence_flag_reason_length" CHECK(length(`reason`) BETWEEN 3 AND 1000)
);
--> statement-breakpoint
INSERT INTO `__new_community_evidence_flags` (`evidence_id`,`user_id`,`reason`,`created_at`,`resolved_at`) SELECT `evidence_id`,`user_id`,`reason`,`created_at`,`resolved_at` FROM `community_evidence_flags`;
--> statement-breakpoint
DROP TABLE `community_evidence_flags`;
--> statement-breakpoint
DROP TABLE `community_evidence`;--> statement-breakpoint
ALTER TABLE `__new_community_evidence` RENAME TO `community_evidence`;
--> statement-breakpoint
ALTER TABLE `__new_community_evidence_flags` RENAME TO `community_evidence_flags`;
--> statement-breakpoint
CREATE INDEX `community_evidence_flags_queue` ON `community_evidence_flags` (`resolved_at`,`evidence_id`);--> statement-breakpoint
CREATE INDEX `community_evidence_scope` ON `community_evidence` (`target_key`,`catalog_year`,`curriculum_fingerprint`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `community_evidence_program` ON `community_evidence` (`program_id`,`catalog_year`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `community_evidence_queue` ON `community_evidence` (`review_status`,`deleted_at`,`created_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `community_evidence_user_scope` ON `community_evidence` (`user_id`,`target_key`,`catalog_year`,`curriculum_fingerprint`);
