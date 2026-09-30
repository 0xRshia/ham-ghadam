import { faContent } from "@/locales/domain-fa";
import { AtSign, MapPin, MessageSquare, Phone } from "lucide-react";
import { getSiteContent } from "@/lib/site-content";
import type { ContactContent } from "@/lib/content-shapes";
import { ContactForm } from "@/components/content/contact-form";
import styles from "@/components/content/site-pages.module.css";

export const metadata = { title: faContent.contactPageTitle };

export default async function ContactPage() {
  const content = await getSiteContent<ContactContent>("contact");
  const hasDetails = !!(content.email || content.phone || content.address);
  return <main className={`container ${styles.page}`}>
    <header className={styles.hero}>
      <span className={styles.eyebrow}><MessageSquare size={16} />{content.eyebrow}</span>
      <h1>{content.title}</h1><p>{content.intro}</p>
    </header>
    <div className={styles.contactLayout}>
      <section className={styles.contactPanel} aria-labelledby="contact-form-heading">
        <h2 id="contact-form-heading">{faContent.writeMessage}</h2><ContactForm />
      </section>
      <aside className={styles.contactAside}>
        <h2>{faContent.stayInTouch}</h2>
        <p>{faContent.contactReplyHint}</p>
        {hasDetails ? <ul className={styles.contactInfo}>
          {content.email && <li><a href={`mailto:${content.email}`}><AtSign size={18} />{content.email}</a></li>}
          {content.phone && <li><a href={`tel:${content.phone}`}><Phone size={18} />{content.phone}</a></li>}
          {content.address && <li><span><MapPin size={18} />{content.address}</span></li>}
        </ul> : <p>{faContent.contactTrackingHint}</p>}
      </aside>
    </div>
  </main>;
}
