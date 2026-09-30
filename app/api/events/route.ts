import { database, config } from "@/db";
import { boundary, currentUser, json } from "@/lib/server";
import { seedSamples, eventSelect } from "@/lib/events";
import {
  rankSuggestions,
  type ConfirmedEventHistory,
  type EventTicketSales,
} from "@/lib/recommendations";
import type { EventItem } from "@/lib/types";

export const GET = (req: Request) =>
  boundary(async () => {
    await seedSamples();
    const user = await currentUser(req);
    const db = database();
    const now = Date.now();
    const includeSamples = config().SEED_SAMPLE_EVENTS !== "true" ? 0 : 1;
    const [catalog, sales, history] = await Promise.all([
      db
        .prepare(
          eventSelect +
            " WHERE e.published=1 AND e.starts_at>?1 AND (?2=1 OR e.sample=0) ORDER BY e.starts_at,e.id",
        )
        .bind(now, includeSamples)
        .all<EventItem>(),
      db
        .prepare(
          "SELECT r.event_id,SUM(r.quantity) tickets FROM reservations r JOIN events e ON e.id=r.event_id WHERE r.status='confirmed' AND r.total>0 AND r.payment_state<>'skipped_dev' AND e.published=1 AND e.starts_at>?1 AND (?2=1 OR e.sample=0) GROUP BY r.event_id",
        )
        .bind(now, includeSamples)
        .all<EventTicketSales>(),
      user
        ? db
            .prepare(
              "SELECT r.event_id,e.category,MAX(r.created_at) last_booked_at FROM reservations r JOIN events e ON e.id=r.event_id WHERE r.user_id=? AND r.status='confirmed' GROUP BY r.event_id,e.category",
            )
            .bind(user.id)
            .all<ConfirmedEventHistory>()
        : null,
    ]);
    return json(
      {
        events: catalog.results,
        serverNow: now,
        suggestions: rankSuggestions(
          catalog.results,
          history?.results ?? [],
          sales.results,
          now,
        ),
      },
      200,
      { "Cache-Control": "private, no-store", Vary: "Cookie" },
    );
  });
