import { body, boundary, json, requireUser, sameOrigin } from "@/lib/server";
import { startTopUp } from "@/lib/wallet";

export const POST = (req: Request) => boundary(async () => {
  sameOrigin(req);
  const user = await requireUser(req);
  const data = await body(req, 1000);
  return json(await startTopUp(user, data.amount), 201);
});
