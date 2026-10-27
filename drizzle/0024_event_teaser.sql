-- Teasers enrich both manual and sheet-synced events without replacing video.
ALTER TABLE events ADD COLUMN teaser_url text;
--> statement-breakpoint
DROP TRIGGER events_edit_revision;
--> statement-breakpoint
CREATE TRIGGER events_edit_revision AFTER UPDATE OF title,description,category,host_id,organizer_id,organizer_name,instagram_url,teaser_url,original_price,venue,address,city,lat,lng,maps_url,starts_at,ends_at,registration_ends_at,price,capacity,image,published,schedule_json ON events
WHEN NEW.revision=OLD.revision BEGIN UPDATE events SET revision=OLD.revision+1 WHERE id=NEW.id; END;
