-- Alter columns in place; rebuilding the event parent would cascade into media and history.
DROP TRIGGER events_edit_revision;
--> statement-breakpoint
DROP INDEX idx_events_city_start;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN __nullable_starts_at INTEGER;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN __nullable_ends_at INTEGER;
--> statement-breakpoint
UPDATE events SET __nullable_starts_at=starts_at,__nullable_ends_at=ends_at;
--> statement-breakpoint
ALTER TABLE events DROP COLUMN starts_at;
--> statement-breakpoint
ALTER TABLE events DROP COLUMN ends_at;
--> statement-breakpoint
ALTER TABLE events RENAME COLUMN __nullable_starts_at TO starts_at;
--> statement-breakpoint
ALTER TABLE events RENAME COLUMN __nullable_ends_at TO ends_at;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN schedule_json TEXT;
--> statement-breakpoint
CREATE INDEX idx_events_city_start ON events(city,starts_at);
--> statement-breakpoint
CREATE TRIGGER events_edit_revision AFTER UPDATE OF title,description,category,host_id,organizer_id,organizer_name,instagram_url,original_price,venue,address,city,lat,lng,maps_url,starts_at,ends_at,registration_ends_at,price,capacity,image,published,schedule_json ON events
WHEN NEW.revision=OLD.revision BEGIN UPDATE events SET revision=OLD.revision+1 WHERE id=NEW.id; END;
--> statement-breakpoint
CREATE TABLE event_sync_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  sheet_url TEXT NOT NULL,
  persian_year INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  next_scheduled_at INTEGER NOT NULL DEFAULT 0,
  heartbeat_at INTEGER
);
--> statement-breakpoint
INSERT INTO event_sync_settings(id,sheet_url,persian_year) VALUES(1,'https://docs.google.com/spreadsheets/d/1BDtW3PvSm26WjpPvKqg3cASf3LnicLShbhsRWJavEv8/edit?gid=1283818652',1405);
--> statement-breakpoint
CREATE TABLE event_sync_runs (
  id TEXT PRIMARY KEY,
  settings_revision INTEGER NOT NULL,
  sheet_url TEXT NOT NULL,
  persian_year INTEGER NOT NULL,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  active INTEGER UNIQUE CHECK(active IS NULL OR active=1),
  lease_token TEXT NOT NULL DEFAULT '',
  lease_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  finished_at INTEGER,
  total INTEGER NOT NULL DEFAULT 0,
  unpublished INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
--> statement-breakpoint
CREATE TABLE event_sync_items (
  run_id TEXT NOT NULL REFERENCES event_sync_runs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  external_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  PRIMARY KEY(run_id,row_number),
  UNIQUE(run_id,external_id)
);
--> statement-breakpoint
CREATE INDEX idx_event_sync_items_status ON event_sync_items(run_id,status,row_number);
--> statement-breakpoint
CREATE TABLE event_sheet_links (
  external_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  image_hash TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  last_run_id TEXT NOT NULL
);
