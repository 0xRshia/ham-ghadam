CREATE TABLE `profile_media` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_media_user_id_unique` ON `profile_media` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `profile_media_storage_key_unique` ON `profile_media` (`storage_key`);