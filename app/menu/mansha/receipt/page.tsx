import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ArrowRight, ReceiptText } from "lucide-react";
import { AppLink } from "@/components/event/app-navigation";
import { ManshaReceiptAction } from "@/components/venue-order/receipt-actions";
import styles from "@/components/venue-order/mansha.module.css";
import { getManshaReceipt, MANSHA_BUYER_COOKIE } from "@/lib/mansha-orders";
import { clock, date, fa, faDigits } from "@/lib/types";
import { copy } from "@/locales/fa";
import { manshaCopy as t } from "@/locales/mansha-fa";

export const metadata: Metadata = {
  title: `${t.receipt} | ${t.venue}`,
  robots: { index: false, follow: false, noarchive: true },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ order?: string | string[]; payment?: string | string[] }>;

function OrderTime({ timestamp }: { timestamp: number }) {
  return <time dateTime={new Date(timestamp).toISOString()}>{date(timestamp, true)} · {clock(timestamp)}</time>;
}

export default async function ManshaReceiptPage({ searchParams }: { searchParams: SearchParams }) {
  const { order, payment } = await searchParams;
  const orderId = typeof order === "string" ? order : "";
  const buyer = (await cookies()).get(MANSHA_BUYER_COOKIE)?.value;
  const receipt = orderId && buyer ? await getManshaReceipt(orderId, buyer) : null;
  const state = receipt?.status === "paid" ? "paid"
    : payment === "cancelled" ? "cancelled"
    : receipt?.status === "failed" ? "failed" : "pending";
  return <main className={styles.page}>
    <div className={styles.receiptNav}>
      <AppLink href="/menu/mansha"><ArrowRight size={20} aria-hidden="true" />{t.backToMenu}</AppLink>
    </div>
    <article className={styles.paper} aria-labelledby="mansha-receipt-heading">
      <header>
        <ReceiptText size={26} aria-hidden="true" />
        <div><p>{t.venue}</p><h1 id="mansha-receipt-heading">{t.receipt}</h1></div>
      </header>
      {receipt ? <>
        <p className={styles.receiptStatus} data-state={state}>{t[state]}</p>
        <p className={styles.orderNumber}>{t.orderNumber}<strong dir="ltr">{faDigits(receipt.orderNumber)}</strong></p>
        <dl className={styles.receiptDetails}>
          <div><dt>{t.orderItem}</dt><dd dir="auto">{receipt.itemName}</dd></div>
          <div><dt>{t.quantity}</dt><dd>{fa(receipt.quantity)}</dd></div>
          <div><dt>{copy.total}</dt><dd>{fa(receipt.amountToman)} {copy.toman}</dd></div>
          <div><dt>{t.createdAt}</dt><dd><OrderTime timestamp={receipt.createdAt} /></dd></div>
          {receipt.paidAt !== null && <div><dt>{t.paidAt}</dt><dd><OrderTime timestamp={receipt.paidAt} /></dd></div>}
          {receipt.paymentReference && <div><dt>{t.paymentReference}</dt><dd><bdi>{faDigits(receipt.paymentReference)}</bdi></dd></div>}
        </dl>
      </> : <p className={styles.dim}>{t.receiptUnavailable}</p>}
    </article>
    {receipt && (state === "paid" || state === "pending") && <div className={styles.receiptActions}>
      <ManshaReceiptAction action={state === "paid" ? "print" : "verify"} orderId={orderId} />
    </div>}
  </main>;
}
