import fs from "node:fs";
import path from "node:path";

export async function testContent({ check, user, db, root, base, admin: configuredAdmin, guest, host: configuredHost }) {
  const admin = configuredAdmin ?? user(99);
  const visitor = guest ?? user(1);
  const host = configuredHost ?? user(0);
  const suffix = `content-${crypto.randomUUID()}`;
  const origin = base ?? "http://127.0.0.1:5188";
  const draftSlug = `${suffix}-draft`;
  const contactSubject = `${suffix} contact`;
  const request = async (method, route, body, token, contentType = "application/json") => {
    // Exercise each independent admin operation beyond its intentional cooldown.
    if (method !== "GET" && route.startsWith("/api/admin/")) {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    const headers = { Origin: origin, ...(token ? { Cookie: `hg_session=${token}` } : {}) };
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers["Content-Type"] = contentType; payload = JSON.stringify(body); }
    const response = await fetch(`${origin}${route}`, { method, headers, body: payload, signal: AbortSignal.timeout(7000) });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = null; }
    return { response, data, raw };
  };
  const articleDraft = (slug, status = "draft") => ({
    slug,
    title: `راهنمای ${suffix}`,
    excerpt: "متن راهنمایی برای بررسی انتشار.",
    body: "## بخش نخست\n\nمتن مقالهٔ آزمایشی.",
    category: "راهنما",
    author_name: "تحریریهٔ هم‌قدم",
    status,
  });
  try {
    check((await request("GET", "/api/admin/articles", undefined, visitor.token)).response.status === 403,
      "A signed-in non-admin cannot read the article manager");
    check((await request("GET", "/api/admin/contact", undefined, host.token)).response.status === 403,
      "A host role does not grant access to the contact inbox");

    const created = await request("POST", "/api/admin/articles", articleDraft(draftSlug), admin.token);
    check(created.response.status === 201, "An admin can create an unpublished article");
    const articleId = created.data.id;
    check((await request("GET", `/blog/${draftSlug}`, undefined, undefined)).response.status === 404,
      "A draft article cannot be opened through its public route");
    check((await request("GET", "/blog/find-an-event-that-fits", undefined, undefined)).response.status === 404,
      "Seeded guide articles stay unpublished until an admin approves them");
    const publicIndex = await request("GET", "/blog", undefined, undefined);
    check(publicIndex.response.status === 200 && !publicIndex.raw.includes(draftSlug),
      "The public blog index excludes draft articles");
    check((await request("GET", "/blog?page=0")).response.status === 404 &&
      (await request("GET", "/blog?page=99999")).response.status === 404,
      "Invalid and out-of-range blog pages return not found");

    const invalidSlug = await request("POST", "/api/admin/articles", { ...articleDraft(`${suffix}-invalid`), slug: "../unsafe" }, admin.token);
    check(invalidSlug.response.status === 400, "Article slugs reject path traversal characters");
    const mediaFile = fs.readFileSync(path.join(root, "public/images/cafe.jpg"));
    const form = new FormData();
    form.append("data", JSON.stringify({}));
    form.append("cover", new Blob([mediaFile], { type: "image/jpeg" }), "cover.jpg");
    const uploaded = await request("POST", `/api/admin/articles/${articleId}/cover`, form, admin.token);
    check(uploaded.response.status === 200, "An admin can upload a validated article cover");
    const mediaId = uploaded.data.id;
    const privateCover = await request("GET", `/api/article-media/${mediaId}`, undefined, visitor.token);
    check(privateCover.response.status === 403, "A draft cover remains private to admins");
    const adminCover = await request("GET", `/api/article-media/${mediaId}`, undefined, admin.token);
    check(adminCover.response.status === 200 && adminCover.response.headers.get("content-type") === "image/jpeg",
      "An admin can preview a draft cover");

    const published = await request("PUT", `/api/admin/articles/${articleId}`, articleDraft(draftSlug, "published"), admin.token);
    check(published.response.status === 200 && published.data.published_at > 0,
      `Publishing sets the article publication time (${published.response.status}: ${published.raw})`);
    const publicArticle = await request("GET", `/blog/${draftSlug}`, undefined, undefined);
    check(publicArticle.response.status === 200 && publicArticle.raw.includes("متن مقالهٔ آزمایشی"),
      "Published article content appears on its public route");
    const publicCover = await request("GET", `/api/article-media/${mediaId}`, undefined, undefined);
    check(publicCover.response.status === 200 && publicCover.response.headers.get("cache-control") === "no-store",
      "Published cover is publicly readable without stale caching");

    const contact = await request("POST", "/api/contact", {
      name: "کاربر آزمایشی", email: "visitor@example.invalid", phone: "", subject: contactSubject,
      message: "پیام تماس برای بررسی ماندگاری.",
    }, visitor.token);
    check(contact.response.status === 201 && contact.data.received === true,
      "The contact form reports success after accepting a valid message");
    const message = db.prepare("SELECT id,user_id,name,email,subject,message,status,created_at FROM contact_messages WHERE subject=?").get(contactSubject);
    check(message?.user_id === visitor.id && message?.status === "new" && message?.message === "پیام تماس برای بررسی ماندگاری.",
      "Contact success corresponds to a persisted message tied to the signed-in account");
    const inbox = await request("GET", "/api/admin/contact?status=new", undefined, admin.token);
    check(inbox.response.status === 200 && inbox.data.items.some((item) => item.id === message?.id),
      "The new contact message appears in the admin inbox");
    const moved = await request("PATCH", `/api/admin/contact/${message.id}`, { status: "in_progress" }, admin.token);
    const resolved = await request("PATCH", `/api/admin/contact/${message.id}`, { status: "resolved" }, admin.token);
    check(moved.response.status === 200 && resolved.response.status === 200 && db.prepare("SELECT status FROM contact_messages WHERE id=?").get(message.id)?.status === "resolved",
      "Admins can move a persisted contact message through its tracking states");
    const badContact = await request("POST", "/api/contact", { name: "کاربر", subject: "راه تماس ندارد", message: "پیام" }, visitor.token);
    check(badContact.response.status === 400 && db.prepare("SELECT COUNT(*) total FROM contact_messages WHERE subject='راه تماس ندارد'").get().total === 0,
      "The contact form never records a message without a reply channel");
    db.prepare("UPDATE rate_limits SET count=5,resets_at=? WHERE key LIKE 'contact:%'").run(Date.now() + 60_000);
    const repeatedContact = await request("POST", "/api/contact", { name: "کاربر", subject: "راه تماس ندارد", message: "پیام" }, visitor.token);
    check(repeatedContact.response.status === 429, "Contact submissions enforce the hourly limit");

    const demoted = await request("PUT", `/api/admin/articles/${articleId}`, articleDraft(draftSlug, "draft"), admin.token);
    check(demoted.response.status === 200 && (await request("GET", `/blog/${draftSlug}`, undefined, undefined)).response.status === 404,
      "Unpublishing removes the article from its public route");
    check((await request("GET", `/api/article-media/${mediaId}`, undefined, visitor.token)).response.status === 403,
      "Unpublishing immediately makes its cover private again");
    const removed = await request("DELETE", `/api/admin/articles/${articleId}`, undefined, admin.token);
    check(removed.response.status === 200 && !db.prepare("SELECT id FROM article_media WHERE article_id=?").get(articleId),
      "Deleting an article removes its cover reference");
  } finally {
    db.prepare("DELETE FROM contact_messages WHERE subject=?").run(contactSubject);
    db.prepare("DELETE FROM articles WHERE slug=?").run(draftSlug);
    // The cover object is immutable to keep an already captured DB backup restorable.
  }
}
