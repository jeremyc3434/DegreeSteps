CREATE TABLE `community_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`context` text NOT NULL,
	`parent_id` text,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `community_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_id`) REFERENCES `community_comments`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "community_comment_context_length" CHECK(length("community_comments"."context") BETWEEN 3 AND 180),
	CONSTRAINT "community_comment_body_length" CHECK(length("community_comments"."body") BETWEEN 1 AND 3000)
);
--> statement-breakpoint
CREATE INDEX `community_comments_context` ON `community_comments` (`context`,`deleted_at`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `community_context_reactions` (
	`context` text NOT NULL,
	`user_id` text NOT NULL,
	`reaction` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`context`, `user_id`, `reaction`),
	FOREIGN KEY (`user_id`) REFERENCES `community_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "community_context_reaction_context_length" CHECK(length("community_context_reactions"."context") BETWEEN 3 AND 180),
	CONSTRAINT "community_context_reaction_kind" CHECK("community_context_reactions"."reaction" IN ('like','upvote'))
);
--> statement-breakpoint
CREATE TABLE `community_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`context` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`url` text,
	`plan_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `community_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "community_post_context_length" CHECK(length("community_posts"."context") BETWEEN 3 AND 180),
	CONSTRAINT "community_post_kind" CHECK("community_posts"."kind" IN ('question','plan','template')),
	CONSTRAINT "community_post_title_length" CHECK(length("community_posts"."title") BETWEEN 3 AND 160),
	CONSTRAINT "community_post_body_length" CHECK(length("community_posts"."body") BETWEEN 1 AND 6000)
);
--> statement-breakpoint
CREATE INDEX `community_posts_feed` ON `community_posts` (`deleted_at`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `community_posts_context` ON `community_posts` (`context`,`deleted_at`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `community_posts_kind` ON `community_posts` (`kind`,`deleted_at`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `community_rate_limits` (
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`user_id`, `action`),
	FOREIGN KEY (`user_id`) REFERENCES `community_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "community_rate_action" CHECK("community_rate_limits"."action" IN ('publish','comment','reaction','report','profile','moderation')),
	CONSTRAINT "community_rate_positive" CHECK("community_rate_limits"."count">0)
);
--> statement-breakpoint
CREATE TABLE `community_reactions` (
	`post_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reaction` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`post_id`, `user_id`, `reaction`),
	FOREIGN KEY (`post_id`) REFERENCES `community_posts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `community_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "community_reaction_kind" CHECK("community_reactions"."reaction" IN ('like','upvote'))
);
--> statement-breakpoint
CREATE INDEX `community_reactions_user` ON `community_reactions` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `community_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`reviewed_at` integer,
	`reviewed_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `community_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `community_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "community_report_target_type" CHECK("community_reports"."target_type" IN ('post','comment')),
	CONSTRAINT "community_report_reason_length" CHECK(length("community_reports"."reason") BETWEEN 3 AND 1000),
	CONSTRAINT "community_report_status" CHECK("community_reports"."status" IN ('open','reviewed','dismissed'))
);
--> statement-breakpoint
CREATE INDEX `community_reports_queue` ON `community_reports` (`status`,`created_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `community_reports_user_target` ON `community_reports` (`user_id`,`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `community_users` (
	`id` text PRIMARY KEY NOT NULL,
	`alias` text DEFAULT 'Community member' NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "community_user_alias_length" CHECK(length("community_users"."alias") BETWEEN 2 AND 40),
	CONSTRAINT "community_user_role" CHECK("community_users"."role" IN ('member','moderator','owner'))
);
