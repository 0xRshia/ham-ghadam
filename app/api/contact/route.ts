import { faContent, faMessages } from "@/locales/domain-fa";
import { database } from "@/db";
import { ApiError, body, boundary, currentUser, json, rateLimit, sameOrigin, hash } from "@/lib/server";

const clean = (value: unknown, label: string, max: number, required = true) => {
  if (typeof value !== "string") {
    if (!required && (value === undefined || value === null)) return "";
    throw new ApiError(400, faMessages.requiredField(String(label)));
  }
  const result = value.trim();
  if (required && !result) throw new ApiError(400, faMessages.requiredField(String(label)));
  if (result.length > max) throw new ApiError(400, faMessages.fieldTooLong(String(label)));
  return result;
};

export const POST = (req: Request) => boundary(async () => {
  sameOrigin(req);
  const ip = req.headers.get("cf-connecting-ip") ?? "local";
  await rateLimit(`contact:${await hash(ip)}`, 5);
  const data = await body(req, 16000);
  const name = clean(data.name, faContent.name, 80);
  const email = clean(data.email, "", 254, false).toLowerCase();
  const phone = clean(data.phone, "", 32, false);
  const subject = clean(data.subject, faContent.subject, 120);
  const message = clean(data.message, faContent.message, 4000);
  if (!email && !phone) throw new ApiError(400, faContent.contactMethodRequired);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, faContent.invalidEmail);
  if (phone && !/^[+0-9۰-۹٠-٩()\s-]{7,32}$/.test(phone)) throw new ApiError(400, faContent.invalidPhone);
  const now = Date.now();
  const user = await currentUser(req);
  await database().prepare(
    "INSERT INTO contact_messages(id,user_id,name,email,phone,subject,message,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'new',?,?)",
  ).bind(crypto.randomUUID(), user?.id ?? null, name, email || null, phone || null, subject, message, now, now).run();
  return json({ received: true }, 201);
});
