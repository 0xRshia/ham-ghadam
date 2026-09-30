-- Remove only the temp-20260925 batch, after a fresh verified backup.
-- Refuses cleanup if these events acquired additional bookings, uploads or scanner links.
-- Existing demo users and all pre-existing data remain intact.
-- Deletes batch-created demo accounts only if no other records depend on them.
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
BEGIN IMMEDIATE;

CREATE TEMP TABLE _temp_event_cleanup_ids (id TEXT PRIMARY KEY);
INSERT INTO _temp_event_cleanup_ids
SELECT id FROM events WHERE sample = 1 AND id GLOB 'temp-20260925-*';

CREATE TEMP TABLE _temp_event_cleanup_guard (safe_to_remove INTEGER CHECK (safe_to_remove = 1));
INSERT OR ROLLBACK INTO _temp_event_cleanup_guard
SELECT CASE WHEN
  NOT EXISTS (
    SELECT 1 FROM reservations r JOIN _temp_event_cleanup_ids e ON e.id = r.event_id
    WHERE r.id <> e.id || '-reservation'
      OR r.user_id IS NOT (SELECT id FROM users WHERE phone = '09108624707')
      OR r.quantity <> 2 OR r.status <> 'confirmed'
      OR r.payment_state NOT IN ('none', 'skipped_dev')
      OR r.authority IS NOT NULL OR r.reference IS NOT NULL
  ) AND NOT EXISTS (
    SELECT 1 FROM tickets t JOIN reservations r ON r.id = t.reservation_id
    JOIN _temp_event_cleanup_ids e ON e.id = r.event_id
    WHERE t.checked_in_at IS NOT NULL OR t.id <> r.id || '-ticket-' || t.ordinal
  ) AND NOT EXISTS (
    SELECT 1 FROM event_media m JOIN _temp_event_cleanup_ids e ON e.id = m.event_id
  ) AND NOT EXISTS (
    SELECT 1 FROM event_scanners s JOIN _temp_event_cleanup_ids e ON e.id = s.event_id
  ) THEN 1 ELSE 0 END;

DELETE FROM tickets WHERE reservation_id IN (
  SELECT r.id FROM reservations r JOIN _temp_event_cleanup_ids e ON e.id = r.event_id
);
DELETE FROM reservations WHERE event_id IN (SELECT id FROM _temp_event_cleanup_ids);
DELETE FROM events WHERE id IN (SELECT id FROM _temp_event_cleanup_ids);

DELETE FROM users
WHERE ((id = 'temp-20260925-host' AND phone = '09108624708')
    OR (id = 'temp-20260925-attendee' AND phone = '09108624707'))
  AND NOT EXISTS (SELECT 1 FROM events WHERE host_id = users.id)
  AND NOT EXISTS (SELECT 1 FROM reservations WHERE user_id = users.id)
  AND NOT EXISTS (SELECT 1 FROM sessions WHERE user_id = users.id);

DROP TABLE _temp_event_cleanup_guard;
DROP TABLE _temp_event_cleanup_ids;
COMMIT;
