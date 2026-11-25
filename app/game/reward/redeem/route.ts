import { redeemSquirrelReward } from "@/lib/squirrel-rewards";
import { body, boundary, json, sameOrigin } from "@/lib/server";

export const POST = (req: Request) => boundary(async () => {
  sameOrigin(req);
  return json(await redeemSquirrelReward(req, (await body(req, 512)).token));
});
