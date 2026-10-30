const ENAMAD_ID = "8423175";
const ENAMAD_CODE = "A1UvI8w05HMyIWEwN1MaxYCYWW2gjDGA";
const LABEL = "نماد اعتماد الکترونیکی";

// Markup follows the snippet issued by enamad.ir: its verifier relies on the
// `origin` referrer policy and the non-standard `code` attribute on the image.
export function EnamadTrustSeal() {
  const query = `id=${ENAMAD_ID}&Code=${ENAMAD_CODE}`;
  return <a className="trust-seal" referrerPolicy="origin" target="_blank" href={`https://trustseal.enamad.ir/?${query}`} aria-label={LABEL}>
    <img referrerPolicy="origin" src={`https://trustseal.enamad.ir/logo.aspx?${query}`} alt={LABEL} width={125} height={136} loading="lazy" {...{ code: ENAMAD_CODE }} />
  </a>;
}
