import { boundary, json, requireUser } from "@/lib/server";
import { walletOverview } from "@/lib/wallet";

export const GET = (req: Request) => boundary(async () => {
  const user = await requireUser(req);
  return json(await walletOverview(user.id));
});
