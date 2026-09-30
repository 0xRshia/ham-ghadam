export type FaqContent = {
  eyebrow: string;
  title: string;
  intro: string;
  items: { question: string; answer: string }[];
};
export type AboutContent = {
  eyebrow: string;
  title: string;
  intro: string;
  sections: { heading: string; body: string }[];
};
export type ContactContent = {
  eyebrow: string;
  title: string;
  intro: string;
  email: string;
  phone: string;
  address: string;
};
export type SiteContent = {
  faq: FaqContent;
  about: AboutContent;
  contact: ContactContent;
};

export function parseContent<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
