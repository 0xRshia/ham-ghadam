import { database } from "@/db";
import { ApiError, phoneNumber } from "@/lib/server";
import { digits } from "@/lib/types";
import { persianInput } from "@/lib/persian-date";
import { ORGANIZER_CONTRACT_VERSION } from "@/lib/legal-versions";
import { organizerContractFields, type OrganizerContractValues } from "@/lib/organizer-contract-fields";

export function readOrganizerAgreement(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ApiError(400, "پیش از انتشار، اطلاعات و پذیرش قرارداد برگزارکننده را تکمیل کنید.");
  const data = input as Record<string, unknown>;
  if (data.accepted !== true || data.version !== ORGANIZER_CONTRACT_VERSION) throw new ApiError(400, "متن فعلی قرارداد برگزارکننده را مطالعه و تأیید کنید.");
  if (data.partyType !== "individual" && data.partyType !== "company") throw new ApiError(400, "نوع شخص طرف قرارداد را انتخاب کنید.");
  const fields: OrganizerContractValues = { partyType: data.partyType };
  for (const field of organizerContractFields) {
    if ("party" in field && field.party !== data.partyType) continue;
    const value = typeof data[field.key] === "string" ? (data[field.key] as string).trim() : "";
    if (value.length > field.max || /[\u0000-\u001f\u007f]/.test(value) || (field.required && (!value || /^[.\s\[\]…-]+$/.test(value)))) throw new ApiError(400, `اطلاعات «${field.label}» را کامل و معتبر وارد کنید.`);
    fields[field.key] = value;
  }
  fields.nationalId = digits(fields.nationalId!);
  if (!(data.partyType === "company" ? /^\d{11}$/ : /^\d{10}$/).test(fields.nationalId) || /^(\d)\1+$/.test(fields.nationalId)) throw new ApiError(400, "کد ملی یا شناسه ملی معتبر وارد کنید.");
  if (data.partyType === "individual") {
    const sum = [...fields.nationalId.slice(0, 9)].reduce((total, digit, index) => total + Number(digit) * (10 - index), 0) % 11;
    if (Number(fields.nationalId[9]) !== (sum < 2 ? sum : 11 - sum)) throw new ApiError(400, "کد ملی معتبر وارد کنید.");
  }
  fields.postalCode = digits(fields.postalCode!);
  if (!/^\d{10}$/.test(fields.postalCode) || /^(\d)\1+$/.test(fields.postalCode)) throw new ApiError(400, "کد پستی ده‌رقمی معتبر وارد کنید.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email!)) throw new ApiError(400, "پست الکترونیکی معتبر وارد کنید.");
  fields.phone = phoneNumber(fields.phone);
  if (data.partyType === "individual") {
    fields.birthDate = digits(fields.birthDate!).replaceAll("-", "/");
    const parts = fields.birthDate.match(/^(1[234]\d{2})\/(\d{1,2})\/(\d{1,2})$/);
    let birth = NaN;
    if (parts) {
      const [, y, m, d] = parts.map(Number);
      const expected = `${y}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
      const estimate = Date.UTC(y + 621, 2, 20) + ((m - 1) * 31 - Math.max(0, m - 7) + d - 1) * 86400000;
      for (let offset = -3; offset <= 3; offset++) {
        const candidate = estimate + offset * 86400000;
        if (persianInput(candidate) === expected) birth = candidate;
      }
    }
    if (!Number.isFinite(birth) || birth >= Date.now()) throw new ApiError(400, "تاریخ تولد شمسی معتبر وارد کنید.");
  }
  if (fields.iban || fields.bank || fields.accountHolder) {
    fields.iban = digits(fields.iban || "").replace(/\s/g, "").toUpperCase();
    if (!fields.bank || !fields.accountHolder || !/^IR\d{24}$/.test(fields.iban)) throw new ApiError(400, "نام صاحب حساب، نام بانک و شبای معتبر را با هم وارد کنید.");
    const rearranged = fields.iban.slice(4) + "1827" + fields.iban.slice(2, 4);
    let remainder = 0;
    for (const character of rearranged) remainder = (remainder * 10 + Number(character)) % 97;
    if (remainder !== 1) throw new ApiError(400, "شماره شبا معتبر نیست.");
  }
  return fields;
}
export type ContractEvent = { id: string; host_id: string | null; title: string; starts_at: number | null; ends_at: number | null; venue: string; address: string; city: string; capacity: number | null; price: number; schedule_json?: string | null; maps_url?: string | null };
export function eventContractSnapshot(event: ContractEvent) {
  return JSON.stringify({ id: event.id, schedule_json: event.schedule_json ?? null, maps_url: event.maps_url ?? null, title: event.title, starts_at: event.starts_at, ends_at: event.ends_at, venue: event.venue, address: event.address, city: event.city, capacity: event.capacity, price: event.price });
}
export function organizerAgreementStatement(event: ContractEvent, userId: string, fields: OrganizerContractValues, revision = 1) {
  return database().prepare("INSERT INTO organizer_contract_acceptances(id,event_id,user_id,version,accepted_at,fields_json,event_snapshot_json) SELECT ?,id,?,?,?,?,? FROM events WHERE id=? AND host_id=? AND revision=? RETURNING id")
    .bind(crypto.randomUUID(), userId, ORGANIZER_CONTRACT_VERSION, Date.now(), JSON.stringify(fields), eventContractSnapshot(event), event.id, userId, revision);
}
export async function requireOrganizerAgreement(event: ContractEvent, userId: string) {
  const accepted = await database().prepare("SELECT id FROM organizer_contract_acceptances WHERE event_id=? AND user_id=? AND version=? AND event_snapshot_json=? LIMIT 1")
    .bind(event.id, userId, ORGANIZER_CONTRACT_VERSION, eventContractSnapshot(event)).first();
  if (!accepted) throw new ApiError(400, "پیش از انتشار، قرارداد و اطلاعات برگزارکننده را در بخش قرارداد رویداد تکمیل کنید.");
}
