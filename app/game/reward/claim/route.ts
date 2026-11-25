import { squirrelPlayPreflight, squirrelPlayResponse } from "@/lib/squirrel-play-request";
import { claimSquirrelReward } from "@/lib/squirrel-rewards";
import { body, json } from "@/lib/server";

export const OPTIONS = squirrelPlayPreflight;
export const POST = (req: Request) => squirrelPlayResponse(req, async () => {
  return json(await claimSquirrelReward(req, await body(req, 4096)));
});
