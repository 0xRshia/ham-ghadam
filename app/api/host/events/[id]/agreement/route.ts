import { decodeEvent } from "@/lib/event-schedule";
import type { EventItem } from "@/lib/types";
import { database } from "@/db";
import { requireHostEvent } from "@/lib/host-attendees";
import { boundary, json, sameOrigin, body, requireUser, rateLimit, ApiError } from "@/lib/server";
import { eventContractSnapshot, organizerAgreementStatement, readOrganizerAgreement } from "@/lib/organizer-contract";
import { ORGANIZER_CONTRACT_VERSION } from "@/lib/legal-versions";
import type { OrganizerContractValues } from "@/lib/organizer-contract-fields";
type Context = { params: Promise<{ id: string }> };
export const GET = (req: Request, context: Context) => boundary(async () => {
  const event = await requireHostEvent(req, (await context.params).id);
  const previous = await database().prepare("SELECT fields_json,accepted_at,version FROM organizer_contract_acceptances WHERE event_id=? AND user_id=? ORDER BY accepted_at DESC LIMIT 1")
    .bind(event.id, event.host_id).first<{fields_json:string;accepted_at:number;version:string}>();
  return json({ event: decodeEvent(event), previous: previous ? { fields: JSON.parse(previous.fields_json) as OrganizerContractValues, acceptedAt:previous.accepted_at, version:previous.version } : null, version:ORGANIZER_CONTRACT_VERSION });
});
export const POST = (req: Request, context: Context) => boundary(async () => {
  sameOrigin(req);
  const host = await requireUser(req, true);
  await rateLimit("host-contract:" + host.id, 50);
  const event = await requireHostEvent(req, (await context.params).id);
  const data = await body(req);
  if (!Number.isInteger(data.revision)) throw new ApiError(400, "نسخه رویداد لازم است. صفحه را تازه کنید.");
  if (data.revision !== (event as EventItem & {revision:number}).revision) throw new ApiError(409, "اطلاعات رویداد تغییر کرده است. صفحه را تازه و قرارداد را دوباره بررسی کنید.");
  const fields = readOrganizerAgreement(data.organizerAgreement);
  const results = await database().batch([
    organizerAgreementStatement(event, host.id, fields, data.revision),
    database().prepare("UPDATE events SET published=1 WHERE id=? AND host_id=? AND revision=? AND EXISTS(SELECT 1 FROM organizer_contract_acceptances WHERE event_id=events.id AND user_id=? AND version=? AND event_snapshot_json=?) RETURNING id")
      .bind(event.id,host.id,data.revision,host.id,ORGANIZER_CONTRACT_VERSION,eventContractSnapshot(event)),
  ]);
  if (!results[0].results?.length || !results[1].results?.length) throw new ApiError(409, "اطلاعات رویداد تغییر کرده است. صفحه را تازه و قرارداد را دوباره بررسی کنید.");
  return json({ ok:true });
});
