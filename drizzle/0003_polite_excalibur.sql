CREATE TABLE `curriculum_source_cache` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`program_id` text NOT NULL,
	`source_url` text,
	`payload_json` text NOT NULL,
	`source_hash` text,
	`checked_at` text NOT NULL,
	`expires_at` text NOT NULL,
	CONSTRAINT "curriculum_source_cache_payload" CHECK(json_valid("curriculum_source_cache"."payload_json") AND length(CAST("curriculum_source_cache"."payload_json" AS BLOB)) <= 1048576),
	CONSTRAINT "curriculum_source_cache_key" CHECK(length("curriculum_source_cache"."cache_key") BETWEEN 1 AND 500),
	CONSTRAINT "curriculum_source_cache_hash" CHECK("curriculum_source_cache"."source_hash" IS NULL OR length("curriculum_source_cache"."source_hash") = 64)
);
--> statement-breakpoint
CREATE INDEX `curriculum_source_cache_program` ON `curriculum_source_cache` (`program_id`);--> statement-breakpoint
CREATE INDEX `curriculum_source_cache_expiry` ON `curriculum_source_cache` (`expires_at`);