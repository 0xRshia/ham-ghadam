# استقرار و عملیات روی hmghadam.com

[فهرست مستندات](README.md) · [اجرای Docker](docker.md)

مستندات بخشی از همان سرویس برنامه هستند. `/` همچنان برنامه را ارائه می‌کند و `/docs` و `/docs/openapi.json` پس از انتشار این نسخه در دسترس می‌شوند. دامنه یا سرویس جداگانه‌ای برای Swagger لازم نیست. تغییر فایل‌های مخزن به‌تنهایی نسخهٔ در حال اجرای سرور را عوض نمی‌کند؛ ساخت و فرایند انتشار معمول سرویس باید انجام شود.

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
