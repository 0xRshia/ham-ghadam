import { createHash, timingSafeEqual } from "node:crypto";
import { config } from "@/db";
import { boundary, json } from "@/lib/server";
import { processEventSync } from "@/lib/event-sync";
import { discardEventRequest } from "@/lib/event-media";

export const POST = (req: Request) => boundary(async () => {
  // This control endpoint has no input. Drain unexpected bodies before returning,
  // including auth failures, so the HTTP adapter can reuse the connection safely.
  await discardEventRequest(req, 16000);
  const secret = config().EVENT_SYNC_JOB_SECRET;
  const supplied = req.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32 || !timingSafeEqual(createHash("sha256").update(supplied).digest(),createHash("sha256").update(`Bearer ${secret}`).digest())) return json({ error: "Unauthorized" }, 401);
  return json(await processEventSync());
});
