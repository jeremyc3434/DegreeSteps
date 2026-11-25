DROP INDEX `community_comments_context`;--> statement-breakpoint
CREATE INDEX `community_comments_context` ON `community_comments` (`context`,`deleted_at`,`created_at`,`id`,`user_id`);