CREATE TABLE squirrel_reward_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  browser_hash TEXT NOT NULL,
  seed INTEGER NOT NULL CHECK(seed BETWEEN 0 AND 4294967295),
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_squirrel_reward_sessions_browser ON squirrel_reward_sessions(browser_hash, expires_at);
--> statement-breakpoint
CREATE TABLE squirrel_reward_coupons (
  code TEXT PRIMARY KEY NOT NULL,
  browser_hash TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL UNIQUE REFERENCES squirrel_reward_sessions(id),
  issued_at INTEGER NOT NULL
);
--> statement-breakpoint
ALTER TABLE reservations ADD COLUMN squirrel_coupon_code TEXT REFERENCES squirrel_reward_coupons(code);
--> statement-breakpoint
ALTER TABLE reservations ADD COLUMN squirrel_coupon_discount INTEGER NOT NULL DEFAULT 0 CHECK(squirrel_coupon_discount BETWEEN 0 AND 300000);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_reservations_squirrel_coupon ON reservations(squirrel_coupon_code)
  WHERE squirrel_coupon_code IS NOT NULL AND status != 'cancelled' AND NOT (status='failed' AND authority IS NULL);
