import { boundary, body, json, sameOrigin } from "@/lib/server";
import { requireFast } from "@/lib/fast-auth";
import { eventSyncStatus, saveSyncSettings } from "@/lib/event-sync";
import { discardEventRequest } from "@/lib/event-media";

export const GET = (req: Request) => boundary(async () => {
  await requireFast(req);
  return json(await eventSyncStatus());
});
export const PUT = (req: Request) => boundary(async () => {
  try { sameOrigin(req); await requireFast(req, true); }
  catch (error) { await discardEventRequest(req,16000); throw error; }
  return json(await saveSyncSettings(await body(req)));
});
