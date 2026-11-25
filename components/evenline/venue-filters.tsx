"use client";

import { countVenueFilters, INITIAL_VENUE_FILTERS, VENUE_AMENITIES, type VenueFilterState } from "@/lib/venue-filters";
import { copy, venueFilterCopy as labels } from "@/locales/fa";
import { Button } from "./primitives";
import { VuesaxIcon } from "./vuesax-icon";
import styles from "./venue-filters.module.css";

type VenueFiltersProps = {
  id?: string;
  filters: VenueFilterState;
  onChange: (filters: VenueFilterState) => void;
  facetsOnly?: boolean;
  canSortByDistance?: boolean;
  onApply?: () => void;
};

export function VenueFilters({ id, filters, onChange, facetsOnly = false, canSortByDistance = false, onApply }: VenueFiltersProps) {
  const reset = facetsOnly
    ? { ...INITIAL_VENUE_FILTERS, query: filters.query, sort: filters.sort }
    : INITIAL_VENUE_FILTERS;
  const activeCount = countVenueFilters(filters) - countVenueFilters(reset);
  return <form
    id={id}
    className={styles.form}
    aria-label={copy.venueFilters}
    dir="rtl"
    onSubmit={event => {
      event.preventDefault();
      onApply?.();
    }}
  >
    {!facetsOnly && <label className={styles.field}>
      {labels.search}
      <input
        type="search"
        placeholder={labels.searchPlaceholder}
        value={filters.query}
        onChange={event => onChange({ ...filters, query: event.target.value })}
      />
    </label>}

    <div className={styles.selects}>
      <label className={styles.field}>
        {labels.kind}
        <span className="el-filter-select">
          <select value={filters.kind} onChange={event => onChange({ ...filters, kind: event.target.value as VenueFilterState["kind"] })}>
            <option value="all">{labels.allKinds}</option>
            <option value="cafe">{copy.cafe}</option>
            <option value="restaurant">{copy.restaurant}</option>
          </select>
          <VuesaxIcon name="arrow-down" />
        </span>
      </label>
      <label className={styles.field}>
        {labels.priceLevel}
        <span className="el-filter-select">
          <select
            value={filters.priceLevel ?? ""}
            onChange={event => onChange({ ...filters, priceLevel: event.target.value === "" ? null : Number(event.target.value) })}
          >
            <option value="">{copy.anyPrice}</option>
            {labels.priceLevels.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
          </select>
          <VuesaxIcon name="arrow-down" />
        </span>
      </label>
    </div>

    <fieldset className={styles.amenities}>
      <legend>{labels.features}</legend>
      <div className={styles.options}>
        {VENUE_AMENITIES.map(amenity => <label key={amenity} className={styles.option}>
          <input
            type="checkbox"
            value={amenity}
            checked={filters.amenities.includes(amenity)}
            onChange={event => onChange({
              ...filters,
              amenities: event.target.checked
                ? [...filters.amenities, amenity]
                : filters.amenities.filter(selected => selected !== amenity),
            })}
          />
          {labels.amenities[amenity]}
        </label>)}
      </div>
    </fieldset>

    {!facetsOnly && <label className={styles.field}>
      {labels.sortLabel}
      <span className="el-filter-select">
        <select value={filters.sort} onChange={event => onChange({ ...filters, sort: event.target.value as VenueFilterState["sort"] })}>
          <option value="recommended">{labels.sort.recommended}</option>
          <option value="name">{labels.sort.name}</option>
          {(canSortByDistance || filters.sort === "distance") &&
            <option value="distance" disabled={!canSortByDistance}>{labels.sort.distance}</option>}
          <option value="price">{labels.sort.price}</option>
        </select>
        <VuesaxIcon name="arrow-down" />
      </span>
    </label>}

    <div className={styles.actions}>
      <button
        type="button"
        className="el-text-action"
        disabled={activeCount === 0}
        onClick={() => onChange(reset)}
      >{copy.reset}</button>
      {onApply && <Button type="submit" small>{labels.apply}</Button>}
    </div>
  </form>;
}
