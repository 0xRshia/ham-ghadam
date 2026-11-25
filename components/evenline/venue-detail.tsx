"use client";

import { BookOpen, MapPin } from "lucide-react";
import { useState } from "react";
import { AppLink } from "@/components/event/app-navigation";
import { useResource } from "@/hooks/use-resource";
import { hasVenueCoordinates, VENUE_CATALOG_URL, type VenueCatalog } from "@/lib/venue-catalog";
import { VENUE_AMENITIES } from "@/lib/venue-filters";
import { copy, venueFilterCopy } from "@/locales/fa";
import { ErrorState, Header, LoadingState } from "./primitives";
import styles from "./venue-detail.module.css";

function VenuePhoto({ image }: { image: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  // Catalog image URLs are allowlisted by the importer.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={styles.photo} src={image} alt="" width={800} height={450} decoding="async"
    referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

export function VenueDetail({ id, fromMap }: { id?: string; fromMap: boolean }) {
  const { data, error, loading, reload } = useResource<VenueCatalog>(id ? VENUE_CATALOG_URL : null);
  const venue = data?.venues.find(item => item.id === id);
  const mapHref = `/map?layer=places${id ? `&venue=${encodeURIComponent(id)}` : ""}`;
  const backHref = fromMap ? mapHref : "/cafes";
  if (!venue) {
    return <main dir="rtl">
      <Header title={copy.venueDetails} back={backHref} />
      {loading ? <LoadingState /> : error
        ? <ErrorState message={error} retry={reload} />
        : <ErrorState message="این مکان در فهرست پیدا نشد." />}
    </main>;
  }

  const hasCoordinates = hasVenueCoordinates(venue);
  const amenities = VENUE_AMENITIES.filter(amenity => venue.tags?.includes(amenity));
  const price = venue.priceLevel ? venueFilterCopy.priceLevels[venue.priceLevel - 1] : undefined;
  return <main className={styles.page} dir="rtl">
    <Header back={backHref} />
    <article className={styles.content} aria-labelledby="venue-title">
      <div className={styles.identity}>
        <p className={styles.kind}>{venue.kinds.map(kind => kind === "cafe" ? copy.cafe : copy.restaurant).join("، ")}</p>
        <h1 id="venue-title" dir="auto">{venue.name}</h1>
      </div>
      {venue.image && <VenuePhoto key={venue.image} image={venue.image} />}
      {venue.address && <section className={styles.section}>
        <h2>نشانی</h2>
        <p className={styles.address}><MapPin size={18} aria-hidden="true" /><span dir="auto">{venue.address}</span></p>
      </section>}
      {(hasCoordinates || venue.menuUrl) && <div className={styles.actions}>
        {hasCoordinates && <AppLink className="el-button el-button-primary" href={mapHref}>
          <MapPin size={18} aria-hidden="true" />{copy.venueShowOnMap}
        </AppLink>}
        {venue.menuUrl && <a className={`el-button el-button-${hasCoordinates ? "secondary" : "primary"}`}
          href={venue.menuUrl} target="_blank" rel="noopener noreferrer">
          <BookOpen size={18} aria-hidden="true" />{copy.venueMenu}
        </a>}
      </div>}
      {amenities.length > 0 && <section className={styles.section}>
        <h2>{venueFilterCopy.features}</h2>
        <ul className={styles.amenities}>
          {amenities.map(amenity => <li key={amenity}>{venueFilterCopy.amenities[amenity]}</li>)}
        </ul>
      </section>}
      {price && <dl className={styles.price}>
        <dt>{venueFilterCopy.priceLevel}</dt><dd>{price}</dd>
      </dl>}
    </article>
  </main>;
}
