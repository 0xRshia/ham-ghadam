import { LegalDocument } from "@/components/legal/legal-document";
import blocks from "@/locales/legal/terms.json";
import { TERMS_VERSION } from "@/lib/legal-versions";
export default function Page() { return <LegalDocument title="شرایط و مقررات استفاده از پلتفرم هم‌قدم" blocks={blocks} version={TERMS_VERSION} />; }
