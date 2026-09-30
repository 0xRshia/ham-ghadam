ALTER TABLE `events` ADD `registration_ends_at` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE events SET registration_ends_at = starts_at - 86400000;
