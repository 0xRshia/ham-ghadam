import crypto from "node:crypto";

export async function testPaymentBypass({ db, call, event, user, check, host, startPreview, normalVars }) {
  const buyer = user(60), other = user(61);
  const paid = event("bypass-paid", 10, 250000);
  const sample = event("bypass-sample", 10, 50000);
  db.prepare("UPDATE events SET sample=1 WHERE id=?").run(sample);
  const order = (eventId, quantity = 1) => ({ eventId, quantity, name: "خریدار آزمایشی", requestKey: crypto.randomUUID() });
  const reserve = (data, token = buyer.token) => call("/api/reservations", data, token);
  const stored = (id) => db.prepare("SELECT * FROM reservations WHERE id=?").get(id);
  const tickets = (id) => call(`/api/reservations/${id}/tickets`, undefined, buyer.token);
  const sumSales = (data) => data.sales.reduce((sum, day) => sum + day.sales, 0);

  // Pre-existing provider state must survive an environment change without conversion.
  const pendingOrder = order(paid);
  const pendingId = crypto.randomUUID();
  const pendingAuthority = "integration-authority-" + crypto.randomUUID();
  db.prepare(`INSERT INTO reservations(id,user_id,event_id,quantity,total,amount_rial,status,request_key,created_at,expires_at,payment_state,authority)
    VALUES(?,?,?,1,250000,2500000,'hold',?,?,?,'pending',?)`)
    .run(pendingId, buyer.id, paid, pendingOrder.requestKey, Date.now(), Date.now() + 900000, pendingAuthority);
  const pendingBefore = stored(pendingId);
  const expectedPaymentUrl = `https://payment.zarinpal.com/pg/StartPay/${pendingAuthority}`;

  try {
    check((await call("/api/me")).data.skipPayDevEnabled === false,
      "Missing payment bypass configuration is disabled");
    check((await reserve({ ...order(paid), skipPayDevEnabled: true, SKIP_PAY_DEV: "true" })).status === 503,
      "Client-supplied flags cannot activate payment bypass");
    const before = (await call("/api/host", undefined, host.token)).data;
    const bypassVars = { ...normalVars, SKIP_PAY_DEV: "true" };
    await startPreview(bypassVars);
    const capability = (await call("/api/me")).data;
    check(capability.skipPayDevEnabled === true && capability.paymentReady === false,
      "Payment bypass is available independently of gateway credentials");

    const purchase = order(paid, 2);
    const bought = await reserve(purchase);
    check(bought.status === 201 && bought.data.paymentUrl === null && bought.data.reservation.status === "confirmed",
      "Paid booking confirms immediately with no payment URL or gateway configuration");
    const id = bought.data.reservation.id;
    const booking = stored(id);
    check(booking.payment_state === "skipped_dev" && booking.total === 500000 && booking.amount_rial === 5000000 &&
      booking.expires_at === null && booking.authority === null && booking.reference === null,
    "Bypass preserves price snapshots without recording a charge, authority, or expiry");
    check(booking.attendee_name === purchase.name && booking.attendee_phone === buyer.phone,
      "Bypass records the purchaser name and verified phone");
    const issued = await tickets(id);
    check(issued.status === 200 && issued.data.tickets.length === 2 && new Set(issued.data.tickets.map((ticket) => ticket.qr)).size === 2,
      "Bypassed bookings issue distinct downloadable tickets for every seat");
    check((await call(`/api/reservations/${id}/tickets`, undefined, other.token)).status === 404,
      "Bypassed tickets still require reservation ownership");
    const retried = await Promise.all(Array.from({ length: 5 }, () => reserve(purchase)));
    check(retried.every((r) => r.status === 200 && r.data.reservation.id === id && r.data.paymentUrl === null) &&
      JSON.stringify((await tickets(id)).data.tickets) === JSON.stringify(issued.data.tickets),
    "Repeated bypass requests preserve reservation and QR identities");
    check((await reserve({ ...purchase, quantity: 1 })).status === 409,
      "Bypass does not permit reusing a request key with different order details");
    const simultaneous = order(paid);
    const raced = await Promise.all(Array.from({ length: 5 }, () => reserve(simultaneous)));
    check(raced.every((r) => [200, 201].includes(r.status) && r.data.paymentUrl === null) &&
      new Set(raced.map((r) => r.data.reservation.id)).size === 1 && raced.filter((r) => r.status === 201).length === 1,
    "Concurrent first submissions create exactly one bypassed reservation");

    const sampleBought = await reserve(order(sample));
    check(sampleBought.status === 201 && sampleBought.data.reservation.payment_state === "skipped_dev" && sampleBought.data.paymentUrl === null &&
      (await tickets(sampleBought.data.reservation.id)).data.tickets.length === 1,
    "Paid sample events complete the same booking and ticket flow without a charge");
    const free = event("bypass-free", 2);
    const freeBought = await reserve(order(free));
    check(freeBought.status === 201 && freeBought.data.reservation.payment_state === "none" && freeBought.data.reservation.total === 0,
      "Free bookings retain their normal payment state while bypass is enabled");
    const finite = event("bypass-concurrency", 7, 1000);
    const attempts = await Promise.all(Array.from({ length: 14 }, () => reserve(order(finite), other.token)));
    check(attempts.filter((r) => r.status === 201).length === 7 && attempts.filter((r) => r.status === 409).length === 7 &&
      db.prepare("SELECT SUM(quantity) quantity FROM reservations WHERE event_id=? AND status='confirmed'").get(finite).quantity === 7,
    "Concurrent paid bypass bookings sell exactly seven of seven seats");
    const catalog = (await call("/api/events")).data;
    check(catalog.events.find((e) => e.id === paid).remaining === 6,
      "Bypassed bookings and existing payment holds both occupy event capacity");
    check(catalog.suggestions.some((s) => s.eventId === paid && s.reason !== "popular"),
      "Bypassed paid bookings do not inflate paid-ticket popularity");

    const after = (await call("/api/host", undefined, host.token)).data;
    check(after.stats.revenue === before.stats.revenue && sumSales(after) === sumSales(before) &&
      after.stats.bookings === before.stats.bookings + 11 && after.stats.people === before.stats.people + 12,
    "Bypassed bookings add attendees and bookings without increasing host revenue or sales");
    const panel = (await call(`/api/host/events/${paid}`, undefined, host.token)).data;
    check(panel.stats.revenue === 0 && panel.stats.people === 3 && panel.stats.bookings === 2 &&
      panel.attendees.every((r) => r.payment_state === "skipped_dev"),
    "Event host stats exclude skipped amounts and expose persisted bypass labels");

    check((await reserve(order(paid), "")).status === 401 &&
      (await call("/api/reservations", order(paid), buyer.token, "https://attacker.invalid")).status === 403,
    "Payment bypass preserves authentication and origin checks");
    for (const data of [{ ...order(paid), name: " " }, order(paid, 7), order(event("bypass-too-large", 10, 100000000), 2)]) {
      check((await reserve(data)).status === 400, "Payment bypass retains purchaser, quantity and amount validation");
    }
    for (const state of ["past", "unpublished"]) {
      const closed = event("bypass-" + state, 2, 1000);
      db.prepare(state === "past" ? "UPDATE events SET starts_at=? WHERE id=?" : "UPDATE events SET published=? WHERE id=?")
        .run(state === "past" ? Date.now() - 1000 : 0, closed);
      check([404, 409].includes((await reserve(order(closed))).status),
        `Bypass does not book ${state} events`);
    }
    await startPreview({ ...bypassVars, SEED_SAMPLE_EVENTS: "false" });
    check((await reserve(order(sample))).status === 404, "Payment bypass does not expose disabled sample events");
    await startPreview(bypassVars);

    const pendingRepeat = await reserve(pendingOrder);
    const pendingRetry = await call(`/api/reservations/${pendingId}`, { action: "retry" }, buyer.token);
    check(pendingRepeat.data.paymentUrl === expectedPaymentUrl && pendingRetry.data.paymentUrl === expectedPaymentUrl &&
      pendingRepeat.data.reservation.status === "hold",
    "Existing pending bookings retain their original payment redirect when bypass is enabled");
    check((await call(`/api/reservations/${pendingId}`, { action: "verify" }, buyer.token)).status === 409 &&
      JSON.stringify(stored(pendingId)) === JSON.stringify(pendingBefore) && (await tickets(pendingId)).status === 409,
    "Existing pending bookings still require gateway verification and cannot issue tickets");

    for (const value of [undefined, "false", "TRUE", "1", ""]) {
      await startPreview({ ...normalVars, ...(value === undefined ? {} : { SKIP_PAY_DEV: value }) });
      check((await call("/api/me")).data.skipPayDevEnabled === false && (await reserve(order(paid))).status === 503 &&
        (await reserve(order(sample))).status === 409,
      `Flag ${JSON.stringify(value) ?? "missing"} restores normal paid and sample booking restrictions`);
    }
    const afterDisabled = await reserve(purchase);
    check(afterDisabled.status === 200 && afterDisabled.data.paymentUrl === null && afterDisabled.data.reservation.id === id &&
      afterDisabled.data.reservation.payment_state === "skipped_dev" && JSON.stringify(stored(id)) === JSON.stringify(booking),
    "Disabling bypass leaves existing reservation snapshots and idempotent responses unchanged");
    check(JSON.stringify((await tickets(id)).data.tickets) === JSON.stringify(issued.data.tickets) &&
      (await call(`/api/reservations/${id}`, { action: "verify" }, buyer.token)).data.reservation.payment_state === "skipped_dev" &&
      (await call("/api/reservations", undefined, buyer.token)).data.reservations.find((r) => r.id === id).payment_state === "skipped_dev",
    "Issued tickets and persisted bypass labels remain available after disabling the flag");
  } finally {
    await startPreview(normalVars);
  }
}
