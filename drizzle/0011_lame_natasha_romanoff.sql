CREATE TABLE `push_deliveries` (
	`notification_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`delivered_at` integer,
	`status_code` integer,
	PRIMARY KEY(`notification_id`, `subscription_id`),
	FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subscription_id`) REFERENCES `push_subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `collection_events` ADD `added_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD `session_hash` text REFERENCES sessions(hash);