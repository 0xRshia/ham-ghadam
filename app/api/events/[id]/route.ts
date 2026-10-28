import { boundary, json } from "@/lib/server";
import { publicEvent } from "@/lib/public-event";
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  boundary(async () => json({ event: await publicEvent((await params).id, req) }));
