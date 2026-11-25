import { readManshaBuyerCookie, verifyManshaBuyerOrder } from "@/lib/mansha-orders";
import { body, boundary, json, sameOrigin } from "@/lib/server";

export const POST = (req: Request) => boundary(async () => {
  sameOrigin(req);
  const { orderId } = await body(req, 1024);
  return json({ status: await verifyManshaBuyerOrder(orderId, readManshaBuyerCookie(req)) });
});
