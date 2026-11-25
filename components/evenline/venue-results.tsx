"use client";

import { useState } from "react";
import { Coffee, MapPin, Utensils } from "lucide-react";
import { AppLink } from "@/components/event/app-navigation";
import { hasVenueCoordinates, type Venue } from "@/lib/venue-catalog";
import { copy } from "@/locales/fa";

const pageSize = 24;

export function VenueResults({ venues, selected, onShowOnMap }: {
  venues: Venue[];
  selected?: string | null;
  onShowOnMap?: (venue: Venue & { lat: number; lng: number }) => void;
}) {
  const [limit, setLimit] = useState(pageSize);
  const activeVenue = selected ? venues.find(venue => venue.id === selected) : undefined;
  const visible = activeVenue
    ? [activeVenue, ...venues.filter(venue => venue.id !== selected).slice(0, limit - 1)]
    : venues.slice(0, limit);

  return <>
    <ul className="el-venue-results">
      {visible.map(venue => {
        const Icon = venue.kinds.includes("cafe") ? Coffee : Utensils;
        return <li key={venue.id} data-venue-id={venue.id} className={`el-venue-card${selected === venue.id ? " el-map-selected" : ""}`}>
          <div className="el-venue-thumbnail" aria-hidden="true">
            <Icon size={23} />
            {/* Catalog media URLs are allowlisted by the importer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {venue.image && <img src={venue.image} alt="" width={104} height={104} loading="lazy" decoding="async" onError={event => { event.currentTarget.hidden = true; }} />}
          </div>
          <div className="el-venue-card-copy">
            <p className="el-venue-type">{venue.kinds.map(kind => kind === "cafe" ? copy.cafe : copy.restaurant).join("، ")}</p>
            <h3 dir="auto">{venue.name}</h3>
            {venue.address && <p className="el-venue-address"><MapPin size={14} aria-hidden="true" /><span dir="auto">{venue.address}</span></p>}
            <div className="el-venue-actions">
              {hasVenueCoordinates(venue) && (onShowOnMap
                ? <button type="button" className="el-text-action" onClick={() => onShowOnMap(venue)}>{copy.venueShowOnMap}</button>
                : <AppLink className="el-text-action" href={`/map?layer=places&venue=${encodeURIComponent(venue.id)}`}>{copy.venueShowOnMap}</AppLink>)}
              {venue.menuUrl && <a className="el-text-action" href={venue.menuUrl} target="_blank" rel="noopener noreferrer">{copy.venueMenu}</a>}
              {venue.url && <a className="el-text-action" href={venue.url} target="_blank" rel="noopener noreferrer">{copy.venueDetails}</a>}
            </div>
          </div>
        </li>;
      })}
    </ul>
    {venues.length > limit && <button type="button" className="el-text-action el-venue-more" onClick={() => setLimit(value => value + pageSize)}>{copy.venueShowMore}</button>}
  </>;
}
