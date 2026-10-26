export type OrganizerPartyType = "individual" | "company";
export const organizerContractFields = [
  { key: "name", label: "نام و نام خانوادگی یا نام شخص حقوقی", max: 120, required: true },
  { key: "nationalId", label: "کد ملی یا شناسه ملی شخص حقوقی", max: 11, required: true, numeric: true },
  { key: "fatherName", label: "نام پدر", max: 80, required: true, party: "individual" },
  { key: "birthDate", label: "تاریخ تولد شمسی (۱۳۷۰/۰۱/۰۱)", max: 10, required: true, party: "individual", numeric: true },
  { key: "registrationNumber", label: "شماره ثبت", max: 30, required: true, party: "company" },
  { key: "representativeName", label: "نام نماینده مجاز امضاکننده", max: 120, required: true, party: "company" },
  { key: "representativeRole", label: "سمت نماینده", max: 100, required: true, party: "company" },
  { key: "address", label: "نشانی کامل", max: 500, required: true, wide: true },
  { key: "postalCode", label: "کد پستی", max: 10, required: true, numeric: true },
  { key: "email", label: "پست الکترونیکی رسمی", max: 254, required: true, type: "email" },
  { key: "phone", label: "شماره همراه رسمی برگزارکننده", max: 16, required: true, type: "tel" },
  { key: "executiveContact", label: "نام و شماره تماس نماینده اجرایی", max: 200, required: true },
  { key: "financialContact", label: "نام و شماره تماس نماینده مالی (اختیاری)", max: 200, required: false },
  { key: "accountHolder", label: "نام صاحب حساب (در صورت ثبت اطلاعات بانکی)", max: 120, required: false },
  { key: "bank", label: "نام بانک (در صورت ثبت اطلاعات بانکی)", max: 80, required: false },
  { key: "iban", label: "شماره شبا (در صورت ثبت اطلاعات بانکی)", max: 26, required: false },
] as const;
export type OrganizerContractField = typeof organizerContractFields[number]["key"];
export type OrganizerContractValues = Partial<Record<OrganizerContractField, string>> & { partyType: OrganizerPartyType };
