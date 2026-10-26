import { LegalDocument } from "@/components/legal/legal-document";
import blocks from "@/locales/legal/organizer-contract.json";
import { ORGANIZER_CONTRACT_VERSION } from "@/lib/legal-versions";
export default function Page() { return <><aside className="container" role="note" style={{paddingBlock:20}}>این متن، نسخهٔ ارسالی قرارداد است و مشخصات شرکت و بخش‌هایی از پیوست مالی هنوز تکمیل نشده‌اند. نرخ‌های پیشنهادی تا تأیید طرفین قطعی نیستند. ثبت پذیرش برگزارکننده به‌تنهایی امضای هم‌قدم یا تأیید شرایط تکمیل‌نشده نیست.</aside><LegalDocument title="قرارداد همکاری برگزارکنندگان هم‌قدم" blocks={blocks} version={ORGANIZER_CONTRACT_VERSION} /></>; }
