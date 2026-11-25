import { body, boundary, json, sameOrigin } from "@/lib/server";
import { manshaBuyerCookie, startManshaOrder } from "@/lib/mansha-orders";

export const POST = (req: Request) => boundary(async () => {
  sameOrigin(req);
  const { paymentUrl, token } = await startManshaOrder(req, await body(req, 4096));
  return json({ paymentUrl }, 200, { "Set-Cookie": manshaBuyerCookie(req, token) });
});
