import { squirrelPlayPreflight, squirrelPlayResponse } from "@/lib/squirrel-play-request";
import { squirrelRewardCookie, startSquirrelReward } from "@/lib/squirrel-rewards";
import { json } from "@/lib/server";

export const OPTIONS = squirrelPlayPreflight;
export const POST = (req: Request) => squirrelPlayResponse(req, async () => {
  const { token, session } = await startSquirrelReward(req);
  return json(session, 200, { "Set-Cookie": squirrelRewardCookie(req, token) });
});
