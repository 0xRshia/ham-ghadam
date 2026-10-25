"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppLink, useAppNavigate } from "@/components/event/app-navigation";
import { useEventBrowse } from "@/components/event/event-browse-provider";
import { useEventCatalog } from "@/hooks/use-event-catalog";
import { copy, categoryCopy } from "@/locales/fa";
import { Button } from "./primitives";
import { FigmaIcon } from "./source-icon";
import { VuesaxIcon } from "./vuesax-icon";

const categoryIcons = { all: "flash", halloween: "ghost", music: "music", art: "brush", books: "book", games: "game", coffee: "coffee", uncategorized: "flash" } as const;

export function Filters() {
  const params = useSearchParams();
  const fromMap = params.get("from") === "map";
  const mapParams = new URLSearchParams();
  if (params.get("intro") === "1") mapParams.set("intro", "1");
  if (params.get("layout") === "v2") mapParams.set("layout", "v2");
  const mapHref = `/map${mapParams.size ? `?${mapParams}` : ""}`;
  const { filters, updateFilters } = useEventBrowse();
  const { catalog } = useEventCatalog();
  const [draft, setDraft] = useState(filters);
  const [allCategories, setAllCategories] = useState(false);
  const navigate = useAppNavigate();
  const visibleCategories = allCategories ? categoryCopy : categoryCopy.filter((category, index) => index < 4 || category.id === draft.category);
  const cities = [...new Set(catalog?.events.map(event => event.city) ?? [])];
  // Keep an existing selection available while the catalog is loading or changes.
  if (draft.city !== "all" && draft.city !== "nearby" && !cities.includes(draft.city)) cities.push(draft.city);
  return <main className="el-filters"><header className="el-header el-filters-header">
    <AppLink href={fromMap ? mapHref : "/events"} className="el-icon-button" aria-label={copy.close}><FigmaIcon screen={34} name="x" /></AppLink>
    <h1>{copy.filters}</h1>
  </header><form onSubmit={e => { e.preventDefault(); updateFilters(draft); navigate(fromMap ? mapHref : "/events?view=all"); }}>
    <div className="el-filter-content">
      <div className="el-field"><label htmlFor="filter-dates">{copy.dates}</label><div className="el-filter-select"><select id="filter-dates" value={draft.when} onChange={e => setDraft({ ...draft, when: e.target.value })}><option value="all">{copy.allDays}</option><option value="today">{copy.today}</option><option value="week">{copy.week}</option></select><VuesaxIcon name="calendar" /></div></div>
      <fieldset><legend>{copy.categories}</legend><div className="el-filter-section-actions"><button type="button" className="el-text-action" aria-expanded={allCategories} aria-controls="filter-categories" onClick={() => setAllCategories(!allCategories)}>{allCategories ? copy.showLessProfile : copy.all}</button></div>
        <div className="el-choice-list" id="filter-categories">{visibleCategories.map(option => <label key={option.id} className={`el-choice${draft.category === option.id ? " selected" : ""}`}>
          <input type="radio" name="category" value={option.id} checked={draft.category === option.id} onChange={() => setDraft({ ...draft, category: option.id })} /><VuesaxIcon name={categoryIcons[option.id]} /><span className="el-filter-category-label">{option.label}</span><span className="el-filter-selection">{draft.category === option.id ? <FigmaIcon screen={34} name="check" /> : <span className="el-filter-dot" />}</span>
        </label>)}</div>
      </fieldset>
      <div className="el-field"><label htmlFor="filter-city">{copy.city}</label><div className="el-filter-select"><select id="filter-city" value={draft.city} onChange={e => setDraft({ ...draft, city: e.target.value })}><option value="all">{copy.allCities}</option>{draft.city === "nearby" && <option value="nearby">{copy.nearby}</option>}{cities.sort().map(city => <option key={city} value={city}>{city}</option>)}</select><VuesaxIcon name="location" /></div></div>
    </div><div className="el-action-footer"><Button type="submit">{copy.apply}</Button></div>
  </form></main>;
}
