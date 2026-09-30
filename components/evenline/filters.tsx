"use client";
import { useState } from "react";
import { useEventBrowse } from "@/components/event/event-browse-provider";
import { useAppNavigate } from "@/components/event/app-navigation";
import { useEventCatalog } from "@/hooks/use-event-catalog";
import { copy, categoryCopy } from "@/locales/fa";
import { Header, Button, SourceIcon } from "./primitives";
import { assets } from "./assets";

export function Filters() {
  const { filters, updateFilters } = useEventBrowse();
  const { catalog } = useEventCatalog();
  const [draft, setDraft] = useState(filters);
  const [allCategories, setAllCategories] = useState(false);
  const navigate = useAppNavigate();
  return <main><Header title={copy.filters} back="/events" /><form onSubmit={e => { e.preventDefault(); updateFilters(draft); navigate("/events?view=all"); }}>
    <div className="el-filter-content">
      <label className="el-field"><strong>{copy.dates}</strong><select value={draft.when} onChange={e => setDraft({ ...draft, when: e.target.value })}><option value="all">{copy.allDays}</option><option value="today">{copy.today}</option><option value="week">{copy.week}</option></select></label>
      <fieldset><legend className="el-section-heading"><strong>{copy.categories}</strong><button type="button" className="el-text-action" onClick={() => setAllCategories(!allCategories)}>{copy.all}</button></legend>
        <div className="el-choice-list">{categoryCopy.slice(0, allCategories ? undefined : 4).map(option => <label key={option.id} className={`el-choice${draft.category === option.id ? " selected" : ""}`}>
          <input type="radio" name="category" value={option.id} checked={draft.category === option.id} onChange={() => setDraft({ ...draft, category: option.id })} /><span>{option.label}</span><SourceIcon asset={draft.category === option.id ? assets.filters.imgCheck : assets.filters.imgDot} size={20} />
        </label>)}</div>
      </fieldset>
      <label className="el-field"><strong>{copy.price}</strong><select value={draft.free ? "free" : "all"} onChange={e => setDraft({ ...draft, free: e.target.value === "free" })}><option value="all">{copy.anyPrice}</option><option value="free">{copy.freeOnly}</option></select></label>
      <label className="el-field"><strong>{copy.city}</strong><select value={draft.city} onChange={e => setDraft({ ...draft, city: e.target.value })}><option value="all">{copy.allCities}</option>{[...new Set(catalog?.events.map(event => event.city))].sort().map(city => <option key={city} value={city}>{city}</option>)}</select></label>
    </div><div className="el-action-footer"><Button type="submit">{copy.apply}</Button></div>
  </form></main>;
}
