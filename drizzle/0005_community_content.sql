CREATE TABLE `article_media` (
	`id` text PRIMARY KEY NOT NULL,
	`article_id` text NOT NULL,
	`storage_key` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `article_media_article_id_unique` ON `article_media` (`article_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `article_media_storage_key_unique` ON `article_media` (`storage_key`);--> statement-breakpoint
CREATE TABLE `articles` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`excerpt` text DEFAULT '' NOT NULL,
	`body` text NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`author_name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `articles_slug_unique` ON `articles` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_articles_status_published` ON `articles` (`status`,`published_at`);--> statement-breakpoint
CREATE TABLE `contact_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`subject` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_contact_status_created` ON `contact_messages` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `event_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`rating` integer NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`moderated_by` text,
	`moderated_at` integer,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`moderated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reviews_event_user` ON `event_reviews` (`event_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_reviews_event_status_created` ON `event_reviews` (`event_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_reviews_status_created` ON `event_reviews` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `host_customer_metadata` (
	`host_id` text NOT NULL,
	`user_id` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`host_id`, `user_id`),
	FOREIGN KEY (`host_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `review_replies` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`host_id` text NOT NULL,
	`comment` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`moderated_by` text,
	`moderated_at` integer,
	FOREIGN KEY (`review_id`) REFERENCES `event_reviews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`host_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`moderated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_replies_review_id_unique` ON `review_replies` (`review_id`);--> statement-breakpoint
CREATE INDEX `idx_replies_status_created` ON `review_replies` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `site_content` (
	`key` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
-- Original editorial content; guides remain drafts until an administrator publishes them.
INSERT OR IGNORE INTO site_content(key,content,updated_at) VALUES('faq','{"eyebrow":"پاسخ‌های کوتاه و روشن","title":"پرسش‌های پرتکرار","intro":"اگر پاسخ پرسشت را اینجا پیدا نکردی، از صفحهٔ تماس با ما پیام بفرست.","items":[{"question":"چطور برای یک ایونت بلیت بگیرم؟","answer":"ایونت را باز کن، تعداد بلیت را انتخاب کن و با شمارهٔ همراهت وارد حساب شو. پس از ثبت رزرو، وضعیت آن را در بخش «بلیت‌های من» می‌بینی. اگر پرداخت آنلاین برای آن ایونت فعال باشد، ادامهٔ پرداخت همان‌جا نمایش داده می‌شود."},{"question":"بلیت رزروشده‌ام را از کجا ببینم؟","answer":"پس از ورود، از منوی «بلیت‌های من» می‌توانی رزروها و بلیت‌های صادرشده را ببینی. برای ورود به ایونت، میزبان بلیت را بررسی می‌کند."},{"question":"آیا برای دیدن ایونت‌ها باید موقعیتم را روشن کنم؟","answer":"خیر. می‌توانی شهر را دستی انتخاب کنی. دسترسی به موقعیت اختیاری است و فاصلهٔ مستقیم روی دستگاهت محاسبه می‌شود."},{"question":"چطور ایونتم را منتشر کنم؟","answer":"برای ساخت ایونت، با شمارهٔ تأییدشدهٔ میزبان وارد پنل میزبان شو و اطلاعات برنامه را در فرم ساخت وارد کن. پس از انتشار، می‌توانی فروش را از پنل متوقف یا دوباره فعال کنی و فهرست شرکت‌کنندگان را ببینی."},{"question":"اگر دربارهٔ رزرو یا پرداخت مشکلی داشتم چه کنم؟","answer":"از فرم تماس، موضوع و شرح مشکل را بنویس و شمارهٔ پیگیری یا اطلاعات لازم را فقط در حد نیاز اضافه کن. اطلاعات تماس را برای پاسخ‌گویی وارد کن."}]}',1790467200000);
--> statement-breakpoint
INSERT OR IGNORE INTO site_content(key,content,updated_at) VALUES('about','{"eyebrow":"همراه تجربه‌های شهری","title":"دربارهٔ هم‌قدم","intro":"هم‌قدم راهی برای پیدا کردن دورهمی‌ها و تجربه‌های حضوری شهر و مدیریت بلیت آن‌هاست.","sections":[{"heading":"برای شرکت‌کننده‌ها","body":"ایونت‌ها را بر اساس شهر و دسته‌بندی مرور کن، جزئیات هر برنامه را بخوان و از بخش بلیت‌های من وضعیت رزروت را پیگیری کن. موقعیت مکانی برای استفاده از سایت اجباری نیست."},{"heading":"برای میزبان‌ها","body":"میزبان‌های تأییدشده می‌توانند ایونت بسازند، انتشار یا توقف فروش را مدیریت کنند و فهرست شرکت‌کنندگان و وضعیت ورود را ببینند. هر میزبان زمان‌بندی، ظرفیت و قیمت برنامهٔ خود را اعلام می‌کند."},{"heading":"اطلاعات و حریم خصوصی","body":"شمارهٔ همراه برای ورود و رزرو استفاده می‌شود و میزبان هر ایونت برای هماهنگی و بررسی ورود، اطلاعات شرکت‌کنندگان همان ایونت را می‌بیند. دسترسی به موقعیت اختیاری است و موقعیت دقیق برای محاسبهٔ فاصله روی دستگاه باقی می‌ماند. ایونت‌هایی که برچسب نمونه دارند، برنامهٔ واقعی برگزارکنندگان نیستند."}]}',1790467200000);
--> statement-breakpoint
INSERT OR IGNORE INTO site_content(key,content,updated_at) VALUES('contact','{"eyebrow":"در تماس بمانیم","title":"تماس با ما","intro":"پرسش یا مشکلی دربارهٔ هم‌قدم داری؟ پیامت را بفرست تا در پنل پیگیری شود.","email":"","phone":"","address":""}',1790467200000);
--> statement-breakpoint
INSERT OR IGNORE INTO articles(id,slug,title,excerpt,body,category,author_name,status,created_at,updated_at) VALUES('guide-find-an-event-that-fits','find-an-event-that-fits','چطور ایونتی متناسب با حال‌وهوایت پیدا کنی؟','چند نکته برای انتخاب برنامه‌ای که با زمان، علاقه و جمع همراهانت جور باشد.','## از علاقه‌ات شروع کن

به دسته‌بندی‌های ایونت‌ها سر بزن و موضوعی را انتخاب کن که واقعاً برایت جذاب است؛ از موسیقی و هنر تا کتاب و بازی.

## جزئیات را پیش از رزرو بخوان

زمان شروع و پایان، نشانی، قیمت و ظرفیت را در صفحهٔ ایونت بررسی کن. اگر برنامه برچسب نمونه دارد، آن را برنامهٔ واقعی برگزارکننده در نظر نگیر.

## مسیر و همراهانت را در نظر بگیر

شهر را دستی انتخاب کن یا در صورت تمایل دسترسی موقعیت را برای مرتب‌سازی بر اساس فاصله فعال کن. دسترسی به موقعیت برای مرور ایونت‌ها ضروری نیست.','راهنمای شرکت‌کننده','تحریریهٔ هم‌قدم','draft',1790467200000,1790467200000);
--> statement-breakpoint
INSERT OR IGNORE INTO articles(id,slug,title,excerpt,body,category,author_name,status,created_at,updated_at) VALUES('guide-ticket-and-reservation-guide','ticket-and-reservation-guide','از انتخاب بلیت تا ورود به ایونت','مراحل رزرو را بشناس و پیش از روز برنامه، وضعیت بلیتت را بررسی کن.','## رزرو را کامل کن

در صفحهٔ ایونت تعداد بلیت را انتخاب کن و با شمارهٔ همراه وارد شو. اگر پرداخت آنلاین برای آن برنامه فعال باشد، مراحل پرداخت در ادامه نمایش داده می‌شود.

## وضعیت بلیت را بررسی کن

پس از ورود به حساب، به «بلیت‌های من» برو. جزئیات رزرو و بلیت‌های صادرشده از همان‌جا در دسترس‌اند.

## روز برگزاری

اطلاعات زمان و نشانی را دوباره بخوان و بلیت را برای بررسی به میزبان ارائه کن. میزبان بلیت را هنگام ورود بررسی می‌کند.','راهنمای بلیت','تحریریهٔ هم‌قدم','draft',1790467200000,1790467200000);
--> statement-breakpoint
INSERT OR IGNORE INTO articles(id,slug,title,excerpt,body,category,author_name,status,created_at,updated_at) VALUES('guide-publish-and-host-an-event','publish-and-host-an-event','راهنمای میزبان برای آماده‌کردن صفحهٔ ایونت','اطلاعاتی که به مهمان‌ها کمک می‌کند پیش از رزرو تصمیم روشن‌تری بگیرند.','## اطلاعات پایه را دقیق بنویس

عنوان، توضیح، دسته‌بندی، شهر، نشانی و زمان شروع و پایان را روشن وارد کن. قیمت و ظرفیت را هم مطابق برنامهٔ واقعی خودت تنظیم کن.

## پیش از انتشار بازبینی کن

پیش از ثبت ایونت، نشانی و زمان را دوباره بررسی کن تا مهمان‌ها بتوانند برای حضور برنامه‌ریزی کنند. پس از انتشار، پنل میزبان امکان توقف یا فعال‌کردن فروش را می‌دهد.

## ورود مهمان‌ها را مدیریت کن

از پنل میزبان می‌توانی فهرست شرکت‌کنندگان را ببینی و بلیت هر مهمان را هنگام ورود بررسی کنی. دسترسی پنل برای شماره‌های تأییدشدهٔ میزبان فراهم است.','راهنمای میزبان','تحریریهٔ هم‌قدم','draft',1790467200000,1790467200000);
