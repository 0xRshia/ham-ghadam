-- TODO(PRODUCTION): REMOVE_TEMP_LOGIN
-- Run against the intended database after disabling temporary login.
-- Revoke these accounts' sessions without deleting account or event data.
DELETE FROM sessions
WHERE user_id IN (
  SELECT id FROM users
  WHERE phone IN ('09108624707', '09108624708')
);
