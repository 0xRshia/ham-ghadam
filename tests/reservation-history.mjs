import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const compiled = ts.transpileModule(fs.readFileSync("lib/reservation-history.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { reservationTab, groupReservations } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const now = 1800000000000;
const cases = [
  [{ status: "confirmed", starts_at: now + 1, ends_at: now + 2 }, "upcoming"],
  [{ status: "confirmed", starts_at: now - 1, ends_at: now + 1 }, "upcoming"],
  [{ status: "confirmed", ends_at: now }, "past"],
  [{ status: "confirmed", ends_at: now - 1 }, "past"],
  [{ status: "hold", expires_at: now + 1 }, "upcoming"],
  [{ status: "hold", expires_at: now }, "cancelled"],
  [{ status: "hold", expires_at: now - 1 }, "cancelled"],
  [{ status: "hold", expires_at: null }, "cancelled"],
  [{ status: "paid_unfulfilled", ends_at: now - 1 }, "upcoming"],
  [{ status: "paid_unfulfilled", ends_at: now + 1 }, "upcoming"],
  [{ status: "failed", ends_at: now + 1 }, "cancelled"],
  [{ status: "cancelled", ends_at: now - 1 }, "cancelled"],
];
for (const [reservation, expected] of cases) {
  assert.equal(reservationTab(reservation, now), expected, JSON.stringify(reservation));
}
const rows = cases.map(([row], index) => ({ ...row, id: String(index) }));
const groups = groupReservations(rows, now);
for (const tab of ["past", "upcoming", "cancelled"]) {
  assert.deepEqual(groups[tab], rows.filter((_, index) => cases[index][1] === tab),
    `${tab} keeps API ordering and includes exactly its matching reservations`);
}
assert.equal(new Set(Object.values(groups).flat().map(row => row.id)).size, rows.length);
assert.deepEqual(groupReservations([], now), { past: [], upcoming: [], cancelled: [] });
assert.equal(reservationTab(rows[0], now + 2), "past", "Confirmed booking moves after the event ends");
assert.equal(reservationTab(rows[4], now + 1), "cancelled", "Payment hold moves at expiry");
console.log("PASS reservation tabs, counts, ordering, event boundaries and payment follow-up");
