# کارایی و زمان بارگیری

این تغییرات برنامهٔ اصلی، پنل `/fast`، داشبورد میزبان و مدیریت مقاله را پوشش می‌دهند؛ برنامهٔ مستقل `blog/` تغییر نکرده است. طراحی فارسی، RTL، معرفی نقشه و قواعد مجوز حفظ شده‌اند. تغییر schema یا migration لازم نیست.

## تحویل دارایی و اجرای رابط

ساخت Node در `scripts/build-node.mjs` گزینهٔ پشتیبانی‌شدهٔ vinext یعنی `--precompress` را فعال می‌کند. فایل‌های Brotli/gzip همراه خروجی standalone و Docker نگهداری می‌شوند. سرور بر اساس Accept-Encoding نسخهٔ مناسب را با Vary و همان محتوای اصلی می‌فرستد؛ کش immutable دارایی‌های هش‌دار حفظ می‌شود. Workers از مسیر ساخت و تحویل قبلی خود استفاده می‌کند.

اسکن Tailwind به app، components، hooks، lib، locales و design-system محدود است. stylesheet نقشه همراه SDK همان ارائه‌دهنده بارگیری می‌شود؛ CSS اسکنر، صفحات میزبان و اشتراک‌گذاری در بخش مربوط وارد می‌شود. در نسخهٔ نصب‌شده، import مستقیم CSS داخل import پویا، manifest وابستگی standalone را اشتباه می‌ساخت؛ دو ماژول کوچک `maplibre-client` و `leaflet-client` CSS و SDK را کنار هم وارد می‌کنند، بدون تغییر چارچوب یا node_modules. specificity جای‌گذاری canvas و preview نیز بالاتر از CSS ارائه‌دهنده است تا بارگیری دیرهنگام آن ارتفاع نقشه را از بین نبرد؛ تست مرورگر اندازه و نمایش واقعی نقشه را بررسی می‌کند.

نمودار فروش هنگام نزدیک‌شدن به viewport، فرم ساخت هنگام بازکردن، پیش‌نمایش Markdown هنگام ویرایش، اشتراک‌گذاری هنگام درخواست و تنظیمات پیشرفته هنگام بازشدن بارگیری می‌شوند. پس از نخستین نمایش، محتوای تنظیمات حفظ می‌شود تا بستن و بازکردن آن ورودی کاربر را از بین نبرد. ویرایشگر دستی و شیت از صفحهٔ سرور جدا انتخاب می‌شوند؛ اعتبارسنجی فایل مستقل از فرم و تقویم است.

## داده و نشست

`useEventCatalog` یک کش حافظه‌ای برای نشست جاری مرورگر دارد. مصرف‌کننده‌های هم‌زمان یک Promise مشترک دارند و ناوبری تا ۶۰ ثانیه از پاسخ قبلی استفاده می‌کند. دریافت اولیهٔ کاتالوگ و `/api/me` موازی است، ولی نمایش نتیجهٔ شخصی فقط پس از تطبیق `viewerId` پاسخ با حساب فعلی انجام می‌شود. این فیلد در `/api/events` برای مهمان null است. هدر API همچنان `private, no-store` و Vary: Cookie است؛ دادهٔ شخصی در cache عمومی یا localStorage ذخیره نمی‌شود.

refresh ورود و خروج، نسل درخواست‌ها را تغییر می‌دهد و نتیجهٔ دیررس نسل قبلی پذیرفته نمی‌شود. هنگام بازخوانی پس‌زمینه، دادهٔ قبلی باقی می‌ماند؛ خطای خانه پیام retry دارد. بازخوانی دوره‌ای در تب پنهان انجام نمی‌شود و بازگشت تب یا bfcache بازخوانی مناسب را فعال می‌کند. زمان سرور در لحظهٔ دریافت لنگر می‌شود تا استفادهٔ دوباره از پاسخ، ساعت شمارش‌گر را عقب نبرد.

لودر request-scoped جزئیات عمومی بین HTML و API مشترک است و انتشار، نمونه و نشست را به همان روش بررسی می‌کند. عنوان و تصویر اصلی در HTML اولیه حضور دارند و hydration درخواست تکراری نمی‌فرستد. صفحهٔ نخست `/fast` و فهرست برگزارکنندگان نیز دادهٔ اولیهٔ سرور را مصرف می‌کنند. پاسخ‌های شخصی همچنان وابسته به درخواست‌اند؛ کش سرور مشترک اضافه نشده است.

فیلتر، گروه‌بندی و مرتب‌سازی خانه memo شده‌اند. ساعت کاتالوگ هر دقیقه و در مرز بعدی شروع/پایان/مهلت/روز تهران تازه می‌شود؛ formatterهای ثابت Intl بین کارت‌ها مشترک‌اند. بررسی دقیق نشان داد hook قبلی با deadline نامشخص از قبل دقیقه‌ای بود؛ این تغییر به‌عنوان حذف یک timer واقعی یک‌ثانیه‌ای گزارش نمی‌شود.

## اندازه‌گیری محلی

اندازه‌گیری در ۲۸ اکتبر ۲۰۲۶ با production build، Chromium، پایگاه SQLite موقت واقعی و تصاویر محلی موجود انجام شد؛ APIها intercept یا جایگزین نشده‌اند. هر حالت پنج بار سرد و پنج بار گرم اجرا شد. موبایل: viewport عرض ۳۹۰، CPU چهار برابر کندتر، RTT برابر ۱۵۰ ms و دانلود ۲۰۰٬۰۰۰ بایت در ثانیه. دسکتاپ: عرض ۱۲۸۰، CPU عادی، RTT برابر ۲۰ ms و دانلود ۲٬۰۰۰٬۰۰۰ بایت در ثانیه. اندازه‌ها شامل transferSize دارایی‌های JS/CSS داخلی‌اند.

نسخهٔ قبل از تغییر از خروجی production ذخیره‌شدهٔ همین working tree استفاده کرد؛ بهینه‌سازی تصویر از قبل در هر دو نسخه موجود بود. sidecarهای فشردهٔ آزمایش قبلی فقط از کپی موقت baseline حذف شدند تا سیاست واقعی قبلیِ تحویل JS/CSS بدون فشرده‌سازی بازتولید شود. هیچ استقرار یا اندازه‌گیری بار روی تولید انجام نشد.

| مسیر و حالت | میانهٔ LCP قبل | میانهٔ LCP بعد | JS/CSS سرد قبل → بعد |
| --- | --- | --- | --- |
| خانه، موبایل سرد | ۸۳۷۶ ms | ۳۶۹۶ ms | ۱٬۳۵۵٬۱۲۱ → ۳۰۲٬۶۶۰ بایت |
| جست‌وجو، موبایل سرد | ۸۴۷۲ ms | ۳۷۶۸ ms | ۱٬۳۴۱٬۴۷۷ → ۲۹۸٬۵۰۳ بایت |
| خانه، موبایل گرم | ۸۵۲ ms | ۶۵۶ ms | صفر بایت انتقال مجدد JS/CSS |
| جست‌وجو، موبایل گرم | ۸۱۶ ms | ۶۵۶ ms | صفر بایت انتقال مجدد JS/CSS |
| خانه، دسکتاپ سرد | ۹۲۴ ms | ۵۰۰ ms | همان فایل‌های جدول بالا |
| جست‌وجو، دسکتاپ سرد | ۹۳۶ ms | ۵۱۶ ms | همان فایل‌های جدول بالا |

کاهش انتقال اولیه حدود ۷۸٪ و بهبود LCP سرد موبایل حدود ۵۵٪ است. بیشترین CLS مشاهده‌شده پس از تغییر کمتر از ۰٫۰۱۸ بود. LCP گرم دسکتاپ خانه از ۱۶۰ به ۱۴۸ ms و جست‌وجو از ۱۷۲ به ۱۴۴ ms رسید. این اعداد آزمایشگاهی‌اند؛ تضمین زمان برای کاربران واقعی، نقشهٔ بیرونی یا شبکه‌های دیگر نیستند. پنل‌ها از نظر رفتار بررسی شدند، اما برای زمان بارگیری همهٔ پنل‌ها میانهٔ پنج‌اجرا ثبت نشده است.

## اعتبارسنجی و بازتولید

```sh
npm run typecheck
npm run lint
npm run test:performance
npm run build:node
npm run test:build-assets
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs PERFORMANCE_RUNS=5 PERFORMANCE_OUTPUT=/tmp/performance.json npm run test:performance:browser
```

آزمون مرورگر تنها روی loopback، با SQLite و اعتبارنامهٔ موقت اجرا می‌شود. dedup ناوبری، HTML اولیهٔ جزئیات، نبود fetch تکراری، اشتراک‌گذاری تنبل، مسیرهای مدیریت، CSS نقشه، معرفی نخستین بازدید، RTL و خطاهای runtime را بررسی می‌کند. متغیر اختیاری PERFORMANCE_SERVER مسیر خروجی baseline و PERFORMANCE_BASELINE=1 فقط assertionهای مخصوص رفتار تازه را خاموش می‌کند. تست مستقل store نیز انقضا، retry، پاسخ دیررس، تعویض هویت و snapshot خالی SSR را بررسی می‌کند.

TypeScript، lint (۲۵ هشدار موجود تصویر و صفر خطا)، ساخت Node/Workers، manifest دارایی، قرارداد مستندات، SQLite/Flight، discovery، آزمون‌های نقشه/ورود/تاریخ، تصویر واقعی و فرم واقعی مدیر بررسی شدند. آزمون recommendation از لودر مشترک ماژول‌های واقعی استفاده می‌کند و metadata هویت و رفتار فعلی discovery را می‌سنجد. آزمون portrait نیز سیاست مستند موجودِ private/no-cache به همراه ETag را کنترل می‌کند.

محدودیت شناخته‌شده: مجموعهٔ عمومی `test:integration:node` در آزمون قدیمی صدور رسید متوقف می‌شود، چون تلاش می‌کند رزرو تازه بسازد و محصول فعلی این کار را مسدود می‌کند. همان شکست روی build ذخیره‌شدهٔ قبل از این تغییر نیز بازتولید شد. قواعد رزرو برای عبور دادن آزمون تغییر نکردند.

## Learning Notes

فشرده‌سازی حجم انتقال را کم می‌کند؛ جداکردن کدِ بخش‌های اختیاری هزینهٔ parse و اجرای اولیه را نیز کم می‌کند. کش کاتالوگ باید به هویت و نسل درخواست متصل باشد؛ صرف ذخیرهٔ آخرین JSON برای دادهٔ شخصی کافی نیست. Context7 در مرحلهٔ برنامه‌ریزی سهمیه نداشت، ولی هنگام پیاده‌سازی مستندات React از آن خوانده شد؛ گزینه‌های vinext با سورس نسخهٔ نصب‌شده بررسی شدند.

## Why This Matters

اولین بازدید دارایی کمتری دریافت می‌کند، ناوبری درخواست و انتظار تکراری کمتری دارد و پنل مدیریت ویژگی‌های سنگین را هنگام استفاده بارگیری می‌کند. اعتبارسنجی نشست و انتشار همچنان مقدم بر نمایش دادهٔ شخصی است.

## فهرست دقیق تغییرات این کار

کندی اولیه عمدتاً از انتقال JS/CSS بدون فشرده‌سازی می‌آمد. دانلود فایل‌های بزرگ، دریافت پشت‌سرهم نشست و کاتالوگ، درخواست دوبارهٔ داده بعد از mount و واردکردن ابزارهای اختیاری در مسیر اولیه زمان نمایش را بیشتر می‌کردند. جدول اندازه‌گیری اثر مجموع تغییرات را نشان می‌دهد؛ سهم مستقل هر تغییر در LCP اندازه‌گیری نشده است.

| فایل‌ها | تغییر دقیق و علت |
| --- | --- |
| `scripts/build-node.mjs` | فعال‌کردن `--precompress` برای تولید sidecarهای Brotli/gzip و کاهش انتقال شبکه. |
| `app/globals.css` | محدودکردن sourceهای Tailwind به پوشه‌های رابط اصلی، جلوگیری از تولید utilityهای ناشی از فایل‌های نامرتبط. |
| `app/layout.tsx`، `app/host/layout.tsx` (جدید)، `app/scanner/page.tsx`، `components/evenline/event-share.tsx` | انتقال CSS میزبان، اسکنر و اشتراک‌گذاری از layout عمومی به بخش مربوط؛ CSS مشترک همهٔ صفحات میزبان در layout همان مسیر است. |
| `lib/maplibre-client.ts` و `lib/leaflet-client.ts` (جدید)، `components/evenline/minimal-map-canvas.tsx`، `components/evenline/event-map.tsx`، `components/evenline/map-preview.tsx`، `components/evenline/evenline.css` | بارگیری CSS همراه SDK پویا و حفظ اولویت موقعیت absolute نقشه و preview، مستقل از ترتیب بارگیری. |
| `lib/catalog-store.ts` (جدید)، `hooks/use-event-catalog.ts` | کش حافظه‌ای ۶۰ثانیه‌ای، dedup درخواست در جریان، دریافت موازی با auth، حفظ داده هنگام refresh، retry و جلوگیری از پذیرش پاسخ نشست قبلی. |
| `components/event/app-shell.tsx`، `app/api/events/route.ts`، `lib/types.ts` | افزودن viewerId به قرارداد کاتالوگ، پاک‌کردن کش هنگام تغییر auth، و نپذیرفتن پاسخ دیررس بررسی نشست پس از ورود/خروج. |
| `lib/public-event.ts` (جدید)، `app/api/events/[id]/route.ts`، `app/events/[id]/page.tsx`، `components/evenline/event-detail.tsx` | لودر عمومی مشترک request-scoped، دریافت مستقل جزئیات به‌صورت موازی و HTML اولیهٔ واقعی به‌جای انتظار برای fetch مرورگر. |
| `hooks/use-resource.ts` | پذیرش دادهٔ اولیهٔ سرور فقط برای URL اولیه؛ حفظ fetch برای تغییر URL و reload صریح. |
| `lib/fast-event-list.ts` (جدید)، `app/api/fast/events/route.ts`، `app/fast/page.tsx`، `components/fast/event-list.tsx` | استفادهٔ مشترک از منطق موجود pagination/filter در API و صفحه، دریافت موازی فهرست و برگزارکنندگان در سرور، حذف fetch تکراری نخستین صفحه. |
| `app/fast/events/[id]/page.tsx`، `components/fast/event-editor.tsx`، `components/fast/sheet-event-editor.tsx` | انتخاب ویرایشگر دستی یا شیت در سرور؛ استفاده از فهرست برگزارکنندگان اولیه و حذف وابستگی شیت به فرم کامل. |
| `lib/validate-images.ts` و `components/event/event-date-time-field.tsx` (جدید)، `components/event/event-form.tsx` | استخراج اعتبارسنجی تصویر و ورودی تاریخ موجود برای استفادهٔ مستقل، بدون تغییر قواعد اعتبارسنجی. |
| `components/fast/advanced-program.tsx` (جدید)، `components/fast/event-editor.tsx` | import و دریافت series فقط پس از بازکردن تنظیمات پیشرفته؛ حفظ draft بعد از بستن و بازکردن. |
| `components/event/host-sales-chart.tsx` (جدید)، `components/ui/when-visible.tsx` (جدید)، `app/host/page.tsx` | استخراج نمودار و بارگیری آن نزدیک viewport با فضای رزروشده؛ بارگیری EventForm هنگام بازکردن dialog. |
| `components/ui/deferred-loading.tsx` (جدید)، `app/admin/articles/page.tsx`، `components/evenline/event-detail.tsx` | loading/retry مشترک برای import پویا؛ Markdown هنگام ویرایش و اشتراک‌گذاری هنگام درخواست بارگیری می‌شوند. |
| `hooks/use-catalog-clock.ts` (جدید)، `components/evenline/catalog.tsx`، `components/evenline/event-card.tsx`، `lib/types.ts` | memo برای فیلتر و مرتب‌سازی، اشتراک formatterهای Intl، زمان‌بندی مرزهای رویداد و توقف timer کاتالوگ در تب پنهان؛ نمایش خطای refresh همراه دادهٔ قبلی. |
| `components/evenline/explorer.tsx` | دریافت collections و organizers فقط برای تب نتیجه‌ای که به آن‌ها نیاز دارد. |
| `tests/catalog-store.mjs` و `tests/performance-browser.mjs` (جدید)، `package.json` | تست store و production مرورگر با scriptهای قابل بازتولید؛ بررسی فشرده‌سازی، ETag/304، HTML سرور، درخواست‌ها، map/host CSS، RTL و اندازه‌گیری سرد/گرم. |
| `tests/recommendations.mjs` | استفاده از لودر مشترک ماژول‌های واقعی و اصلاح assertionهای viewerId و رفتار موجود discovery، بدون تغییر رتبه‌بندی محصول. |
| `tests/fast-integration.mjs` | هماهنگ‌کردن assertion تصویر برگزارکننده با سیاست موجود private/no-cache و ETag. |
| `docs/performance.md` (جدید)، `docs/README.md`، `docs/testing.md`، `docs/architecture.md`، `docs/api.md`، `docs/openapi.json` | ثبت روش بازتولید، اندازه‌گیری، محدودیت‌ها، معماری کش و قرارداد افزایشی viewerId. |

تغییرات قبلی پردازش/تحویل تصویر، `public/optimized/`، manifest تصاویر، Sharp، routeهای رسانه، `vite.config.ts` و `package-lock.json` متعلق به working tree پیش از این کار بودند و حفظ شدند. در فایل‌های مشترک مثل کارت و جزئیات، تغییر تصویر قبلی از تغییرات کارایی این جدول جداست. dependency جدید، migration، commit، push یا استقرار در این کار انجام نشد.
