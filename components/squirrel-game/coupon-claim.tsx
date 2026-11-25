"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, LoaderCircle, Ticket } from "lucide-react";
import { fa } from "@/lib/types";
import { squirrelRewardCopy as copy } from "@/locales/squirrel-fa";

export type SquirrelCoupon = {
  code: string;
  amountToman: number;
  redeemHref: string;
};

export type CouponClaimState =
  | { status: "loading" }
  | { status: "failed"; error: string; retryable: boolean }
  | { status: "received"; coupon: SquirrelCoupon };

export function CouponClaim({ state, open, onOpen, onClose, onRetry }: {
  state: CouponClaimState;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onRetry: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const code = useRef<HTMLInputElement>(null);
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) element.close();
  }, [open]);

  async function copyCode() {
    if (state.status !== "received") return;
    try {
      await navigator.clipboard.writeText(state.coupon.code);
      setCopyStatus(copy.copied);
    } catch {
      code.current?.focus();
      code.current?.select();
      setCopyStatus(copy.copyManually);
    }
  }

  return <>
    <button type="button" className="sg-coupon-trigger" onClick={onOpen}>
      <Ticket size={18} aria-hidden="true" />{copy.show}
    </button>
    <dialog
      ref={dialog}
      className="sg-coupon-dialog"
      aria-labelledby="sg-coupon-title"
      onCancel={event => { event.preventDefault(); onClose(); }}
    >
      <Ticket size={27} className="sg-coupon-icon" aria-hidden="true" />
      <h2 id="sg-coupon-title">{copy.title}</h2>
      {state.status === "loading" ? <p className="sg-coupon-loading" role="status">
        <LoaderCircle size={18} className="sg-spin" aria-hidden="true" />{copy.loading}
      </p> : state.status === "failed" ? <>
        <p className="sg-coupon-error" role="alert">{state.error || copy.failed}</p>
        {state.retryable && <button type="button" className="sg-primary" onClick={onRetry}>{copy.retry}</button>}
      </> : <>
        <p className="sg-sr-only" role="status">{copy.received}</p>
        <p className="sg-coupon-amount"><strong>{fa(state.coupon.amountToman)}</strong> {copy.toman}</p>
        <p className="sg-coupon-meta">{copy.redeemHint}</p>
        <label className="sg-coupon-code">
          <span>{copy.code}</span>
          <input ref={code} dir="ltr" readOnly value={state.coupon.code} onFocus={event => event.currentTarget.select()} />
        </label>
        <button type="button" className="sg-primary" onClick={() => void copyCode()}><Copy size={18} aria-hidden="true" />{copy.copy}</button>
        {copyStatus && <p className="sg-coupon-meta" role="status">{copyStatus}</p>}
        <a className="sg-coupon-redeem" href={state.coupon.redeemHref} target="_blank" rel="noreferrer">{copy.redeem}</a>
      </>}
      <button type="button" className="sg-text-button" onClick={onClose}>{copy.close}</button>
    </dialog>
  </>;
}
