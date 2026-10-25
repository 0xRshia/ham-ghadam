import { boundary, body, json, sameOrigin } from "@/lib/server";
import { fastSession, fastCookie, loginFast, logoutFast } from "@/lib/fast-auth";
import { discardEventRequest } from "@/lib/event-media";

export const GET = (req: Request) => boundary(async () => json({ authenticated: !!await fastSession(req.headers.get("cookie")) }));
export const POST = (req: Request) => boundary(async () => {
  try {
    sameOrigin(req);
    const token = await loginFast(req, await body(req, 4000));
    return json({ authenticated: true }, 200, { "Set-Cookie": fastCookie(req, token) });
  } finally {
    // Also dispose rejected Origin/oversize bodies before replying to Workerd.
    await discardEventRequest(req, 4000);
  }
});
export const DELETE = (req: Request) => boundary(async () => {
  try {
    sameOrigin(req);
    await logoutFast(req);
    return json({ authenticated: false }, 200, { "Set-Cookie": fastCookie(req, "", 0) });
  } finally {
    await discardEventRequest(req, 4000);
  }
});
