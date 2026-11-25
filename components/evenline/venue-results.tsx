"use client";

import { useState } from "react";
import { ChevronLeft, Coffee, MapPin, Utensils } from "lucide-react";
import { AppLink } from "@/components/event/app-navigation";
import { formatVenueDistance, getVenueDistanceKm, hasVenueCoordinates, type Venue, type VenuePosition } from "@/lib/venue-catalog";
import { VENUE_AMENITIES } from "@/lib/venue-filters";
import { fa } from "@/lib/types";
import { copy, venueFilterCopy } from "@/locales/fa";

const pageSize = 24;

export function VenueResults({ venues, selected, origin, onShowOnMap }: {
  venues: Venue[];
  selected?: string | null;
  origin?: VenuePosition | null;
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
        const id = encodeURIComponent(venue.id);
        const distance = getVenueDistanceKm(venue, origin);
        const amenities = VENUE_AMENITIES.filter(amenity => venue.tags?.includes(amenity));
        const detailHref = `/cafes/${id}${onShowOnMap ? "?from=map" : ""}`;
        return <li key={venue.id} data-venue-id={venue.id} className={`el-venue-card${selected === venue.id ? " el-map-selected" : ""}`}>
          <div className="el-venue-thumbnail" aria-hidden="true">
            <Icon size={23} />
            {/* Catalog media URLs are allowlisted by the importer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {venue.image && <img src={venue.image} alt="" width={120} height={96} loading="lazy" decoding="async"
              referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />}
          </div>
          <div className="el-venue-card-copy">
            <h3><bdi>{venue.name}</bdi></h3>
            <p className="el-venue-meta">
              <span>{venue.kinds.map(kind => kind === "cafe" ? copy.cafe : copy.restaurant).join("، ")}</span>
              {distance !== null && <span className="el-venue-distance"><MapPin size={13} aria-hidden="true" />
                {formatVenueDistance(distance)}</span>}
            </p>
            {venue.address && <p className="el-venue-card-address" title={venue.address}><bdi>{venue.address}</bdi></p>}
            <div className="el-venue-actions">
              <AppLink className="el-venue-detail-link" href={detailHref}>{copy.venueDetails}<ChevronLeft size={14} aria-hidden="true" /></AppLink>
              {hasVenueCoordinates(venue) && (onShowOnMap
                ? <button type="button" onClick={() => onShowOnMap(venue)}>{copy.venueShowOnMap}</button>
                : <AppLink href={`/map?layer=places&venue=${id}`}>{copy.venueShowOnMap}</AppLink>)}
              {venue.menuUrl && <a href={venue.menuUrl} target="_blank" rel="noopener noreferrer">{copy.venueMenu}</a>}
            </div>
          </div>
          {amenities.length > 0 && <ul className="el-venue-features" aria-label={venueFilterCopy.features}>
            {amenities.slice(0, 3).map(amenity => <li key={amenity}>{venueFilterCopy.amenities[amenity]}</li>)}
            {amenities.length > 3 && <li className="el-venue-more-features"><bdi>+{fa(amenities.length - 3)}</bdi></li>}
          </ul>}
        </li>;
      })}
    </ul>
    {venues.length > limit && <button type="button" className="el-text-action el-venue-more" onClick={() => setLimit(value => value + pageSize)}>{copy.venueShowMore}</button>}
  </>;
}
