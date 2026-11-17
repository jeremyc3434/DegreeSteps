CREATE TABLE `template_research_progress` (
	`template_id` text PRIMARY KEY NOT NULL,
	`stage` text NOT NULL,
	`pass` integer DEFAULT 1 NOT NULL,
	`source_count` integer DEFAULT 0 NOT NULL,
	`requirement_count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `degree_templates`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "template_progress_stage" CHECK("template_research_progress"."stage" IN ('identifying','requirements','transfers','checking','refining','complete','needs-attention')),
	CONSTRAINT "template_progress_pass" CHECK("template_research_progress"."pass" BETWEEN 1 AND 2),
	CONSTRAINT "template_progress_sources" CHECK("template_research_progress"."source_count" BETWEEN 0 AND 200),
	CONSTRAINT "template_progress_requirements" CHECK("template_research_progress"."requirement_count" BETWEEN 0 AND 180)
);
