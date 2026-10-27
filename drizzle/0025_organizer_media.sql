CREATE TABLE organizer_media (
  id TEXT PRIMARY KEY NOT NULL,
  organizer_id TEXT NOT NULL UNIQUE REFERENCES organizers(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK(content_type IN ('image/jpeg','image/png','image/webp')),
  byte_size INTEGER NOT NULL CHECK(byte_size>0 AND byte_size<=5242880),
  source TEXT NOT NULL CHECK(source IN ('upload','instagram')),
  instagram_handle TEXT,
  created_at INTEGER NOT NULL
);
