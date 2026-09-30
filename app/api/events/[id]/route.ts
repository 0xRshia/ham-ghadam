import { faContent } from "@/locales/domain-fa";
import { getEventProgram, getEventEditions } from "@/lib/event-program";
import { getOrganizer } from "@/lib/organizers";
import { currentUser } from "@/lib/server";
import { getTicketTiers } from "@/lib/ticket-tiers";
import { config } from "@/db";
import { getEventDetail, seedSamples } from "@/lib/events";
import { boundary, json, ApiError } from "@/lib/server";
export const GET = (
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) =>
  boundary(async () => {
    await seedSamples();
    const e = await getEventDetail((await params).id);
    if (
      !e ||
      !e.published ||
      (e.sample === 1 && config().SEED_SAMPLE_EVENTS !== "true")
    )
      throw new ApiError(404, faContent.eventNotFound);
    return json({ event: { ...e, program: await getEventProgram(e.id), editions: await getEventEditions(e), ticketTiers: await getTicketTiers(e.id), organizer: await getOrganizer(e.host_id,(await currentUser(req))?.id ?? null), serverNow: Date.now() } });
  });
