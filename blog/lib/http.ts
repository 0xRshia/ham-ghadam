import { BlogError } from "./validation.ts";

export async function readBytes(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit) throw new BlogError(413, "حجم درخواست بیش از حد مجاز است.");
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw new BlogError(413, "حجم درخواست بیش از حد مجاز است."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, length);
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new BlogError(415, "نوع درخواست باید JSON باشد.");
  try {
    const value = JSON.parse((await readBytes(request, 600_000)).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new BlogError(400, "درخواست نامعتبر است.");
    return value;
  } catch (error) {
    if (error instanceof BlogError) throw error;
    throw new BlogError(400, "درخواست JSON نامعتبر است.");
  }
}

export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function boundary(action: () => Promise<Response> | Response) {
  try { return await action(); }
  catch (error) {
    if (error instanceof BlogError) return json({ error: error.message }, error.status);
    console.error("Blog request failed", error instanceof Error ? error.name : "UnknownError");
    return json({ error: "درخواست انجام نشد. لطفاً دوباره تلاش کنید." }, 500);
  }
}
