CREATE TABLE `transcript_import_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`started_at` integer NOT NULL,
	CONSTRAINT "transcript_import_started" CHECK("transcript_import_runs"."started_at" >= 0)
);
--> statement-breakpoint
CREATE INDEX `transcript_import_global_window` ON `transcript_import_runs` (`started_at`);--> statement-breakpoint
CREATE INDEX `transcript_import_owner_window` ON `transcript_import_runs` (`user_id`,`started_at`);
