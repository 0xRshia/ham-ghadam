/* No fetch handler: this worker does not cache pages, account data, or map tiles. */
self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let payload;
    try { payload = event.data?.json(); } catch { return; }
    if (!payload || typeof payload.id !== "string" || typeof payload.title !== "string" || typeof payload.message !== "string") return;
    const url = new URL(typeof payload.href === "string" ? payload.href : "/notifications",self.location.origin);
    await self.registration.showNotification(payload.title, {
      body:payload.message, tag:payload.id, lang:"fa", dir:"rtl",
      data:{ href:url.origin === self.location.origin ? url.href : self.location.origin + "/notifications" },
    });
  })());
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL(event.notification.data?.href ?? "/notifications",self.location.origin);
    if (url.origin !== self.location.origin) return;
    const windows = await self.clients.matchAll({ type:"window",includeUncontrolled:true });
    const client = windows.find(item => new URL(item.url).origin === self.location.origin);
    if (client) { await client.navigate(url.href); await client.focus(); }
    else await self.clients.openWindow(url.href);
  })());
});
