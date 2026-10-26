"use client";
import { useState } from "react";
import { ORGANIZER_CONTRACT_VERSION } from "@/lib/legal-versions";
import { organizerContractFields, type OrganizerContractValues } from "@/lib/organizer-contract-fields";
import styles from "./legal.module.css";

export function organizerAgreementFromForm(form: FormData) {
  return { accepted: form.get("contract_accepted") === "on", version: ORGANIZER_CONTRACT_VERSION,
    partyType: form.get("contract_partyType"), ...Object.fromEntries(organizerContractFields.map(field => [field.key, form.get(`contract_${field.key}`)])) };
}
export function OrganizerAgreementFields({ disabled, initial }: { disabled?: boolean; initial?: OrganizerContractValues }) {
  const [party, setParty] = useState(initial?.partyType ?? "individual");
  return <fieldset className={styles.agreement} disabled={disabled}>
    <legend>اطلاعات و قرارداد برگزارکننده</legend>
    <p className={styles.note}>مشخصات رویداد از همین فرم در سابقهٔ پذیرش ثبت می‌شود. اطلاعات هویتی قرارداد عمومی نیست. اطلاعات بانکی برای انتشار اطلاع‌رسانی الزامی نیست؛ در صورت ورود، هر سه فیلد را کامل کنید.</p>
    <div className={styles.fields}>
      <label>نوع طرف قرارداد<select name="contract_partyType" value={party} onChange={event => setParty(event.target.value as typeof party)}><option value="individual">شخص حقیقی</option><option value="company">شخص حقوقی</option></select></label>
      {organizerContractFields.filter(field => !("party" in field) || field.party === party).map(field => <label key={field.key} className={"wide" in field ? styles.wide : undefined}>{field.label}<input name={`contract_${field.key}`} required={field.required} maxLength={field.max} defaultValue={initial?.[field.key] ?? ""} type={"type" in field ? field.type : "text"} inputMode={"numeric" in field && field.key !== "birthDate" ? "numeric" : undefined} dir={"numeric" in field || "type" in field || field.key === "iban" ? "ltr" : undefined} /></label>)}
    </div>
    <p className={styles.note}>متن ارسالی قرارداد شامل قسمت‌های تکمیل‌نشدهٔ شرکت و پیوست مالی است. پذیرش شما و مشخصات ثبت می‌شوند؛ شرایط مالی یا امضای هم‌قدم از این فرم ایجاد نمی‌شود. سفارش خدمات تبلیغاتی و ارائه مدارک حسب مورد جداگانه پیگیری می‌شود.</p>
    <label className={styles.consent}><input name="contract_accepted" type="checkbox" required /><span><a href="/host/contract" target="_blank" rel="noreferrer">متن قرارداد همکاری برگزارکنندگان</a> را مطالعه کرده‌ام، مفاد مربوط به خود را می‌پذیرم و صحت اطلاعات و اختیار قانونی خود را تأیید می‌کنم.</span></label>
  </fieldset>;
}
