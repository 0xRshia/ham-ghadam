import { boundary, body, sameOrigin, createSession } from "@/lib/server";
import { consumePhoneVerification } from "@/lib/phone-verification";
export const POST = (req: Request) => boundary(async () => {
  sameOrigin(req); const data = await body(req);
  const phone = await consumePhoneVerification(req,data.challengeId,data.code);
  return createSession(req,phone,data.name);
});
