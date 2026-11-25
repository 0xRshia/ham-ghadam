ALTER TABLE squirrel_reward_sessions ADD COLUMN reward_mode TEXT NOT NULL DEFAULT 'coupon' CHECK(reward_mode IN ('coupon','wallet'));
--> statement-breakpoint
ALTER TABLE squirrel_reward_sessions ADD COLUMN user_id TEXT REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE squirrel_reward_sessions ADD COLUMN handoff_hash TEXT;
--> statement-breakpoint
ALTER TABLE squirrel_reward_sessions ADD COLUMN handoff_expires_at INTEGER;
--> statement-breakpoint
CREATE UNIQUE INDEX idx_squirrel_reward_handoffs ON squirrel_reward_sessions(handoff_hash) WHERE handoff_hash IS NOT NULL;
--> statement-breakpoint
CREATE TABLE wallet_transactions_next (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK(kind IN ('admin_grant','top_up','game_reward')),
  amount INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','completed','failed','cancelled','paid_unfulfilled')),
  balance_after INTEGER,
  note TEXT NOT NULL DEFAULT '',
  authority TEXT UNIQUE,
  reference TEXT,
  payment_state TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  game_session_id TEXT UNIQUE REFERENCES squirrel_reward_sessions(id),
  CHECK (
    (kind='game_reward' AND amount=100 AND status='completed' AND game_session_id IS NOT NULL)
    OR (kind IN ('admin_grant','top_up') AND amount>=1000 AND amount<=10000000 AND game_session_id IS NULL)
  )
);
--> statement-breakpoint
INSERT INTO wallet_transactions_next(id,user_id,kind,amount,status,balance_after,note,authority,reference,payment_state,created_at,completed_at)
SELECT id,user_id,kind,amount,status,balance_after,note,authority,reference,payment_state,created_at,completed_at
FROM wallet_transactions;
--> statement-breakpoint
DROP TABLE wallet_transactions;
--> statement-breakpoint
ALTER TABLE wallet_transactions_next RENAME TO wallet_transactions;
--> statement-breakpoint
CREATE INDEX idx_wallet_transactions_user ON wallet_transactions(user_id, created_at);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_wallet_game_reward_user ON wallet_transactions(user_id) WHERE kind='game_reward';
