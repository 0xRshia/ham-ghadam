CREATE TABLE `challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`consumed` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`host_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`venue` text NOT NULL,
	`address` text NOT NULL,
	`city` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`price` integer NOT NULL,
	`capacity` integer,
	`image` text NOT NULL,
	`published` integer DEFAULT 1 NOT NULL,
	`sample` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_events_city_start` ON `events` (`city`,`starts_at`);--> statement-breakpoint
CREATE INDEX `idx_events_host` ON `events` (`host_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`resets_at` integer NOT NULL,
	`last_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`event_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`total` integer NOT NULL,
	`amount_rial` integer NOT NULL,
	`status` text NOT NULL,
	`request_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	`authority` text,
	`reference` text,
	`payment_state` text DEFAULT 'none' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reservations_request` ON `reservations` (`user_id`,`request_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reservations_authority` ON `reservations` (`authority`);--> statement-breakpoint
CREATE INDEX `idx_reservations_event_status` ON `reservations` (`event_id`,`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_reservations_user_created` ON `reservations` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_expiry` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_unique` ON `users` (`phone`);