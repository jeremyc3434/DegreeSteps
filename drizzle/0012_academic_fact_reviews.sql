CREATE TABLE `academic_fact_review_events` (
	`id` text PRIMARY KEY NOT NULL,
	`fact_id` text NOT NULL,
	`evidence_fingerprint` text NOT NULL,
	`registry_revision` text NOT NULL,
	`revision` integer NOT NULL,
	`decision` text NOT NULL,
	`note` text NOT NULL,
	`source_ids_json` text NOT NULL,
	`attestation` integer NOT NULL,
	`reviewer_id` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "academic_fact_event_fingerprint" CHECK(length("academic_fact_review_events"."evidence_fingerprint")=64 AND "academic_fact_review_events"."evidence_fingerprint" NOT GLOB '*[^a-f0-9]*'),
	CONSTRAINT "academic_fact_event_registry" CHECK(length("academic_fact_review_events"."registry_revision") BETWEEN 1 AND 120),
	CONSTRAINT "academic_fact_event_revision" CHECK("academic_fact_review_events"."revision">0),
	CONSTRAINT "academic_fact_event_decision" CHECK("academic_fact_review_events"."decision" IN ('reviewed-supported','needs-evidence','conflict')),
	CONSTRAINT "academic_fact_event_note" CHECK(length("academic_fact_review_events"."note") BETWEEN 10 AND 2000),
	CONSTRAINT "academic_fact_event_sources" CHECK(json_valid("academic_fact_review_events"."source_ids_json") AND json_type("academic_fact_review_events"."source_ids_json")='array' AND length(CAST("academic_fact_review_events"."source_ids_json" AS BLOB))<=8192),
	CONSTRAINT "academic_fact_event_attestation" CHECK(("academic_fact_review_events"."decision"='reviewed-supported' AND "academic_fact_review_events"."attestation"=1 AND json_array_length("academic_fact_review_events"."source_ids_json")>0) OR ("academic_fact_review_events"."decision"!='reviewed-supported' AND "academic_fact_review_events"."attestation"=0)),
	CONSTRAINT "academic_fact_event_actor" CHECK(length("academic_fact_review_events"."reviewer_id") BETWEEN 1 AND 256)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `academic_fact_review_event_version` ON `academic_fact_review_events` (`fact_id`,`evidence_fingerprint`,`revision`);--> statement-breakpoint
CREATE INDEX `academic_fact_review_history` ON `academic_fact_review_events` (`fact_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `academic_fact_reviews` (
	`fact_id` text NOT NULL,
	`evidence_fingerprint` text NOT NULL,
	`registry_revision` text NOT NULL,
	`revision` integer NOT NULL,
	`decision` text NOT NULL,
	`note` text NOT NULL,
	`source_ids_json` text NOT NULL,
	`attestation` integer DEFAULT 0 NOT NULL,
	`reviewer_id` text NOT NULL,
	`last_event_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`fact_id`, `evidence_fingerprint`),
	CONSTRAINT "academic_fact_review_id" CHECK(length("academic_fact_reviews"."fact_id") BETWEEN 1 AND 160),
	CONSTRAINT "academic_fact_review_fingerprint" CHECK(length("academic_fact_reviews"."evidence_fingerprint")=64 AND "academic_fact_reviews"."evidence_fingerprint" NOT GLOB '*[^a-f0-9]*'),
	CONSTRAINT "academic_fact_review_registry" CHECK(length("academic_fact_reviews"."registry_revision") BETWEEN 1 AND 120),
	CONSTRAINT "academic_fact_review_revision" CHECK("academic_fact_reviews"."revision">0),
	CONSTRAINT "academic_fact_review_decision" CHECK("academic_fact_reviews"."decision" IN ('reviewed-supported','needs-evidence','conflict')),
	CONSTRAINT "academic_fact_review_note" CHECK(length("academic_fact_reviews"."note") BETWEEN 10 AND 2000),
	CONSTRAINT "academic_fact_review_sources" CHECK(json_valid("academic_fact_reviews"."source_ids_json") AND json_type("academic_fact_reviews"."source_ids_json")='array' AND length(CAST("academic_fact_reviews"."source_ids_json" AS BLOB))<=8192),
	CONSTRAINT "academic_fact_review_attestation" CHECK(("academic_fact_reviews"."decision"='reviewed-supported' AND "academic_fact_reviews"."attestation"=1 AND json_array_length("academic_fact_reviews"."source_ids_json")>0) OR ("academic_fact_reviews"."decision"!='reviewed-supported' AND "academic_fact_reviews"."attestation"=0)),
	CONSTRAINT "academic_fact_review_actor" CHECK(length("academic_fact_reviews"."reviewer_id") BETWEEN 1 AND 256)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `academic_fact_review_event_token` ON `academic_fact_reviews` (`last_event_id`);--> statement-breakpoint
CREATE INDEX `academic_fact_review_status` ON `academic_fact_reviews` (`decision`,`updated_at`,`fact_id`);