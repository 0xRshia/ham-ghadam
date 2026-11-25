CREATE TABLE wallet_transactions_next (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK(kind IN ('admin_grant','top_up','game_reward','game_reward_adjustment')),
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
    (kind='game_reward' AND amount IN (100,100000) AND status='completed' AND game_session_id IS NOT NULL)
    OR (kind='game_reward_adjustment' AND amount=99900 AND status='completed' AND game_session_id IS NULL)
    OR (kind IN ('admin_grant','top_up') AND amount>=1000 AND amount<=10000000 AND game_session_id IS NULL)
  )
);
--> statement-breakpoint
INSERT INTO wallet_transactions_next(id,user_id,kind,amount,status,balance_after,note,authority,reference,payment_state,created_at,completed_at,game_session_id)
SELECT id,user_id,kind,amount,status,balance_after,note,authority,reference,payment_state,created_at,completed_at,game_session_id
FROM wallet_transactions;
--> statement-breakpoint
DROP TABLE wallet_transactions;
--> statement-breakpoint
ALTER TABLE wallet_transactions_next RENAME TO wallet_transactions;
--> statement-breakpoint
CREATE INDEX idx_wallet_transactions_user ON wallet_transactions(user_id, created_at);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_wallet_game_reward_user ON wallet_transactions(user_id) WHERE kind='game_reward';
--> statement-breakpoint
CREATE UNIQUE INDEX idx_wallet_game_reward_adjustment_user ON wallet_transactions(user_id) WHERE kind='game_reward_adjustment';
--> statement-breakpoint
CREATE TRIGGER wallet_current_game_reward_amount
BEFORE INSERT ON wallet_transactions
WHEN NEW.kind='game_reward' AND NEW.amount<>100000
BEGIN
  SELECT RAISE(ABORT, 'new game rewards must be 100000 toman');
END;
--> statement-breakpoint
INSERT INTO wallet_transactions(id,user_id,kind,amount,status,balance_after,created_at,completed_at)
SELECT 'fandogh-adjustment:' || award.id,award.user_id,'game_reward_adjustment',99900,'completed',wallet.balance+99900,
       MAX(wallet.updated_at+1,CAST(strftime('%s','now') AS INTEGER)*1000),
       MAX(wallet.updated_at+1,CAST(strftime('%s','now') AS INTEGER)*1000)
FROM wallet_transactions AS award
JOIN wallets AS wallet ON wallet.user_id=award.user_id
WHERE award.kind='game_reward' AND award.amount=100 AND wallet.balance+99900<=10000000;
--> statement-breakpoint
UPDATE wallets
SET balance=(
  SELECT balance_after FROM wallet_transactions
  WHERE user_id=wallets.user_id AND kind='game_reward_adjustment'
), updated_at=(
  SELECT completed_at FROM wallet_transactions
  WHERE user_id=wallets.user_id AND kind='game_reward_adjustment'
)
WHERE EXISTS (
  SELECT 1 FROM wallet_transactions
  WHERE user_id=wallets.user_id AND kind='game_reward_adjustment'
);
