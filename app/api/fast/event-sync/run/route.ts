import { boundary, json, sameOrigin } from "@/lib/server";
import { requireFast } from "@/lib/fast-auth";
import { queueEventSync } from "@/lib/event-sync";
import { discardEventRequest } from "@/lib/event-media";

export const POST = (req: Request) => boundary(async () => {
  await discardEventRequest(req, 16000);
  sameOrigin(req); await requireFast(req, true);
  return json(await queueEventSync(), 202);
});
