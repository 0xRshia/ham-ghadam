"use client";
import { useId } from "react";
import { Combobox, DirectionProvider } from "@base-ui/react";
import { Check, ChevronDown } from "lucide-react";
import { matchingOrganizers, type EventOrganizerInput } from "@/lib/fast-organizer";
import type { FastOrganizer } from "@/lib/fast-types";
import { fastCopy as t } from "@/locales/fast-fa";
import styles from "./fast.module.css";
import { OrganizerAvatarField } from "./organizer-avatar-field";

export function OrganizerField({ organizers, hostId, organizerId, name, instagramHandle, disabled, identityLocked = false, onChange, onInstagramChange }: {
  organizers: FastOrganizer[];
  hostId: string | null;
  organizerId: string | null;
  name: string;
  instagramHandle: string;
  disabled: boolean;
  identityLocked?: boolean;
  onChange: (value: EventOrganizerInput) => void;
  onInstagramChange: (value: string) => void;
}) {
  const id = useId();
  const selected = organizers.find(item => item.id === (organizerId ?? hostId)) ?? null;
  const text = selected ? selected.name || selected.phone : name;
  const matches = matchingOrganizers(organizers, text);
  return <><div className={styles.field}>
    <label htmlFor={id}>{t.organizer}</label>
    <DirectionProvider direction="rtl"><Combobox.Root<FastOrganizer>
      items={organizers}
      filteredItems={matches}
      value={selected}
      inputValue={text}
      disabled={disabled || identityLocked}
      itemToStringLabel={item => item.name || item.phone}
      isItemEqualToValue={(item, value) => item.id === value.id}
      onInputValueChange={(value, details) => {
        // Blur and selection may reset the primitive's input; typed names must survive.
        if (details.reason === "input-change" || details.reason === "clear-press") onChange({ host_id: null, organizer_id: null, organizer_name: value, instagram_handle: selected ? "" : instagramHandle });
      }}
      onValueChange={(value, details) => {
        if (value && details.reason === "item-press") {
          const accountId = value.host_id ?? (value.phone ? value.id : null);
          onChange({ host_id: accountId, organizer_id: value.id, organizer_name: accountId ? null : value.name, instagram_handle: value.instagram_handle ?? "" });
        }
      }}
    >
      <div className={styles.organizerControl}>
        <Combobox.Input id={id} required maxLength={100} autoComplete="off" aria-describedby={`${id}-hint`} placeholder={t.selectOrganizer} />
        <Combobox.Trigger aria-label={t.selectOrganizer}><ChevronDown size={18} /></Combobox.Trigger>
      </div>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={6} align="start" className={styles.organizerPositioner}>
          <Combobox.Popup dir="rtl" className={styles.organizerPopup}>
            <Combobox.Empty className={styles.organizerEmpty}>{t.organizerNoMatches}</Combobox.Empty>
            <Combobox.List className={styles.organizerList}>
              {(item: FastOrganizer) => <Combobox.Item key={item.id} value={item} className={styles.organizerOption}>
                <span><strong>{item.name || item.phone}</strong><small dir="ltr">{item.instagram_handle ? `@${item.instagram_handle}` : item.phone}</small></span>
                <Combobox.ItemIndicator><Check size={18} /></Combobox.ItemIndicator>
              </Combobox.Item>}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root></DirectionProvider>
    <small id={`${id}-hint`} className={styles.muted}>{selected ? t.organizerLinked : name.trim() ? t.organizerNameOnly : t.organizerHint}</small>
  </div><div className={styles.field}><label htmlFor={`${id}-instagram`}>{t.instagramHandle}</label>
    <input id={`${id}-instagram`} dir="ltr" type="text" maxLength={254} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="@hamghadam" value={instagramHandle} disabled={disabled || identityLocked || !!selected?.instagram_handle} onChange={event => onInstagramChange(event.target.value)} aria-describedby={`${id}-instagram-help`} />
    <small id={`${id}-instagram-help`} className={styles.muted}>{t.instagramHint}</small>
  </div><OrganizerAvatarField key={`${selected?.id}:${selected?.instagram_handle ?? ""}`} organizerId={selected?.id ?? null} disabled={disabled} /></>;
}
