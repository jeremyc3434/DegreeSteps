CREATE TABLE `learning_billing_accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`month` text NOT NULL,
	`writing_remaining` integer NOT NULL,
	`study_remaining` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "learning_account_units" CHECK("learning_billing_accounts"."writing_remaining">=0 AND "learning_billing_accounts"."study_remaining">=0)
);
--> statement-breakpoint
CREATE TABLE `learning_billing_days` (
	`day` text PRIMARY KEY NOT NULL,
	`actual_micro_usd` integer DEFAULT 0 NOT NULL,
	`reserved_micro_usd` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "learning_day_spend" CHECK("learning_billing_days"."actual_micro_usd">=0 AND "learning_billing_days"."reserved_micro_usd">=0)
);
--> statement-breakpoint
CREATE TABLE `learning_billing_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`product_id` text NOT NULL,
	`project_id` text,
	`request_id` text NOT NULL,
	`bucket` text NOT NULL,
	`price_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`units` integer NOT NULL,
	`units_remaining` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`session_id` text,
	`payment_intent_id` text,
	`amount_refunded` integer DEFAULT 0 NOT NULL,
	`grant_event_id` text,
	`refund_event_id` text,
	`created_at` integer NOT NULL,
	`paid_at` integer,
	`updated_at` integer NOT NULL,
	CONSTRAINT "learning_order_state" CHECK("learning_billing_orders"."status" IN ('pending','paid','expired','refunded')),
	CONSTRAINT "learning_order_money" CHECK("learning_billing_orders"."price_cents">0 AND "learning_billing_orders"."units">0 AND "learning_billing_orders"."units_remaining">=0 AND "learning_billing_orders"."units_remaining"<="learning_billing_orders"."units" AND "learning_billing_orders"."amount_refunded">=0 AND "learning_billing_orders"."amount_refunded"<="learning_billing_orders"."price_cents")
);
--> statement-breakpoint
CREATE INDEX `learning_order_credit` ON `learning_billing_orders` (`user_id`,`status`,`bucket`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `learning_order_request_owner` ON `learning_billing_orders` (`user_id`,`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `learning_order_session` ON `learning_billing_orders` (`session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `learning_order_payment_intent` ON `learning_billing_orders` (`payment_intent_id`);--> statement-breakpoint
CREATE TABLE `learning_billing_projects` (
	`project_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`bucket` text NOT NULL,
	`state` text DEFAULT 'new' NOT NULL,
	`credit_source` text,
	`grant_order_id` text,
	`credit_month` text,
	`runs` integer DEFAULT 0 NOT NULL,
	`active_run_id` text,
	`updated_at` integer NOT NULL,
	CONSTRAINT "learning_project_bucket" CHECK("learning_billing_projects"."bucket" IN ('writing','study')),
	CONSTRAINT "learning_project_state" CHECK("learning_billing_projects"."state" IN ('new','pending','active','revoked')),
	CONSTRAINT "learning_project_runs" CHECK("learning_billing_projects"."runs">=0)
);
--> statement-breakpoint
CREATE INDEX `learning_billing_project_owner` ON `learning_billing_projects` (`user_id`);--> statement-breakpoint
CREATE TABLE `learning_billing_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`request_id` text NOT NULL,
	`action` text NOT NULL,
	`day` text NOT NULL,
	`month` text NOT NULL,
	`status` text NOT NULL,
	`first_charge` integer NOT NULL,
	`credit_source` text,
	`grant_order_id` text,
	`reserved_micro_usd` integer NOT NULL,
	`actual_micro_usd` integer DEFAULT 0 NOT NULL,
	`estimated` integer DEFAULT 0 NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cache_write_tokens` integer DEFAULT 0 NOT NULL,
	`cache_read_tokens` integer DEFAULT 0 NOT NULL,
	`searches` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`settled_at` integer,
	`lease_until` integer NOT NULL,
	`settlement_id` text,
	CONSTRAINT "learning_run_status" CHECK("learning_billing_runs"."status" IN ('reserved','completed','failed')),
	CONSTRAINT "learning_run_cost" CHECK("learning_billing_runs"."reserved_micro_usd">=0 AND "learning_billing_runs"."actual_micro_usd">=0 AND "learning_billing_runs"."first_charge" IN (0,1) AND "learning_billing_runs"."estimated" IN (0,1))
);
--> statement-breakpoint
CREATE INDEX `learning_run_day` ON `learning_billing_runs` (`day`,`status`);--> statement-breakpoint
CREATE INDEX `learning_run_project` ON `learning_billing_runs` (`project_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `learning_run_request_owner` ON `learning_billing_runs` (`user_id`,`request_id`);--> statement-breakpoint
CREATE TABLE `learning_billing_user_days` (
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`actual_micro_usd` integer DEFAULT 0 NOT NULL,
	`reserved_micro_usd` integer DEFAULT 0 NOT NULL,
	`calls` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `day`),
	CONSTRAINT "learning_user_day_spend" CHECK("learning_billing_user_days"."actual_micro_usd">=0 AND "learning_billing_user_days"."reserved_micro_usd">=0 AND "learning_billing_user_days"."calls">=0)
);
