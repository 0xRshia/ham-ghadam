import { ApiError, boundary, json, requireUser, sameOrigin } from "@/lib/server";
import { completeTopUp, findTopUp } from "@/lib/wallet";
import { walletCopy } from "@/locales/wallet-fa";

// Lets the user re-check a top-up whose gateway return was interrupted.
// Zarinpal's verify response, not the client, decides whether it was paid.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => boundary(async () => {
  sameOrigin(req);
  const user = await requireUser(req);
  const { id } = await params;
  const transaction = id.length <= 64 ? await findTopUp({ id, userId: user.id }) : null;
  if (!transaction) throw new ApiError(404, walletCopy.errors.transactionNotFound);
  if (transaction.status === "pending" && !transaction.authority) throw new ApiError(409, walletCopy.errors.nothingToVerify);
  return json({ outcome: await completeTopUp(transaction, true) });
});
