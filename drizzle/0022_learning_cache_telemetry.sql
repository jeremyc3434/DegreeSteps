ALTER TABLE `learning_billing_runs` ADD `workflow` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `learning_billing_runs` ADD `prompt_version` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `learning_billing_runs` ADD `cache_mode` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `learning_billing_runs` ADD `cache_status` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `learning_billing_runs` ADD `prefix_tokens` integer;--> statement-breakpoint
ALTER TABLE `learning_billing_runs` ADD `provider_duration_ms` integer;--> statement-breakpoint
ALTER TABLE `learning_billing_runs` ADD `ttft_ms` integer;--> statement-breakpoint
ALTER TABLE `learning_billing_runs` ADD `feedback_rating` text;--> statement-breakpoint
ALTER TABLE `learning_billing_runs` ADD `feedback_reason` text;--> statement-breakpoint
ALTER TABLE `learning_billing_runs` ADD `feedback_updated_at` integer;