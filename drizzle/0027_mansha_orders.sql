CREATE TABLE mansha_orders (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  seller_id TEXT NOT NULL REFERENCES users(id),
  buyer_session_hash TEXT NOT NULL,
  request_key TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  buyer_phone TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 10),
  amount_toman INTEGER NOT NULL CHECK(amount_toman BETWEEN 1000 AND 100000000),
  status TEXT NOT NULL CHECK(status IN ('requesting','pending','paid','failed')),
  authority TEXT UNIQUE,
  reference TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_mansha_orders_request ON mansha_orders(buyer_session_hash, request_key);
