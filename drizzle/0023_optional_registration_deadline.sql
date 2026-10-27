-- Keep the event parent and its dependent history intact while making the deadline nullable.
DROP TRIGGER events_edit_revision;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN __nullable_registration_ends_at INTEGER;
--> statement-breakpoint
UPDATE events SET __nullable_registration_ends_at=registration_ends_at;
--> statement-breakpoint
ALTER TABLE events DROP COLUMN registration_ends_at;
--> statement-breakpoint
ALTER TABLE events RENAME COLUMN __nullable_registration_ends_at TO registration_ends_at;
--> statement-breakpoint
CREATE TRIGGER events_edit_revision AFTER UPDATE OF title,description,category,host_id,organizer_id,organizer_name,instagram_url,original_price,venue,address,city,lat,lng,maps_url,starts_at,ends_at,registration_ends_at,price,capacity,image,published,schedule_json ON events
WHEN NEW.revision=OLD.revision BEGIN UPDATE events SET revision=OLD.revision+1 WHERE id=NEW.id; END;
