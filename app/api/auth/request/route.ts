import { faContent } from "@/locales/domain-fa";
import { database, config } from "@/db";
import { temporaryAccount, temporaryOtpCode, temporaryOtpHashPrefix } from "@/lib/temporary-login";
import {
  ApiError,
  boundary,
  body,
  json,
  otpHash,
  phoneNumber,
  rateLimit,
  sameOrigin,
  smsReady,
  hash,
  createSession,
} from "@/lib/server";
export const POST = (req: Request) =>
  boundary(async () => {
    sameOrigin(req);
    const data = await body(req);
    const p = phoneNumber(data.phone);
    const ip = req.headers.get("cf-connecting-ip") ?? "local";
    // TODO(PRODUCTION): REMOVE_TEMP_LOGIN — only explicitly enabled demo accounts skip SMS.
    const temporary = temporaryAccount(p);
    const testCode = temporaryOtpCode(p);
    if (temporary && !testCode) {
      await rateLimit("temp-login-ip:" + (await hash(ip)), 20);
      await rateLimit("temp-login-phone:" + p, 20);
      return createSession(req, p, data.name, temporary.name);
    }
    if (!testCode && !smsReady())
      throw new ApiError(
        503,
        faContent.smsUnavailable,
      );
    await rateLimit("otp-ip:" + (await hash(ip)), 20);
    await rateLimit("otp-phone:" + p, 5, 60000);
    const id = crypto.randomUUID();
    const code = testCode ?? String(
      (crypto.getRandomValues(new Uint32Array(1))[0] % 900000) + 100000,
    );
    const db = database();
    const createdAt = Date.now();
    const expiresAt = createdAt + 300000;
    const resendAt = createdAt + 60000;
    await db
      .prepare(
        "INSERT INTO challenges(id,phone,hash,expires_at) VALUES(?,?,?,?)",
      )
      .bind(id, p, (testCode ? temporaryOtpHashPrefix : "") + await otpHash(id, p, code), expiresAt)
      .run();
    try {
      if (!testCode) {
        const c = config();
        const r = await fetch(
          `https://api.kavenegar.com/v1/${encodeURIComponent(c.KAVENEGAR_API_KEY!)}/verify/lookup.json`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            },
            body: new URLSearchParams({
              receptor: p,
              token: code,
              template: c.KAVENEGAR_TEMPLATE!,
              type: "sms",
            }),
            signal: AbortSignal.timeout(12000),
          },
        );
        const data = (await r.json()) as { return?: { status: number } };
        if (!r.ok || data.return?.status !== 200)
          throw Error("SMS delivery rejected");
      }
    } catch {
      await db.prepare("DELETE FROM challenges WHERE id=?").bind(id).run();
      throw new ApiError(
        503,
        faContent.smsSendFailed,
      );
    }
    // Keep the previous challenge usable when delivery fails; replace it only
    // after Kavenegar confirms delivery of the new code.
    await db
      .prepare("UPDATE challenges SET consumed=1 WHERE phone=? AND id<>? AND consumed=0")
      .bind(p, id)
      .run();
    return json({
      challengeId: id,
      resendAfter: Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)),
      expiresIn: Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)),
      serverNow: Date.now(),
      expiresAt,
      resendAt,
    });
  });
