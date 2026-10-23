ALTER TABLE events ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE TABLE fast_sessions (
  hash TEXT PRIMARY KEY NOT NULL,
  credential_fingerprint TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_fast_sessions_expiry ON fast_sessions(expires_at);
--> statement-breakpoint
-- Host publication changes must invalidate an open admin editor too.
CREATE TRIGGER events_edit_revision AFTER UPDATE OF title,description,category,host_id,venue,address,city,lat,lng,maps_url,starts_at,ends_at,registration_ends_at,price,capacity,image,published ON events
WHEN NEW.revision=OLD.revision
BEGIN
  UPDATE events SET revision=OLD.revision+1 WHERE id=NEW.id;
END;
