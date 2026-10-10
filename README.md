# هم‌قدم

برنامهٔ فارسی و راست‌به‌چپ کشف رویداد، رزرو و فروش بلیت، با رابط اقتباس‌شده از Evenline. برنامه از ساختار App Router، React و vinext استفاده می‌کند و روی Node با SQLite و فایل محلی، یا Cloudflare Workers با D1 و R2 اجرا می‌شود.

[مستندات کامل فارسی](docs/README.md) · [راهنمای API](docs/api.md) · [قرارداد OpenAPI](docs/openapi.json)

پس از استقرار، Swagger UI در **https://hmghadam.com/docs** و فایل ماشین‌خوان در **https://hmghadam.com/docs/openapi.json** در دسترس خواهد بود. در اجرای محلی همان مسیر `/docs` را باز کنید.

## شروع توسعه

Node نسخهٔ 22.13 یا جدیدتر لازم است. فایل `.env.example` را به `.env.local` کپی و مقادیر واقعی، به‌ویژه مسیرهای مطلق ذخیره‌سازی و `APP_ORIGIN` را تنظیم کنید. راهنمای کامل در [توسعه](docs/development.md) است.

```sh
npm ci
cp .env.example .env.local
# پس از تنظیم فایل و ساخت پوشه‌های ذخیره‌سازی:
set -a
. ./.env.local
set +a
npm run db:migrate:node
npm run dev
```

درگاه پیش‌فرض توسعه 5173 است. در صورت تغییر درگاه، `APP_ORIGIN` را نیز هماهنگ کنید. برای خروجی Node از `npm run build:node` و `npm run start:node` استفاده کنید. ساخت Workers با `npm run build` انجام می‌شود. این دو ساخت از `dist` مشترک استفاده می‌کنند و باید ترتیبی اجرا شوند.

دادهٔ نمونه، ورود آزمایشی و عبور از پرداخت به‌صورت پیش‌فرض خاموش‌اند. روش آزمون محلی و محدودیت‌های این قابلیت‌ها در [راهنمای توسعه](docs/development.md) توضیح داده شده است. تنظیم سرویس‌ها را در [پیکربندی](docs/configuration.md) و اجرای کانتینری را در [Docker](docs/docker.md) ببینید.

## ورود آزمایشی

رفتار فعلی حساب آزمایشی، استثناهای انقضا و محدودیت درخواست و روش لغو نشست‌ها در [راهنمای توسعه](docs/development.md#ورود-آزمایشی-موجود) مستند است. این قابلیت فقط با پرچم صریح فعال می‌شود.

## بررسی تغییرات

```sh
npm run test:docs
npm run typecheck
npm run lint
npm run build:node
npm run test:docs:node
```

[راهنمای آزمون](docs/testing.md) دستورهای آزمون دامنه، رسانه، اعلان، مهاجرت و یکپارچه‌سازی هر دو محیط را پوشش می‌دهد. تست مستندات تمام متدهای API را با OpenAPI تطبیق می‌دهد؛ بررسی HTTP نیز فایل قرارداد، دارایی‌های محلی Swagger و صفحهٔ اصلی را کنترل می‌کند.
