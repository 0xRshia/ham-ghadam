"use client";

import { useEffect, useRef, useState } from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/evenline/primitives";
import { authHref } from "@/lib/auth-navigation";
import { api, ClientError } from "@/lib/client";
import type { SquirrelRewardCredit } from "@/lib/squirrel-reward-credit";
import {
  squirrelRewardReceivePath,
  squirrelRewardStorageKey,
  squirrelRewardTokenPattern,
} from "@/lib/squirrel-reward-receive";
import { fa } from "@/lib/types";
import { squirrelRewardReceiveCopy as receiveCopy } from "@/locales/squirrel-reward-receive-fa";
import { squirrelWalletRewardCopy as copy } from "@/locales/squirrel-fa";
import styles from "./squirrel-reward-receive.module.css";

type ReceiveState =
  | { status: "loading" | "ready" | "submitting" | "expired" | "storageUnavailable" }
  | { status: "failed"; error: string }
  | { status: "received"; reward: SquirrelRewardCredit };

function readPendingReward() {
  const token = window.sessionStorage.getItem(squirrelRewardStorageKey);
  if (token && squirrelRewardTokenPattern.test(token)) return token;
  if (token) window.sessionStorage.removeItem(squirrelRewardStorageKey);
  return null;
}

function initializeReward(): ReceiveState {
  const token = window.location.hash.slice(1);
  try {
    if (token) {
      if (!squirrelRewardTokenPattern.test(token)) {
        window.sessionStorage.removeItem(squirrelRewardStorageKey);
        return { status: "expired" };
      }
      window.sessionStorage.setItem(squirrelRewardStorageKey, token);
    }
    return { status: readPendingReward() ? "ready" : "expired" };
  } catch {
    return { status: "storageUnavailable" };
  } finally {
    if (token) window.history.replaceState(window.history.state, "", squirrelRewardReceivePath);
  }
}

export function SquirrelRewardReceive() {
  const [state, setState] = useState<ReceiveState>({ status: "loading" });
  const submitting = useRef(false);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) setState(initializeReward()); });
    return () => { active = false; };
  }, []);

  async function collect() {
    if (submitting.current) return;
    submitting.current = true;
    setState({ status: "submitting" });
    try {
      const token = readPendingReward();
      if (!token) { setState({ status: "expired" }); return; }
      const { reward } = await api<{ reward: SquirrelRewardCredit }>("/game/reward/redeem", { token });
      window.sessionStorage.removeItem(squirrelRewardStorageKey);
      setState({ status: "received", reward });
    } catch (error) {
      if (error instanceof ClientError && error.status === 401) {
        window.location.replace(authHref("/login", squirrelRewardReceivePath, null));
        return;
      }
      if (error instanceof ClientError && [400, 404, 410].includes(error.status)) {
        window.sessionStorage.removeItem(squirrelRewardStorageKey);
        setState({ status: "expired" });
        return;
      }
      setState({ status: "failed", error: error instanceof ClientError ? error.message : copy.failed });
    } finally {
      submitting.current = false;
    }
  }

  const busy = state.status === "loading" || state.status === "submitting";
  const expired = state.status === "expired" || state.status === "storageUnavailable";

  return <main className={styles.page}>
    <section className={styles.card} aria-labelledby="squirrel-reward-heading">
      <span className={styles.icon} aria-hidden="true"><Wallet size={24} /></span>
      <h1 id="squirrel-reward-heading">{copy.title}</h1>
      {state.status === "received" ? <>
        <div role="status" className={styles.result}>
          <p>{receiveCopy.credited(fa(state.reward.amountToman))}</p>
          <p>{receiveCopy.balance(fa(state.reward.balanceAfter))}</p>
        </div>
        <a className="el-button el-button-primary" href={state.reward.walletHref}>{copy.wallet}</a>
      </> : expired ? <>
        <p role="status">{state.status === "storageUnavailable" ? receiveCopy.storageUnavailable : copy.expired}</p>
        <a className="el-button el-button-secondary" href="/game">{receiveCopy.back}</a>
      </> : <>
        {state.status === "failed" ? <p role="alert">{state.error}</p> : <p>{receiveCopy.hint}</p>}
        <Button type="button" disabled={busy} aria-busy={busy} onClick={() => void collect()}>
          {busy ? copy.loading : state.status === "failed" ? copy.retry : receiveCopy.collect}
        </Button>
      </>}
    </section>
  </main>;
}
