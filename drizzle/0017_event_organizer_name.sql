-- Keep the parent table intact so media, tickets and scanner links survive.
-- Suspend revision tracking while copying the existing owner column.
DROP TRIGGER events_edit_revision;
--> statement-breakpoint
DROP INDEX idx_events_host;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN __nullable_host_id TEXT;
--> statement-breakpoint
UPDATE events SET __nullable_host_id=host_id;
--> statement-breakpoint
ALTER TABLE events DROP COLUMN host_id;
--> statement-breakpoint
ALTER TABLE events RENAME COLUMN __nullable_host_id TO host_id;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN organizer_name TEXT;
--> statement-breakpoint
CREATE INDEX idx_events_host ON events(host_id);
--> statement-breakpoint
CREATE TRIGGER events_edit_revision AFTER UPDATE OF title,description,category,host_id,organizer_name,venue,address,city,lat,lng,maps_url,starts_at,ends_at,registration_ends_at,price,capacity,image,published ON events
WHEN NEW.revision=OLD.revision
BEGIN
  UPDATE events SET revision=OLD.revision+1 WHERE id=NEW.id;
END;
