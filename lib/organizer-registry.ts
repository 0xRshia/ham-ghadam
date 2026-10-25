import { database } from "@/db";
import { ApiError, hash } from "@/lib/server";
import { normalizeInstagramHandle } from "@/lib/instagram";
import { normalizeOrganizerSearch, type EventOrganizerInput } from "@/lib/fast-organizer";

type OrganizerRecord = { id: string; user_id: string | null; name: string; instagram_handle: string | null };

export async function resolveEventOrganizer(data: Record<string, unknown>, input: EventOrganizerInput) {
  const db = database();
  const statements: D1PreparedStatement[] = [];
  const suppliedHandle = data.instagram_handle;
  const handle = suppliedHandle == null || suppliedHandle === "" ? null : normalizeInstagramHandle(suppliedHandle);
  if (suppliedHandle != null && suppliedHandle !== "" && !handle)
    throw new ApiError(400, "آیدی اینستاگرام معتبر وارد کنید؛ مانند @hamghadam یا پیوند پروفایل اینستاگرام.");
  let record: OrganizerRecord | null = null;
  const selectedId = data.organizer_id ?? input.host_id;
  if (selectedId != null && selectedId !== "") {
    if (typeof selectedId !== "string") throw new ApiError(400, "برگزارکنندهٔ معتبر انتخاب کنید.");
    record = await db.prepare("SELECT * FROM organizers WHERE id=?").bind(selectedId).first<OrganizerRecord>();
    if (!record || record.user_id !== input.host_id) throw new ApiError(400, "برگزارکنندهٔ انتخاب‌شده با حساب رویداد مطابقت ندارد.");
    if (handle && record.instagram_handle && record.instagram_handle !== handle)
      throw new ApiError(409, "این پروفایل آیدی دیگری دارد؛ برگزارکنندهٔ درست را انتخاب کنید.");
    if (handle && !record.instagram_handle) {
      const owner = await db.prepare("SELECT id FROM organizers WHERE instagram_handle=?").bind(handle).first<{ id: string }>();
      if (owner && owner.id !== record.id) throw new ApiError(409, "این آیدی قبلاً ثبت شده است؛ همان برگزارکننده را از پیشنهادها انتخاب کنید.");
      // The NOT NULL guard aborts the entire event batch if another writer
      // attaches a different handle after our read. No partial profile save.
      statements.push(db.prepare(`UPDATE organizers SET instagram_handle=?1,
        name=CASE WHEN instagram_handle IS NULL OR instagram_handle=?1 THEN name ELSE NULL END WHERE id=?2`).bind(handle, record.id));
    }
  } else if (input.organizer_name) {
    const name = input.organizer_name;
    if (handle) {
      // A unique, normalized handle is the identity. A duplicate submission
      // returns the existing record, even if the typed display name differs.
      record = await db.prepare("SELECT * FROM organizers WHERE instagram_handle=?").bind(handle).first<OrganizerRecord>();
      if (record?.user_id) throw new ApiError(409, "این آیدی به یک حساب متصل است؛ آن برگزارکننده را از پیشنهادها انتخاب کنید.");
      if (!record) {
        // Concurrent first events derive the same ID and therefore the same
        // foreign key, before either transaction has inserted the profile.
        const id = `instagram:${await hash(handle)}`;
        record = { id, user_id: null, name, instagram_handle: handle };
        statements.push(db.prepare("INSERT INTO organizers(id,name,instagram_handle,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING")
          .bind(id, name, handle, Date.now()));
      }
    } else {
      // Compatibility for legacy clients without Instagram. Never infer an
      // account owner from a matching display name.
      const { results } = await db.prepare("SELECT * FROM organizers WHERE user_id IS NULL AND instagram_handle IS NULL").all<OrganizerRecord>();
      record = results.find(item => normalizeOrganizerSearch(item.name) === normalizeOrganizerSearch(name)) ?? null;
      if (!record) {
        const id = `name:${await hash(normalizeOrganizerSearch(name))}`;
        record = { id, user_id: null, name, instagram_handle: null };
        statements.push(db.prepare("INSERT INTO organizers(id,name,created_at) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING").bind(id, name, Date.now()));
      }
    }
  }
  if (!record) throw new ApiError(400, "برگزارکنندهٔ معتبر انتخاب کنید.");
  return { ...input, organizer_name: input.host_id ? null : record.name, organizer_id: record.id, statements };
}
