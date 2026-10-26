import { boundary, body, sameOrigin, createSession, requireTermsAcceptance } from "@/lib/server";
import { consumePhoneVerification } from "@/lib/phone-verification";
import { temporaryAccount } from "@/lib/temporary-login";
export const POST = (req: Request) => boundary(async () => {
  sameOrigin(req); const data = await body(req);
  const termsVersion = requireTermsAcceptance(data);
  const phone = await consumePhoneVerification(req,data.challengeId,data.code);
  return createSession(req,phone,data.name,termsVersion,temporaryAccount(phone)?.name);
});
