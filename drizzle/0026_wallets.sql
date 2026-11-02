CREATE TABLE wallets (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id),
  balance INTEGER NOT NULL DEFAULT 0 CHECK(balance>=0 AND balance<=10000000),
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE wallet_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK(kind IN ('admin_grant','top_up')),
  amount INTEGER NOT NULL CHECK(amount>=1000 AND amount<=10000000),
  status TEXT NOT NULL CHECK(status IN ('pending','completed','failed','cancelled','paid_unfulfilled')),
  balance_after INTEGER,
  note TEXT NOT NULL DEFAULT '',
  authority TEXT UNIQUE,
  reference TEXT,
  payment_state TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
--> statement-breakpoint
CREATE INDEX idx_wallet_transactions_user ON wallet_transactions(user_id, created_at);
