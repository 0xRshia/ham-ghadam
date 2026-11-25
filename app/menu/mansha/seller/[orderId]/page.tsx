import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { AppLink } from "@/components/event/app-navigation";
import styles from "@/components/event/page-layouts.module.css";
import { authHref } from "@/lib/auth-navigation";
import { isManshaOrderId, manshaSellerOrderPrefix } from "@/lib/mansha-navigation";
import { getManshaSellerReceipt } from "@/lib/mansha-orders";
import { currentUser } from "@/lib/server";
import { clock, date, fa, faDigits } from "@/lib/types";
import { faContent } from "@/locales/domain-fa";
import { manshaCopy as copy } from "@/locales/mansha-fa";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: `${copy.sellerOrderSlip} | ${copy.venue}`,
  robots: { index: false, follow: false, noarchive: true },
};

function OrderTime({ value }: { value: number }) {
  return <time dateTime={new Date(value).toISOString()}>{date(value, true)} · {clock(value)}</time>;
}

export default async function ManshaSellerOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  if (!isManshaOrderId(orderId)) notFound();

  const request = new Request("http://localhost", { headers: await headers() });
  const user = await currentUser(request);
  if (!user) redirect(authHref("/login", `${manshaSellerOrderPrefix}${orderId}`, null));

  const receipt = await getManshaSellerReceipt(orderId, user.id);
  if (!receipt) notFound();

  return (
    <main className={`container subpage ${styles.page} receipt-print-page`}>
      <div className="receipt-print-actions">
        <AppLink className="back-link" href="/notifications">
          <ArrowRight size={17} aria-hidden="true" />
          {copy.backToNotifications}
        </AppLink>
        <PrintButton />
      </div>
      <article className="receipt-paper" dir="rtl" aria-labelledby="mansha-order-slip-title">
        <header>
          <span>{copy.venue}</span>
          <h1 id="mansha-order-slip-title">{copy.sellerOrderSlip}</h1>
        </header>
        <dl>
          <div><dt>{copy.orderNumber}</dt><dd><bdi dir="ltr">{faDigits(receipt.orderNumber)}</bdi></dd></div>
          <div><dt>{copy.orderItem}</dt><dd>{receipt.itemName}</dd></div>
          <div><dt>{copy.quantity}</dt><dd>{fa(receipt.quantity)}</dd></div>
          <div><dt>{copy.orderAmount}</dt><dd>{fa(receipt.amountToman)} {faContent.toman}</dd></div>
          <div><dt>{faContent.status}</dt><dd>{copy.paid}</dd></div>
          <div><dt>{faContent.buyerName}</dt><dd>{receipt.buyerName}</dd></div>
          <div><dt>{faContent.mobile}</dt><dd><bdi dir="ltr">{faDigits(receipt.buyerPhone)}</bdi></dd></div>
          <div><dt>{copy.createdAt}</dt><dd><OrderTime value={receipt.createdAt} /></dd></div>
          {receipt.paidAt !== null && <div><dt>{copy.paidAt}</dt><dd><OrderTime value={receipt.paidAt} /></dd></div>}
          {receipt.paymentReference && <div><dt>{copy.paymentReference}</dt><dd><bdi dir="ltr">{faDigits(receipt.paymentReference)}</bdi></dd></div>}
        </dl>
      </article>
    </main>
  );
}
