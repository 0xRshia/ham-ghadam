# وبلاگ مستقل هم‌قدم

وبلاگ در `blog/` یک سرویس مستقل Next.js App Router روی Node 24 است. دامنهٔ عمومی `https://hmghadam.com`، فهرست نوشته‌ها `/blog`، مقاله `/blog/[slug]`، صفحهٔ محتوایی `/pages/[slug]` و مدیریت `/admin` است. برنامهٔ رویدادها در `app.hmghadam.com` با پایگاه، نشست، کانتینر و فرایند انتشار خودش باقی می‌ماند.

لوگو، قلم Darbareh و توکن‌های طراحی از فایل‌های اصلی مخزن هنگام ساخت کپی می‌شوند. متن فارسی، RTL، رنگ‌ها و کنترل‌های گرد حفظ شده‌اند؛ عرض خواندن مقاله برای دسکتاپ مستقل از قاب موبایلی برنامه است. نسخهٔ تازه هیچ مقالهٔ نمونه یا پیش‌نویس برنامهٔ قبلی را منتشر نمی‌کند. صفحهٔ اصلی با معرفی واقعی محصول و فهرست خالی نوشته‌ها آغاز می‌شود.

## اجرا و بررسی محلی

از ریشهٔ مخزن اجرا کنید:

```sh
npm --prefix blog ci
cp blog/.env.example blog/.env.local
npm --prefix blog run password
```

فرمان رمز، ورودی تعاملی را پنهان می‌کند و فقط هش scrypt را خروجی می‌دهد. نام کاربری را در `.env.local` وارد کنید. برای هش در فایل‌های env خود Next، **هر `$` را به `\$` تبدیل کنید**؛ کوتیشن تکی به‌تنهایی جلوی گسترش متغیر در Next را نمی‌گیرد. هش کاملِ escapeشده را داخل کوتیشن تکی در مقدار `BLOG_ADMIN_PASSWORD_HASH` بنویسید.

قالب Compose متفاوت است: در فایل runtime آن، هش خام با `$`های دست‌نخورده را داخل کوتیشن تکی قرار دهید. یک فایل هش آماده‌شده برای Next را بدون تبدیل به Compose ندهید. فایل env محرمانه است و در Git و تصویر Docker وارد نمی‌شود. گذرواژه را در آرگومان CLI یا گزارش‌ها ننویسید.

```sh
npm --prefix blog run dev
npm --prefix blog run typecheck
npm --prefix blog run lint
npm --prefix blog test
npm --prefix blog run build
npm --prefix blog start
```

dev و start هر دو روی `http://localhost:9090` هستند و هم‌زمان نباید اجرا شوند. برای ساخت تولید، `BLOG_ORIGIN` و `BLOG_DATA_DIR` مطلق را نیز تنظیم کنید. HTTP فقط برای بررسی روی `localhost`، `127.0.0.1` یا `::1` مجاز است؛ دامنهٔ عمومی تولید HTTPS می‌خواهد. خروجی standalone شامل `server.js` است و پوشه‌های `public` و `.next/static` نیز باید کنار آن منتقل شوند؛ Dockerfile این کار را انجام می‌دهد. [مستندات رسمی Next](https://nextjs.org/docs/app/api-reference/config/next-config-js/output).

## مدیریت محتوا و SEO

در `/admin/login` با نام کاربری و گذرواژه وارد شوید. بخش‌های «نوشته‌ها»، «صفحه‌ها» و «صفحهٔ اصلی» امکان ساخت، ویرایش و حذف محتوا، پیش‌نمایش خصوصی، انتشار یا بازگشت به پیش‌نویس را دارند. تاریخ آینده، محتوا را تا رسیدن زمان انتشار از خروجی عمومی پنهان می‌کند. متن Markdown با ابزار درج تیتر، لینک و تصویر نوشته می‌شود؛ HTML خام اجرا نمی‌شود.

برای هر نوشته عنوان، نامک فارسی یا لاتین، خلاصه، متن، نویسنده، دسته، تصویر با متن جایگزین، عنوان و توضیح SEO، canonical، عنوان/توضیح/تصویر اشتراک و گزینهٔ noindex قابل ویرایش‌اند. صفحهٔ اصلی علاوه بر SEO، نام سایت، معرفی، عنوان و متن بالای صفحه، متن اصلی، دکمهٔ ورود به برنامه، ناوبری، لوگو، پانوشت و کد تأیید Google Search Console را نگه می‌دارد. canonical خالی از نشانی واقعی صفحه ساخته می‌شود؛ canonical خارجی فقط برای بازنشر آگاهانه مناسب است.

تغییر نامک، نامک‌های قبلی را به مقصد فعلی هدایت می‌کند و مانع استفادهٔ تصادفی از مسیر قدیمی برای مقاله‌ای دیگر می‌شود. تغییر هم‌زمان از دو تب با خطای نسخه متوقف می‌شود تا متن تازهٔ مدیر دیگر بازنویسی نشود. زمان و تاریخ نمایشی فارسی‌اند؛ زمان ذخیره‌شده UTC است. محتوای منتشرشده، metadata و structured data در HTML سرور حضور دارند. Sitemap و robots از وضعیت فعلی خوانده می‌شوند؛ پیش‌نویس، انتشار آینده و noindex از sitemap حذف می‌شوند.

پس از انتشار نوشتهٔ واقعی، `https://hmghadam.com/sitemap.xml` را در Search Console ثبت و خروجی یک مقاله را با Rich Results Test بررسی کنید. کد فنی و structured data تضمین رتبه یا حتی ایندکس‌شدن نیستند؛ محتوای مفید، کیفیت نگارش و ارزیابی موتور جست‌وجو تعیین‌کننده‌اند. [راهنمای SEO گوگل](https://developers.google.com/search/docs/fundamentals/seo-starter-guide).

## تنظیم تولید

| متغیر | کاربرد |
| --- | --- |
| `BLOG_ORIGIN` | `https://hmghadam.com`؛ مبنای canonical، CSRF و Secure cookie |
| `BLOG_DATA_DIR` | مسیر مطلق SQLite و رسانه؛ داخل Compose برابر `/data` |
| `BLOG_ADMIN_USERNAME` | نام کاربری مستقل مدیر وبلاگ |
| `BLOG_ADMIN_PASSWORD_HASH` | هش کامل خروجی فرمان password، داخل کوتیشن تکی |
| `BLOG_TRUST_PROXY` | فقط پشت Nginx معتبر و backend محدود به loopback برابر `1` |
| `BLOG_ENV_FILE` | مسیر مطلق فایل env برای Compose؛ پیش‌فرض `blog/.env.production` |
| `BLOG_IMAGE` | برچسب تصویر انتشار؛ بهتر است شامل commit کامل باشد |
| `BLOG_BACKUP_DIR` | فقط هنگام پشتیبان؛ مسیر مطلق خارج از پوشهٔ داده |

نشست مدیر هشت ساعت اعتبار دارد و فقط هش توکن تصادفی در SQLite ذخیره می‌شود. کوکی host-only، HttpOnly، SameSite=Strict و روی HTTPS دارای Secure است. تغییر نام کاربری یا هش و بازسازی کانتینر، نشست‌های قبلی را نامعتبر می‌کند. نبود اعتبارنامه ورود را غیرفعال می‌کند؛ حساب برنامهٔ رویدادها مجوز این پنل نیست. تلاش ورود بر اساس IP معتبر و سقف کل محدود می‌شود.

تصاویر JPEG/PNG/WebP حداکثر ۵ MiB پذیرفته، decode و دوباره به WebP تبدیل می‌شوند؛ فایل SVG آپلودی یا تصویر متحرک پذیرفته نمی‌شود. مسیر فایل UUID است و رسانهٔ استفاده‌نشده یا متصل به پیش‌نویس فقط برای مدیر قابل خواندن است. تصویر استفاده‌شده در صفحهٔ اصلی یا محتوای منتشرشده عمومی است.

## Docker و مسیر ترافیک

Compose فقط سرویس `blog` را تعریف می‌کند و پروژهٔ مستقل آن باید همیشه `hmghadam-blog` باشد. volume حاصل `hmghadam-blog_blog-data` است؛ نام پروژه را میان انتشارها تغییر ندهید. درگاه پیشنهادی مطابق جداسازی فعلی سرور: **Nginx → `127.0.0.1:9090` → پورت `3000` کانتینر وبلاگ**. `app.hmghadam.com` همچنان به پورت 3000 میزبان خود متصل است. تغییر نهایی پراکسی باید با انتخاب تأییدشدهٔ مالک درگاه‌ها هماهنگ شود.

```sh
export BLOG_ENV_FILE=/opt/hmghadam-blog/shared/.env.production
export BLOG_IMAGE=hamghadam-blog:REPLACE_WITH_COMMIT
docker compose -f blog/compose.yaml --project-name hmghadam-blog config --quiet
docker compose -f blog/compose.yaml --project-name hmghadam-blog build blog
docker compose -f blog/compose.yaml --project-name hmghadam-blog up -d --no-build blog
docker compose -f blog/compose.yaml --project-name hmghadam-blog ps
curl --fail http://127.0.0.1:9090/api/health
```

فایل env مقصد را پیش از اجرا با مجوز `600` بسازید؛ مقادیر origin و اعتماد پراکسی تولید را جایگزین مقادیر توسعه کنید. از `config --quiet` استفاده کنید؛ خروجی کامل config می‌تواند رازهای محیط را نمایش دهد. کوتیشن تکی در env، مقدار هش را بدون interpolation حفظ می‌کند. [مرجع Docker](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/).

ساخت از ریشهٔ مخزن با `blog/Dockerfile` انجام می‌شود. `blog/Dockerfile.dockerignore` بر فایل ignore ریشه مقدم است و فقط کد وبلاگ و دارایی‌های برند لازم را وارد context می‌کند. تصویر نهایی Node 24 با کاربر `node`، UID/GID برابر 1000، اجرا می‌شود. SQLite آزمایشی مرحلهٔ build به runtime منتقل نمی‌شود. volume تازه مجوز پوشهٔ `/data` تصویر را می‌گیرد؛ برای دادهٔ بازیابی‌شده مالکیت 1000 لازم است.

Nginx در vhost دارای گواهی `hmghadam.com` باید Host را حفظ و `X-Real-IP`، `X-Forwarded-Proto`، `X-Forwarded-Host` و `X-Forwarded-For` را خودش بازنویسی کند؛ هیچ هدر IP دریافتی از اینترنت نباید بدون بازنویسی معتبر تلقی شود. سقف درخواست `6m` برای آپلود ۵ MiB کافی است. پیش از ویرایش از فایل فعال Nginx نسخه بگیرید و تنها پس از موفقیت `nginx -t` سرویس را reload کنید. app و staging را به vhost وبلاگ منتقل نکنید.

بررسی نهایی باید HTTPS صفحهٔ اصلی، `/blog`، `/admin/login`، `/robots.txt`، `/sitemap.xml`، سلامت SQLite، فایل قلم و CSS، 404 واقعی، ورود و ذخیرهٔ مدیر، و سلامت مستقل `app.hmghadam.com` را پوشش دهد. health صرفاً آمادگی SQLite را می‌سنجد؛ موفقیت ورود و صحت محتوا نیازمند بررسی جداست.

## پشتیبان سازگار

پیش از ارتقا یا بازیابی، تمام نویسندگان وبلاگ را متوقف کنید؛ stop سرویس `blog` شامل API و مدیر آن است. رسانه و SQLite یک مجموعهٔ بازیابی‌اند. backup از API رسمی SQLite استفاده می‌کند، سلامت پایگاه و foreign keyها را می‌سنجد، همهٔ تصاویر را همراه checksum کپی می‌کند و وجود هر رسانهٔ مرجع را بررسی می‌کند. تنها نسخهٔ کامل از نام موقت به پوشهٔ نهایی تغییر نام می‌دهد.

```sh
sudo install -d -o 1000 -g 1000 -m 700 /var/backups/hamghadam-blog
docker compose -f blog/compose.yaml --project-name hmghadam-blog stop blog
docker compose -f blog/compose.yaml --project-name hmghadam-blog run --rm --no-deps \
  -v /var/backups/hamghadam-blog:/backups \
  -e BLOG_BACKUP_DIR=/backups blog node scripts/backup.ts
docker compose -f blog/compose.yaml --project-name hmghadam-blog start blog
```

خروجی شامل نام پوشهٔ snapshot، تعداد نوشته‌ها و تصاویر است؛ داده یا اعتبارنامه را چاپ نمی‌کند. هر پوشهٔ `blog-…` شامل `blog.sqlite`، `media/` و `manifest.json` است. آن را به فضای مستقل از سرور منتقل کنید. حذف خودکار پشتیبان در این اسکریپت انجام نمی‌شود؛ نگهداری و پاک‌سازی نسخه‌های قدیمی مسئولیت عملیات است. backup را داخل `/data` ننویسید.

## بازیابی و بازگشت انتشار

برای بازگشت صرفاً کد، ابتدا image جاری را با برچسب مستقل نگه دارید، سپس `BLOG_IMAGE` را به image بررسی‌شدهٔ قبلی برگردانید و `up -d --no-build` اجرا کنید. volume و env را حفظ کنید. این روش پایگاه را به عقب برنمی‌گرداند؛ تغییر schema ناسازگار نیازمند بازیابی snapshot سازگار است.

بازیابی داده جایگزینی صریح دادهٔ جاری است: نخست snapshot تازه بگیرید، سرویس را متوقف نگه دارید، checksumهای `manifest.json` و `PRAGMA integrity_check` snapshot منتخب را بررسی کنید، سپس فقط همان جفت پایگاه و رسانه را جایگزین کنید. نمونهٔ زیر فقط با نام دقیق snapshot موجود اجرا شود:

```sh
export BLOG_RESTORE_NAME=REPLACE_WITH_EXISTING_SNAPSHOT_DIRECTORY
docker compose -f blog/compose.yaml --project-name hmghadam-blog stop blog
docker compose -f blog/compose.yaml --project-name hmghadam-blog run --rm --no-deps --user root \
  -v /var/backups/hamghadam-blog:/backups:ro -e BLOG_RESTORE_NAME \
  --entrypoint sh blog -c '
    set -eu
    case "$BLOG_RESTORE_NAME" in blog-*) ;; *) exit 1 ;; esac
    case "$BLOG_RESTORE_NAME" in *[!a-zA-Z0-9.-]*) exit 1 ;; esac
    test -f "/backups/$BLOG_RESTORE_NAME/blog.sqlite"
    test -d "/backups/$BLOG_RESTORE_NAME/media"
    rm -f /data/blog.sqlite-wal /data/blog.sqlite-shm
    cp "/backups/$BLOG_RESTORE_NAME/blog.sqlite" /data/blog.sqlite
    rm -rf /data/media
    cp -R "/backups/$BLOG_RESTORE_NAME/media" /data/media
    chown -R 1000:1000 /data
    chmod 700 /data /data/media
    chmod 600 /data/blog.sqlite
  '
docker compose -f blog/compose.yaml --project-name hmghadam-blog up -d --no-build blog
curl --fail http://127.0.0.1:9090/api/health
```

پس از بازیابی، صفحهٔ اصلی، چند نوشته و تصویر، نشست مدیر و شمار رکوردها را با snapshot مقایسه کنید. پوشهٔ انتشار یا `docker compose down` بدون `--volumes` داده را حذف نمی‌کند؛ `--volumes` برای ارتقای معمول نباید استفاده شود.

## نکتهٔ طراحی (Learning Notes)

وبلاگ از قرارداد SSR استاندارد Next و پایگاه محلی مستقل استفاده می‌کند؛ پوسته و احراز هویت برنامهٔ رویدادها وارد آن نشده‌اند. پرس‌وجوهای عمومی، metadata و sitemap از یک معیار انتشار استفاده می‌کنند و تغییرات مدیر بدون بازسازی سایت دیده می‌شوند. سادگی یک سرویس SQLite به معنای اجرای یک نمونهٔ نویسنده است، نه اشتراک فایل میان چند میزبان.

## اهمیت تصمیم (Why This Matters)

انتشار و بازگشت وبلاگ، رویدادها و حساب‌های برنامه را تغییر نمی‌دهد. HTML قابل خواندن برای خزنده‌ها و کنترل دقیق عنوان، canonical، انتشار و رسانه، پایهٔ فنی انتشار مقاله را فراهم می‌کند؛ حجم کد و منابع runtime نیز از قابلیت‌های غیرمرتبط برنامه مستقل می‌ماند.
