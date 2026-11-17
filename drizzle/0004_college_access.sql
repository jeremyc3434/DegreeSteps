CREATE TABLE `college_access_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`target_id` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`organization_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `college_organizations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "college_access_audit_note_length" CHECK(length("college_access_audit"."note") <= 500),
	CONSTRAINT "college_access_audit_action" CHECK("college_access_audit"."action" IN ('create','verify','revoke','grant-member','revoke-member','consent','withdraw','read-leads'))
);
--> statement-breakpoint
CREATE INDEX `college_access_audit_org` ON `college_access_audit` (`organization_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `college_access_rate_limits` (
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`user_id`, `action`),
	CONSTRAINT "college_access_rate_action" CHECK("college_access_rate_limits"."action" IN ('interest','admin','read')),
	CONSTRAINT "college_access_rate_count" CHECK("college_access_rate_limits"."count">0)
);
--> statement-breakpoint
CREATE TABLE `college_interest_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`contact_name` text NOT NULL,
	`contact_email` text NOT NULL,
	`program_interest` text DEFAULT '' NOT NULL,
	`study_format` text DEFAULT 'either' NOT NULL,
	`start_timing` text DEFAULT '' NOT NULL,
	`consent_version` text NOT NULL,
	`consent_text` text NOT NULL,
	`consented_at` integer NOT NULL,
	`withdrawn_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `college_organizations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "college_interest_name_length" CHECK(length("college_interest_requests"."contact_name") BETWEEN 2 AND 100),
	CONSTRAINT "college_interest_email_length" CHECK(length("college_interest_requests"."contact_email") BETWEEN 3 AND 254),
	CONSTRAINT "college_interest_program_length" CHECK(length("college_interest_requests"."program_interest") <= 200),
	CONSTRAINT "college_interest_start_length" CHECK(length("college_interest_requests"."start_timing") <= 120),
	CONSTRAINT "college_interest_format" CHECK("college_interest_requests"."study_format" IN ('online','campus','either')),
	CONSTRAINT "college_interest_consent_version" CHECK(length("college_interest_requests"."consent_version") BETWEEN 1 AND 80),
	CONSTRAINT "college_interest_consent_text" CHECK(length("college_interest_requests"."consent_text") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE INDEX `college_interest_lead_scope` ON `college_interest_requests` (`organization_id`,`withdrawn_at`,`consented_at`,`id`);--> statement-breakpoint
CREATE INDEX `college_interest_student` ON `college_interest_requests` (`user_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `college_interest_student_org` ON `college_interest_requests` (`user_id`,`organization_id`);--> statement-breakpoint
CREATE TABLE `college_memberships` (
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`granted_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`organization_id`, `user_id`),
	FOREIGN KEY (`organization_id`) REFERENCES `college_organizations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "college_member_role" CHECK("college_memberships"."role" IN ('advisor','admin')),
	CONSTRAINT "college_member_status" CHECK("college_memberships"."status" IN ('active','revoked'))
);
--> statement-breakpoint
CREATE INDEX `college_memberships_user` ON `college_memberships` (`user_id`,`status`,`organization_id`);--> statement-breakpoint
CREATE TABLE `college_organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`website` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`verified_by` text,
	`verified_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "college_org_name_length" CHECK(length("college_organizations"."name") BETWEEN 2 AND 160),
	CONSTRAINT "college_org_website_length" CHECK(length("college_organizations"."website") BETWEEN 8 AND 1500),
	CONSTRAINT "college_org_status" CHECK("college_organizations"."status" IN ('pending','verified','revoked')),
	CONSTRAINT "college_org_revision" CHECK("college_organizations"."revision" > 0)
);
--> statement-breakpoint
CREATE INDEX `college_organizations_status` ON `college_organizations` (`status`,`created_at`,`id`);