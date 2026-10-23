import { boundary, json } from "@/lib/server";
import { requireFast } from "@/lib/fast-auth";
import { fastOrganizers } from "@/lib/fast-events";
export const GET = (req: Request) => boundary(async () => {
  await requireFast(req);
  return json({ organizers: await fastOrganizers() });
});
