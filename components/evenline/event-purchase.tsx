"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useAppNavigate } from "@/components/event/app-navigation";
import { useAuth } from "@/components/event/auth-context";
import { eventTicketTiers, ticketSelection } from "@/lib/ticket-selection";
import { readCheckoutDraft, saveCheckoutDraft, clearCheckoutDraft } from "@/lib/checkout-draft";
import type { EventDetailData } from "@/lib/types";
import { fa } from "@/lib/types";
import { copy } from "@/locales/fa";
import { Button } from "./primitives";
import { Price } from "./event-card";

const subscribe = () => () => {};
export function EventPurchase({ event, open, closedLabel }: { event: EventDetailData; open: boolean; closedLabel: string }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  return mounted ? <PurchaseSelection key={event.id} event={event} open={open} closedLabel={closedLabel} /> : null;
}

function Quantity({ count, canAdd, disabled, label, update }: { count: number; canAdd: boolean; disabled: boolean; label: string; update: (count: number) => void }) {
  return <div className="el-quantity el-inline-quantity" role="group" aria-label={`${copy.quantity} ${label}`}>
    <button type="button" aria-label={count === 1 ? copy.removeTicket : copy.decrease} disabled={disabled || count === 0} onClick={() => update(count - 1)}>{count === 1 ? <Trash2 size={20} aria-hidden="true" /> : <Minus size={20} aria-hidden="true" />}</button>
    <output aria-live="polite">{fa(count)}</output>
    <button type="button" aria-label={copy.increase} disabled={disabled || !canAdd} onClick={() => update(count + 1)}><Plus size={20} aria-hidden="true" /></button>
  </div>;
}

function PurchaseSelection({ event, open, closedLabel }: { event: EventDetailData; open: boolean; closedLabel: string }) {
  const { user, loading } = useAuth();
  const navigate = useAppNavigate();
  const [draft] = useState(() => readCheckoutDraft(event.id));
  const [counts, setCounts] = useState<Record<string, number>>(draft?.counts ?? {});
  const [active, setActive] = useState(!!draft && Object.values(draft.counts).some(Boolean));
  const [error, setError] = useState("");
  const options = useRef<HTMLElement>(null);
  const requestKey = useRef(draft?.requestKey ?? null);
  const tiers = eventTicketTiers(event, copy.regular);
  const selection = ticketSelection(tiers, counts, event.remaining);
  const single = tiers.length === 1;
  const update = (id: string, count: number) => {
    requestKey.current = null;
    const next = { ...counts, [id]: count };
    setCounts(next); setError("");
    if (!Object.values(next).some(Boolean)) { setActive(false); clearCheckoutDraft(event.id); }
  };
  function begin() {
    setActive(true); setError("");
    if (single && selection.canAdd(tiers[0])) update(tiers[0].id, 1);
    else requestAnimationFrame(() => { options.current?.scrollIntoView({ block: "center", behavior: "instant" }); options.current?.focus({ preventScroll: true }); });
  }
  function proceed() {
    if (!open || !selection.valid || loading) return;
    try { saveCheckoutDraft(event.id, counts, requestKey.current); }
    catch { setError(copy.saveFailed); return; }
    const checkout = `/events/${encodeURIComponent(event.id)}/tickets`;
    navigate(user ? checkout : `/login?next=${encodeURIComponent(checkout)}`);
  }
  const prices = tiers.map(tier => tier.price);
  return <>
    {active && !single && <section className="el-inline-ticket-options" ref={options} tabIndex={-1} aria-label={copy.chooseTicket}>
      <h2>{copy.chooseTicket}</h2>{tiers.map(tier => <article className="el-inline-ticket-tier" key={tier.id}><div><h3>{tier.name}</h3><p><Price value={tier.price} /></p><small>{tier.remaining === null ? copy.unlimited : `${fa(tier.remaining)} ${copy.spotsLeft}`}</small>{tier.description && <details><summary>{copy.ticketBenefits}</summary><p>{tier.description}</p></details>}</div><Quantity count={counts[tier.id] ?? 0} canAdd={selection.canAdd(tier)} disabled={!open} label={tier.name} update={count => update(tier.id, count)} /></article>)}
    </section>}
    <footer className={`el-action-footer el-purchase-footer el-inline-purchase${active ? " is-selecting" : ""}`}>
      <div className="el-inline-purchase-price"><strong>{selection.quantity ? <Price value={selection.total} /> : <><Price value={prices.length ? Math.min(...prices) : event.price} />{prices.length > 1 && Math.max(...prices) !== Math.min(...prices) && <> – <Price value={Math.max(...prices)} /></>}</>}</strong><p>{selection.quantity ? `${fa(selection.quantity)} ${copy.selectedTickets}` : event.remaining === null ? copy.unlimited : `${fa(event.remaining)} ${copy.spotsLeft}`}</p></div>
      {open && active && single && <Quantity count={counts[tiers[0].id] ?? 0} canAdd={selection.canAdd(tiers[0])} disabled={!open} label={tiers[0].name} update={count => update(tiers[0].id, count)} />}
      {open ? active ? <Button disabled={!selection.valid || loading} onClick={proceed}>{copy.continuePurchase}</Button> : <Button disabled={!tiers.some(tier => selection.canAdd(tier))} onClick={begin}>{copy.getTicket}</Button> : <Button disabled>{closedLabel}</Button>}
      {error && <p className="el-inline-purchase-error" role="alert">{error}</p>}
      {active && Object.values(counts).some(Boolean) && !selection.valid && <p className="el-inline-purchase-error" role="alert">{copy.ticketSelectionChanged} <button type="button" className="el-text-action" onClick={() => { setCounts({}); setActive(false); requestKey.current = null; clearCheckoutDraft(event.id); }}>{copy.resetTicketSelection}</button></p>}
    </footer>
  </>;
}
