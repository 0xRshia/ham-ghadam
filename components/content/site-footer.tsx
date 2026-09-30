import { faContent } from "@/locales/domain-fa";
import { ArrowLeft, MapPin } from "lucide-react";
import { AppLink } from "@/components/event/app-navigation";
import styles from "./site-footer.module.css";

export function SiteFooter() {
  return <footer className={styles.footer}>
    <div className={styles.inner}>
      <section className={styles.brandBlock}>
        <AppLink className={styles.brand} href="/">{faContent.appName}<span>{faContent.newExperiencesTagline}</span></AppLink>
        <p>{faContent.tagline}</p>
        <span className={styles.note}>{faContent.productDescription}</span>
      </section>
      <nav className={styles.links} aria-label={faContent.siteNavigation}>
        <h2>{faContent.appName}</h2>
        <AppLink href="/about">{faContent.aboutUs}</AppLink>
        <AppLink href="/blog">{faContent.magazine}</AppLink>
        <AppLink href="/credits">{faContent.sourcesTransparency}</AppLink>
      </nav>
      <nav className={styles.links} aria-label={faContent.helpSupport}>
        <h2>{faContent.helpSupport}</h2>
        <AppLink href="/faq">{faContent.frequentQuestions}</AppLink>
        <AppLink href="/contact">{faContent.contactUs}</AppLink>
        <AppLink href="/reservations">{faContent.myTickets}</AppLink>
      </nav>
      <div className={styles.contact}>
        <h2>{faContent.nextMeetupReady}</h2>
        <p>{faContent.newEventsCta}</p>
        <AppLink className={styles.discover} href="/">{faContent.goToEvents + " "}<ArrowLeft size={16} /></AppLink>
        <AppLink className={styles.social} href="/contact"><MapPin size={15} />{faContent.contactCta}</AppLink>
      </div>
    </div>
    <div className={styles.bottom}><span>{faContent.appName}</span><span>{faContent.experienceFooter}</span></div>
  </footer>;
}
