"use client";

import { useEffect, useRef } from "react";
import { LoaderCircle, Wallet } from "lucide-react";
import { SQUIRREL_REWARD_TOMAN, type SquirrelRewardCredit } from "@/lib/squirrel-reward-credit";
import { fa } from "@/lib/types";
import { squirrelWalletRewardCopy as copy } from "@/locales/squirrel-fa";

export type WalletRewardState =
  | { status: "loading" }
  | { status: "signIn" | "continue"; href: string }
  | { status: "failed"; error: string; retryable: boolean }
  | { status: "received"; credit: SquirrelRewardCredit };

export function WalletReward({ state, open, onOpen, onClose, onRetry, onNavigate }: {
  state: WalletRewardState;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onRetry: () => void;
  onNavigate: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) element.close();
  }, [open]);

  return <>
    {state.status === "signIn" ? <a href={state.href} className="sg-reward-trigger" onClick={onNavigate}>
      <Wallet size={18} aria-hidden="true" />{copy.signIn}
    </a> : <button type="button" className="sg-reward-trigger" onClick={onOpen}>
      <Wallet size={18} aria-hidden="true" />{copy.show}
    </button>}
    <dialog ref={dialog} className="sg-reward-dialog" aria-labelledby="sg-reward-title"
      onCancel={event => { event.preventDefault(); onClose(); }}>
      <Wallet size={27} className="sg-reward-icon" aria-hidden="true" />
      <h2 id="sg-reward-title">{copy.title}</h2>
      {state.status === "loading" ? <p className="sg-reward-loading" role="status">
        <LoaderCircle size={18} className="sg-spin" aria-hidden="true" />{copy.loading}
      </p> : state.status === "failed" ? <>
        <p className="sg-reward-error" role="alert">{state.error || copy.failed}</p>
        {state.retryable && <button type="button" className="sg-primary" onClick={onRetry}>{copy.retry}</button>}
      </> : <>
        <div role="status">
          <p className="sg-reward-amount"><strong>{fa(state.status === "received" ? state.credit.amountToman : SQUIRREL_REWARD_TOMAN)}</strong> {copy.toman}</p>
          <p className="sg-reward-meta">{state.status === "received" ? copy.received : state.status === "signIn" ? copy.signInHint : copy.continueHint}</p>
        </div>
        {state.status === "received" ? <a className="sg-primary" href={state.credit.walletHref} onClick={onNavigate}>{copy.wallet}</a>
          : <a className="sg-primary" href={state.href} onClick={onNavigate}>{state.status === "signIn" ? copy.signIn : copy.continue}</a>}
      </>}
      <button type="button" className="sg-text-button" onClick={onClose}>{copy.close}</button>
    </dialog>
  </>;
}
