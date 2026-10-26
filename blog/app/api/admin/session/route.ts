import { cookies } from "next/headers";
import { assertOrigin, login, logout, trustedIP, COOKIE, SESSION_AGE } from "@/lib/auth";
import { origin } from "@/lib/config";
import { boundary, readJson, json } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return boundary(async () => {
    assertOrigin(request);
    const data = await readJson(request);
    const token = await login(data.username, data.password, trustedIP(request));
    (await cookies()).set(COOKIE, token, { httpOnly: true, secure: origin().startsWith("https:"), sameSite: "strict", path: "/", maxAge: SESSION_AGE });
    return json({ ok: true });
  });
}
export async function DELETE(request: Request) {
  return boundary(async () => {
    assertOrigin(request);
    const jar = await cookies();
    logout(jar.get(COOKIE)?.value || "");
    jar.set(COOKIE, "", { httpOnly: true, secure: origin().startsWith("https:"), sameSite: "strict", path: "/", maxAge: 0 });
    return json({ ok: true });
  });
}
