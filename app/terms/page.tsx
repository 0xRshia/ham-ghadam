import { LegalDocument } from "@/components/legal/legal-document";
import { EnamadTrustSeal } from "@/components/content/enamad-trust-seal";
import blocks from "@/locales/legal/terms.json";
import { TERMS_VERSION } from "@/lib/legal-versions";
import styles from "@/components/legal/legal.module.css";
export default function Page() { return <LegalDocument title="شرایط و مقررات استفاده از پلتفرم هم‌قدم" blocks={blocks} version={TERMS_VERSION}><EnamadTrustSeal className={styles.trustSeal} /></LegalDocument>; }
