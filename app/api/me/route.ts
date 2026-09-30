import { faContent } from "@/locales/domain-fa";
import { database } from "@/db";
import {
  ApiError,
  boundary,
  body,
  currentUser,
  json,
  paymentReady,
  requireUser,
  sameOrigin,
  skipPayDevEnabled,
  smsReady,
} from "@/lib/server";
import { temporaryLoginEnabled } from "@/lib/temporary-login";
export const GET = (req: Request) =>
  boundary(async () =>
    json({
      user: await currentUser(req),
      smsReady: smsReady(),
      // TODO(PRODUCTION): REMOVE_TEMP_LOGIN
      temporaryLoginEnabled: temporaryLoginEnabled(),
      paymentReady: paymentReady(),
      skipPayDevEnabled: skipPayDevEnabled(),
    }),
  );

export const PATCH = (req: Request) =>
  boundary(async () => {
    sameOrigin(req);
    const user = await requireUser(req);
    const data = await body(req);
    if (typeof data.name !== "string")
      throw new ApiError(400, faContent.nameRequired);
    const name = data.name.trim();
    if (name.length < 2 || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name))
      throw new ApiError(400, faContent.nameLength);
    await database()
      .prepare("UPDATE users SET name=? WHERE id=?")
      .bind(name, user.id)
      .run();
    return json({ user: { ...user, name } });
  });
