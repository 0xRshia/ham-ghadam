"use client";

import { useState } from "react";
import { ChevronLeft, Coffee, MapPin, Utensils } from "lucide-react";
import { AppLink } from "@/components/event/app-navigation";
import { formatVenueDistance, getVenueDistanceKm, hasVenueCoordinates, type Venue, type VenuePosition } from "@/lib/venue-catalog";
import { VENUE_AMENITIES } from "@/lib/venue-filters";
import { fa } from "@/lib/types";
import { copy, venueFilterCopy } from "@/locales/fa";

const pageSize = 24;

function VenueThumbnail({ venue }: { venue: Venue }) {
  const Icon = venue.kinds.includes("cafe") ? Coffee : Utensils;
  return <>
    <Icon size={23} aria-hidden="true" />
    {/* Catalog media URLs are allowlisted by the importer. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {venue.image && <img src={venue.image} alt="" width={120} height={96} loading="lazy" decoding="async"
      referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />}
  </>;
}

type ShowVenueOnMap = (venue: Venue & VenuePosition) => void;

function VenueRating({ venue }: { venue: Venue }) {
  const rating = venue.reviewRating;
  const percent = rating ? `${fa(rating.likedPercent)}٪` : "—";
  const description = rating ? copy.venueRatingSummary(percent, fa(rating.reviewCount)) : copy.venueUnrated;
  return <span className="el-map-venue-rating" title={description}>
    <span className="el-sr-only">{description}</span>
    <strong aria-hidden="true">{percent}</strong>
    <small aria-hidden="true">{rating ? copy.venueLiked : copy.venueUnrated}</small>
  </span>;
}

function MapVenueCard({ venue, selected, distance, onShowOnMap }: {
  venue: Venue;
  selected: boolean;
  distance: number | null;
  onShowOnMap: ShowVenueOnMap;
}) {
  const href = `/cafes/${encodeURIComponent(venue.id)}?from=map`;
  const location = <><MapPin size={13} aria-hidden="true" /><span><bdi>{venue.address || copy.venueShowOnMap}</bdi></span></>;
  return <li data-venue-id={venue.id} className={selected ? "el-map-selected" : undefined}>
    <article className="el-event-list el-map-venue-card">
      <div className="el-event-image el-venue-thumbnail">
        <VenueThumbnail venue={venue} />
        <VenueRating venue={venue} />
      </div>
      <div className="el-event-copy">
        <h3><bdi>{venue.name}</bdi></h3>
        <div className="el-map-venue-meta">
          {distance !== null && <span className="el-venue-distance">{formatVenueDistance(distance)}</span>}
          {venue.menuUrl && <a href={venue.menuUrl} target="_blank" rel="noopener noreferrer">{copy.venueMenu}</a>}
        </div>
        <div className="el-event-bottom">
          {hasVenueCoordinates(venue)
            ? <button className="el-location" type="button" onClick={() => onShowOnMap(venue)}
                title={venue.address || copy.venueShowOnMap} aria-label={`${copy.venueShowOnMap}، ${venue.name}`}>{location}</button>
            : venue.address && <span className="el-location" title={venue.address}>{location}</span>}
          <AppLink className="el-button el-button-primary el-button-small" href={href}>{copy.venueDetails}</AppLink>
        </div>
      </div>
    </article>
  </li>;
}

export function VenueResults({ venues, selected, origin, onShowOnMap }: {
  venues: Venue[];
  selected?: string | null;
  origin?: VenuePosition | null;
  onShowOnMap?: ShowVenueOnMap;
}) {
  const [limit, setLimit] = useState(pageSize);
  const activeVenue = selected ? venues.find(venue => venue.id === selected) : undefined;
  const visible = activeVenue
    ? [activeVenue, ...venues.filter(venue => venue.id !== selected).slice(0, limit - 1)]
    : venues.slice(0, limit);

  return <>
    <ul className="el-venue-results">
      {visible.map(venue => {
        const id = encodeURIComponent(venue.id);
        const distance = getVenueDistanceKm(venue, origin);
        if (onShowOnMap) return <MapVenueCard key={venue.id} venue={venue} selected={selected === venue.id}
          distance={distance} onShowOnMap={onShowOnMap} />;
        const amenities = VENUE_AMENITIES.filter(amenity => venue.tags?.includes(amenity));
        return <li key={venue.id} data-venue-id={venue.id} className="el-venue-card">
          <div className="el-venue-thumbnail" aria-hidden="true">
            <VenueThumbnail venue={venue} />
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
              <AppLink className="el-venue-detail-link" href={`/cafes/${id}`}>{copy.venueDetails}<ChevronLeft size={14} aria-hidden="true" /></AppLink>
              {hasVenueCoordinates(venue) && <AppLink href={`/map?layer=places&venue=${id}`}>{copy.venueShowOnMap}</AppLink>}
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
