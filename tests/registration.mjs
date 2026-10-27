import { withLocaleModules } from "./locale-module.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

function url(source) {
  return `data:text/javascript;base64,${Buffer.from(ts.transpileModule(withLocaleModules(source), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText).toString("base64")}`;
}
const { registrationState, registrationClosesAt,
  registrationCountdownMinutes: minutes, registrationClockDelay: delay,
  validRegistrationDeadline: valid } = await import(url(fs.readFileSync("lib/registration.ts", "utf8")));
const now = 1800000000000, minute = 60000, hour = 60 * minute, day = 24 * hour;
for (const [remaining, expected] of [
  [5 * day, null], [4 * day + 1, null], [4 * day, 5760], [4 * day - 1, 5760],
  [4 * day - minute, 5759], [3 * day, 4320],
  [day + 1, 1441], [day, 1440], [day - 1, 1440], [day - minute, 1439],
  [hour + 1, 61], [hour, 60], [hour - 1, 60], [hour - minute, 59],
  [minute + 1, 2], [minute, 1], [minute - 1, 1],
  [1001, 1], [1000, 1], [999, 1], [1, 1], [0, 0], [-1, 0], [-day, 0],
]) {
  assert.equal(minutes(now + remaining, now), expected, `D:H:M countdown at ${remaining} ms`);
}
for (const invalid of [NaN, Infinity, -Infinity]) assert.equal(minutes(invalid, now), null);
assert.equal(delay(undefined, now, 1000), minute);
assert.equal(delay(now + 5 * day, now), minute);
assert.equal(delay(now + 4 * day + 500, now), 500, "Wake at the inclusive four-day threshold");
assert.equal(delay(now + 4 * day + 1, now), 1);
assert.equal(delay(now + 4 * day, now), minute);
assert.equal(delay(now + 4 * day - 1, now), minute - 1);
assert.equal(delay(now + hour, now), minute);
assert.equal(delay(now + hour + 12345, now), 12345, "Align the first refresh to the minute display");
assert.equal(delay(now + hour, now, 1000), 1000);
assert.equal(delay(now + hour - 1, now, 1000), 999);
assert.equal(delay(now + 500, now), 500, "Minute timers wake at the exact registration cutoff");
assert.equal(delay(now + 1, now), 1);
assert.equal(delay(now + 500, now, 1000), 500, "Wake at the exact registration cutoff");
assert.equal(delay(now + 1, now, 1000), 1);
assert.equal(delay(now, now, 1000), minute, "Expired timers no longer tick every second");
assert.equal(delay(now - day, now, 1000), minute);
const deadline = now + 4 * day + 500;
let tick = now;
assert.equal(minutes(deadline, tick), null);
tick += delay(deadline, tick);
assert.equal(minutes(deadline, tick), 5760, "The timer appears at exactly four days");
tick += delay(deadline, tick);
assert.equal(minutes(deadline, tick), 5759, "The next minute updates without a second-level loop");
tick = deadline - 1;
assert.equal(minutes(deadline, tick), 1);
tick += delay(deadline, tick);
assert.equal(minutes(deadline, tick), 0, "The final partial minute closes exactly on time");
assert.equal(valid(now + hour, now + hour, now), true);
for (const deadline of [NaN, Infinity, now, now - hour, now + 2 * hour, now + minute]) {
  assert.equal(valid(deadline, now + hour, now), false);
}
const event = { starts_at: now + hour, ends_at: now + 2 * hour, registration_ends_at: now + minute, remaining: 1 };
assert.equal(registrationState(event, now), "open");
assert.equal(registrationState({ ...event, remaining: 0 }, now), "sold_out");
assert.equal(registrationState({ ...event, remaining: 0 }, now + minute), "expired");
assert.equal(registrationState(event, now + hour), "expired");
const multiDay = { starts_at: now - day, ends_at: now + 2 * day, registration_ends_at: null, remaining: 1 };
assert.equal(registrationState(multiDay, now), "open", "Day two remains open without a separate deadline");
assert.equal(registrationClosesAt(multiDay), multiDay.ends_at);
assert.equal(registrationState({ ...multiDay, remaining: 0 }, now), "sold_out");
assert.equal(registrationState({ ...multiDay, remaining: null }, now), "open");
assert.equal(registrationState(multiDay, multiDay.ends_at - 1), "open");
assert.equal(registrationState(multiDay, multiDay.ends_at), "ended");
assert.equal(registrationState(multiDay, multiDay.ends_at + 1), "ended");
assert.equal(registrationState({ ...multiDay, registration_ends_at: now }, now), "expired");
assert.equal(registrationState({ ...multiDay, registration_ends_at: now + hour }, now), "open");
assert.equal(registrationState({ ...multiDay, ends_at: null }, now), "expired");
assert.equal(registrationState({ ...multiDay, starts_at: null }, now), "expired");
assert.equal(registrationClosesAt({ ...multiDay, registration_ends_at: now + 3 * day }), multiDay.ends_at);
console.log("PASS optional registration, multi-day availability, deadline/end boundaries, capacity and countdown cadence");
