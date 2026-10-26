# انتشار خودکار با GitHub Actions

[فهرست مستندات](README.md) · [عملیات استقرار](deployment.md) · [Docker و بازیابی](docker.md)

گردش کار [deploy.yml](../.github/workflows/deploy.yml) برای pull request به `main` یا `stage` بررسی‌ها را اجرا می‌کند. هر push یا merge به یکی از این شاخه‌ها، پس از موفقیت همان بررسی‌ها، نسخهٔ بررسی‌شده را در محیط همان شاخه روی سرور Docker منتشر می‌کند. اجرای دستی نیز از بخش Actions و گزینهٔ Run workflow روی شاخهٔ مقصد در دسترس است.

مقصد تولید `https://app.hmghadam.com` است. health داخلی روی `127.0.0.1:3000/api/health` و health عمومی روی همان دامنهٔ برنامه بررسی می‌شوند. مقصد آزمایشی `https://stage.hmghadam.com` با backend مستقل روی `127.0.0.1:3100` است. پراکسی و گواهی تولید هنگام راه‌اندازی staging حفظ می‌شوند.

## بررسی‌ها و انتشار

بررسی‌ها شامل TypeScript، lint، قرارداد API، قواعد discovery، SQLite، رسانه و پشتیبان، اعلان‌ها، حساب، مدیریت سریع، همگام‌سازی شیت و رگرسیون‌های نقشه و ورود هستند. ساخت Node، دارایی‌های خروجی و HTTP مستندات/پنل مستقل نیز بررسی می‌شوند. آزمون Docker روی پروژه، پایگاه و رسانهٔ موقت، migration، سلامت، اجرای غیر root، آپلود و حفظ داده پس از تعویض کانتینر را می‌سنجد. آزمون‌های خرید قدیمی مطابق [راهنمای آزمون](testing.md) جزو دروازهٔ نسخهٔ اطلاع‌رسانی نیستند.

رازهای اختصاصی هر مقصد فقط در job انتشار همان شاخه خوانده می‌شوند؛ بررسی PR کلید استقرار را دریافت نمی‌کند. actionهای checkout و setup-node به SHA کامل نسخهٔ رسمی پین شده‌اند. انتشارهای هر شاخه به ترتیب اجرا می‌شوند و اجرای در حال انتشار با push تازه لغو نمی‌شود؛ قفل مستقل هر محیط روی سرور نیز مانع دو انتشار هم‌زمان همان محیط است.

کنترل‌گر سرور، commit کامل ۴۰نویسه‌ای را با آخرین `main` مخزن ثابت تطبیق می‌دهد. همان سورس را در `/var/lib/hamghadam-deploy/releases/<sha>` باز می‌کند و قبل از توقف برنامه، image جدید را می‌سازد. اگر main حین ساخت جلو رفته باشد، نسخهٔ قدیمی‌تر منتشر نمی‌شود و برنامهٔ جاری فعال می‌ماند.

سپس worker شیت و برنامه به ترتیب متوقف می‌شوند؛ image قبلی از SQLite و فایل‌های رسانه پشتیبان سازگار و بررسی‌شده می‌گیرد. برنامه و worker با image جدید بالا می‌آیند؛ migration در entrypoint موجود اجرا می‌شود. Compose، health داخلی، health عمومی و برچسب commit واقعی image باید موفق باشند. این عملیات هنگام پشتیبان و راه‌اندازی مجدد، وقفهٔ کوتاه دارد.

نام پروژهٔ `ham-ghadam`، volume موجود `ham-ghadam_app-data`، مسیر `/data/hmghadam.sqlite` و `/data/media` ثابت و قبل از توقف کنترل می‌شوند. هر دو سرویس `app` و `event-sync` از image همان commit استفاده می‌کنند. env واقعی از `/root/ham-ghadam/.env.docker` خوانده می‌شود؛ `--env-file` و `APP_ENV_FILE` هر دو به مسیر مطلق همان فایل اشاره می‌کنند. env و داده در سورس انتشار یا Git ذخیره نمی‌شوند.

## حساب و رازهای استقرار

حساب SSH اختصاصی `hamghadam-deploy` عضو گروه Docker نیست و رمز ورود فعال ندارد. کلید آن با `restrict` و forced command فقط درخواست `status` یا `deploy <sha>` را می‌پذیرد. فایل‌های حساب، authorized_keys، sudoers، کنترل‌گر و تنظیمات را root مدیریت می‌کند. کنترل‌گر root درخواست، مخزن، مسیر داده و commit را بررسی می‌کند؛ دسترسی shell یا ارسال فرمان دلخواه از این کلید فراهم نیست.

رازهای مخزن در Settings → Secrets and variables → Actions:

| نام | مقدار |
| --- | --- |
| `DEPLOY_HOST` | نشانی سرور مقصد |
| `DEPLOY_USER` | `hamghadam-deploy` |
| `DEPLOY_SSH_KEY` | کلید خصوصی اختصاصی همین انتشار |
| `DEPLOY_KNOWN_HOSTS` | کلید عمومی SSH تأییدشدهٔ سرور با قالب known_hosts |

کلید میزبان با `StrictHostKeyChecking=yes` بررسی می‌شود. در صورت تعویض سرور یا کلید آن، fingerprint تازه باید از راه مستقل تأیید و سپس راز known_hosts به‌روز شود. رمز root فقط برای راه‌اندازی اولیه استفاده می‌شود و در GitHub یا مخزن ذخیره نمی‌شود.

روی سرور، فایل‌های نسخه‌بندی‌شدهٔ [کنترل‌گر](../deploy/production-deploy.py)، [درگاه SSH](../deploy/production-ssh.sh) و [نمونهٔ تنظیمات](../deploy/production-config.example.json) به‌ترتیب در مسیرهای زیر نصب می‌شوند:

```text
/usr/local/sbin/hamghadam-deploy
/usr/local/libexec/hamghadam-deploy-ssh
/etc/hamghadam-deploy/config.json
/etc/sudoers.d/hamghadam-deploy
```

کنترل‌گر و درگاه متعلق به root و اجرایی‌اند؛ پوشهٔ تنظیمات و state فقط برای root قابل دسترسی است. تغییر این فایل‌های زیرساختی در Git، نسخهٔ نصب‌شدهٔ کنترل‌گر را خودکار جایگزین نمی‌کند؛ مسئول سرور پس از اجرای آزمون‌ها آن‌ها را دوباره با `install` نصب و sudoers را با `visudo -cf` بررسی می‌کند. انتشار روزمرهٔ برنامه به این مرحله نیاز ندارد.

## شکست، بازگشت و تشخیص

شکست ساخت، پیش‌بررسی یا تشخیص commit قدیمی، برنامهٔ در حال اجرا را متوقف نمی‌کند. شکست بعد از شروع توقف، حتی شکست پشتیبان، راه‌اندازی imageهای قبلی را امتحان می‌کند. شکست انتشار همچنان job را قرمز می‌کند تا نیاز به بررسی پنهان نماند.

بازگشت خودکار فقط image و تنظیمات Compose قبلی را انتخاب می‌کند؛ پایگاه داده عقب برده یا با snapshot جایگزین نمی‌شود. migration ناسازگار با نسخهٔ قبل ممکن است به بازیابی دستی نیاز داشته باشد. snapshotهای بررسی‌شده در `/data/backups` داخل volume و metadata انتشار در `/var/lib/hamghadam-deploy` می‌مانند؛ بازیابی دستی مطابق [Docker](docker.md) و پس از انتخاب پشتیبان انجام شود. این پشتیبان هم‌دیسک جای پشتیبان مستقل را نمی‌گیرد.

برای مشاهدهٔ وضعیت، با دسترسی root اجرا کنید:

```sh
/usr/local/sbin/hamghadam-deploy status
docker ps --filter label=com.docker.compose.project=ham-ghadam
```

فایل `current.json` فقط بعد از موفقیت همهٔ بررسی‌ها به commit تازه تغییر می‌کند. source releaseها، imageها و cache ساخت برای تشخیص/بازگشت حفظ می‌شوند؛ مصرف دیسک باید در عملیات معمول سرور پایش شود. فایل env و snapshot تنظیمات Compose حاوی راز هستند و نباید در گزارش یا Git کپی شوند.

## محیط آزمایشی stage

شاخهٔ `stage` برای آزمون قابلیت‌ها روی [stage.hmghadam.com](https://stage.hmghadam.com) منتشر می‌شود. job مشترک تمام بررسی‌های تولید، از جمله پذیرش شرایط و قرارداد و ساخت تصویر استوری را اجرا می‌کند؛ فقط پس از موفقیت آن، job `Deploy staging` همان commit کامل را منتشر می‌کند. کنترل‌گر دوباره آخرین commit شاخهٔ `stage` را پیش و پس از ساخت بررسی می‌کند. ادغام با `main` و انتشار تولید مرحله‌ای جداست.

### منابع و هزینه

staging از همان سرور موجود، Docker و Nginx استفاده می‌کند و سرویس پولی تازه‌ای لازم ندارد. اجرای استاندارد `ubuntu-24.04` برای این مخزن عمومی طبق [مستندات هزینهٔ GitHub Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions) رایگان است؛ گواهی نیز از [Let's Encrypt](https://letsencrypt.org/about/) رایگان دریافت می‌شود. ساخت و اجرای محیط دوم از CPU، RAM و دیسک همان سرور استفاده می‌کند؛ هزینهٔ سرویس فعلی و محدودیت منابع آن پابرجاست. workflow از runner بزرگ یا سرویس انتشار پولی استفاده نمی‌کند.

### جداسازی و راه‌اندازی اولیه

| مورد | مقدار staging |
| --- | --- |
| شاخه و پروژهٔ Compose | `stage` / `ham-ghadam-stage` |
| volume پایدار | `ham-ghadam-stage_app-data` |
| env محرمانه | `/etc/hamghadam-stage/runtime.env` |
| تنظیم کنترل‌گر | `/etc/hamghadam-stage-deploy/config.json` |
| state، قفل، release و rollback | `/var/lib/hamghadam-stage-deploy` |
| Compose اولیه | `/opt/hamghadam-stage/compose.yaml` |
| backend و health داخلی | `127.0.0.1:3100` / `http://127.0.0.1:3100/api/health` |

راه‌اندازی اولیه با دسترسی root انجام می‌شود. [نمونهٔ تنظیمات](../deploy/staging-config.example.json)، [env](../deploy/staging.env.example)، [درگاه SSH](../deploy/staging-ssh.sh) و [Nginx](../deploy/staging.nginx.conf) مرجع مقادیر هستند:

1. یک env متعلق به root با دسترسی `0600` بسازید. `APP_ORIGIN=https://stage.hmghadam.com`، `APP_PORT=127.0.0.1:3100` و `VINEXT_TRUST_PROXY=1` باشند. برای `OTP_SECRET` و سایر رازهای لازم مقدار تصادفی مستقل بسازید. پایگاه، رسانه، env یا اعتبارنامه‌های تولید به staging کپی نشوند.
2. سورس شاخهٔ `stage` را در مسیر اولیه آماده و Compose را با پروژهٔ `ham-ghadam-stage` و فایل env مطلق بالا بیاورید. volume تازه، migrationها و دادهٔ آزمایشی را دارد؛ هر محیط یک نمونهٔ برنامه و volume خودش را نگه می‌دارد.
3. نسخهٔ [کنترل‌گر](../deploy/production-deploy.py) را جداگانه در `/usr/local/sbin/hamghadam-stage-deploy` نصب و درگاه staging را در `/usr/local/libexec/hamghadam-stage-deploy-ssh` قرار دهید. فایل اجرایی تولید جایگزین نشود. حساب اختصاصی `hamghadam-stage-deploy` بدون عضویت Docker، کلید محدودشده با `restrict` و forced command همین درگاه، و sudoers متعلق به root دارد. درگاه فقط کنترل‌گر مرحله را با `--config /etc/hamghadam-stage-deploy/config.json` اجرا می‌کند؛ sudoers را با `visudo -cf` بررسی کنید.
4. DNS دامنهٔ `stage` به سرور موجود اشاره کند. ابتدا challenge HTTP و گواهی اختصاصی `stage.hmghadam.com` را آماده، سپس vhost نمونه را نصب و `nginx -t` را پیش از reload اجرا کنید. نمونهٔ HTTPS به فایل گواهی موجود نیاز دارد؛ vhost و گواهی تولید حفظ شوند.
5. رازهای زیر را در Settings → Secrets and variables → Actions مخزن قرار دهید؛ نام و کلیدشان از تولید مستقل است. workflow محیط `staging` را برای نمایش مقصد انتشار استفاده می‌کند. محدودیت شاخه در شرط job و کنترل‌گر root اعمال می‌شود؛ سیاست محافظت شاخهٔ GitHub environment جزو این تنظیم نیست. کلید میزبان از مسیر مستقل تأیید شود.

| راز مخزن برای staging | مقدار |
| --- | --- |
| `STAGE_DEPLOY_HOST` | نشانی همان سرور |
| `STAGE_DEPLOY_USER` | `hamghadam-stage-deploy` |
| `STAGE_DEPLOY_SSH_KEY` | کلید خصوصی اختصاصی staging |
| `STAGE_DEPLOY_KNOWN_HOSTS` | کلید عمومی SSH تأییدشدهٔ سرور |

### داده و دسترسی آزمایشی

قالب env پرچم‌های آزمایشی را خاموش شروع می‌کند. در نصب آزمایشی با دادهٔ ساختگی، `SEED_SAMPLE_EVENTS=true` و `TEMP_LOGIN_ENABLED=true` قرار می‌گیرند. حساب `09108624707` با کد `123456` و میزبان `09108624708` با ورود فوری برای آزمون جریان‌های کاربری قابل استفاده‌اند؛ [رفتار دقیق و لغو نشست‌ها](development.md#ورود-آزمایشی-موجود) را ببینید. پنل `/fast` کاربر مستقل `stage-admin` و رمز تصادفی جدا دارد؛ اطلاعات دسترسی نصب در فایل محلی نادیده‌گرفته‌شدهٔ `.env.stage-access` نگهداری می‌شود و وارد Git نمی‌شود. SMS، زرین‌پال، Resend و Push واقعی تنظیم نمی‌شوند. `EVENT_SYNC_JOB_SECRET` خالی می‌ماند؛ کانتینر `event-sync` بالا است اما همگام‌سازی خودکار انجام نمی‌دهد.

پراکسی staging هدر `X-Robots-Tag: noindex, nofollow, noarchive` و `robots.txt` با `Disallow: /` می‌دهد. این‌ها راهنمای موتور جست‌وجو هستند و محدودیت دسترسی ایجاد نمی‌کنند؛ آدرس محیط و حساب‌های آزمایشی عمومی‌اند. اطلاعات واقعی کاربران یا اسناد محرمانه در این محیط وارد نشوند. کوکی‌های برنامه Domain ندارند و نشست‌های staging و تولید مستقل می‌مانند.

### عملیات و بررسی

پس از push به `stage`، نتیجهٔ checks و `Deploy staging` را در Actions ببینید. پشتیبان، migration، health داخلی و عمومی و تطبیق commit image برای staging مانند تولید اجرا می‌شوند؛ rollback پایگاه را عقب نمی‌برد. برای بررسی سرور:

```sh
/usr/local/sbin/hamghadam-stage-deploy --config /etc/hamghadam-stage-deploy/config.json status
docker ps --filter label=com.docker.compose.project=ham-ghadam-stage
curl --fail-with-body https://stage.hmghadam.com/api/health
curl --fail-with-body --output /dev/null https://stage.hmghadam.com/docs
curl --fail-with-body https://stage.hmghadam.com/robots.txt
curl --head --fail https://stage.hmghadam.com/
```

صفحهٔ اصلی، جزئیات رویداد، نقشه، تصویر استوری و ورود میزبان را در مرورگر نیز بررسی کنید. metadata و پشتیبان‌ها در state/volume همان محیط حفظ می‌شوند و مصرف دیسک releaseها و imageها باید پایش شود.

## اعتبارسنجی کنترل‌گر

برای اعتبارسنجی منطق انتشار بدون تماس با سرور:

```sh
python3 -m unittest discover -s tests -p 'production_deploy_test.py' -v
```

این آزمون‌ها commit قدیمی، تغییر main هنگام ساخت، شکست پشتیبان/توقف/سلامت، بازگشت image، حفظ پایگاه، مسیرهای مطلق، volume و رد فرمان SSH نامعتبر را می‌سنجند. منطق واقعی کنترل‌گر اجرا و فقط مرز Docker/Git/HTTP جایگزین می‌شود.

منابع: [رازهای Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)، [هم‌زمانی workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)، [checkout رسمی](https://github.com/actions/checkout) و [setup-node رسمی](https://github.com/actions/setup-node).
