"use client";

import { Printer, RotateCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/evenline/primitives";
import { api } from "@/lib/client";
import { manshaCopy as t } from "@/locales/mansha-fa";
import styles from "./mansha.module.css";

export function ManshaReceiptAction({ action, orderId }: { action: "print" | "verify"; orderId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const printable = action === "print";
  async function verify() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/menu/mansha/orders/verify", { orderId });
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.paymentUnavailable);
      setBusy(false);
    }
  }
  return <>
    {error && <p className={styles.orderError} role="alert">{error}</p>}
    <Button
      variant="secondary"
      type="button"
      disabled={busy}
      aria-busy={busy}
      onClick={() => { if (printable) window.print(); else void verify(); }}
    >
      {printable ? <Printer size={19} aria-hidden="true" /> : <RotateCw size={19} aria-hidden="true" />}
      {printable ? t.printReceipt : busy ? t.checkingPayment : t.checkPayment}
    </Button>
  </>;
}
