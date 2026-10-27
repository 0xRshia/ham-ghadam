import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { nodeSourceModules } from "./node-source-module.mjs";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hamghadam-detail-dates-"));
try {
  const load = nodeSourceModules(directory);
  const { eventDetailDateLabel, exactEventWindow, parseSheetSchedule, scheduleDateLabel, scheduleTimeLabel } = await load("lib/event-schedule.ts");
  const { parsePersianDate } = await load("lib/persian-date.ts");
  const { parseSheetCsv, sheetEventInput } = await load("lib/event-sheet-source.ts");
  const starts_at = parsePersianDate("1405/08/06", "11:00");
  const fixed = { starts_at, ends_at: parsePersianDate("1405/08/15", "19:00") };
  assert.ok(Number.isFinite(starts_at));
  assert.match(scheduleDateLabel(fixed, true), /۱۴۰۵/);
  assert.doesNotMatch(eventDetailDateLabel(fixed), /۱۴۰۵/);
  assert.match(eventDetailDateLabel(fixed), / تا /);
  assert.equal(eventDetailDateLabel(fixed), scheduleDateLabel(fixed));
  assert.equal(eventDetailDateLabel({ starts_at, ends_at: starts_at + 3600000 }), scheduleDateLabel({ starts_at, ends_at: starts_at + 3600000 }));
  assert.ok(exactEventWindow(fixed), "The display does not change calendar eligibility or exact timestamps");
  console.log("PASS fixed single-day and multi-day detail labels omit years while full labels and exact calendar times remain unchanged");

  const cases = [
    ["۱۴۰۵ آبان ۶، چهارشنبه تا ۱۴۰۵ آبان ۱۵، جمعه", "آبان ۶، چهارشنبه تا آبان ۱۵، جمعه"],
    ["۱۴۰۵آبان۶، چهارشنبه تا۱۴۰۵آبان۱۵، جمعه", "آبان۶، چهارشنبه تا آبان۱۵، جمعه"],
    ["۶ آبان ۱۴۰۵، چهارشنبه تا ۱۵ آبان ۱۴۰۵، جمعه", "۶ آبان، چهارشنبه تا ۱۵ آبان، جمعه"],
    ["۶آبان۱۴۰۵", "۶آبان"],
    ["۶ آبان۱۴۰۵ تا۱۴۰۵آبان۱۵", "۶ آبان تا آبان۱۵"],
    ["۶ آبان سال ۱۴۰۵", "۶ آبان"],
    ["سال ۱۴۰۵ آبان ۶", "آبان ۶"],
    ["6 آبان 1405 تا 15 آبان 1405", "6 آبان تا 15 آبان"],
    ["٦ آبان ١٤٠٥ تا ١٥ آبان ١٤٠٥", "٦ آبان تا ١٥ آبان"],
    ["۱۴۰۵/۸/۶ تا ۱۴۰۵/۸/۱۵", "۸/۶ تا ۸/۱۵"],
    ["1405-08-06 تا 1405-08-15", "08-06 تا 08-15"],
    ["١٤٠٥ / ٨ / ٦", "٨ / ٦"],
    ["۶/۸/۱۴۰۵ تا ۱۵/۸/۱۴۰۵", "۶/۸ تا ۱۵/۸"],
    ["تا ۶ آبان ۱۴۰۵\nبه جز شنبه و یکشنبه", "تا ۶ آبان\nبه جز شنبه و یکشنبه"],
    ["آبان ۱۴۰۵", "آبان"],
  ];
  for (const [source, expected] of cases) {
    const schedule = parseSheetSchedule(source, "ساعات مشخص نیست", 1405);
    const event = { starts_at: null, ends_at: null, schedule };
    const before = structuredClone(event);
    assert.equal(eventDetailDateLabel(event), expected, source);
    assert.equal(scheduleDateLabel(event, true), source);
    assert.equal(scheduleDateLabel(event), source, "Other authored schedule consumers keep their original source text");
    assert.equal(scheduleTimeLabel(event), "ساعات مشخص نیست");
    assert.deepEqual(event, before, "Compact labels never rewrite the schedule or fabricate timestamps");
    assert.equal(exactEventWindow(event), false);
  }
  console.log("PASS flexible named-month and valid numeric dates omit attached Persian, Arabic and Latin years without changing stored/full labels or unknown hours");

  for (const source of [
    "هر جمعه", "هر دوشنبه\nبه جز روزهای تعطیل", "زمان برگزاری اعلام می‌شود",
    "از سال ۱۴۰۵، هر جمعه", "سال ۱۴۰۵", "۱۴۰۵ نفر", "کد ۱۴۰۵", "نسخه ۱۴۰۵۰",
    "۱۴۰۵/۱۳/۶", "۱۴۰۵/۸/۴۰", "۶/۱۳/۱۴۰۵", "آبان ۱۴۰۵۰", "روزآبان۱۴۰۵",
  ]) {
    const event = { starts_at: null, ends_at: null, schedule: parseSheetSchedule(source, "", 1405) };
    assert.equal(eventDetailDateLabel(event), source, source);
  }
  const rows = parseSheetCsv(fs.readFileSync("tests/fixtures/event-sheet.csv", "utf8"));
  assert.equal(rows.length, 51);
  for (const row of rows) {
    const { input, schedule } = sheetEventInput(row, 1405);
    const event = { starts_at: input.start, ends_at: input.end, schedule };
    assert.equal(eventDetailDateLabel(event), scheduleDateLabel(event), row["تاریخ"]);
  }
  console.log("PASS recurrence, unknown dates, non-date numbers, invalid numeric dates and all 51 recorded sheet labels retain their source meaning");
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
