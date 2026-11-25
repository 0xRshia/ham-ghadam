"use client";

import { useRef, useState } from "react";
import { ArrowLeft, Coffee, CreditCard, Minus, Plus } from "lucide-react";
import { Button } from "@/components/evenline/primitives";
import { api } from "@/lib/client";
import { MANSHA_MAX_QUANTITY, type ManshaMenuItem } from "@/lib/mansha-menu";
import { digits, fa } from "@/lib/types";
import { copy } from "@/locales/fa";
import { manshaCopy as t } from "@/locales/mansha-fa";
import styles from "./mansha.module.css";

type Props = {
  menu: readonly ManshaMenuItem[];
  originalMenuUrl: string;
  pricesConfirmed: boolean;
  checkoutAvailable: boolean;
};

function MenuItems({ menu, showPrices, selected, disabled, onSelect }: {
  menu: readonly ManshaMenuItem[];
  showPrices: boolean;
  selected?: string;
  disabled?: boolean;
  onSelect?: (itemId: string) => void;
}) {
  const categories = new Map<string, ManshaMenuItem[]>();
  for (const item of menu) {
    const items = categories.get(item.category);
    if (items) items.push(item);
    else categories.set(item.category, [item]);
  }
  const sections = [...categories];
  const Item = onSelect ? "label" : "div";

  return <section className={styles.menu} aria-labelledby="mansha-menu-heading">
    <h2 id="mansha-menu-heading">{t.menu}</h2>
    {sections.length > 1 && <nav className={styles.categoryLinks} aria-label={t.menuCategories}>
      {sections.map(([category], index) => <a href={`#mansha-category-${index}`} key={category}>{category}</a>)}
    </nav>}
    {sections.map(([category, items], index) => <div className={styles.category} id={`mansha-category-${index}`} key={category}>
      <h3>{category}</h3>
      <ul className={styles.items}>
        {items.map(item => <li key={item.id}>
          <Item className={styles.item} data-selectable={!!onSelect || undefined} data-selected={selected === item.id || undefined}>
            {onSelect && <input
              className="el-radio"
              type="radio"
              name="item"
              value={item.id}
              checked={selected === item.id}
              disabled={disabled}
              onChange={() => onSelect(item.id)}
              aria-label={item.name}
              aria-describedby={`mansha-price-${item.id}`}
            />}
            <span className={styles.itemContent}>
              <strong dir="auto">{item.name}</strong>
              {item.description && <small dir="auto">{item.description}</small>}
            </span>
            {showPrices && <span className={styles.price} id={`mansha-price-${item.id}`}>{fa(item.priceToman)} <small>{copy.toman}</small></span>}
          </Item>
        </li>)}
      </ul>
    </div>)}
  </section>;
}

export function ManshaMenu({ menu, originalMenuUrl, pricesConfirmed, checkoutAvailable }: Props) {
  const items = menu.filter(item => Number.isSafeInteger(item.priceToman) && item.priceToman > 0);
  const canOrder = checkoutAvailable && pricesConfirmed && items.length > 0;
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const requestKey = useRef("");
  const selected = items.find(item => item.id === itemId);
  const total = (selected?.priceToman ?? 0) * quantity;

  function edited() {
    requestKey.current = "";
    setError("");
  }

  async function submitOrder() {
    if (!canOrder || !selected || total <= 0 || submitting.current) return;
    const fullName = name.trim();
    if (fullName.length < 2 || fullName.length > 80) {
      setError(t.invalidName);
      return;
    }

    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      requestKey.current ||= crypto.randomUUID();
      const result = await api<{ paymentUrl: string }>("/api/menu/mansha/orders", {
        itemId: selected.id,
        quantity,
        name: fullName,
        phone: digits(phone).trim(),
        requestKey: requestKey.current,
      });
      if (!result.paymentUrl) throw new Error(t.paymentUnavailable);
      window.location.assign(result.paymentUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.paymentUnavailable);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <main className={styles.page}>
    <header className={styles.hero}>
      <Coffee size={26} aria-hidden="true" />
      <div><h1>{t.venue}</h1><p>{t.orderMenu}</p></div>
    </header>

    {canOrder ? <form
      className={styles.orderForm}
      onSubmit={event => {
        event.preventDefault();
        void submitOrder();
      }}
    >
      <MenuItems
        menu={items}
        showPrices
        selected={itemId}
        disabled={busy}
        onSelect={value => {
          setItemId(value);
          setQuantity(1);
          edited();
        }}
      />
      {selected && <div className={styles.jump}>
        <a href="#mansha-checkout"><span>{t.continueToCheckout}</span><ArrowLeft size={18} aria-hidden="true" /></a>
      </div>}
      <section id="mansha-checkout" className={styles.checkout} tabIndex={-1} aria-labelledby="mansha-checkout-heading">
        <h2 id="mansha-checkout-heading">{t.order}</h2>
        {selected ? <div className={styles.summary}>
          <div className={styles.summaryItem}>
            <strong dir="auto">{selected.name}</strong>
            <div className={styles.stepper} role="group" aria-label={t.quantity}>
              <button type="button" aria-label={t.removeQuantity} disabled={busy || quantity <= 1} onClick={() => {
                setQuantity(value => Math.max(1, value - 1));
                edited();
              }}><Minus size={18} aria-hidden="true" /></button>
              <output aria-label={t.quantity}>{fa(quantity)}</output>
              <button type="button" aria-label={t.addQuantity} disabled={busy || quantity >= MANSHA_MAX_QUANTITY} onClick={() => {
                setQuantity(value => Math.min(MANSHA_MAX_QUANTITY, value + 1));
                edited();
              }}><Plus size={18} aria-hidden="true" /></button>
            </div>
          </div>
          <p className={styles.summaryTotal}>{copy.total} <strong>{fa(total)} {copy.toman}</strong></p>
        </div> : <p className={styles.dim}>{t.chooseItem}</p>}
        <fieldset className={styles.contact} disabled={busy || !selected}>
          <label>
            <span>{copy.checkoutFullName}</span>
            <input required minLength={2} maxLength={80} autoComplete="name" dir="auto" value={name} onChange={event => {
              setName(event.target.value);
              edited();
            }} />
          </label>
          <label>
            <span>{copy.phone}</span>
            <input type="tel" required maxLength={24} autoComplete="tel" dir="ltr" value={phone} onChange={event => {
              setPhone(event.target.value);
              edited();
            }} />
          </label>
          <p className={styles.dim}>{t.fulfillmentNotice}</p>
          {error && <p className={styles.orderError} role="alert">{error}</p>}
          <Button className={styles.submit} type="submit" aria-busy={busy}>
            <CreditCard size={20} aria-hidden="true" /> {busy ? t.connecting : t.proceedToPayment}
          </Button>
        </fieldset>
      </section>
    </form> : <>
      <div className={styles.unavailable}>
        <p>{!menu.length ? t.menuUnavailable : pricesConfirmed ? t.paymentUnavailable : t.pricesUnconfirmed}</p>
        <a href={originalMenuUrl} rel="noreferrer" target="_blank">{t.viewOriginalMenu} <ArrowLeft size={17} aria-hidden="true" /></a>
      </div>
      {menu.length > 0 && <MenuItems menu={pricesConfirmed ? items : menu} showPrices={pricesConfirmed} />}
    </>}
  </main>;
}
