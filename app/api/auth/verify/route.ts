import { faContent } from "@/locales/domain-fa";
import { ApiError, boundary, body, sameOrigin, createSession, requireTermsAcceptance } from "@/lib/server";
import { consumePhoneVerification } from "@/lib/phone-verification";
import { temporaryAccount } from "@/lib/temporary-login";
export const POST = (req: Request) => boundary(async () => {
  sameOrigin(req); const data = await body(req);
  const termsVersion = requireTermsAcceptance(data);
  // Signup sends the account name here now that phone verification is the only sign-in path.
  if (typeof data.name === "string" && data.name.trim() !== "" && (data.name.trim().length < 2 || data.name.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(data.name))) throw new ApiError(400,faContent.invalidName);
  const phone = await consumePhoneVerification(req,data.challengeId,data.code);
  return createSession(req,phone,data.name,termsVersion,temporaryAccount(phone)?.name);
});
