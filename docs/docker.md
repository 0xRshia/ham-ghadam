# استقرار با Docker Compose

[فهرست مستندات](README.md) · [پیکربندی](configuration.md)

این پیکربندی یک نمونهٔ Node با SQLite و رسانهٔ محلی روی volume پایدار اجرا می‌کند. Docker Engine/Desktop و Compose v2 لازم‌اند. میزبانی دامنه، HTTPS و زمان‌بند اعلان را ایجاد نمی‌کند.

## شروع

```sh
cp .env.docker.example .env.docker
node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
```

راز تولیدشده را در `OTP_SECRET` قرار دهید. برای دامنهٔ اصلی `APP_ORIGIN=https://hmghadam.com` و برای دسترسی مستقیم محلی پیش‌فرض `http://localhost:3000` است. تغییر `APP_PORT` باید با Origin هماهنگ باشد. سرویس‌های مورد نیاز را با مقادیر واقعی تنظیم کنید. فایل env از Git و image حذف می‌شود و نباید commit شود.

```sh
docker compose --env-file .env.docker config --quiet
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs --tail=100 app
curl --fail http://localhost:3000/api/health
```

image از `node:22-bookworm-slim`، `npm ci` و ساخت Node موجود استفاده می‌کند. آماده‌سازی Swagger بخشی از ساخت است؛ مسیر `/docs` و دارایی‌ها همراه خروجی standalone منتقل می‌شوند. runtime شامل خروجی، migrationها و اسکریپت‌های عملیات است. برنامه با UID/GID برابر 1000 روی درگاه داخلی 3000 اجرا و هر ۳۰ ثانیه سلامت بررسی می‌شود. entrypoint پوشه‌ها و migrationها را پیش از شروع آماده می‌کند؛ خطای مهاجرت راه‌اندازی را متوقف می‌کند. unhealthy شدن به‌تنهایی به معنی restart خودکار توسط healthcheck نیست.

## داده و HTTPS

volume با نام منطقی `app-data` شامل `/data/hmghadam.sqlite`، فایل‌های WAL و `/data/media` است. volume تازه مالکیت image را می‌گیرد؛ در واردکردن داده یا bind mount، مجوز نوشتن UID/GID 1000 را رعایت کنید. فقط یک نمونهٔ برنامه برای هر volume نگه دارید. `docker compose down` volume را حفظ می‌کند؛ افزودن `--volumes` داده را حذف می‌کند و برای ارتقای معمول مناسب نیست.

برای دسترسی عمومی، پراکسی HTTPS جلوی سرویس، `APP_ORIGIN=https://hmghadam.com` و `VINEXT_TRUST_PROXY=1` لازم است؛ پراکسی باید Host را حفظ و X-Forwarded-Proto را بازنویسی کند. دسترسی مستقیم به درگاه backend را محدود کنید. هنگام دسترسی مستقیم Node، اعتماد پراکسی را خاموش بگذارید. TLS خارج از Compose فعلی است. نمونهٔ Nginx قدیمی مخزن باید قبل از استفاده با دامنه و گواهی واقعی تطبیق داده شود.

## ارتقا و زمان‌بندی

پیش از ارتقا پشتیبان بگیرید. نسخهٔ مورد نظر را طبق فرایند انتشار خود در checkout قرار دهید و سرویس را بازسازی کنید:

```sh
docker compose --env-file .env.docker up -d --build
docker compose --env-file .env.docker logs --tail=100 app
docker compose --env-file .env.docker ps
```

نام پروژه/پوشهٔ Compose را بین انتشارها ثابت نگه دارید تا volume مورد انتظار استفاده شود. migrationها checksum دارند؛ فایل اعمال‌شده را تغییر ندهید. بازگشت نیازمند نسخهٔ سازگار یا بازیابی جفت پایگاه/رسانهٔ مناسب است.

برای ارسال اعلان، این دستور را در زمان‌بند بیرونی طبق [راهنمای اعلان](notifications.md) اجرا کنید:

```sh
docker compose --env-file .env.docker exec -T app node scripts/notifications-job.mjs
```

## پشتیبان

برای عملیات پشتیبان کنترل‌شده، برنامه را متوقف کنید تا هنگام snapshot و کپی فایل‌ها تغییر هم‌زمان رخ ندهد. helper سلامت SQLite و اندازهٔ تصاویر ارجاع‌شده را بررسی می‌کند و ۱۴ جفت آخر را نگه می‌دارد.

```sh
docker compose --env-file .env.docker stop app
docker compose --env-file .env.docker run --rm --no-deps --entrypoint sh app -c 'mkdir -p /data/backups && BACKUP_DIRECTORY=/data/backups node scripts/backup-node.mjs'
mkdir -p backups
docker compose --env-file .env.docker cp app:/data/backups/. ./backups/
docker compose --env-file .env.docker start app
```

پوشهٔ `backups` را به فضای مستقل منتقل کنید. هر فایل `mvp-<timestamp>.sqlite` باید با پوشهٔ هم‌نام `.media` نگهداری شود؛ پشتیبان داخل volume برنامه در برابر از دست رفتن آن volume کافی نیست.

## بازیابی

بازیابی دادهٔ فعلی را جایگزین می‌کند. ابتدا پشتیبان تازه بگیرید، برنامه را متوقف و جفت انتخاب‌شده را در پوشهٔ backups volume قرار دهید. `RESTORE_NAME` باید نام پایهٔ واقعی یک snapshot موجود، بدون پسوند باشد:

```sh
docker compose --env-file .env.docker stop app
docker compose --env-file .env.docker cp ./backups/. app:/data/backups/
: "${RESTORE_NAME:?نام پایه snapshot موجود را تنظیم کنید}"
docker compose --env-file .env.docker run --rm --no-deps --user root --entrypoint sh -e RESTORE_NAME="$RESTORE_NAME" app -c '
  set -eu
  test -f "/data/backups/$RESTORE_NAME.sqlite"
  test -d "/data/backups/$RESTORE_NAME.media"
  rm -f /data/hmghadam.sqlite-wal /data/hmghadam.sqlite-shm
  cp "/data/backups/$RESTORE_NAME.sqlite" /data/hmghadam.sqlite
  rm -rf /data/media
  cp -R "/data/backups/$RESTORE_NAME.media" /data/media
  chown -R 1000:1000 /data/hmghadam.sqlite /data/media
'
docker compose --env-file .env.docker up -d
```

این دستورات فقط برای سرویس متوقف و snapshot انتخاب‌شده‌اند. پس از شروع سلامت و تصاویر واقعی را بررسی کنید.

## آزمون و تنظیمات تکمیلی

`compose.yaml` مسیر داده و درگاه داخلی را ثابت می‌کند؛ `APP_PORT` فقط درگاه میزبان را عوض می‌کند. برای فایل env دیگر، `APP_ENV_FILE` و گزینهٔ `--env-file` را هماهنگ کنید. build به اعتبارنامهٔ تولید نیاز ندارد. ورود آزمایشی مطابق [توسعه](development.md) فقط در استقرار ایزوله فعال شود و با بازسازی سرویس تغییر env اعمال شود.

`npm run test:docker` با Docker فعال، استقرار ایزوله می‌سازد، migration، سلامت، دارایی‌ها، اجرای غیر root، OTP، پایداری رسانه و شکست مهاجرت را می‌آزماید و منابع متعلق به همان آزمون را پاک می‌کند.

## نکتهٔ طراحی (Learning Notes)

کانتینر قابل جایگزینی است؛ داده در volume و migration runner همراه برنامه نگهداری می‌شود. SQLite و رسانه یک مجموعهٔ بازیابی هستند.

## اهمیت تصمیم (Why This Matters)

ساخت image جدید، حساب‌ها، رزروها و تصاویر را حفظ می‌کند؛ بازیابی جفت سازگار نیز از رکوردهای دارای تصویر گم‌شده جلوگیری می‌کند.
