-- Drizzle Kit's ADD COLUMN emitted REFERENCES without ON DELETE CASCADE.
-- This trigger also revokes subscriptions on databases that applied that migration.
CREATE TRIGGER revoke_session_push BEFORE DELETE ON sessions
BEGIN
  DELETE FROM push_subscriptions WHERE session_hash=OLD.hash;
END;
