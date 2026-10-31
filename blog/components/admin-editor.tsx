"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { postPath, type Post, type SiteSettings } from "@/lib/types";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Icon } from "@/components/icon";

type ContentResponse = { posts: Post[]; settings: SiteSettings; serverTime: string };
type Tab = "article" | "page" | "home";

function publicationState(post: Post, now: number) {
  if (post.status === "draft") return "draft";
  return post.publishedAt && Date.parse(post.publishedAt) <= now ? "published" : "scheduled";
}

const publicationLabels = { draft: "پیش‌نویس", scheduled: "زمان‌بندی‌شده", published: "منتشرشده" };

function publicationDate(value: string) {
  return new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(value)) + " به وقت تهران";
}

async function request<T>(path: string, method = "GET", data?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method, credentials: "same-origin", cache: "no-store", signal,
    ...(data === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "درخواست انجام نشد. دوباره تلاش کنید.");
  return result as T;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "درخواست انجام نشد. دوباره تلاش کنید.";
}

function blankPost(kind: Post["kind"]): Post {
  return { id: "", kind, slug: "", title: "", excerpt: "", body: "", author: "", category: "",
    coverImage: "", coverAlt: "", seoTitle: "", seoDescription: "", canonicalUrl: "", ogTitle: "",
    ogDescription: "", ogImage: "", noIndex: false, featured: false, status: "draft", publishedAt: "",
    createdAt: "", updatedAt: "", version: 0 };
}

function localDateTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function displayDate(value: string) {
  return value ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeZone: "Asia/Tehran" }).format(new Date(value)) : "";
}

function Field({ label, value, onChange, hint, required = false, maxLength = 180, multiline = false, direction, type = "text" }: {
  label: string; value: string; onChange: (value: string) => void; hint?: string; required?: boolean;
  maxLength?: number; multiline?: boolean; direction?: "ltr" | "rtl"; type?: string;
}) {
  const id = useId();
  const props = { id, value, required, maxLength, dir: direction, "aria-describedby": hint ? `${id}-hint` : undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value) };
  return <div className="admin-field"><label htmlFor={id}>{label}{required ? " *" : ""}</label>
    {multiline ? <textarea {...props} rows={3} /> : <input {...props} type={type} />}
    {hint && <small id={`${id}-hint`}>{hint}</small>}
  </div>;
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (value: boolean) => void; hint?: string }) {
  return <label className="admin-toggle"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    <span><strong>{label}</strong>{hint && <small>{hint}</small>}</span></label>;
}

function ImageField({ label, value, onChange, uploadImage, busy, resetValue = "" }: {
  label: string; value: string; onChange: (value: string) => void; uploadImage: (file: File) => Promise<string>; busy: boolean; resetValue?: string;
}) {
  const id = useId();
  const [error, setError] = useState("");
  async function choose(file: File) {
    setError("");
    try { onChange(await uploadImage(file)); } catch (cause) { setError(message(cause)); }
  }
  return <div className="admin-image-field">
    <label htmlFor={id}>{label}</label>
    {value && <div className="admin-image-preview"><img src={value} alt={label} width={560} height={315} />
      {value !== resetValue && <button type="button" className="admin-text-button admin-danger-text" disabled={busy} onClick={() => onChange(resetValue)}>{resetValue ? "بازگشت به نشان هم‌قدم" : "حذف تصویر"}</button>}</div>}
    <input id={id} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
      onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void choose(file); }} />
    <small>JPEG، PNG یا WebP · حداکثر ۵ مگابایت</small>
    {error && <p className="admin-error" role="alert">{error}</p>}
  </div>;
}

export function LoginForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      await request("/api/admin/session", "POST", { username: form.get("username"), password: form.get("password") });
      window.location.assign("/admin");
    } catch (cause) { setError(message(cause)); setBusy(false); }
  }
  return <form className="admin-login-form" onSubmit={(event) => void submit(event)}>
    <div className="admin-field"><label htmlFor="admin-username">نام کاربری</label><input id="admin-username" name="username" required maxLength={100} autoComplete="username" dir="ltr" disabled={busy} /></div>
    <div className="admin-field"><label htmlFor="admin-password">رمز عبور</label><input id="admin-password" name="password" required maxLength={512} type="password" autoComplete="current-password" dir="ltr" disabled={busy} /></div>
    {error && <p className="admin-error" role="alert">{error}</p>}
    <button className="admin-button admin-primary" type="submit" disabled={busy} aria-busy={busy}>{busy ? "در حال ورود…" : "ورود به پنل"}</button>
  </form>;
}

export function AdminEditor() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [savedSettings, setSavedSettings] = useState("");
  const [tab, setTab] = useState<Tab>("article");
  const [post, setPost] = useState<Post | null>(null);
  const [savedPost, setSavedPost] = useState("");
  const [publishNow, setPublishNow] = useState(false);
  const [clock, setClock] = useState<{ time: number; receivedAt: number } | null>(null);
  const [serverNow, setServerNow] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dirty = tab === "home" ? settings !== null && JSON.stringify(settings) !== savedSettings : post !== null && (publishNow || JSON.stringify(post) !== savedPost);

  function syncClock(serverTime: string) {
    const time = Date.parse(serverTime);
    setClock({ time, receivedAt: performance.now() });
    setServerNow(time);
  }

  useEffect(() => {
    if (!clock) return;
    const timer = window.setInterval(() => setServerNow(clock.time + performance.now() - clock.receivedAt), 30_000);
    return () => window.clearInterval(timer);
  }, [clock]);

  useEffect(() => {
    const controller = new AbortController();
    request<ContentResponse>("/api/admin/content", "GET", undefined, controller.signal).then((result) => {
      syncClock(result.serverTime);
      setPosts(result.posts); setSettings(result.settings); setSavedSettings(JSON.stringify(result.settings)); setLoading(false);
    }).catch((cause) => { if (!controller.signal.aborted) { setError(message(cause)); setLoading(false); } });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!dirty) return;
    function beforeUnload(event: BeforeUnloadEvent) { event.preventDefault(); }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function mayLeave() { return !dirty || window.confirm("تغییرات ذخیره‌نشده کنار گذاشته شوند؟"); }
  function clearMessages() { setError(""); setNotice(""); }
  function selectTab(next: Tab) {
    if (busy || !mayLeave()) return;
    if (tab === "home" && savedSettings) setSettings(JSON.parse(savedSettings) as SiteSettings);
    setTab(next); setPost(null); setPublishNow(false); setSearch(""); setFilter("all"); clearMessages();
  }
  function openPost(selected?: Post) {
    if (busy || !mayLeave()) return;
    const next = selected ? { ...selected } : blankPost(tab === "page" ? "page" : "article");
    setPost(next); setSavedPost(JSON.stringify(next)); setPublishNow(false); clearMessages();
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function closePost() {
    if (!mayLeave()) return;
    setPost(null); setSavedPost(""); setPublishNow(false); clearMessages();
  }
  function editPost<K extends keyof Post>(key: K, value: Post[K]) {
    if (key === "status" || key === "publishedAt") setPublishNow(false);
    setPost((current) => current ? { ...current, [key]: value } : current);
  }
  function editSettings<K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) { setSettings((current) => current ? { ...current, [key]: value } : current); }

  async function uploadImage(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("فقط تصویر JPEG، PNG یا WebP مجاز است.");
    if (file.size > 5 * 1024 * 1024) throw new Error("حجم تصویر باید حداکثر ۵ مگابایت باشد.");
    setBusy(true);
    try {
      const response = await fetch("/api/admin/media", { method: "POST", credentials: "same-origin", headers: { "Content-Type": file.type }, body: file });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "بارگذاری تصویر انجام نشد.");
      return result.url as string;
    } finally { setBusy(false); }
  }

  async function savePost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!post || busy) return;
    setBusy(true); clearMessages();
    try {
      const result = await request<{ post: Post; serverTime: string }>(post.id ? `/api/admin/posts/${post.id}` : "/api/admin/posts", post.id ? "PUT" : "POST", { post, publishNow });
      syncClock(result.serverTime);
      setPosts((current) => [result.post, ...current.filter((item) => item.id !== result.post.id)]);
      setPost(result.post); setSavedPost(JSON.stringify(result.post)); setPublishNow(false);
      const state = publicationState(result.post, Date.parse(result.serverTime));
      setNotice(state === "draft" ? "پیش‌نویس ذخیره شد." : state === "published" ? "نوشته ذخیره شد و اکنون در سایت قابل مشاهده است." : `نوشته برای ${publicationDate(result.post.publishedAt)} زمان‌بندی شد؛ تا آن زمان نشانی عمومی در دسترس نیست.`);
    } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  }

  async function removePost(item: Post) {
    if (busy || !window.confirm(`«${item.title}» برای همیشه حذف شود؟ این کار قابل بازگشت نیست.`)) return;
    setBusy(true); clearMessages();
    try {
      await request(`/api/admin/posts/${item.id}`, "DELETE", { version: item.version });
      setPosts((current) => current.filter((entry) => entry.id !== item.id));
      if (post?.id === item.id) { setPost(null); setSavedPost(""); setPublishNow(false); }
      setNotice("نوشته حذف شد.");
    } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings || busy) return;
    setBusy(true); clearMessages();
    try {
      const result = await request<{ settings: SiteSettings }>("/api/admin/settings", "PUT", { settings });
      setSettings(result.settings); setSavedSettings(JSON.stringify(result.settings)); setNotice("صفحهٔ اصلی و تنظیمات سایت ذخیره شد.");
    } catch (cause) { setError(message(cause)); } finally { setBusy(false); }
  }

  async function logout() {
    if (busy || !mayLeave()) return;
    setBusy(true); clearMessages();
    try { await request("/api/admin/session", "DELETE"); window.location.assign("/admin/login"); }
    catch (cause) { setError(message(cause)); setBusy(false); }
  }

  const visiblePosts = posts.filter((item) => item.kind === tab && (filter === "all" || publicationState(item, serverNow) === filter)
    && (!search || `${item.title} ${item.slug} ${item.category}`.toLocaleLowerCase("fa").includes(search.toLocaleLowerCase("fa"))));
  const selectedName = tab === "page" ? "صفحه" : "نوشته";
  const savedSelection = posts.find((item) => item.id === post?.id);
  const savedState = savedSelection ? publicationState(savedSelection, serverNow) : null;

  return <div className="admin-workspace">
    <header className="admin-heading"><div><span className="admin-eyebrow">تحریریهٔ هم‌قدم</span><h1>مدیریت محتوا</h1><p className="admin-muted">از اولین پیش‌نویس تا انتشار.</p></div>
      <div className="admin-actions"><a className="admin-button" href="/" target="_blank" rel="noreferrer">مشاهدهٔ سایت <Icon name="external-link" /></a><button className="admin-button" disabled={busy} onClick={() => void logout()}>خروج</button></div>
    </header>
    <nav className="admin-tabs" aria-label="بخش‌های مدیریت">
      <button type="button" className={tab === "article" ? "is-active" : ""} aria-current={tab === "article" ? "page" : undefined} disabled={busy} onClick={() => selectTab("article")}>نوشته‌ها <span>{posts.filter((item) => item.kind === "article").length.toLocaleString("fa-IR")}</span></button>
      <button type="button" className={tab === "page" ? "is-active" : ""} aria-current={tab === "page" ? "page" : undefined} disabled={busy} onClick={() => selectTab("page")}>صفحه‌ها <span>{posts.filter((item) => item.kind === "page").length.toLocaleString("fa-IR")}</span></button>
      <button type="button" className={tab === "home" ? "is-active" : ""} aria-current={tab === "home" ? "page" : undefined} disabled={busy} onClick={() => selectTab("home")}>صفحهٔ اصلی و سئو</button>
    </nav>
    {error && <div role="alert" className="admin-error">{error} <a href="/admin/login">ورود دوباره</a></div>}
    {notice && <p role="status" className="admin-success">{notice}</p>}
    {loading ? <p className="admin-empty" role="status">در حال دریافت محتوا…</p> : !settings ? <div className="admin-empty"><p>دریافت محتوا انجام نشد.</p><button className="admin-button" onClick={() => window.location.reload()}>تلاش دوباره</button></div> : tab === "home" ?
      <form onSubmit={(event) => void saveSettings(event)}>
        <fieldset disabled={busy} className="admin-form-grid">
          <div className="admin-main-column">
            <section className="admin-panel"><h2>شروع صفحهٔ اصلی</h2><div className="admin-fields">
              <Field label="عبارت بالای عنوان" value={settings.heroEyebrow} onChange={(value) => editSettings("heroEyebrow", value)} maxLength={120} />
              <Field label="عنوان اصلی صفحه" value={settings.heroTitle} onChange={(value) => editSettings("heroTitle", value)} required maxLength={200} />
              <Field label="توضیح اصلی" value={settings.heroDescription} onChange={(value) => editSettings("heroDescription", value)} maxLength={1000} multiline />
              <div className="admin-two-columns"><Field label="متن دکمه" value={settings.ctaLabel} onChange={(value) => editSettings("ctaLabel", value)} maxLength={80} required />
                <Field label="نشانی دکمه" value={settings.ctaUrl} onChange={(value) => editSettings("ctaUrl", value)} maxLength={2048} direction="ltr" required /></div>
              <MarkdownEditor label="محتوای صفحهٔ اصلی" value={settings.homeBody} onChange={(value) => editSettings("homeBody", value)} uploadImage={uploadImage} disabled={busy} maxLength={50000} />
              <Field label="عنوان بخش نوشته‌ها" value={settings.articlesTitle} onChange={(value) => editSettings("articlesTitle", value)} required maxLength={100} />
              <Field label="پیام فهرست خالی" value={settings.emptyMessage} onChange={(value) => editSettings("emptyMessage", value)} maxLength={500} required />
            </div></section>
            <section className="admin-panel"><h2>هویت، منو و پانوشت</h2><div className="admin-fields">
              <div className="admin-two-columns"><Field label="نام سایت" value={settings.siteName} onChange={(value) => editSettings("siteName", value)} required maxLength={100} />
                <Field label="نام ناشر" value={settings.organizationName} onChange={(value) => editSettings("organizationName", value)} required maxLength={100} /></div>
              <Field label="توضیح کوتاه برند" value={settings.tagline} onChange={(value) => editSettings("tagline", value)} maxLength={200} />
              <ImageField label="نشان سایت" value={settings.logoUrl} onChange={(value) => editSettings("logoUrl", value)} uploadImage={uploadImage} busy={busy} resetValue="/brand/hamghadam-wordmark.svg" />
              <div className="admin-nav-editor"><h3>پیوندهای منو</h3>
                {settings.navLinks.map((link, index) => <div className="admin-nav-row" key={index}>
                  <Field label={`عنوان پیوند ${(index + 1).toLocaleString("fa-IR")}`} value={link.label} maxLength={60} required onChange={(value) => editSettings("navLinks", settings.navLinks.map((item, position) => position === index ? { ...item, label: value } : item))} />
                  <Field label="نشانی" value={link.href} direction="ltr" maxLength={2048} required onChange={(value) => editSettings("navLinks", settings.navLinks.map((item, position) => position === index ? { ...item, href: value } : item))} />
                  <button type="button" className="admin-button admin-danger-text" aria-label={`حذف پیوند ${link.label || index + 1}`} onClick={() => editSettings("navLinks", settings.navLinks.filter((_, position) => position !== index))}>حذف</button>
                </div>)}
                <button type="button" className="admin-button" disabled={settings.navLinks.length >= 8} onClick={() => editSettings("navLinks", [...settings.navLinks, { label: "", href: "" }])}><Icon name="plus" />افزودن پیوند</button>
              </div>
              <Field label="متن پانوشت" value={settings.footerText} onChange={(value) => editSettings("footerText", value)} multiline maxLength={1000} />
            </div></section>
          </div>
          <aside className="admin-sidebar"><section className="admin-panel"><h2>سئوی صفحهٔ اصلی</h2><div className="admin-fields">
            <Field label="عنوان در نتایج جست‌وجو" value={settings.seoTitle} onChange={(value) => editSettings("seoTitle", value)} required hint={`${settings.seoTitle.length.toLocaleString("fa-IR")} نویسه · پیشنهاد: حدود ۵۰ تا ۶۰ نویسه`} />
            <Field label="توضیح در نتایج جست‌وجو" value={settings.seoDescription} onChange={(value) => editSettings("seoDescription", value)} multiline maxLength={500} required hint={`${settings.seoDescription.length.toLocaleString("fa-IR")} نویسه · پیشنهاد: حدود ۱۴۰ تا ۱۶۰ نویسه`} />
            <Field label="نشانی مرجع (Canonical)" value={settings.canonicalUrl} onChange={(value) => editSettings("canonicalUrl", value)} maxLength={2048} direction="ltr" hint="خالی باشد، نشانی همین صفحه استفاده می‌شود." />
            <Toggle label="عدم نمایش در موتورهای جست‌وجو" checked={settings.noIndex} onChange={(value) => editSettings("noIndex", value)} hint="با فعال‌کردن این گزینه، صفحهٔ اصلی noindex می‌شود." />
            <Field label="کد تأیید Google Search Console" value={settings.googleVerification} onChange={(value) => editSettings("googleVerification", value)} maxLength={200} direction="ltr" hint="فقط مقدار کد، بدون تگ HTML." />
          </div></section>
          <section className="admin-panel"><h2>پیش‌نمایش اشتراک‌گذاری</h2><div className="admin-fields">
            <Field label="عنوان اشتراک‌گذاری" value={settings.ogTitle} onChange={(value) => editSettings("ogTitle", value)} />
            <Field label="توضیح اشتراک‌گذاری" value={settings.ogDescription} onChange={(value) => editSettings("ogDescription", value)} multiline maxLength={400} />
            <ImageField label="تصویر پیش‌فرض اشتراک‌گذاری" value={settings.socialImage} onChange={(value) => editSettings("socialImage", value)} uploadImage={uploadImage} busy={busy} />
          </div></section></aside>
        </fieldset>
        <div className="admin-save-bar"><span>{dirty ? "تغییرات ذخیره نشده‌اند" : "آخرین نسخه ذخیره شده است"}</span><button className="admin-button admin-primary" disabled={busy} aria-busy={busy} type="submit">{busy ? "در حال انجام…" : "ذخیرهٔ صفحهٔ اصلی"}</button></div>
      </form> : post ? <form onSubmit={(event) => void savePost(event)}>
        <div className="admin-section-heading"><h2>{post.id ? `ویرایش ${selectedName}` : `${selectedName} تازه`}</h2><button type="button" className="admin-button" disabled={busy} onClick={closePost}>بازگشت به فهرست</button></div>
        <fieldset disabled={busy} className="admin-form-grid">
          <div className="admin-main-column">
            <section className="admin-panel"><div className="admin-fields">
              <Field label="عنوان" value={post.title} onChange={(value) => editPost("title", value)} required />
              <Field label="نشانی کوتاه (Slug)" value={post.slug} onChange={(value) => editPost("slug", value)} required maxLength={140} direction="ltr" hint="حروف فارسی یا انگلیسی و عدد؛ واژه‌ها با خط تیره جدا شوند. تغییر نشانی، پیوند قدیمی را هدایت می‌کند." />
              <Field label="خلاصه" value={post.excerpt} onChange={(value) => editPost("excerpt", value)} multiline maxLength={400} />
              <MarkdownEditor value={post.body} onChange={(value) => editPost("body", value)} uploadImage={uploadImage} required={post.status === "published"} disabled={busy} />
            </div></section>
            <section className="admin-panel"><h2>تصویر شاخص</h2><div className="admin-fields">
              <ImageField label="بارگذاری تصویر شاخص" value={post.coverImage} onChange={(value) => editPost("coverImage", value)} uploadImage={uploadImage} busy={busy} />
              <Field label="متن جایگزین تصویر" value={post.coverAlt} onChange={(value) => editPost("coverAlt", value)} required={Boolean(post.coverImage)} maxLength={300} hint="آنچه در تصویر دیده می‌شود را کوتاه و روشن توصیف کنید." />
            </div></section>
            <section className="admin-panel"><h2>سئو و اشتراک‌گذاری</h2><div className="admin-fields">
              <Field label="عنوان در نتایج جست‌وجو" value={post.seoTitle} onChange={(value) => editPost("seoTitle", value)} hint={`${post.seoTitle.length.toLocaleString("fa-IR")} نویسه · در صورت خالی‌بودن، عنوان نوشته استفاده می‌شود.`} />
              <Field label="توضیح در نتایج جست‌وجو" value={post.seoDescription} onChange={(value) => editPost("seoDescription", value)} multiline maxLength={400} hint={`${post.seoDescription.length.toLocaleString("fa-IR")} نویسه · پیشنهاد: حدود ۱۴۰ تا ۱۶۰ نویسه`} />
              <div className="admin-search-preview" aria-label="پیش‌نمایش نتیجهٔ جست‌وجو"><span dir="ltr">{post.kind === "article" ? "/blog/" : "/pages/"}{post.slug}</span><strong>{post.seoTitle || post.title}</strong><p>{post.seoDescription || post.excerpt}</p></div>
              <Field label="نشانی مرجع (Canonical)" value={post.canonicalUrl} onChange={(value) => editPost("canonicalUrl", value)} maxLength={2048} direction="ltr" hint="خالی باشد، نشانی همین نوشته استفاده می‌شود." />
              <Toggle label="عدم نمایش در موتورهای جست‌وجو" checked={post.noIndex} onChange={(value) => editPost("noIndex", value)} hint="نوشتهٔ منتشرشده همچنان در سایت قابل مشاهده است." />
              <Field label="عنوان اشتراک‌گذاری" value={post.ogTitle} onChange={(value) => editPost("ogTitle", value)} />
              <Field label="توضیح اشتراک‌گذاری" value={post.ogDescription} onChange={(value) => editPost("ogDescription", value)} multiline maxLength={400} />
              <ImageField label="تصویر اختصاصی اشتراک‌گذاری" value={post.ogImage} onChange={(value) => editPost("ogImage", value)} uploadImage={uploadImage} busy={busy} />
            </div></section>
          </div>
          <aside className="admin-sidebar"><section className="admin-panel"><h2>انتشار</h2><div className="admin-fields">
            <label className="admin-field">وضعیت<select value={post.status} onChange={(event) => editPost("status", event.target.value as Post["status"])}><option value="draft">پیش‌نویس</option><option value="published">انتشار (فوری یا زمان‌بندی)</option></select></label>
            <Field label="زمان انتشار" value={publishNow ? "" : localDateTime(post.publishedAt)} type="datetime-local" onChange={(value) => editPost("publishedAt", value ? new Date(value).toISOString() : "")} hint={publishNow ? "انتشار فوری انتخاب شده است. برای زمان‌بندی، تاریخ و ساعت دلخواه را وارد کنید." : "به وقت دستگاه شما. خالی‌بودن برای نوشتهٔ تازه یعنی انتشار فوری؛ برای نوشتهٔ موجود، زمان ذخیره‌شده حفظ می‌شود."} />
            <button type="button" className="admin-button" onClick={() => { setPublishNow(true); setPost((current) => current ? { ...current, status: "published" } : current); }}>تنظیم انتشار برای همین حالا</button>
            <small>{publishNow ? "با «ذخیره و انتشار»، نوشته همین حالا منتشر می‌شود؛ زمان‌بندی قبلی جایگزین خواهد شد." : "زمان انتخاب‌شده پس از «ذخیره و انتشار» اعمال می‌شود."}</small>
            {savedState && <div><span className={`admin-status ${savedState}`}>نسخهٔ ذخیره‌شده: {publicationLabels[savedState]}</span>
              {savedState === "scheduled" && savedSelection && <small>انتشار در {publicationDate(savedSelection.publishedAt)}؛ تا آن زمان نشانی عمومی در دسترس نیست. برای انتشار فوری، «تنظیم انتشار برای همین حالا» و سپس «ذخیره و انتشار» را بزنید.</small>}</div>}
            <Field label="نویسنده" value={post.author} onChange={(value) => editPost("author", value)} required={post.kind === "article" && post.status === "published"} maxLength={100} />
            {post.kind === "article" && <><Field label="دسته‌بندی" value={post.category} onChange={(value) => editPost("category", value)} maxLength={80} />
              <Toggle label="نوشتهٔ منتخب" checked={post.featured} onChange={(value) => editPost("featured", value)} hint="در صفحهٔ اصلی در اولویت نمایش قرار می‌گیرد." /></>}
            {post.id && <>
              {dirty || busy
                ? <button type="button" className="admin-button admin-saved-preview" disabled aria-describedby={dirty ? "post-preview-hint" : undefined}>پیش‌نمایش نسخهٔ ذخیره‌شده <Icon name="external-link" /></button>
                : <a className="admin-button" href={`/admin/preview/${post.id}`} target="_blank" rel="noreferrer">پیش‌نمایش نسخهٔ ذخیره‌شده <Icon name="external-link" /></a>}
              {dirty && <small id="post-preview-hint">برای دیدن آخرین تصویرها و متن در پیش‌نمایش، ابتدا تغییرات را با «{post.status === "draft" ? "ذخیرهٔ پیش‌نویس" : "ذخیره و انتشار"}» ذخیره کنید.</small>}
              {!dirty && !busy && savedState === "published" && savedSelection && <a className="admin-text-button" href={postPath(savedSelection)} target="_blank" rel="noreferrer">نشانی عمومی <Icon name="external-link" /></a>}
              <small>آخرین ویرایش: {displayDate(post.updatedAt)}</small>
              <button type="button" className="admin-text-button admin-danger-text" onClick={() => void removePost(post)}>حذف {selectedName}</button></>}
          </div></section></aside>
        </fieldset>
        <div className="admin-save-bar"><span>{dirty ? "تغییرات ذخیره نشده‌اند" : post.id ? "آخرین نسخه ذخیره شده است" : "هنوز ذخیره نشده است"}</span><button className="admin-button admin-primary" disabled={busy} aria-busy={busy} type="submit">{busy ? "در حال انجام…" : post.status === "draft" ? "ذخیرهٔ پیش‌نویس" : "ذخیره و انتشار"}</button></div>
      </form> : <section>
        <div className="admin-section-heading"><h2>{tab === "page" ? "صفحه‌های سایت" : "همهٔ نوشته‌ها"}</h2><button className="admin-button admin-primary" disabled={busy} onClick={() => openPost()}><Icon name="plus" />{selectedName} تازه</button></div>
        <div className="admin-list-controls"><label className="admin-field">جست‌وجو<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <label className="admin-field">وضعیت<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">همه</option><option value="draft">پیش‌نویس</option><option value="published">منتشرشده</option><option value="scheduled">زمان‌بندی‌شده</option></select></label></div>
        {visiblePosts.length ? <div className="admin-post-list">{visiblePosts.map((item) => <article key={item.id} className="admin-post-row">
          <div><div className="admin-post-labels"><span className={`admin-status ${publicationState(item, serverNow)}`}>{publicationLabels[publicationState(item, serverNow)]}</span>{item.noIndex && <span className="admin-status">noindex</span>}{item.category && <span>{item.category}</span>}</div>
            <h3><button type="button" disabled={busy} onClick={() => openPost(item)}>{item.title}</button></h3><p className="admin-muted">{item.author} · آخرین ویرایش {displayDate(item.updatedAt)}</p></div>
          <div className="admin-actions"><button className="admin-button" disabled={busy} onClick={() => openPost(item)}>ویرایش</button><a className="admin-text-button" href={`/admin/preview/${item.id}`} target="_blank" rel="noreferrer">پیش‌نمایش <Icon name="external-link" /></a><button className="admin-text-button admin-danger-text" disabled={busy} onClick={() => void removePost(item)}>حذف</button></div>
        </article>)}</div> : <div className="admin-empty"><h3>{search || filter !== "all" ? "نتیجه‌ای پیدا نشد" : `هنوز ${selectedName}‌ای ندارید`}</h3><p>{search || filter !== "all" ? "جست‌وجو یا فیلتر را تغییر دهید." : `با ساخت اولین ${selectedName} شروع کنید.`}</p></div>}
      </section>}
  </div>;
}
