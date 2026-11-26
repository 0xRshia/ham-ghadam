export const eventApp = "https://app.hmghadam.com";
export const eventCalendar = `${eventApp}/events?view=all`;
export const eventMap = `${eventApp}/map`;
export const instagram = "https://www.instagram.com/hmghadam.app/";
export const themeStorageKey = "hmghadam.landing.theme";

export const topics = [
  { id: "art", title: "هنر و تجربه", action: "دیدن رویدادهای هنری" },
  { id: "music", title: "موسیقی", action: "دیدن برنامه‌های موسیقی" },
  { id: "books", title: "کتاب و گفت‌وگو", action: "دیدن دورهمی‌های کتاب" },
  { id: "games", title: "بازی و دورهمی", action: "دیدن دورهمی‌های بازی" },
  { id: "coffee", title: "قهوه و کافه", action: "دیدن قرارهای کافه" },
] as const;

export type Topic = typeof topics[number]["id"];
