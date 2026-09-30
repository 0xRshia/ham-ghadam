import crypto from "node:crypto";
import fs from "node:fs";
import ts from "typescript";

export async function testRegistration({ db, call, event, host, guest, eventForm, check, createdIds }) {
  for (const change of [
    { registrationDate: undefined }, { registrationTime: undefined },
    { registrationDate: "1404/12/30" }, { registrationDate: "1400/01/01" },
    { registrationTime: "24:00" }, { registrationTime: "18:05" }, { registrationTime: "17:01" },
  ]) {
    check((await call("/api/host", { ...eventForm, ...change }, host.token)).status === 400,
      "Registration creation rejects missing, invalid, past, after-start and off-step deadlines");
  }
  const persian = (value) => value.replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
  const creation = await call("/api/host", { ...eventForm,
    registrationDate: persian(eventForm.date), registrationTime: persian(eventForm.time) }, host.token);
  check(creation.status === 201, "Registration accepts Persian digits and a deadline equal to event start");
  createdIds.push(creation.data.id);
  const detail = (await call(`/api/events/${creation.data.id}`)).data.event;
  check(detail.registration_ends_at === detail.starts_at, "Stored deadline is returned by the detail API");

  const id = event("registration-cutoff", null);
  const order = { eventId: id, quantity: 1, requestKey: crypto.randomUUID() };
  const booked = await call("/api/reservations", order, guest.token);
  check(booked.status === 201, "Open registration succeeds");
  db.prepare("UPDATE events SET registration_ends_at=? WHERE id=?").run(Date.now() - 1, id);
  const blocked = await Promise.all(Array.from({ length: 4 }, () => call("/api/reservations", {
    ...order, requestKey: crypto.randomUUID(),
  }, guest.token)));
  check(blocked.every((result) => result.status === 409) &&
    db.prepare("SELECT COUNT(*) n FROM reservations WHERE event_id=?").get(id).n === 1,
  "Concurrent direct API calls cannot register after deadline or allocate seats");
  check((await call("/api/reservations", order, guest.token)).data.reservation.id === booked.data.reservation.id,
    "Idempotent confirmed booking survives deadline");
  const catalog = (await call("/api/events")).data;
  check(catalog.events.some((item) => item.id === id) && !catalog.suggestions.some((item) => item.eventId === id),
    "Expired registration stays in catalog but is excluded from suggestions");
  check((await call(`/api/reservations/${booked.data.reservation.id}`, { action: "cancel" }, guest.token)).status === 200,
    "Free ticket cancellation remains available before event start after registration closes");

  const source = ts.transpileModule(fs.readFileSync("lib/booking-sql.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const { reserveSql, confirmSql } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const paid = event("registration-paid-hold", 4, 1000);
  const now = Date.now(), cutoff = now + 1000, key = crypto.randomUUID(), holdId = crypto.randomUUID();
  db.prepare("UPDATE events SET registration_ends_at=? WHERE id=?").run(cutoff, paid);
  const reserve = (id, at, requestKey = crypto.randomUUID(), bypass = 0) => db.prepare(reserveSql).get(
    id, guest.id, paid, 1, requestKey, at, at + 900000, "آزمایش مهلت", bypass);
  check(!!reserve(holdId, cutoff - 1, key), "Atomic SQL accepts registration one millisecond before deadline");
  check(!reserve(crypto.randomUUID(), cutoff) && !reserve(crypto.randomUUID(), cutoff + 1, crypto.randomUUID(), 1),
    "Atomic SQL rejects exact cutoff and bypass requests after cutoff");
  db.prepare("UPDATE reservations SET authority=?,payment_state='pending' WHERE id=?").run("deadline-authority", holdId);
  db.prepare("UPDATE events SET registration_ends_at=? WHERE id=?").run(now - 1, paid);
  const repeat = await call("/api/reservations", { eventId: paid, quantity: 1, requestKey: key }, guest.token);
  const retry = await call(`/api/reservations/${holdId}`, { action: "retry" }, guest.token);
  check(repeat.status === 200 && retry.status === 200 && repeat.data.paymentUrl === retry.data.paymentUrl,
    "Pre-deadline active payment hold retains idempotent redirect and retry after deadline");
  check(!!db.prepare(confirmSql).get(holdId, "deadline-reference", cutoff + 1),
    "Existing payment confirmation is not rejected solely because registration expired");
}
