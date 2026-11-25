"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";
import { eventMap } from "@/lib/landing-content";

const venues = [
  { id: "delgosha", name: "گالری دلگشا", district: "انقلاب", address: "خیابان دوازدهم فروردین، کوچهٔ نوروز، پلاک ۱۷", directions: "https://nshn.ir/f9_bvhZh0xOjyL" },
  { id: "degareh", name: "خونه‌کار دگره", district: "ایرانشهر", address: "خیابان قرنی، حسینعلی البرز، کوچهٔ گل", directions: "https://nshn.ir/_b_bvPemVxiGYb" },
  { id: "ghaf", name: "نگارخانه قاف", district: "پاسداران", address: "نگارستان هفتم (بهرام جعفر)، پلاک ۵۵", directions: "https://nshn.ir/_bv2Z_Qxu0y9" },
] as const;

export function Venues() {
  const [selected, setSelected] = useState(0);
  const venue = venues[selected];

  return <section id="places" className="wrap places-section" aria-labelledby="places-title">
    <div className="section-head">
      <h2 id="places-title">تهران روی نقشه</h2>
      <a className="inline-link" href={eventMap}>نقشهٔ همهٔ رویدادها <Icon name="chevron-left" className="ico" /></a>
    </div>
    <div className="places-panel">
      <div className="place-maps">
        <a className="city-summary" href={eventMap} aria-label="تهران، ایران؛ باز کردن نقشهٔ رویدادهای تهران">
          <span className="city-copy"><strong>تهران</strong><span>تهران، ایران</span></span>
          <span className="city-thumb" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 1.5a8.5 8.5 0 0 0-8.5 8.5c0 5.4 7.3 12.3 8 12.8a.8.8 0 0 0 1 0c.7-.5 8-7.4 8-12.8A8.5 8.5 0 0 0 12 1.5Z"/><circle cx="12" cy="10" r="3" fill="white"/></svg>
          </span>
        </a>
        <div className="street-map" data-place={venue.id} role="group" aria-label={`نقشهٔ محلهٔ ${venue.name}`}>
          <span className="map-pin" aria-hidden="true"><span /></span>
          <a className="map-route" href={venue.directions} aria-label={`مسیریابی به ${venue.name} در نشان`}>
            <span className="route-icon"><Icon name="directions" className="ico" /></span>
            <span className="route-copy"><strong>{venue.name}</strong><span>تهران، {venue.district}</span></span>
          </a>
          <a className="map-credit" dir="ltr" lang="en" href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>
        </div>
      </div>
      <div className="places-directory">
        <div className="map-guide">
          <span className="map-guide-art"><img src="/landing/fondogh-map.webp" alt="" width={960} height={384} loading="lazy" /></span>
          <p className="places-intro"><strong>کدوم محله بهت نزدیک‌تره؟</strong>یکی از این سه جا رو انتخاب کن تا نشونی و مسیرش رو ببینی.</p>
        </div>
        {venues.map((place, index) => <details className="venue" key={place.id} name="tehran-venue"
          id={`place-${place.id}`} open={index === selected} onToggle={event => {
            if (event.currentTarget.open) setSelected(index);
          }}>
          <summary><span className="venue-key" aria-hidden="true">{(index + 1).toLocaleString("fa-IR")}</span>
            <span className="venue-name">{place.name}</span><span className="district">{place.district}</span>
            <Icon name="chevron-left" className="ico" />
          </summary>
          <div className="venue-address"><p>{place.address}</p>
            <a href={place.directions}>مسیریابی در نشان <Icon name="arrow-up-left" className="ico" /></a>
          </div>
        </details>)}
      </div>
    </div>
  </section>;
}
