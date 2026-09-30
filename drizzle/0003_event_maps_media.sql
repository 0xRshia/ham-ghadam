-- Keep the parent table: rebuilding it would cascade-delete event scanner links.
ALTER TABLE events ADD COLUMN __nullable_lat REAL;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN __nullable_lng REAL;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN __nullable_image TEXT;
--> statement-breakpoint
UPDATE events SET __nullable_lat=lat, __nullable_lng=lng, __nullable_image=NULLIF(image,'');
--> statement-breakpoint
ALTER TABLE events DROP COLUMN lat;
--> statement-breakpoint
ALTER TABLE events DROP COLUMN lng;
--> statement-breakpoint
ALTER TABLE events DROP COLUMN image;
--> statement-breakpoint
ALTER TABLE events RENAME COLUMN __nullable_lat TO lat;
--> statement-breakpoint
ALTER TABLE events RENAME COLUMN __nullable_lng TO lng;
--> statement-breakpoint
ALTER TABLE events RENAME COLUMN __nullable_image TO image;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN maps_url TEXT;
--> statement-breakpoint
UPDATE events SET maps_url='https://www.google.com/maps/search/?api=1&query=' || lat || '%2C' || lng;
--> statement-breakpoint
CREATE TABLE event_media (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  position INTEGER NOT NULL,
  storage_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX event_media_storage_key_unique ON event_media(storage_key);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_event_media_position ON event_media(event_id,role,position);
