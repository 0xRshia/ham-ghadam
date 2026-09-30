import { faContent } from "@/locales/domain-fa";
import { ArrowRight, ImageIcon, MapPin, ShieldCheck } from "lucide-react";
import { AppLink } from "@/components/event/app-navigation";
import layouts from "@/components/event/page-layouts.module.css";

export default function Credits() {
  return (
    <main data-motion-group className={`container subpage ${layouts.page} ${layouts.credits}`}>
      <AppLink className="back-link" href="/"><ArrowRight size={17} />{faContent.backToEvents}</AppLink>
      <header className={layouts.creditsIntro}>
        <span className="eyebrow">{faContent.transparencyEyebrow}</span>
        <h1>{faContent.eventsAndImages}</h1>
        <p>{faContent.attributionIntroduction}</p>
      </header>
      <section className={layouts.creditSection} aria-labelledby="sample-events-heading">
        <h2 id="sample-events-heading"><MapPin size={21} />{faContent.sampleTehranEvents}</h2>
        <p>
          {faContent.sampleEventsDisclaimer}</p>
      </section>
      <section className={layouts.creditSection} aria-labelledby="image-sources-heading">
        <h2 id="image-sources-heading"><ImageIcon size={21} />{faContent.imageSources}</h2>
        <ul>
          <li>
            <a href="https://commons.wikimedia.org/wiki/File:Sam_Cafe,_Tehran_(39662980492).jpg">
              {faContent.cafePhotoAttribution}</a>
            {faContent.licensedUnder}{" "}
            <a href="https://creativecommons.org/licenses/by/2.0/">{faContent.ccByLicense}</a>{faContent.cropDisclosure}</li>
          <li><a href="https://unsplash.com/photos/hands-shaping-clay-on-a-pottery-wheel-c4BwtY4L-hc">{faContent.potteryPhotoAttribution}</a></li>
          <li><a href="https://unsplash.com/photos/a-book-and-a-cup-of-coffee-on-a-table-9eppPl9-5T8">{faContent.booksPhotoAttribution}</a></li>
          <li><a href="https://unsplash.com/photos/a-close-up-of-a-board-game-on-a-table-nX5JRgNedCE">{faContent.boardGamesPhotoAttribution}</a></li>
        </ul>
      </section>
      <section className={layouts.creditSection} aria-labelledby="privacy-heading">
        <h2 id="privacy-heading"><ShieldCheck size={21} />{faContent.locationPrivacy}</h2>
        <p>
          {faContent.locationPrivacyDescription}</p>
      </section>
    </main>
  );
}
