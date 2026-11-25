import { config, database } from "@/db";
import { ApiError, hash, phoneNumber, randomToken, rateLimit } from "@/lib/server";
import { zarinpalRequest } from "@/lib/payments";
import { MIN_PAID_TOMAN, MAX_ORDER_TOMAN } from "@/lib/payment-limits";
import { fa } from "@/lib/types";
import { MANSHA_MAX_QUANTITY, MANSHA_MENU } from "./mansha-menu";
import { isManshaOrderId, manshaMenuPath, manshaSellerOrderPrefix } from "./mansha-navigation";

export const MANSHA_BUYER_COOKIE = "hg_mansha_receipt";
const buyerTokenPattern = /^[a-f0-9]{64}$/;
const authorityPattern = /^[a-zA-Z0-9_-]{8,100}$/;
const orderUnavailable = "پرداخت آنلاین عمارت منشأ فعلاً فعال نیست.";
const orderMissing = "سفارش پیدا نشد.";
const paymentPending = "پاسخ درگاه هنوز آماده نیست. دوباره تلاش کنید.";
const gatewayError = "درگاه پرداخت در دسترس نیست. دوباره تلاش کنید.";

type StoredOrder = {
  id: string;
  sequence: number;
  seller_id: string;
  buyer_name: string;
  buyer_phone: string;
  buyer_session_hash: string;
  item_id: string;
  item_name: string;
  quantity: number;
  amount_toman: number;
  status: "requesting" | "pending" | "paid" | "failed";
  authority: string | null;
  reference: string | null;
  created_at: number;
  paid_at: number | null;
};

export function getManshaMenu() {
  return { items: MANSHA_MENU, pricesConfirmed: true };
}

function merchantConfiguration() {
  const env = config();
  const merchantId = env.MANSHA_ZARINPAL_MERCHANT_ID?.trim();
  if (!merchantId || !env.APP_ORIGIN) return null;
  try {
    const origin = new URL(env.APP_ORIGIN);
    if (origin.protocol === "https:" && !origin.username && !origin.password && origin.href === origin.origin + "/") {
      return { merchantId, origin: origin.origin };
    }
  } catch { /* A malformed deployment origin keeps checkout unavailable. */ }
  return null;
}

async function configuredSeller() {
  let phone: string;
  try { phone = phoneNumber(config().MANSHA_SELLER_PHONE); } catch { return null; }
  return database().prepare("SELECT id FROM users WHERE phone=?").bind(phone).first<{ id: string }>();
}

export async function manshaCheckoutAvailable() {
  return Boolean(merchantConfiguration() && MANSHA_MENU.length && await configuredSeller());
}

export function readManshaBuyerCookie(req: Request) {
  const cookie = req.headers.get("cookie")?.split(";").map(item => item.trim())
    .find(item => item.startsWith(`${MANSHA_BUYER_COOKIE}=`))?.slice(MANSHA_BUYER_COOKIE.length + 1);
  return cookie && buyerTokenPattern.test(cookie) ? cookie : undefined;
}

export function manshaBuyerCookie(req: Request, token: string) {
  const secure = new URL(req.url).protocol === "https:" || merchantConfiguration() !== null;
  return `${MANSHA_BUYER_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000${secure ? "; Secure" : ""}`;
}

function orderNumber(order: StoredOrder) {
  return `MSH-${String(order.sequence).padStart(5, "0")}`;
}

function receipt(order: StoredOrder) {
  return {
    orderNumber: orderNumber(order), itemName: order.item_name, quantity: order.quantity, amountToman: order.amount_toman,
    status: order.status === "requesting" ? "pending" as const : order.status,
    paymentReference: order.reference, createdAt: order.created_at, paidAt: order.paid_at,
  };
}

async function buyerOrder(id: string, token: string | undefined) {
  if (!isManshaOrderId(id) || !token || !buyerTokenPattern.test(token)) return null;
  return database().prepare("SELECT * FROM mansha_orders WHERE id=? AND buyer_session_hash=?")
    .bind(id, await hash(token)).first<StoredOrder>();
}

export async function getManshaReceipt(id: string, token: string | undefined) {
  const order = await buyerOrder(id, token);
  return order ? receipt(order) : null;
}

export async function getManshaSellerReceipt(id: string, sellerId: string) {
  if (!isManshaOrderId(id)) return null;
  const order = await database().prepare("SELECT * FROM mansha_orders WHERE id=? AND seller_id=? AND status='paid'").bind(id, sellerId).first<StoredOrder>();
  return order ? { ...receipt(order), status: "paid" as const, buyerName: order.buyer_name, buyerPhone: order.buyer_phone } : null;
}

function paymentUrl(authority: string) {
  return `https://payment.zarinpal.com/pg/StartPay/${encodeURIComponent(authority)}`;
}

export function manshaReceiptPath(id?: string, outcome?: "success" | "cancelled" | "pending") {
  const path = `${manshaMenuPath}/receipt`;
  return id ? `${path}?order=${encodeURIComponent(id)}${outcome ? `&payment=${outcome}` : ""}` : path;
}

export async function startManshaOrder(req: Request, input: Record<string, unknown>) {
  const merchant = merchantConfiguration();
  const seller = merchant ? await configuredSeller() : null;
  if (!merchant || !seller) throw new ApiError(503, orderUnavailable);
  const item = MANSHA_MENU.find(item => item.id === input.itemId);
  const { quantity, requestKey } = input;
  if (!item || typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > MANSHA_MAX_QUANTITY ||
    typeof requestKey !== "string" || !isManshaOrderId(requestKey)) throw new ApiError(400, "آیتم یا تعداد سفارش معتبر نیست.");

  const buyerName = typeof input.name === "string" ? input.name.trim() : "";
  if (buyerName.length < 2 || buyerName.length > 80 || /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(buyerName)) {
    throw new ApiError(400, "نام کامل را وارد کنید.");
  }
  const buyerPhone = phoneNumber(input.phone);
  const amountToman = item.priceToman * quantity;
  if (amountToman < MIN_PAID_TOMAN || amountToman > MAX_ORDER_TOMAN) throw new ApiError(400, "مبلغ سفارش معتبر نیست.");
  const token = readManshaBuyerCookie(req) ?? randomToken();
  const sessionHash = await hash(token);
  await rateLimit(`mansha-order-ip:${req.headers.get("cf-connecting-ip") ?? "local"}`, 45);
  await rateLimit(`mansha-order-phone:${await hash(buyerPhone)}`, 12);

  const db = database();
  let order = await db.prepare(`INSERT INTO mansha_orders(id,seller_id,buyer_session_hash,request_key,buyer_name,buyer_phone,item_id,item_name,quantity,amount_toman,status,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,'requesting',?) ON CONFLICT(buyer_session_hash,request_key) DO NOTHING RETURNING *`)
    .bind(crypto.randomUUID(), seller.id, sessionHash, requestKey, buyerName, buyerPhone, item.id, item.name, quantity, amountToman, Date.now()).first<StoredOrder>();
  if (!order) {
    const existing = await db.prepare("SELECT * FROM mansha_orders WHERE buyer_session_hash=? AND request_key=?")
      .bind(sessionHash, requestKey).first<StoredOrder>();
    if (!existing) throw new ApiError(409, paymentPending);
    if (existing.item_id !== item.id || existing.quantity !== quantity || existing.buyer_name !== buyerName || existing.buyer_phone !== buyerPhone) {
      throw new ApiError(409, "جزئیات سفارش تغییر کرده است. سفارش تازه‌ای ثبت کنید.");
    }
    if (existing.status === "paid") return { paymentUrl: merchant.origin + manshaReceiptPath(existing.id, "success"), token };
    if (existing.status === "pending" && existing.authority) return { paymentUrl: paymentUrl(existing.authority), token };
    order = await db.prepare("UPDATE mansha_orders SET status='requesting' WHERE id=? AND status='failed' AND authority IS NULL RETURNING *")
      .bind(existing.id).first<StoredOrder>();
    if (!order) throw new ApiError(409, paymentPending);
  }

  try {
    const response = await zarinpalRequest("request", {
      amount: order.amount_toman * 10,
      currency: "IRR",
      description: `سفارش عمارت منشأ ${orderNumber(order)}`,
      callback_url: `${merchant.origin}/api/menu/mansha/orders/callback`,
      metadata: { mobile: buyerPhone, order_id: order.id, auto_verify: false },
    }, merchant.merchantId);
    const authority = response.data?.authority;
    if (response.data?.code !== 100 || !authority || !authorityPattern.test(authority)) throw new Error("Invalid gateway authority");
    await db.prepare("UPDATE mansha_orders SET authority=?,status='pending' WHERE id=? AND status='requesting'").bind(authority, order.id).run();
    return { paymentUrl: paymentUrl(authority), token };
  } catch {
    await db.prepare("UPDATE mansha_orders SET status='failed' WHERE id=? AND status='requesting'").bind(order.id).run();
    throw new ApiError(502, gatewayError, {}, { "Set-Cookie": manshaBuyerCookie(req, token) });
  }
}

async function verifyManshaOrder(order: StoredOrder): Promise<"paid" | "pending" | "failed"> {
  if (order.status === "paid" || order.status === "failed") return order.status;
  const merchant = merchantConfiguration();
  if (!merchant || !order.authority) return "pending";
  const db = database();
  let response;
  try {
    await rateLimit(`mansha-verify:${order.id}`, 30, 3000);
    response = await zarinpalRequest("verify", { amount: order.amount_toman * 10, authority: order.authority }, merchant.merchantId);
  } catch { return "pending"; }
  if (response.data?.code !== 100 && response.data?.code !== 101) return "pending";

  const reference = String(response.data.ref_id ?? "").slice(0, 100) || null;
  const key = `mansha_order:${order.id}`;
  await db.batch([
    db.prepare("UPDATE mansha_orders SET status='paid',reference=?,paid_at=? WHERE id=? AND status='pending'").bind(reference, Date.now(), order.id),
    db.prepare(`INSERT INTO notifications(id,user_id,kind,title,message,href,deduplication_key,created_at)
      SELECT ?,seller_id,'mansha_order',?,?,?,?,paid_at FROM mansha_orders WHERE id=? AND status='paid'
      ON CONFLICT(user_id,deduplication_key) DO NOTHING`)
      .bind(key, `سفارش تازهٔ منشأ ${orderNumber(order)}`, `${order.buyer_name} با شمارهٔ ${order.buyer_phone}، ${fa(order.quantity)} عدد ${order.item_name} خرید.`,
        manshaSellerOrderPrefix + order.id, key, order.id),
  ]);
  return "paid";
}

export async function verifyManshaBuyerOrder(id: unknown, token: string | undefined) {
  const order = typeof id === "string" ? await buyerOrder(id, token) : null;
  if (!order) throw new ApiError(404, orderMissing);
  return verifyManshaOrder(order);
}

export async function manshaPaymentReturn(req: Request) {
  const url = new URL(req.url);
  const safeOrigin = merchantConfiguration()?.origin ?? url.origin;
  const authority = url.searchParams.get("Authority");
  let destination = manshaReceiptPath();
  if (authority && authorityPattern.test(authority)) {
    const order = await database().prepare("SELECT * FROM mansha_orders WHERE authority=?").bind(authority).first<StoredOrder>();
    if (order) {
      let outcome: "success" | "cancelled" | "pending" = order.status === "paid" ? "success" : "cancelled";
      if (outcome !== "success" && url.searchParams.get("Status") === "OK") {
        outcome = "pending";
        try { if (await verifyManshaOrder(order) === "paid") outcome = "success"; }
        catch { /* The receipt can retry verification without accepting the redirect as proof. */ }
      }
      destination = manshaReceiptPath(order.id, outcome);
    }
  }
  return new Response(null, {
    status: 303, headers: { Location: new URL(destination, safeOrigin).href, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
