import { faContent } from "@/locales/domain-fa";
import { getEventProgram, getEventEditions } from "./event-program";
import { getOrganizer } from "./organizers";
import { currentUser, ApiError } from "./server";
import { getTicketTiers } from "./ticket-tiers";
import { config } from "@/db";
import { getEventDetail, seedSamples } from "./events";

/** Request-scoped loader shared by HTML and JSON; following state is private. */
export async function publicEvent(id: string, req: Request) {
  await seedSamples();
  const [event, user] = await Promise.all([getEventDetail(id), currentUser(req)]);
  if (!event || !event.published || (event.sample === 1 && config().SEED_SAMPLE_EVENTS !== "true")) {
    throw new ApiError(404, faContent.eventNotFound);
  }
  const [program, editions, ticketTiers, organizer] = await Promise.all([
    getEventProgram(event.id), getEventEditions(event), getTicketTiers(event.id),
    getOrganizer(event.organizer_id ?? event.host_id, user?.id ?? null),
  ]);
  return { ...event, program, editions, ticketTiers, organizer, serverNow: Date.now() };
}
