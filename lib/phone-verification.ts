import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import { digits } from "@/lib/types";
import { ApiError, hash, otpHash, rateLimit } from "@/lib/server";
import { temporaryOtpCode, temporaryOtpHashPrefix } from "@/lib/temporary-login";
export async function consumePhoneVerification(req: Request, challengeId: unknown, suppliedCode: unknown) {
  const code = digits(String(suppliedCode ?? ""));
  if (typeof challengeId !== "string" || !/^\d{6}$/.test(code)) throw new ApiError(400,faContent.enterSixDigits);
  await rateLimit("verify-ip:" + await hash(req.headers.get("cf-connecting-ip") ?? "local"),100);
  const db = database();
  const challenge = await db.prepare("UPDATE challenges SET attempts=attempts+1 WHERE id=? AND consumed=0 AND expires_at>? AND attempts<5 RETURNING phone,hash").bind(challengeId,Date.now()).first<{ phone: string; hash: string }>();
  if (!challenge) throw new ApiError(400,faContent.codeAttemptsExceeded);
  const isTestChallenge = challenge.hash.startsWith(temporaryOtpHashPrefix);
  if (isTestChallenge && !temporaryOtpCode(challenge.phone)) throw new ApiError(400,faContent.codeIncorrect);
  const expectedHash = (isTestChallenge ? temporaryOtpHashPrefix : "") + await otpHash(challengeId,challenge.phone,code);
  const consumed = await db.prepare("UPDATE challenges SET consumed=1 WHERE id=? AND hash=? AND consumed=0 AND expires_at>? RETURNING phone").bind(challengeId,expectedHash,Date.now()).first<{ phone: string }>();
  if (!consumed) throw new ApiError(400,faContent.codeIncorrect);
  await db.prepare("UPDATE challenges SET consumed=1 WHERE phone=? AND id<>? AND consumed=0").bind(consumed.phone,challengeId).run();
  return consumed.phone;
}
