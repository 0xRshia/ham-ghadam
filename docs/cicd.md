# انتشار خودکار با GitHub Actions

[فهرست مستندات](README.md) · [عملیات استقرار](deployment.md) · [Docker و بازیابی](docker.md)

گردش کار [deploy.yml](../.github/workflows/deploy.yml) برای pull request به `main` بررسی‌ها را اجرا می‌کند. هر push یا merge به `main`، پس از موفقیت همان بررسی‌ها، نسخهٔ بررسی‌شده را روی سرور Docker منتشر می‌کند. اجرای دستی نیز از بخش Actions و گزینهٔ Run workflow روی شاخهٔ `main` در دسترس است.

مقصد فعال سرور فعلی `https://app.hmghadam.com` است. health داخلی روی `127.0.0.1:3000/api/health` و health عمومی روی همان دامنهٔ برنامه بررسی می‌شوند. پراکسی Nginx و گواهی‌های موجود حفظ می‌شوند.

## بررسی‌ها و انتشار

بررسی‌ها شامل TypeScript، lint، قرارداد API، قواعد discovery، SQLite، رسانه و پشتیبان، اعلان‌ها، حساب، مدیریت سریع، همگام‌سازی شیت و رگرسیون‌های نقشه و ورود هستند. ساخت Node، دارایی‌های خروجی و HTTP مستندات/پنل مستقل نیز بررسی می‌شوند. آزمون Docker روی پروژه، پایگاه و رسانهٔ موقت، migration، سلامت، اجرای غیر root، آپلود و حفظ داده پس از تعویض کانتینر را می‌سنجد. آزمون‌های خرید قدیمی مطابق [راهنمای آزمون](testing.md) جزو دروازهٔ نسخهٔ اطلاع‌رسانی نیستند.

فقط job انتشار شاخهٔ `main` به رازهای استقرار دسترسی دارد. actionهای checkout و setup-node به SHA کامل نسخهٔ رسمی پین شده‌اند. اجرای PR کلید استقرار را دریافت نمی‌کند. انتشارهای main به ترتیب اجرا می‌شوند و اجرای در حال انتشار با push تازه لغو نمی‌شود؛ قفل مستقل روی سرور نیز مانع دو انتشار هم‌زمان است.

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

برای اعتبارسنجی منطق انتشار بدون تماس با سرور:

```sh
python3 -m unittest discover -s tests -p 'production_deploy_test.py' -v
```

این آزمون‌ها commit قدیمی، تغییر main هنگام ساخت، شکست پشتیبان/توقف/سلامت، بازگشت image، حفظ پایگاه، مسیرهای مطلق، volume و رد فرمان SSH نامعتبر را می‌سنجند. منطق واقعی کنترل‌گر اجرا و فقط مرز Docker/Git/HTTP جایگزین می‌شود.

منابع: [رازهای Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)، [هم‌زمانی workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)، [checkout رسمی](https://github.com/actions/checkout) و [setup-node رسمی](https://github.com/actions/setup-node).
