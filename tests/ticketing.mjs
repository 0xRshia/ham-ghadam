import crypto from "node:crypto";

export async function testTicketing({ db, call, event, check, host, guest, other, base, unlimited, now }) {
  const id = event("ticketing", 30);
  const key = crypto.randomUUID();
  const order = { eventId: id, quantity: 3, requestKey: key, name: "سارا احمدی" };
  const bought = await call("/api/reservations", order, guest.token);
  check(bought.status === 201, "Named multi-ticket purchase succeeds");
  const reservationId = bought.data.reservation.id;
  const ticketPath = `/api/reservations/${reservationId}/tickets`;
  const first = await call(ticketPath, undefined, guest.token);
  check(first.status === 200 && first.data.tickets.length === 3 && new Set(first.data.tickets.map(t => t.qr)).size === 3,
    "One distinct persistent app QR is issued per purchased seat");
  check(first.data.reservation.name === order.name && first.data.reservation.phone === guest.phone && first.data.reservation.address === "تهران، ونک",
    "Ticket download includes snapshotted buyer identity and event address");
  await call("/api/reservations", order, guest.token);
  const repeated = await call(ticketPath, undefined, guest.token);
  check(JSON.stringify(first.data.tickets) === JSON.stringify(repeated.data.tickets), "Booking retries and repeat downloads preserve ticket QR identities");
  check((await call(ticketPath)).status === 401 && (await call(ticketPath, undefined, other.token)).status === 404,
    "Ticket payloads require reservation ownership");
  check((await call("/api/reservations", { ...order, requestKey: crypto.randomUUID(), name: " " }, guest.token)).status === 400,
    "Checkout rejects an empty attendee name");
  const panelPath = `/api/host/events/${id}`;
  const panel = await call(panelPath, undefined, host.token);
  check(panel.data.attendeeTotal === 1 && panel.data.attendees[0].name === order.name && panel.data.stats.people === 3,
    "Event panel immediately shows confirmed purchaser and the purchased seat count");
  check((await call(panelPath + "?q=" + encodeURIComponent("سارا"), undefined, host.token)).data.attendeeTotal === 1,
    "Host can search attendee names");
  const persianPhone = guest.phone.replace(/\d/g, digit => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
  check((await call(panelPath + "?q=" + encodeURIComponent(persianPhone), undefined, host.token)).data.attendeeTotal === 1,
    "Phone search accepts Persian digits");
  check((await call(panelPath + "?q=%25", undefined, host.token)).data.attendeeTotal === 0,
    "Search wildcard characters are treated literally");
  check((await call(panelPath, undefined, guest.token)).status === 403, "Regular users cannot read event attendee panels");
  const foreign = event("foreign-host", 20);
  db.prepare("UPDATE events SET host_id=? WHERE id=?").run(other.id, foreign);
  for (const suffix of ["", "/export"])
    check((await call(`/api/host/events/${foreign}${suffix}`, undefined, host.token)).status === 404,
      "Another host cannot access event attendee " + (suffix || "panel"));
  check((await call(`/api/host/events/${foreign}/scanner`, {}, host.token)).status === 404, "Another host cannot create staff scanner links");
  const csvResponse = await fetch(base + `/api/host/events/${unlimited}/export`, { headers: { Cookie: `hg_session=${host.token}` } });
  const csvBytes = new Uint8Array(await csvResponse.arrayBuffer());
  const csv = new TextDecoder().decode(csvBytes);
  check(csvResponse.status === 200 && csvBytes[0] === 239 && csvBytes[1] === 187 && csvBytes[2] === 191 && csv.split("\r\n").length > 52,
    "UTF-8 CSV exports names and phone numbers across every attendee page");
  check(csvResponse.headers.get("content-disposition").includes("attachment") && csv.includes(guest.phone), "CSV response is a downloadable attendee file");
  const legacy = db.prepare("SELECT id FROM reservations WHERE event_id=? AND attendee_name IS NULL AND status='confirmed' LIMIT 1").get(unlimited);
  const legacyDownload = await call(`/api/reservations/${legacy.id}/tickets`, undefined, guest.token);
  check(legacyDownload.status === 200 && legacyDownload.data.tickets.length === 1 && legacyDownload.data.reservation.phone === guest.phone,
    "Purchases made before the migration receive working tickets on first download");
  const legacyAgain = await call(`/api/reservations/${legacy.id}/tickets`, undefined, guest.token);
  check(legacyAgain.data.tickets[0].qr === legacyDownload.data.tickets[0].qr,
    "Legacy purchase backfill also preserves stable ticket identities");
  const formula = await call("/api/reservations", { eventId: id, quantity: 1, requestKey: crypto.randomUUID(), name: '=HYPERLINK("https://example.invalid")' }, other.token);
  check(formula.status === 201, "Names are stored as literal data");
  const formulaCsv = await fetch(base + panelPath + "/export", { headers: { Cookie: `hg_session=${host.token}` } }).then(r => r.text());
  check(formulaCsv.includes('"\'=HYPERLINK(""https://example.invalid"")"'), "CSV escapes embedded quotes and neutralizes spreadsheet formulas");
  const scanner = await call(panelPath + "/scanner", {}, host.token);
  const scannerKey = scanner.data.scannerUrl.split("#")[1];
  check(/^[a-f0-9]{64}$/.test(scannerKey) && scanner.data.scannerUrl.startsWith("/scanner#"), "Staff scanner uses a private event capability in the URL fragment");
  async function scan(qr, token = scannerKey, origin = base) {
    const result = await fetch(base + "/api/scanner", { method: qr === undefined ? "GET" : "POST",
      headers: { "X-Scanner-Key": token, ...(qr === undefined ? {} : { Origin: origin, "Content-Type": "application/json" }) },
      body: qr === undefined ? undefined : JSON.stringify({ qr }), signal: AbortSignal.timeout(10000) });
    return { status: result.status, data: await result.json() };
  }
  check((await scan()).data.event.id === id, "Staff scanner works without a user session");
  check((await scan(undefined, "0".repeat(64))).status === 403, "An invented staff key cannot read the event");
  check((await scan("https://example.com")).status === 400 && (await scan("hg-ticket:v1:" + "0".repeat(64))).status === 404,
    "Scanner rejects unrelated and forged QR codes");
  check((await scan(first.data.tickets[0].qr, scannerKey, "https://attacker.invalid")).status === 403,
    "Cross-origin check-in mutations are rejected");
  const wrongScanner = await call(`/api/host/events/${unlimited}/scanner`, {}, host.token);
  check((await scan(first.data.tickets[0].qr, wrongScanner.data.scannerUrl.split("#")[1])).status === 404,
    "A valid ticket cannot be checked into a different event");
  const raced = await Promise.all(Array.from({ length: 6 }, () => scan(first.data.tickets[0].qr)));
  check(raced.filter(r => r.data.status === "checked_in").length === 1 && raced.filter(r => r.data.status === "already_checked_in").length === 5,
    "Concurrent staff scans admit a ticket exactly once");
  const admitted = raced.find(r => r.data.status === "checked_in").data.ticket;
  check(admitted.name === order.name && admitted.address === "تهران، ونک" && admitted.ordinal === 1 && admitted.checked_in_at > 0 && !admitted.phone,
    "Successful check-in returns ticket details without exposing buyer phone numbers to staff");
  check((await scan(first.data.tickets[1].qr)).data.status === "checked_in", "Second ticket in the same PDF checks in independently");
  check((await call(panelPath, undefined, host.token)).data.stats.checkedIn === 2, "Event panel counts check-ins per seat");
  check((await call(`/api/reservations/${reservationId}`, { action: "cancel" }, guest.token)).status === 409,
    "A used free ticket cannot cancel its reservation to release occupied capacity");
  const cancelBooking = await call("/api/reservations", { eventId: id, quantity: 1, requestKey: crypto.randomUUID(), name: "لغو آزمایشی" }, guest.token);
  const cancelId = cancelBooking.data.reservation.id;
  const cancelTicket = (await call(`/api/reservations/${cancelId}/tickets`, undefined, guest.token)).data.tickets[0];
  await call(`/api/reservations/${cancelId}`, { action: "cancel" }, guest.token);
  check((await scan(cancelTicket.qr)).status === 404 && (await call(`/api/reservations/${cancelId}/tickets`, undefined, guest.token)).status === 409,
    "Cancelled reservations cannot download or check in previously issued tickets");
  await call(panelPath + "/scanner", { action: "rotate" }, host.token);
  check((await scan()).status === 403 && (await scan(first.data.tickets[2].qr)).status === 403,
    "Rotating the staff link revokes its event view and check-in access immediately");
  db.prepare("UPDATE events SET ends_at=? WHERE id=?").run(now - 1000, id);
  const freshKey = (await call(panelPath + "/scanner", {}, host.token)).data.scannerUrl.split("#")[1];
  check((await scan(first.data.tickets[2].qr, freshKey)).status === 409 && (await call(ticketPath, undefined, guest.token)).status === 200,
    "Past-event tickets stay downloadable in history but cannot check in");
  const heldId = crypto.randomUUID();
  db.prepare("INSERT INTO reservations(id,user_id,event_id,quantity,total,amount_rial,status,request_key,created_at,payment_state) VALUES(?,?,?,1,1000,10000,'hold',?,?,'pending')")
    .run(heldId, guest.id, id, crypto.randomUUID(), now);
  check((await call(`/api/reservations/${heldId}/tickets`, undefined, guest.token)).status === 409,
    "Unpaid reservations never receive downloadable tickets");
  const heldBefore = db.prepare("SELECT COUNT(*) n FROM tickets WHERE reservation_id=?").get(heldId).n;
  check(heldBefore === 0, "No tickets are issued for payment holds");
}
