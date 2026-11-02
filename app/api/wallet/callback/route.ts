import { config } from "@/db";
import { completeTopUp, findTopUp, type TopUpOutcome } from "@/lib/wallet";

// Zarinpal returns the browser here without our session guarantees; the
// outcome comes from server-side verification, never from the query alone.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const authority = url.searchParams.get("Authority");
  let outcome: TopUpOutcome = "pending";
  try {
    const transaction = authority && authority.length <= 100 ? await findTopUp({ authority }) : null;
    if (transaction) outcome = await completeTopUp(transaction, url.searchParams.get("Status") === "OK");
  } catch {
    outcome = "pending";
  }
  return Response.redirect(`${config().APP_ORIGIN || url.origin}/wallet?payment=${outcome}`, 303);
}
