# استقرار و عملیات روی hmghadam.com

[فهرست مستندات](README.md) · [اجرای Docker](docker.md)

مستندات بخشی از همان سرویس برنامه هستند. `/` همچنان برنامه را ارائه می‌کند و `/docs` و `/docs/openapi.json` پس از انتشار این نسخه در دسترس می‌شوند. دامنه یا سرویس جداگانه‌ای برای Swagger لازم نیست. انتشار سرور Docker از طریق [CI/CD](cicd.md) پس از بررسی موفق push یا merge به `main` برای `app.hmghadam.com` و به `stage` برای `stage.hmghadam.com` انجام می‌شود. راه‌اندازی و دادهٔ مستقل محیط آزمایشی در [بخش staging](cicd.md#محیط-آزمایشی-stage) توضیح داده شده‌اند. دستورهای زیر برای ساخت و عملیات دستی نیز قابل استفاده‌اند.

## انتشار Node

پس از نصب از lockfile و تنظیم env واقعی، ابتدا پشتیبان سازگار بگیرید و سپس خروجی را بسازید:

```sh
npm ci
npm run test:docs
npm run typecheck
npm run lint
npm run build:node
npm run test:build-assets
npm run test:docs:node
```

برای سرویس تولید `APP_ORIGIN=https://hmghadam.com`، مسیرهای مطلق پایدار SQLite/رسانه و پرچم‌های آزمایشی false باشند. مهاجرت باید پیش از راه‌اندازی نسخهٔ جدید اعمال شود؛ entrypoint Docker و نمونهٔ systemd این مرحله را دارند. اجرای مستقیم standalone نیازمند اجرای جداگانهٔ `npm run db:migrate:node` با env مقصد است.

`npm run start:node` فایل `dist/standalone/server.js` را اجرا می‌کند. پوشهٔ خروجی را کامل منتقل کنید؛ فقط کپی‌کردن server.js کافی نیست، زیرا کد سرور و دارایی‌های عمومی هم در خروجی بسته‌بندی شده‌اند. دادهٔ SQLite و تصاویر را بیرون پوشهٔ انتشار نگه دارید تا تعویض نسخه آن‌ها را حذف نکند.

## پراکسی و HTTPS

اگر پراکسی فعلی همهٔ مسیرها را با `location /` به برنامه می‌فرستد، `/docs` و دارایی‌های `/docs/...` نیز از همان مسیر عبور می‌کنند. پوشهٔ مخزن `docs/` را به‌صورت ریشهٔ فایل استاتیک Nginx روی `/docs` نگاشت نکنید؛ آن کار Route برنامه و دسترسی JSON را دور می‌زند. از rewrite کلی به index.html نیز برای برنامهٔ سروری استفاده نکنید.

نمونه‌های `deploy/nginx.conf` و `deploy/mvp.service` متعلق به پیکربندی قبلی `dev.rshi.info` و مسیرهای `/opt/mvp` هستند؛ آن‌ها را بدون تطبیق دامنه، مسیر گواهی، کاربر سرویس و Node روی hmghadam.com کپی نکنید. این تغییر مستندات، تنظیم فعال پراکسی سرور شما را ویرایش نمی‌کند.

پراکسی باید Host را حفظ و `X-Forwarded-Proto` و هدرهای IP مورد استفاده را خودش بازنویسی کند. اعتماد به پراکسی (`VINEXT_TRUST_PROXY=1` در تنظیم موجود) فقط با محدودبودن دسترسی مستقیم backend مناسب است. درخواست HTTPS باید در runtime به‌درستی HTTPS شناخته شود تا کوکی Secure صادر شود. سقف آپلود پراکسی باید اجازهٔ درخواست ۲۱ MiB را بدهد؛ نمونهٔ موجود `client_max_body_size 21m` دارد.

برای دامنهٔ برنامه، [قطعهٔ تنظیم سقف بارگذاری](../deploy/event-upload-limits.nginx.conf) را در بلوک HTTPS موجود با `server_name app.hmghadam.com` وارد کنید. فایل را می‌توان در `/etc/nginx/snippets/hamghadam-event-upload-limits.conf` نصب و داخل همان بلوک `include /etc/nginx/snippets/hamghadam-event-upload-limits.conf;` کرد. اگر `location` مرتبط سقف کوچک‌تری تعریف کرده است، آن override را نیز اصلاح کنید. پس از پشتیبان‌گیری از تنظیم فعال، `nginx -t` و فقط در صورت موفقیت، `systemctl reload nginx` را اجرا کنید. تعویض گواهی، upstream یا راه‌اندازی مجدد برنامه لازم نیست. ساخت و انتشار Docker به‌تنهایی تنظیم Nginx میزبان را تغییر نمی‌دهد.

در بررسی ۲۰۲۶-۱۰-۲۷، درخواست بی‌اثر `OPTIONS /api/fast/events` روی تولید با JPEG حدود ۱۶۸ KiB پاسخ 204 و با تصویر واقعی `public/banners/halloween.png` به حجم ۱٬۶۸۷٬۶۵۹ بایت پاسخ HTML 413 از Nginx داد. این خطا پیش از رسیدن به اعتبارسنجی برنامه رخ می‌دهد. برای بررسی پس از اصلاح، از ریشهٔ مخزن اجرا کنید؛ هیچ رویدادی ساخته نمی‌شود و پاسخ مورد انتظار 204 است:

```sh
curl --fail-with-body --request OPTIONS \
  --header 'Content-Type: image/png' \
  --data-binary @public/banners/halloween.png \
  --output /dev/null --write-out '%{http_code}\n' \
  https://app.hmghadam.com/api/fast/events
```

مقدار پیش‌فرض و پاسخ 413 در [مستندات رسمی Nginx](https://nginx.org/en/docs/http/ngx_http_core_module.html#client_max_body_size) توضیح داده شده‌اند. سقف هر فایل و مجموع تصاویر همچنان در برنامه اعمال می‌شوند.

اصلاح زنده در ۲۰۲۶-۱۰-۲۷ ساعت ۱۹:۳۴ UTC روی هر دو دامنهٔ `app.hmghadam.com` و `stage.hmghadam.com` تأیید شد: سقف ۲۱ MiB در سطح بلوک HTTPS قرار گرفت و تعریف تکراری داخل `location /` حذف شد. نسخهٔ قبل در `/root/nginx-backups/event-uploads-20261027T193440Z` نگهداری می‌شود. `nginx -t` موفق بود و سرویس با `systemctl reload nginx` بازخوانی شد. بررسی از خود سرور با TLS معتبر و نام میزبان واقعی، برای هر دو دامنه سلامت 200، تصویر ۱٬۶۸۷٬۶۵۹ بایتی در OPTIONS پاسخ 204 و همان تصویر در multipart بدون نشست پاسخ JSON 401 از برنامه داد؛ هیچ رویدادی ساخته نشد. این اصلاح مربوط به پراکسی است و تغییرات پیام خطای برنامه به انتشار جداگانه نیاز دارند.

## بررسی پس از انتشار

```sh
curl --fail-with-body https://hmghadam.com/api/health
curl --fail-with-body --output /dev/null https://hmghadam.com/docs
curl --fail-with-body --output /dev/null https://hmghadam.com/docs/openapi.json
curl --fail-with-body --output /dev/null https://hmghadam.com/docs/swagger/swagger-ui-bundle.js
curl --fail-with-body --output /dev/null https://hmghadam.com/docs/swagger/swagger-ui.css
```

در مرورگر `/docs` را باز کنید: عنوان فارسی، گروه‌ها و مدل‌ها باید بارگیری شوند و خطای دریافت قرارداد وجود نداشته باشد. یک GET عمومی مانند سلامت را اجرا کنید. مسیر اصلی `/` و ورود واقعی را نیز بررسی کنید. برای آزمون تولید، از ساخت رزرو یا درخواست پیامک صرفاً جهت بررسی نمایش مستندات استفاده نکنید.

## Workers

برای محیط موجود Cloudflare، `npm run build` با تنظیم Workers خروجی `dist/client` و `dist/server` می‌سازد. `DB`، `BUCKET` و env/رازها در پیکربندی میزبانی لازم‌اند. انتشار و مهاجرت D1 باید از فرایند موجود همان محیط انجام شود؛ مخزن فرمان عمومیِ واحدی برای انتشار هر حساب Cloudflare ندارد.

مستندات وب از JSON importشده و دارایی عمومی استفاده می‌کند و به API فایل‌سیستم Node وابسته نیست. پس از ساخت Workers، `npm run test:docs:workers` با پایگاه محلی ایزوله اجرا می‌شود. برای این ساخت ابتدا env مربوط به Node را از shell حذف کنید. دستورهای Node و Workers را به‌دلیل خروجی مشترک پشت سر هم اجرا کنید.

## پایش، اعلان و پشتیبان

`GET /api/health` یک query واقعی به جدول events می‌زند؛ فقط زنده‌بودن فرآیند را گزارش نمی‌کند. عدم آمادگی SMS، پرداخت یا ایمیل از health مشخص نمی‌شود؛ وضعیت سرویس مربوط و تنظیم آن را بررسی کنید. log عمومی `boundary` نام خطا را ثبت می‌کند و جزئیات حساس را به پاسخ کاربر نمی‌دهد.

کار اعلان به زمان‌بند بیرونی نیاز دارد؛ `scripts/notifications-job.mjs` را مطابق [اعلان‌ها](notifications.md) اجرا کنید. پشتیبان SQLite و رسانه باید هم‌زمان و قابل بازیابی باشد؛ اسکریپت پشتیبان integrity و اندازهٔ فایل‌های مرجع را بررسی و ۱۴ جفت آخر را نگه می‌دارد. نمونهٔ Docker در [راهنمای مربوط](docker.md) است. پشتیبان روی همان دیسک به‌تنهایی در برابر خرابی دیسک کافی نیست.
