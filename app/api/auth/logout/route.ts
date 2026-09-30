import { database } from "@/db";
import { boundary, json, hash, sameOrigin, sessionCookie } from "@/lib/server";
export const POST = (req: Request) =>
  boundary(async () => {
    sameOrigin(req);
    const token = req.headers
      .get("cookie")
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("hg_session="))
      ?.slice(11);
    if (token)
      await database()
        .prepare("DELETE FROM sessions WHERE hash=?")
        .bind(await hash(token))
        .run();
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(req, "", 0) });
  });
