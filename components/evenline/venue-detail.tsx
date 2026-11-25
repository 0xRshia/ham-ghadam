"use client";

import { BookOpen, MapPin, Navigation, ThumbsUp, TramFront } from "lucide-react";
import { useState } from "react";
import { AppLink } from "@/components/event/app-navigation";
import { googleMapsUrl } from "@/lib/google-maps";
import { isManshaVenue, manshaMenuPath } from "@/lib/mansha-navigation";
import type { MapConfiguration } from "@/lib/map-configuration";
import { fa } from "@/lib/types";
import { hasVenueCoordinates } from "@/lib/venue-catalog";
import { VENUE_AMENITIES } from "@/lib/venue-filters";
import type { VenueProfile } from "@/lib/venue-profile";
import { copy, venueFilterCopy } from "@/locales/fa";
import { MapAttribution, MapPreview } from "./map-preview";
import { Header } from "./primitives";
import styles from "./venue-detail.module.css";

function VenueGallery({ venue }: { venue: VenueProfile }) {
  const [selected, select] = useState<string>();
  const [failed, setFailed] = useState<string[]>([]);
  const originals = (venue.photos ?? []).filter(url => !failed.includes(url));
  const photos = originals.length ? originals : venue.image && !failed.includes(venue.image) ? [venue.image] : [];
  const active = selected && photos.includes(selected) ? selected : photos[0];
  if (!active) return null;
  const title = (index: number) => `عکس ${fa(index + 1)} از ${venue.name}`;
  return <div className={styles.gallery} role="group" aria-label={`تصاویر ${venue.name}`}>
    <div className="el-detail-hero">
      {/* The importer restricts originals and thumbnails to the public venue-photo collection. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={active} alt={title(photos.indexOf(active))} width={800} height={588}
        decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(items => [...items, active])} />
    </div>
    {photos.length > 1 && <div className={styles.thumbs}>
      {photos.map((url, index) => <button type="button" key={url} aria-label={title(index)}
        aria-pressed={url === active} onClick={() => select(url)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
          onError={() => setFailed(items => [...items, url])} />
      </button>)}
    </div>}
  </div>;
}

export function VenueDetail({ venue, fromMap, configuration }: {
  venue: VenueProfile;
  fromMap: boolean;
  configuration: MapConfiguration;
}) {
  const mapHref = `/map?layer=places&venue=${encodeURIComponent(venue.id)}`;
  const located = hasVenueCoordinates(venue);
  const amenities = VENUE_AMENITIES.filter(amenity => venue.tags?.includes(amenity));
  const price = venue.priceLevel ? venueFilterCopy.priceLevels[venue.priceLevel - 1] : undefined;
  const rating = venue.reviewRating;
  const internalMenu = isManshaVenue(venue.name);
  return <main className="el-detail" dir="rtl">
    <Header back={fromMap ? mapHref : "/cafes"} />
    <article className={`el-detail-content ${styles.content}`} aria-labelledby="venue-title">
      <VenueGallery venue={venue} />
      <header className={styles.identity}>
        <div className={styles.kinds}>{venue.kinds.map(kind => kind === "cafe" ? copy.cafe : copy.restaurant).join("، ")}</div>
        <h1 id="venue-title"><bdi>{venue.name}</bdi></h1>
        {(rating || price) && <div className={styles.summary}>
          {rating && <span><ThumbsUp size={16} aria-hidden="true"/>{copy.venueRatingSummary(`${fa(rating.likedPercent)}٪`, fa(rating.reviewCount))}</span>}
          {price && <span>{venueFilterCopy.priceLevel} · {price}</span>}
        </div>}
      </header>
      {(internalMenu || venue.menuUrl) && <div className={styles.menu}>
        {internalMenu
          ? <AppLink href={manshaMenuPath} className="el-button el-button-primary"><BookOpen size={18} />منو و سفارش</AppLink>
          : <a href={venue.menuUrl} className="el-button el-button-primary" target="_blank" rel="noopener noreferrer"><BookOpen size={18} />مشاهدهٔ منو</a>}
      </div>}
      {amenities.length > 0 && <section className="el-detail-section">
        <h2>{venueFilterCopy.features}</h2>
        <ul className="el-venue-features">
          {amenities.map(amenity => <li key={amenity}>{venueFilterCopy.amenities[amenity]}</li>)}
        </ul>
      </section>}
      {(venue.address || venue.metro || located) && <section className="el-detail-section el-detail-location">
        <h2>نشانی و دسترسی</h2>
        {venue.address && <p className={styles.location}><MapPin size={19}/><bdi>{venue.address}</bdi></p>}
        {venue.metro && <div className={styles.metro}>
          <TramFront size={19}/><div><span>نزدیک‌ترین ایستگاه مترو</span><strong>{venue.metro.name}</strong>
          {venue.metro.lines.length > 0 && <small>خط {venue.metro.lines.map(line => fa(line)).join(" و ")}</small>}</div>
        </div>}
        {located && <>
          <div className="el-venue-map"><MapPreview lat={venue.lat} lng={venue.lng} configuration={configuration} /></div>
          <MapAttribution configuration={configuration} />
          <div className={styles.actions}>
            <AppLink className="el-button el-button-secondary" href={mapHref}><MapPin size={18} />{copy.venueShowOnMap}</AppLink>
            <a className={styles.directions} href={googleMapsUrl(venue.lat, venue.lng)} target="_blank" rel="noopener noreferrer"><Navigation size={17} />نقشهٔ گوگل</a>
          </div>
        </>}
      </section>}
    </article>
  </main>;
}
