const html = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="مستندات فارسی API هم‌قدم؛ قرارداد OpenAPI و آزمایش درخواست‌ها با Swagger UI">
  <title>مستندات API هم‌قدم</title>
  <link rel="icon" href="/favicon.svg">
  <link rel="stylesheet" href="/docs/swagger/swagger-ui.css">
  <link rel="stylesheet" href="/docs/docs.css">
  <script src="/docs/swagger/swagger-ui-bundle.js" defer></script>
  <script src="/docs/swagger-init.js" defer></script>
</head>
<body>
  <header class="docs-header">
    <nav aria-label="پیوندهای مستندات">
      <a href="/">بازگشت به هم‌قدم</a>
      <a href="/docs/openapi.json" download="hamghadam-openapi.json">دریافت OpenAPI</a>
      <a href="/login">ورود به حساب</a>
    </nav>
    <h1>مستندات API هم‌قدم</h1>
    <p>مرجع فارسی مسیرها، ورودی‌ها، پاسخ‌ها و سطح دسترسی API.</p>
    <p>برای درخواست‌های نیازمند حساب، ابتدا در همین دامنه وارد شوید؛ مرورگر کوکی نشست را ارسال می‌کند.
      کلید اسکنر و کلید کار اعلان‌ها از بخش Authorize قابل تنظیم هستند.</p>
    <p>دکمهٔ Try it out درخواست واقعی به همین سرور می‌فرستد؛ عملیات نوشتن می‌تواند داده را تغییر دهد، پیام ارسال کند یا رزرو بسازد.
      مبلغ‌ها به تومان و زمان‌ها به میلی‌ثانیهٔ یونیکس هستند، مگر آنکه خلاف آن ذکر شود.</p>
    <p>راهنمای کامل نصب، معماری، داده‌ها و نگهداری در پوشهٔ <code dir="ltr">docs/</code> مخزن قرار دارد.</p>
  </header>
  <main aria-label="مرجع تعاملی API">
    <p id="docs-status" role="status">در حال بارگذاری مستندات…</p>
    <div id="swagger-ui" dir="ltr"></div>
    <noscript>برای رابط تعاملی JavaScript را فعال کنید؛ فایل OpenAPI از پیوند بالای صفحه قابل دریافت است.</noscript>
  </main>
</body>
</html>`;

// A standalone document isolates Swagger's styles and scripts from the application shell.
export function GET() {
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
    },
  });
}
