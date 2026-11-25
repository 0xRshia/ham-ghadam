import { squirrelRewardCookie, startSquirrelReward } from "@/lib/squirrel-rewards";
import { boundary, json, sameOrigin } from "@/lib/server";

export const POST = (req: Request) => boundary(async () => {
  sameOrigin(req);
  const { token, session } = await startSquirrelReward(req);
  return json(session, 200, { "Set-Cookie": squirrelRewardCookie(req, token) });
});
