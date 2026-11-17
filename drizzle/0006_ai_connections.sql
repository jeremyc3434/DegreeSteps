CREATE TABLE `ai_connection_events` (
	`id` text PRIMARY KEY NOT NULL,
	`service` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`revision` integer NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "ai_connection_event_service" CHECK("ai_connection_events"."service" = 'anthropic'),
	CONSTRAINT "ai_connection_event_action" CHECK("ai_connection_events"."action" IN ('connect','rotate','disconnect','test')),
	CONSTRAINT "ai_connection_event_revision" CHECK("ai_connection_events"."revision" >= 0),
	CONSTRAINT "ai_connection_event_source" CHECK("ai_connection_events"."source" IN ('managed','environment','none'))
);
--> statement-breakpoint
CREATE INDEX `ai_connection_events_created` ON `ai_connection_events` (`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `ai_connection_rate_limits` (
	`user_id` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL,
	CONSTRAINT "ai_connection_rate_count" CHECK("ai_connection_rate_limits"."count" > 0)
);
--> statement-breakpoint
CREATE TABLE `ai_service_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`ciphertext` text,
	`iv` text,
	`revision` integer NOT NULL,
	`verified_at` integer,
	`updated_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "ai_connection_service" CHECK("ai_service_connections"."id" = 'anthropic'),
	CONSTRAINT "ai_connection_revision" CHECK("ai_service_connections"."revision" > 0),
	CONSTRAINT "ai_connection_encrypted_pair" CHECK(("ai_service_connections"."ciphertext" IS NULL AND "ai_service_connections"."iv" IS NULL AND "ai_service_connections"."verified_at" IS NULL) OR ("ai_service_connections"."ciphertext" IS NOT NULL AND length("ai_service_connections"."ciphertext") BETWEEN 44 AND 5600 AND "ai_service_connections"."iv" IS NOT NULL AND length("ai_service_connections"."iv") = 24 AND "ai_service_connections"."verified_at" IS NOT NULL))
);
