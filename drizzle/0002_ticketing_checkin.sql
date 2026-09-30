CREATE TABLE `event_scanners` (
	`event_id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_scanners_token_unique` ON `event_scanners` (`token`);--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`reservation_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`checked_in_at` integer,
	FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tickets_reservation_ordinal` ON `tickets` (`reservation_id`,`ordinal`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tickets_token` ON `tickets` (`token`);--> statement-breakpoint
ALTER TABLE `reservations` ADD `attendee_name` text;--> statement-breakpoint
ALTER TABLE `reservations` ADD `attendee_phone` text;