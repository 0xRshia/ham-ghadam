CREATE TABLE `event_programs` (
	`event_id` text PRIMARY KEY NOT NULL,
	`series_id` text,
	`video_url` text,
	`agenda_json` text DEFAULT '[]' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`series_id`) REFERENCES `event_series`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_event_programs_series` ON `event_programs` (`series_id`);--> statement-breakpoint
CREATE TABLE `event_series` (
	`id` text PRIMARY KEY NOT NULL,
	`host_id` text NOT NULL,
	`title` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_event_series_host` ON `event_series` (`host_id`);