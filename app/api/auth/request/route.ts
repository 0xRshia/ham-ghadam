import { faContent } from "@/locales/domain-fa";
import { database, config } from "@/db";
import { temporaryAccount, temporaryOtpCode, temporaryOtpHashPrefix } from "@/lib/temporary-login";
import {
  ApiError,
  boundary,
  body,
  claimOtpSend,
  json,
  OTP_RESEND_COOLDOWN_MS,
  otpHash,
  phoneNumber,
  rateLimit,
  releaseOtpSend,
  sameOrigin,
  smsReady,
  hash,
  createSession,
  requireTermsAcceptance,
} from "@/lib/server";

function providerSendError(value: unknown) {
  const code = typeof value === "string" && /^-?\d{1,3}$/.test(value) ? Number(value) : value;
  return typeof code === "number" && Number.isInteger(code) && code <= 0 && code >= -999 ? code : undefined;
}

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
      return createSession(req, p, data.name, requireTermsAcceptance(data), temporary.name);
    }
    if (!testCode && !smsReady())
      throw new ApiError(
        503,
        faContent.smsUnavailable,
      );
    // The fixed-code account sends no SMS and must remain usable during testing.
    // The phone claim is the server-side resend cooldown; its time anchors the
    // challenge so the client countdown matches what the server enforces.
    let claimedAt: number | undefined;
    if (!testCode) {
      await rateLimit("otp-ip:" + (await hash(ip)), 20);
      claimedAt = await claimOtpSend(p);
    }
    const id = crypto.randomUUID();
    const code = testCode ?? String(
      (crypto.getRandomValues(new Uint32Array(1))[0] % 900000) + 100000,
    );
    const db = database();
    const createdAt = claimedAt ?? Date.now();
    const expiresAt = createdAt + 300000;
    const resendAt = createdAt + (testCode ? 0 : OTP_RESEND_COOLDOWN_MS);
    await db
      .prepare(
        "INSERT INTO challenges(id,phone,hash,expires_at) VALUES(?,?,?,?)",
      )
      .bind(id, p, (testCode ? temporaryOtpHashPrefix : "") + await otpHash(id, p, code), expiresAt)
      .run();
    let providerRejected = false;
    try {
      if (!testCode) {
        const c = config();
        // sameOrigin has already validated this browser origin, including staging.
        const origin = new URL(req.headers.get("origin")!);
        const domain = data.smsFormat !== "plain" && origin.protocol === "https:" && !origin.port ? origin.hostname : undefined;
        async function send(domain?: string) {
          const r = await fetch("https://api.m.idekavan.com/api/message/send", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": c.IDEKAVAN_API_KEY!,
            },
            body: JSON.stringify([
              {
                SourceAddress: c.IDEKAVAN_SENDER!,
                // Idekavan expects international numbers without "+": 09xx → 989xx.
                DestinationAddress: "98" + p.slice(1),
                MessageText: faContent.otpSmsText(code, domain),
                // 8 is Idekavan's coding for Persian text.
                DataCoding: 8,
                // Unique per-message tag recommended by Idekavan for tracing.
                udh: id,
              },
            ]),
            signal: AbortSignal.timeout(12000),
          });
          const envelope = (await r.json().catch(() => ({}))) as {
            succeeded?: boolean;
            resultCode?: number;
            data?: unknown;
          };
          const messageId = Array.isArray(envelope.data) ? envelope.data[0] : undefined;
          return { r, envelope, messageId };
        }
        let { r, envelope, messageId } = await send(domain);
        // Retry explicit link or content rejection with the same code and no domain.
        const formatError = providerSendError(messageId);
        if (domain && r.ok && (formatError === -21 || formatError === -32)) {
          console.warn("OTP SMS domain format rejected by provider; sending plain code");
          ({ r, envelope, messageId } = await send());
        }
        // Accepted messages return a UID; send errors are small codes such as
        // "0" or "-18", so a numeric entry means this message was not queued.
        const accepted =
          r.ok &&
          envelope.succeeded === true &&
          envelope.resultCode === 100 &&
          typeof messageId === "string" &&
          messageId !== "" &&
          !/^-?\d{1,3}$/.test(messageId);
        if (!accepted) {
          const sendError = providerSendError(messageId);
          providerRejected = r.ok && (sendError !== undefined || (envelope.succeeded === false && Number.isInteger(envelope.resultCode)));
          // Provider codes (e.g. -1 no credit, -18 unregistered IP) are the only
          // way operators can diagnose rejections; never log the key.
          console.error("OTP SMS delivery rejected", {
            status: r.status,
            resultCode: envelope.resultCode,
            messageResult: sendError,
          });
          throw Error("SMS delivery rejected");
        }
      }
    } catch {
      await db.prepare("DELETE FROM challenges WHERE id=?").bind(id).run();
      // Release the resend wait. Only explicit rejections refund a send slot.
      if (claimedAt !== undefined) await releaseOtpSend(p, claimedAt, providerRejected);
      throw new ApiError(
        503,
        faContent.smsSendFailed,
      );
    }
    // Keep the previous challenge usable when delivery fails; replace it only
    // after Idekavan accepts the new code.
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
