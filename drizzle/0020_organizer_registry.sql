CREATE TABLE `organizers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`instagram_handle` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizers_user_id_unique` ON `organizers` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `organizers_instagram_handle_unique` ON `organizers` (`instagram_handle`);--> statement-breakpoint
-- Keep the existing account IDs, so public links and follows remain valid.
INSERT INTO organizers(id,user_id,name,created_at) SELECT id,id,name,created_at FROM users;
--> statement-breakpoint
CREATE TRIGGER users_organizer_insert AFTER INSERT ON users BEGIN
  INSERT INTO organizers(id,user_id,name,created_at) VALUES(NEW.id,NEW.id,NEW.name,NEW.created_at);
END;
--> statement-breakpoint
CREATE TABLE `__new_organizer_follows` (
	`user_id` text NOT NULL,
	`organizer_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `organizer_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organizer_id`) REFERENCES `organizers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_organizer_follows`("user_id", "organizer_id", "created_at") SELECT "user_id", "organizer_id", "created_at" FROM `organizer_follows`;--> statement-breakpoint
DROP TABLE `organizer_follows`;--> statement-breakpoint
ALTER TABLE `__new_organizer_follows` RENAME TO `organizer_follows`;--> statement-breakpoint
CREATE INDEX `idx_follows_organizer` ON `organizer_follows` (`organizer_id`);--> statement-breakpoint
ALTER TABLE `events` ADD `organizer_id` text REFERENCES organizers(id);--> statement-breakpoint
CREATE INDEX `idx_events_organizer` ON `events` (`organizer_id`);
--> statement-breakpoint
-- This is an additive child relation; never rebuild the parent events table.
DROP TRIGGER events_edit_revision;
--> statement-breakpoint
UPDATE events SET organizer_id=host_id WHERE host_id IN (SELECT id FROM organizers);
--> statement-breakpoint
-- Preserve legacy name-only organizers. Exact normalized names share a profile;
-- new Instagram identities are deduplicated by their unique handle instead.
INSERT INTO organizers(id,name,created_at)
SELECT 'legacy:' || MIN(id),TRIM(organizer_name),MIN(COALESCE(created_at,0)) FROM events
WHERE host_id IS NULL AND LENGTH(TRIM(COALESCE(organizer_name,'')))>0
GROUP BY LOWER(REPLACE(REPLACE(TRIM(organizer_name),'ي','ی'),'ك','ک'));
--> statement-breakpoint
UPDATE events SET organizer_id=(SELECT id FROM organizers o WHERE o.user_id IS NULL
  AND LOWER(REPLACE(REPLACE(TRIM(o.name),'ي','ی'),'ك','ک'))=LOWER(REPLACE(REPLACE(TRIM(events.organizer_name),'ي','ی'),'ك','ک')) LIMIT 1)
WHERE host_id IS NULL AND organizer_name IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER events_edit_revision AFTER UPDATE OF title,description,category,host_id,organizer_id,organizer_name,instagram_url,original_price,venue,address,city,lat,lng,maps_url,starts_at,ends_at,registration_ends_at,price,capacity,image,published ON events
WHEN NEW.revision=OLD.revision
BEGIN
  UPDATE events SET revision=OLD.revision+1 WHERE id=NEW.id;
END;
