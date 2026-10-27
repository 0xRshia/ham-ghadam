CREATE TABLE user_terms_acceptances (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version text NOT NULL,
  accepted_at integer NOT NULL,
  PRIMARY KEY (user_id, version)
);
--> statement-breakpoint
CREATE TABLE organizer_contract_acceptances (
  id text PRIMARY KEY NOT NULL,
  event_id text REFERENCES events(id) ON DELETE SET NULL,
  user_id text NOT NULL REFERENCES users(id),
  version text NOT NULL,
  accepted_at integer NOT NULL,
  fields_json text NOT NULL,
  event_snapshot_json text NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_organizer_contract_event ON organizer_contract_acceptances(event_id, user_id, version);
