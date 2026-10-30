import { faContent } from "@/locales/domain-fa";
import styles from "./enamad-trust-seal.module.css";

const ENAMAD_ID = "8423175";
const ENAMAD_CODE = "A1UvI8w05HMyIWEwN1MaxYCYWW2gjDGA";

// Markup follows the snippet issued by enamad.ir: its verifier relies on the
// `origin` referrer policy and the non-standard `code` attribute on the image.
export function EnamadTrustSeal({ className }: { className?: string }) {
  const query = `id=${ENAMAD_ID}&Code=${ENAMAD_CODE}`;
  return <a className={className ? `${styles.seal} ${className}` : styles.seal} referrerPolicy="origin" target="_blank" href={`https://trustseal.enamad.ir/?${query}`} aria-label={faContent.enamadTrustSeal}>
    <img referrerPolicy="origin" src={`https://trustseal.enamad.ir/logo.aspx?${query}`} alt={faContent.enamadTrustSeal} width={125} height={136} loading="lazy" {...{ code: ENAMAD_CODE }} />
  </a>;
}
