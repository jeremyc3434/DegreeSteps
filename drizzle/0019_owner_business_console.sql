CREATE TABLE `owner_content_records` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`slug` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`content_json` text NOT NULL,
	`published_json` text,
	`reviewed_revision` integer,
	`published_revision` integer,
	`reviewed_at` integer,
	`published_reviewed_at` integer,
	`published_at` integer,
	`archived_at` integer,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "owner_content_type" CHECK("owner_content_records"."type" IN ('articles','faqs','campaigns','offers')),
	CONSTRAINT "owner_content_status" CHECK("owner_content_records"."status" IN ('draft','published','archived')),
	CONSTRAINT "owner_content_revision" CHECK("owner_content_records"."revision">0 AND ("owner_content_records"."reviewed_revision" IS NULL OR "owner_content_records"."reviewed_revision"<="owner_content_records"."revision") AND ("owner_content_records"."published_revision" IS NULL OR "owner_content_records"."published_revision"<="owner_content_records"."revision")),
	CONSTRAINT "owner_content_json" CHECK(json_valid("owner_content_records"."content_json") AND length(CAST("owner_content_records"."content_json" AS BLOB))<=60000),
	CONSTRAINT "owner_content_public_json" CHECK("owner_content_records"."published_json" IS NULL OR (json_valid("owner_content_records"."published_json") AND length(CAST("owner_content_records"."published_json" AS BLOB))<=60000))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `owner_content_type_slug` ON `owner_content_records` (`type`,`slug`);--> statement-breakpoint
CREATE INDEX `owner_content_list` ON `owner_content_records` (`type`,`status`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `owner_content_public` ON `owner_content_records` (`type`,`status`,`published_at`,`id`);--> statement-breakpoint
CREATE TABLE `owner_content_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`type` text NOT NULL,
	`revision` integer NOT NULL,
	`action` text NOT NULL,
	`content_json` text NOT NULL,
	`review_note` text,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "owner_content_version_action" CHECK("owner_content_versions"."action" IN ('create','edit','review','publish','archive','starter-edit','starter-archive')),
	CONSTRAINT "owner_content_version_json" CHECK(json_valid("owner_content_versions"."content_json") AND length(CAST("owner_content_versions"."content_json" AS BLOB))<=60000)
);
--> statement-breakpoint
CREATE INDEX `owner_content_version_record` ON `owner_content_versions` (`record_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `business_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`details_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "business_audit_fields" CHECK(length("business_audit"."actor_id") BETWEEN 1 AND 256 AND length("business_audit"."action") BETWEEN 1 AND 80 AND length("business_audit"."target_type") BETWEEN 1 AND 60 AND length("business_audit"."target_id")<=256),
	CONSTRAINT "business_audit_details" CHECK(json_valid("business_audit"."details_json") AND length(CAST("business_audit"."details_json" AS BLOB))<=8192)
);
--> statement-breakpoint
CREATE INDEX `business_audit_history` ON `business_audit` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `business_audit_target` ON `business_audit` (`target_type`,`target_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `business_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`project_origin` text NOT NULL,
	`ciphertext` text,
	`iv` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`verified_at` integer,
	`updated_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "business_connection_id" CHECK("business_connections"."id"='supabase-admin'),
	CONSTRAINT "business_connection_revision" CHECK("business_connections"."revision">0),
	CONSTRAINT "business_connection_encryption" CHECK(("business_connections"."ciphertext" IS NULL AND "business_connections"."iv" IS NULL) OR (length("business_connections"."ciphertext") BETWEEN 20 AND 16384 AND length("business_connections"."iv")=24))
);
--> statement-breakpoint
CREATE TABLE `business_owner` (
	`singleton` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "business_owner_singleton" CHECK("business_owner"."singleton"=1),
	CONSTRAINT "business_owner_id" CHECK(length("business_owner"."user_id") BETWEEN 1 AND 256),
	CONSTRAINT "business_owner_source" CHECK("business_owner"."source"='subject-hash')
);
--> statement-breakpoint
CREATE TABLE `business_owner_limits` (
	`owner_id` text NOT NULL,
	`action` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `action`),
	CONSTRAINT "business_owner_limit_action" CHECK("business_owner_limits"."action" IN ('connection','directory-sync','directory-read')),
	CONSTRAINT "business_owner_limit_count" CHECK("business_owner_limits"."count">0)
);
--> statement-breakpoint
CREATE TABLE `business_student_directory` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_id` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`email_confirmed` integer DEFAULT 0 NOT NULL,
	`created_at` integer,
	`last_sign_in_at` integer,
	`banned_until` text,
	`excluded` integer DEFAULT 0 NOT NULL,
	`generation` text NOT NULL,
	`synced_at` integer NOT NULL,
	CONSTRAINT "business_student_directory_flags" CHECK("business_student_directory"."email_confirmed" IN (0,1) AND "business_student_directory"."excluded" IN (0,1)),
	CONSTRAINT "business_student_directory_metadata" CHECK(length("business_student_directory"."id") BETWEEN 1 AND 256 AND length("business_student_directory"."auth_id")<=128 AND length("business_student_directory"."email")<=254)
);
--> statement-breakpoint
CREATE INDEX `business_student_directory_page` ON `business_student_directory` (`excluded`,`email`,`id`);--> statement-breakpoint
CREATE INDEX `business_student_directory_generation` ON `business_student_directory` (`generation`,`excluded`);--> statement-breakpoint
CREATE TABLE `business_student_sync` (
	`id` text PRIMARY KEY NOT NULL,
	`generation` text NOT NULL,
	`next_page` integer DEFAULT 1 NOT NULL,
	`complete` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`lease_token` text,
	`lease_until` integer,
	`started_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`provider_total` integer,
	CONSTRAINT "business_student_sync_id" CHECK("business_student_sync"."id"='supabase-auth'),
	CONSTRAINT "business_student_sync_values" CHECK("business_student_sync"."next_page">0 AND "business_student_sync"."revision">0 AND "business_student_sync"."complete" IN (0,1))
);
--> statement-breakpoint
CREATE TABLE `owner_financial_records` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`last_event_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`search_key` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`occurred_on` text NOT NULL,
	`period_start` text DEFAULT '' NOT NULL,
	`period_end` text DEFAULT '' NOT NULL,
	`counterparty` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	CONSTRAINT "owner_finance_revision" CHECK("owner_financial_records"."revision">0),
	CONSTRAINT "owner_finance_source" CHECK("owner_financial_records"."source"='manual'),
	CONSTRAINT "owner_finance_kind" CHECK("owner_financial_records"."kind" IN ('revenue','expense','invoice')),
	CONSTRAINT "owner_finance_status_values" CHECK("owner_financial_records"."status" IN ('pending','confirmed','void')),
	CONSTRAINT "owner_finance_amount" CHECK("owner_financial_records"."amount_minor" BETWEEN 0 AND 100000000000 AND length("owner_financial_records"."currency")=3),
	CONSTRAINT "owner_finance_text" CHECK(length("owner_financial_records"."counterparty")<=200 AND length("owner_financial_records"."description")<=4000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `owner_finance_event` ON `owner_financial_records` (`last_event_id`);--> statement-breakpoint
CREATE INDEX `owner_finance_updated` ON `owner_financial_records` (`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `owner_finance_search` ON `owner_financial_records` (`search_key`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `owner_finance_status` ON `owner_financial_records` (`status`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `owner_finance_period` ON `owner_financial_records` (`occurred_on`,`currency`,`kind`,`status`);--> statement-breakpoint
CREATE TABLE `owner_lead_workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`last_event_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`search_key` text NOT NULL,
	`source_kind` text NOT NULL,
	`source_id` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	CONSTRAINT "owner_leads_revision" CHECK("owner_lead_workflows"."revision">0),
	CONSTRAINT "owner_leads_source_kind" CHECK("owner_lead_workflows"."source_kind" IN ('school-inquiry','plan-review','college-interest')),
	CONSTRAINT "owner_leads_status_values" CHECK("owner_lead_workflows"."status" IN ('new','reviewing','qualified','shared','closed')),
	CONSTRAINT "owner_leads_notes" CHECK(length("owner_lead_workflows"."notes")<=4000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `owner_leads_event` ON `owner_lead_workflows` (`last_event_id`);--> statement-breakpoint
CREATE INDEX `owner_leads_updated` ON `owner_lead_workflows` (`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `owner_leads_search` ON `owner_lead_workflows` (`search_key`,`updated_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `owner_lead_original_request` ON `owner_lead_workflows` (`source_kind`,`source_id`);--> statement-breakpoint
CREATE INDEX `owner_leads_status` ON `owner_lead_workflows` (`status`,`updated_at`,`id`);--> statement-breakpoint
CREATE TABLE `owner_partners` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`last_event_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`search_key` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`website` text DEFAULT '' NOT NULL,
	`contact_name` text DEFAULT '' NOT NULL,
	`contact_email` text DEFAULT '' NOT NULL,
	`stage` text DEFAULT 'prospect' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	CONSTRAINT "owner_partners_revision" CHECK("owner_partners"."revision">0),
	CONSTRAINT "owner_partners_name" CHECK(length("owner_partners"."name") BETWEEN 1 AND 200),
	CONSTRAINT "owner_partners_kind" CHECK("owner_partners"."kind" IN ('college','provider','other')),
	CONSTRAINT "owner_partners_stage_values" CHECK("owner_partners"."stage" IN ('prospect','contacted','discussing','active','paused')),
	CONSTRAINT "owner_partners_contact" CHECK(length("owner_partners"."website")<=1500 AND length("owner_partners"."contact_name")<=100 AND length("owner_partners"."contact_email")<=254 AND length("owner_partners"."notes")<=4000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `owner_partners_event` ON `owner_partners` (`last_event_id`);--> statement-breakpoint
CREATE INDEX `owner_partners_updated` ON `owner_partners` (`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `owner_partners_search` ON `owner_partners` (`search_key`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `owner_partners_stage` ON `owner_partners` (`stage`,`updated_at`,`id`);--> statement-breakpoint
CREATE TABLE `owner_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`last_event_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`search_key` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`due_on` text DEFAULT '' NOT NULL,
	CONSTRAINT "owner_tasks_revision" CHECK("owner_tasks"."revision">0),
	CONSTRAINT "owner_tasks_title" CHECK(length("owner_tasks"."title") BETWEEN 1 AND 200),
	CONSTRAINT "owner_tasks_description" CHECK(length("owner_tasks"."description")<=4000),
	CONSTRAINT "owner_tasks_status_values" CHECK("owner_tasks"."status" IN ('todo','doing','waiting','done')),
	CONSTRAINT "owner_tasks_priority" CHECK("owner_tasks"."priority" IN ('low','normal','high'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `owner_tasks_event` ON `owner_tasks` (`last_event_id`);--> statement-breakpoint
CREATE INDEX `owner_tasks_updated` ON `owner_tasks` (`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `owner_tasks_search` ON `owner_tasks` (`search_key`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `owner_tasks_status` ON `owner_tasks` (`status`,`updated_at`,`id`);--> statement-breakpoint
CREATE TABLE `owner_work_events` (
	`id` text PRIMARY KEY NOT NULL,
	`resource` text NOT NULL,
	`record_id` text NOT NULL,
	`revision` integer NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`changed_fields_json` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "owner_work_event_revision_value" CHECK("owner_work_events"."revision">0),
	CONSTRAINT "owner_work_event_fields" CHECK(json_valid("owner_work_events"."changed_fields_json") AND json_type("owner_work_events"."changed_fields_json")='array' AND length("owner_work_events"."changed_fields_json")<=2048)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `owner_work_event_revision` ON `owner_work_events` (`resource`,`record_id`,`revision`);--> statement-breakpoint
CREATE INDEX `owner_work_event_history` ON `owner_work_events` (`resource`,`record_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `owner_work_event_created` ON `owner_work_events` (`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `support_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`ticket_revision` integer NOT NULL,
	`author_id` text NOT NULL,
	`author_role` text NOT NULL,
	`visibility` text DEFAULT 'student' NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `support_tickets`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "support_messages_revision" CHECK("support_messages"."ticket_revision">0),
	CONSTRAINT "support_messages_role" CHECK("support_messages"."author_role" IN ('owner','student')),
	CONSTRAINT "support_messages_visibility" CHECK("support_messages"."visibility" IN ('student','internal') AND ("support_messages"."author_role"!='student' OR "support_messages"."visibility"='student')),
	CONSTRAINT "support_messages_body" CHECK(length("support_messages"."body") BETWEEN 1 AND 6000)
);
--> statement-breakpoint
CREATE INDEX `support_messages_ticket` ON `support_messages` (`ticket_id`,`ticket_revision`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `support_messages_version` ON `support_messages` (`ticket_id`,`ticket_revision`);--> statement-breakpoint
CREATE TABLE `support_rate_limits` (
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`kind` text NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`user_id`, `day`, `kind`),
	CONSTRAINT "support_rate_kind" CHECK("support_rate_limits"."kind" IN ('ticket','message')),
	CONSTRAINT "support_rate_count" CHECK("support_rate_limits"."count">0 AND "support_rate_limits"."count"<=100)
);
--> statement-breakpoint
CREATE INDEX `support_rate_day` ON `support_rate_limits` (`day`);--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`last_event_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`search_key` text NOT NULL,
	`user_id` text,
	`contact_email` text DEFAULT '' NOT NULL,
	`subject` text NOT NULL,
	`category` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`diagnostics_consent` integer DEFAULT 0 NOT NULL,
	`diagnostics_json` text DEFAULT '{}' NOT NULL,
	CONSTRAINT "support_tickets_revision" CHECK("support_tickets"."revision">0),
	CONSTRAINT "support_tickets_subject" CHECK(length("support_tickets"."subject") BETWEEN 1 AND 200),
	CONSTRAINT "support_tickets_category" CHECK("support_tickets"."category" IN ('account','plan','course','bug','other')),
	CONSTRAINT "support_tickets_status_values" CHECK("support_tickets"."status" IN ('open','in-progress','waiting','resolved')),
	CONSTRAINT "support_tickets_priority" CHECK("support_tickets"."priority" IN ('low','normal','high')),
	CONSTRAINT "support_tickets_diagnostics" CHECK("support_tickets"."diagnostics_consent" IN (0,1) AND json_valid("support_tickets"."diagnostics_json") AND length("support_tickets"."diagnostics_json")<=2048 AND ("support_tickets"."diagnostics_consent"=1 OR "support_tickets"."diagnostics_json"='{}'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `support_tickets_event` ON `support_tickets` (`last_event_id`);--> statement-breakpoint
CREATE INDEX `support_tickets_updated` ON `support_tickets` (`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `support_tickets_search` ON `support_tickets` (`search_key`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `support_tickets_user` ON `support_tickets` (`user_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `support_tickets_status` ON `support_tickets` (`status`,`updated_at`,`id`);--> statement-breakpoint
CREATE TABLE `owner_search_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`property` text NOT NULL,
	`fingerprint` text NOT NULL,
	`file_name` text NOT NULL,
	`dimension` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`exported_on` text NOT NULL,
	`search_type` text NOT NULL,
	`filters` text NOT NULL,
	`row_count` integer NOT NULL,
	`rows_json` text NOT NULL,
	`summary_json` text NOT NULL,
	`imported_by` text NOT NULL,
	`imported_at` integer NOT NULL,
	CONSTRAINT "owner_search_import_property" CHECK("owner_search_imports"."property"='degreesteps.com'),
	CONSTRAINT "owner_search_import_dimension_kind" CHECK("owner_search_imports"."dimension" IN ('date','query','page','country','device')),
	CONSTRAINT "owner_search_import_row_count" CHECK("owner_search_imports"."row_count" BETWEEN 1 AND 5000),
	CONSTRAINT "owner_search_import_rows" CHECK(json_valid("owner_search_imports"."rows_json") AND json_type("owner_search_imports"."rows_json")='array' AND json_array_length("owner_search_imports"."rows_json")="owner_search_imports"."row_count" AND length(CAST("owner_search_imports"."rows_json" AS BLOB))<=1900000),
	CONSTRAINT "owner_search_import_summary" CHECK(json_valid("owner_search_imports"."summary_json") AND length(CAST("owner_search_imports"."summary_json" AS BLOB))<=16384),
	CONSTRAINT "owner_search_import_fingerprint_shape" CHECK(length("owner_search_imports"."fingerprint")=64 AND "owner_search_imports"."fingerprint" NOT GLOB '*[^a-f0-9]*'),
	CONSTRAINT "owner_search_import_origin" CHECK(length("owner_search_imports"."imported_by") BETWEEN 1 AND 256)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `owner_search_import_fingerprint` ON `owner_search_imports` (`property`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `owner_search_import_recent` ON `owner_search_imports` (`property`,`imported_at`,`id`);--> statement-breakpoint
CREATE INDEX `owner_search_import_dimension` ON `owner_search_imports` (`property`,`dimension`,`imported_at`,`id`);--> statement-breakpoint
CREATE TABLE `owner_search_settings` (
	`property` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`verification_token` text,
	`dns_status` text DEFAULT 'unchecked' NOT NULL,
	`dns_checked_at` integer,
	`google_ownership_reported` integer DEFAULT 0 NOT NULL,
	`google_ownership_reported_at` integer,
	`sitemap_submitted_reported` integer DEFAULT 0 NOT NULL,
	`sitemap_submitted_reported_at` integer,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "owner_search_property" CHECK("owner_search_settings"."property"='degreesteps.com'),
	CONSTRAINT "owner_search_revision" CHECK("owner_search_settings"."revision">0),
	CONSTRAINT "owner_search_dns_status" CHECK("owner_search_settings"."dns_status" IN ('unchecked','present','not-found','check-failed')),
	CONSTRAINT "owner_search_reported_flags" CHECK("owner_search_settings"."google_ownership_reported" IN (0,1) AND "owner_search_settings"."sitemap_submitted_reported" IN (0,1)),
	CONSTRAINT "owner_search_public_token_length" CHECK("owner_search_settings"."verification_token" IS NULL OR length("owner_search_settings"."verification_token") BETWEEN 35 AND 300)
);

--> statement-breakpoint
-- The owner confirmed Google Domain-property verification in this conversation.
-- This is an owner attestation, not an API connection or an automated DNS check.
-- Sitemap submission was not yet confirmed. Preserve any real saved setup.
INSERT INTO owner_search_settings
  (property,revision,verification_token,dns_status,dns_checked_at,
   google_ownership_reported,google_ownership_reported_at,
   sitemap_submitted_reported,sitemap_submitted_reported_at,updated_by,updated_at)
VALUES
  ('degreesteps.com',1,NULL,'unchecked',NULL,1,1795640336037,0,NULL,
   'owner-confirmed-in-chat',1795640336037)
ON CONFLICT(property) DO NOTHING;
