import { ApiError, body, boundary, json, phoneNumber, sameOrigin } from "@/lib/server";
import { requireFast } from "@/lib/fast-auth";
import { grantCredits, userByPhone, walletNote, walletOverview } from "@/lib/wallet";
import { walletCopy } from "@/locales/wallet-fa";

async function walletUser(phone: unknown) {
  const user = await userByPhone(phoneNumber(phone));
  if (!user) throw new ApiError(404, walletCopy.errors.userNotFound);
  return user;
}

export const GET = (req: Request) => boundary(async () => {
  await requireFast(req);
  const user = await walletUser(new URL(req.url).searchParams.get("phone") ?? "");
  return json({ user, wallet: await walletOverview(user.id, 50) });
});

export const POST = (req: Request) => boundary(async () => {
  sameOrigin(req);
  await requireFast(req, true);
  const data = await body(req, 2000);
  const user = await walletUser(data.phone);
  const transaction = await grantCredits(user.id, data.amount, walletNote(data.note));
  return json({ user, transaction, wallet: await walletOverview(user.id, 50) }, 201);
});
