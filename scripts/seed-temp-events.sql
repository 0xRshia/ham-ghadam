-- User-requested temporary catalog, batch temp-20260925.
-- Apply to the intended SQLite database after a verified online backup.
-- Requires all migrations and SEED_SAMPLE_EVENTS=true; creates missing demo accounts.
-- Inserts 36 events, 6 demo reservations and 12 tickets. Reruns preserve existing rows/dates.
-- Paid demo reservations use skipped_dev and never count as revenue or paid popularity.
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
BEGIN IMMEDIATE;

-- Reuse existing demo accounts by phone; never change their identity or enable demo login.
INSERT INTO users (id, phone, name, created_at)
VALUES
  ('temp-20260925-host', '09108624708', 'میزبان آزمایشی', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('temp-20260925-attendee', '09108624707', 'کاربر آزمایشی', CAST(strftime('%s', 'now') AS INTEGER) * 1000)
ON CONFLICT(phone) DO NOTHING;

CREATE TEMP TABLE _temp_event_seed_context (
  now_ms INTEGER NOT NULL,
  evening_ms INTEGER NOT NULL,
  host_id TEXT NOT NULL,
  attendee_id TEXT NOT NULL
);
INSERT OR ROLLBACK INTO _temp_event_seed_context
SELECT
  CAST(strftime('%s', 'now') AS INTEGER) / 300 * 300000,
  CAST(strftime('%s', 'now', '+3 hours', '+30 minutes', 'start of day',
    '+15 hours', '+30 minutes') AS INTEGER) * 1000,
  (SELECT id FROM users WHERE phone = '09108624708'),
  (SELECT id FROM users WHERE phone = '09108624707');
-- Choose the next 19:00 Tehran slot with at least two hours left to register.
UPDATE _temp_event_seed_context SET evening_ms = evening_ms + 86400000
WHERE evening_ms <= now_ms + 7200000;

CREATE TEMP TABLE _temp_event_seed_rows AS
WITH categories(category, category_order, title, description, venue, address, lat, lng, price, image) AS (
  VALUES
    ('music', 0, 'عصر موسیقی آکوستیک', 'دورهمی شنیدن موسیقی زنده و آشنایی با سازهای آکوستیک.', 'کافه سام', 'ونک، خیابان خدامی', 35.7581, 51.4102, 280000, '/images/cafe.jpg'),
    ('art', 1, 'کارگاه سفال و رنگ', 'تجربه ساخت یک ظرف سفالی و تمرین رنگ‌آمیزی در جمعی کوچک.', 'کافه حیاط شماره ۶۵', 'خیابان ویلا، خیابان سمیه', 35.7052, 51.4154, 450000, '/images/pottery.jpg'),
    ('books', 2, 'کتاب و گفتگوی عصرانه', 'گفتگو درباره کتاب‌های محبوب و شنیدن برداشت‌های متفاوت خوانندگان.', 'کافه کتاب ثالث', 'کریم‌خان زند، بین ایرانشهر و ماهشهر', 35.7143, 51.4193, 120000, '/images/books.jpg'),
    ('games', 3, 'شب بازی‌های رومیزی', 'آشنایی با قوانین بازی‌های گروهی و یک دور بازی با راهنمای جمع.', 'کافه برد', 'خیابان انقلاب، خیابان وصال شیرازی', 35.7022, 51.4009, 150000, '/images/games.jpg'),
    ('coffee', 4, 'از دانه تا فنجان', 'آشنایی با عطر قهوه و تمرین دم‌آوری دستی با ابزارهای ساده.', 'کافه لمیز', 'خیابان ولیعصر، نزدیک پارک ساعی', 35.7338, 51.4103, 320000, '/images/cafe.jpg')
), scenarios(scenario, label, day_offset, is_free, capacity, deadline_hours) AS (
  VALUES
    ('free', 'ورودی رایگان', 0, 1, 24, 1),
    ('paid', 'ورودی بلیت‌دار', 1, 0, 30, 12),
    ('free-unlimited', 'رایگان با ظرفیت نامحدود', 7, 1, NULL, 24),
    ('paid-unlimited', 'بلیت‌دار با ظرفیت نامحدود', 14, 0, NULL, 24),
    ('closed', 'مهلت ثبت‌نام تمام شده', 3, 0, 20, NULL),
    ('sold-out', 'ظرفیت تکمیل', 5, 0, 2, 24)
)
SELECT
  'temp-20260925-' || c.category || '-' || s.scenario AS id,
  '[نمونه] ' || c.title || ' — ' || s.label AS title,
  'این برنامه صرفاً داده آزمایشی موقت است و برنامه واقعی این مکان نیست. ' || c.description AS description,
  c.category, c.venue, c.address, 'تهران' AS city, c.lat, c.lng,
  'https://www.google.com/maps/search/?api=1&query=' || c.lat || ',' || c.lng AS maps_url,
  x.evening_ms + (s.day_offset + c.category_order) * 86400000 AS starts_at,
  x.evening_ms + (s.day_offset + c.category_order) * 86400000 + 7200000 AS ends_at,
  CASE WHEN s.scenario = 'closed' THEN x.now_ms - 3600000
    ELSE x.evening_ms + (s.day_offset + c.category_order) * 86400000 - s.deadline_hours * 3600000
    END AS registration_ends_at,
  CASE WHEN s.is_free = 1 OR (s.scenario = 'sold-out' AND c.category IN ('music', 'games'))
    THEN 0 ELSE c.price END AS price,
  s.capacity, c.image, 1 AS published, x.now_ms - c.category_order * 3600000 AS created_at
FROM categories c CROSS JOIN scenarios s CROSS JOIN _temp_event_seed_context x;

INSERT INTO _temp_event_seed_rows
  (id, title, description, category, venue, address, city, lat, lng, maps_url,
   starts_at, ends_at, registration_ends_at, price, capacity, image, published, created_at)
SELECT 'temp-20260925-' || id, '[نمونه] ' || title,
  'این برنامه صرفاً داده آزمایشی موقت است و برنامه واقعی این مکان نیست. ' || description,
  category, venue, address, city, lat, lng, maps_url,
  CASE WHEN id = 'books-ongoing' THEN x.now_ms - 3600000 ELSE x.evening_ms + day_offset * 86400000 END,
  CASE WHEN id = 'books-ongoing' THEN x.now_ms + 3600000 ELSE x.evening_ms + day_offset * 86400000 + 7200000 END,
  CASE WHEN id = 'books-ongoing' THEN x.now_ms - 7200000 ELSE x.evening_ms + day_offset * 86400000 - 3600000 END,
  price, capacity, image, published, x.now_ms
FROM (
  SELECT 'art-last-seat' AS id, 'سفالگری؛ فقط یک صندلی باقی مانده' AS title,
    'کارگاه کوچک برای نمایش ظرفیت نزدیک به تکمیل و تصویر اختیاری.' AS description,
    'art' AS category, 'کافه حیاط شماره ۶۵' AS venue, 'خیابان ویلا، خیابان سمیه' AS address,
    'تهران' AS city, 35.7052 AS lat, 51.4154 AS lng,
    'https://www.google.com/maps/search/?api=1&query=35.7052,51.4154' AS maps_url,
    1 AS day_offset, 450000 AS price, 3 AS capacity, NULL AS image, 1 AS published
  UNION ALL SELECT 'coffee-paused', 'تمرین باریستا؛ انتشار متوقف', 'این برنامه فقط در پنل میزبان دیده می‌شود.',
    'coffee', 'کافه لمیز', 'خیابان ولیعصر، نزدیک پارک ساعی', 'تهران', 35.7338, 51.4103,
    'https://www.google.com/maps/search/?api=1&query=35.7338,51.4103', 3, 200000, 10, '/images/cafe.jpg', 0
  UNION ALL SELECT 'books-ongoing', 'گفتگوی کتاب؛ در حال برگزاری', 'نمونه برنامه‌ای که شروع شده و هنوز پایان نیافته است.',
    'books', 'کافه کتاب ثالث', 'کریم‌خان زند، بین ایرانشهر و ماهشهر', 'تهران', 35.7143, 51.4193,
    'https://www.google.com/maps/search/?api=1&query=35.7143,51.4193', 0, 0, NULL, '/images/books.jpg', 1
  UNION ALL SELECT 'music-past', 'شنیدن موسیقی؛ برنامه گذشته', 'نمونه برنامه پایان‌یافته برای پنل میزبان.',
    'music', 'کافه سام', 'ونک، خیابان خدامی', 'تهران', 35.7581, 51.4102,
    'https://www.google.com/maps/search/?api=1&query=35.7581,51.4102', -2, 0, 20, '/images/cafe.jpg', 1
  UNION ALL SELECT 'games-shiraz', 'دورهمی بازی در شیراز', 'برنامه نمونه برای بررسی انتخاب شهر شیراز.',
    'games', 'فضای نمونه شیراز', 'محدوده مرکز شهر؛ نشانی صرفاً آزمایشی', 'شیراز', 29.61, 52.53,
    'https://www.google.com/maps/search/?api=1&query=29.61,52.53', 4, 0, 16, '/images/games.jpg', 1
  UNION ALL SELECT 'art-isfahan', 'طراحی در اصفهان', 'برنامه نمونه با لینک مکان بدون مختصات برای بررسی فیلتر شهر.',
    'art', 'فضای نمونه اصفهان', 'محدوده مرکز شهر؛ نشانی صرفاً آزمایشی', 'اصفهان', NULL, NULL,
    'https://www.google.com/maps/search/?api=1&query=Isfahan', 6, 180000, NULL, '/images/pottery.jpg', 1
) CROSS JOIN _temp_event_seed_context x;

INSERT INTO events
  (id, host_id, title, description, category, venue, address, city, lat, lng, maps_url,
   starts_at, ends_at, registration_ends_at, price, capacity, image, published, sample, created_at)
SELECT e.id, x.host_id, e.title, e.description, e.category, e.venue, e.address, e.city,
  e.lat, e.lng, e.maps_url, e.starts_at, e.ends_at, e.registration_ends_at,
  e.price, e.capacity, e.image, e.published, 1, e.created_at
FROM _temp_event_seed_rows e CROSS JOIN _temp_event_seed_context x WHERE 1
ON CONFLICT(id) DO NOTHING;

-- Capacity is derived from reservations; do not fake it with an invalid zero capacity.
INSERT INTO reservations
  (id, user_id, event_id, quantity, total, amount_rial, status, request_key,
   created_at, expires_at, authority, reference, payment_state, attendee_name, attendee_phone)
SELECT e.id || '-reservation', x.attendee_id, e.id, 2, e.price * 2, e.price * 20,
  'confirmed', e.id || '-reservation', x.now_ms, NULL, NULL, NULL,
  CASE WHEN e.price = 0 THEN 'none' ELSE 'skipped_dev' END,
  'شرکت‌کننده نمونه موقت', u.phone
FROM events e JOIN _temp_event_seed_rows seed ON seed.id = e.id
CROSS JOIN _temp_event_seed_context x JOIN users u ON u.id = x.attendee_id
WHERE e.id GLOB 'temp-20260925-*-sold-out' OR e.id = 'temp-20260925-art-last-seat'
ON CONFLICT(id) DO NOTHING;

INSERT INTO tickets (id, reservation_id, ordinal, token, created_at)
SELECT r.id || '-ticket-' || n.ordinal, r.id, n.ordinal, lower(hex(randomblob(32))), r.created_at
FROM reservations r JOIN _temp_event_seed_rows seed ON r.event_id = seed.id
CROSS JOIN (SELECT 1 AS ordinal UNION ALL SELECT 2) n
WHERE r.id = seed.id || '-reservation' AND r.status = 'confirmed'
ON CONFLICT(reservation_id, ordinal) DO NOTHING;

CREATE TEMP TABLE _temp_event_seed_assertion (ok INTEGER CHECK (ok = 1));
INSERT OR ROLLBACK INTO _temp_event_seed_assertion
SELECT CASE WHEN COUNT(*) = 36 THEN 1 ELSE 0 END
FROM events e JOIN _temp_event_seed_rows s ON s.id = e.id
CROSS JOIN _temp_event_seed_context x WHERE e.sample = 1 AND e.host_id = x.host_id;

DROP TABLE _temp_event_seed_assertion;
DROP TABLE _temp_event_seed_rows;
DROP TABLE _temp_event_seed_context;
COMMIT;
