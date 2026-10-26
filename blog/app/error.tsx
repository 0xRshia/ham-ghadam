"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <section className="not-found container"><h1>بارگذاری صفحه انجام نشد</h1><p>لطفاً دوباره تلاش کنید.</p><button className="button" onClick={reset}>تلاش دوباره</button></section>;
}
