"use client";
import { useId } from "react";
import { Combobox, DirectionProvider } from "@base-ui/react";
import { Check, ChevronDown } from "lucide-react";
import { matchingOrganizers, type EventOrganizerInput } from "@/lib/fast-organizer";
import type { FastOrganizer } from "@/lib/fast-types";
import { fastCopy as t } from "@/locales/fast-fa";
import styles from "./fast.module.css";

export function OrganizerField({ organizers, hostId, name, disabled, onChange }: {
  organizers: FastOrganizer[];
  hostId: string | null;
  name: string;
  disabled: boolean;
  onChange: (value: EventOrganizerInput) => void;
}) {
  const id = useId();
  const selected = organizers.find(item => item.id === hostId) ?? null;
  const text = hostId ? selected?.name || selected?.phone || hostId : name;
  const matches = matchingOrganizers(organizers, text);
  return <div className={styles.field}>
    <label htmlFor={id}>{t.organizer}</label>
    <DirectionProvider direction="rtl"><Combobox.Root<FastOrganizer>
      items={organizers}
      filteredItems={matches}
      value={selected}
      inputValue={text}
      disabled={disabled}
      itemToStringLabel={item => item.name || item.phone}
      isItemEqualToValue={(item, value) => item.id === value.id}
      onInputValueChange={(value, details) => {
        // Blur and selection may reset the primitive's input; typed names must survive.
        if (details.reason === "input-change" || details.reason === "clear-press") onChange({ host_id: null, organizer_name: value });
      }}
      onValueChange={(value, details) => {
        if (value && details.reason === "item-press") onChange({ host_id: value.id, organizer_name: null });
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
                <span><strong>{item.name || item.phone}</strong><small dir="ltr">{item.phone}</small></span>
                <Combobox.ItemIndicator><Check size={18} /></Combobox.ItemIndicator>
              </Combobox.Item>}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root></DirectionProvider>
    <small id={`${id}-hint`} className={styles.muted}>{hostId ? t.organizerLinked : name.trim() ? t.organizerNameOnly : t.organizerHint}</small>
  </div>;
}
