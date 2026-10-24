"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Minus, Plus, Trash2, X } from "lucide-react";
import { useAppNavigate } from "@/components/event/app-navigation";
import { useAuth } from "@/components/event/auth-context";
import { eventTicketTiers, ticketSelection } from "@/lib/ticket-selection";
import { readCheckoutDraft, saveCheckoutDraft, clearCheckoutDraft } from "@/lib/checkout-draft";
import type { EventDetailData } from "@/lib/types";
import { fa } from "@/lib/types";
import { copy } from "@/locales/fa";
import { Button } from "./primitives";
import { Price } from "./event-card";
import { TicketPrice } from "./ticket-price";

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
  const [choosing, setChoosing] = useState(false);
  const picker = useRef<HTMLDialogElement>(null);
  const requestKey = useRef(draft?.requestKey ?? null);
  const tiers = eventTicketTiers(event, copy.regular);
  const selection = ticketSelection(tiers, counts, event.remaining);
  const single = tiers.length === 1;
  const chosen = selection.selected.length === 1 ? selection.selected[0] : undefined;
  useEffect(() => {
    if (choosing && open) picker.current?.showModal();
    else picker.current?.close();
  }, [choosing, open]);
  const update = (id: string, count: number) => {
    requestKey.current = null;
    const next = { ...counts, [id]: count };
    setCounts(next); setError("");
    if (!Object.values(next).some(Boolean)) { setActive(false); clearCheckoutDraft(event.id); }
  };
  function begin() {
    setError("");
    if (single && selection.canAdd(tiers[0])) { setActive(true); update(tiers[0].id, 1); }
    else setChoosing(true);
  }
  function proceed() {
    if (!open || !selection.valid || loading) return;
    try { saveCheckoutDraft(event.id, counts, requestKey.current); }
    catch { setError(copy.saveFailed); return; }
    const checkout = `/events/${encodeURIComponent(event.id)}/tickets`;
    navigate(user ? checkout : `/login?next=${encodeURIComponent(checkout)}`);
  }
  const prices = tiers.map(tier => tier.price);
  const cheapest = tiers.reduce<(typeof tiers)[number] | undefined>((best, tier) => !best || tier.price < best.price ? tier : best, undefined);
  const originalTotal = selection.selected.reduce((sum, tier) => sum + (tier.original_price ?? tier.price) * counts[tier.id], 0);
  return <>
    {active && selection.selected.length > 1 && <section className="el-inline-ticket-options" aria-label={copy.chooseTicket}>
      <h2>{copy.chooseTicket}</h2>{selection.selected.map(tier => <article className="el-inline-ticket-tier" key={tier.id}><div><h3>{tier.name}</h3><TicketPrice price={tier.price} originalPrice={tier.original_price} /></div><Quantity count={counts[tier.id] ?? 0} canAdd={selection.canAdd(tier)} disabled={!open} label={tier.name} update={count => update(tier.id, count)} /></article>)}
    </section>}
    <footer className={`el-action-footer el-purchase-footer el-inline-purchase${active ? " is-selecting" : ""}`}>
      <div className="el-inline-purchase-price">{selection.quantity ? <TicketPrice price={selection.total} originalPrice={originalTotal} /> : prices.length > 1 && Math.max(...prices) !== Math.min(...prices) ? <strong><Price value={Math.min(...prices)} /> – <Price value={Math.max(...prices)} /></strong> : <TicketPrice price={cheapest?.price ?? event.price} originalPrice={cheapest?.original_price} />}<p>{selection.quantity ? `${fa(selection.quantity)} ${copy.selectedTickets}` : event.remaining === null ? copy.unlimited : `${fa(event.remaining)} ${copy.spotsLeft}`}</p></div>
      {open && active && chosen && <Quantity count={counts[chosen.id] ?? 0} canAdd={selection.canAdd(chosen)} disabled={!open} label={chosen.name} update={count => update(chosen.id, count)} />}
      {open && active && !single && <button type="button" className="el-ticket-type-change el-text-action" aria-haspopup="dialog" onClick={() => setChoosing(true)}>{chosen?.name} · {copy.changeTicketType}</button>}
      {open ? active ? <Button disabled={!selection.valid || loading} onClick={proceed}>{copy.continuePurchase}</Button> : <Button disabled={!tiers.some(tier => selection.canAdd(tier))} onClick={begin}>{copy.getTicket}</Button> : <Button disabled>{closedLabel}</Button>}
      {error && <p className="el-inline-purchase-error" role="alert">{error}</p>}
      {active && Object.values(counts).some(Boolean) && !selection.valid && <p className="el-inline-purchase-error" role="alert">{copy.ticketSelectionChanged} <button type="button" className="el-text-action" onClick={() => { setCounts({}); setActive(false); requestKey.current = null; clearCheckoutDraft(event.id); }}>{copy.resetTicketSelection}</button></p>}
    </footer>
    <dialog ref={picker} className="el-ticket-type-dialog" aria-labelledby="ticket-type-title" aria-describedby="ticket-type-hint" onCancel={() => setChoosing(false)} onClose={() => setChoosing(false)}>
      <header><h2 id="ticket-type-title">{copy.chooseTicketType}</h2><button type="button" className="el-icon-button" aria-label={copy.close} onClick={() => setChoosing(false)}><X size={20} aria-hidden="true" /></button></header>
      <p id="ticket-type-hint">{copy.ticketTypeHint}</p>
      <div className="el-ticket-type-options">{tiers.map(tier => {
        const available = open && (event.remaining === null || event.remaining > 0) && (tier.remaining === null || tier.remaining > 0);
        return <button type="button" key={tier.id} disabled={!available} aria-pressed={chosen?.id === tier.id} onClick={() => {
          if (!available) return;
          setCounts({ [tier.id]: 1 }); setActive(true); setError(""); requestKey.current = null; clearCheckoutDraft(event.id); setChoosing(false);
        }}><span className="el-ticket-type-name"><strong>{tier.name}</strong>{chosen?.id === tier.id && <Check size={18} aria-hidden="true" />}</span>{tier.description && <span className="el-ticket-type-description">{tier.description}</span>}<TicketPrice price={tier.price} originalPrice={tier.original_price} /><small>{!available ? copy.soldOut : tier.remaining === null ? copy.unlimited : `${fa(tier.remaining)} ${copy.spotsLeft}`}</small></button>;
      })}</div>
    </dialog>
  </>;
}
