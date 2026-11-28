import { centerPhonePosters, isPhonePosterLayout, watchPhonePosters } from "./phone-posters.js";

const appOrigin = "https://app.hmghadam.com";
const events = [
  {
    title: "زیر نیم کاسه (نمایشگاه)", id: "9d11bd86-2f20-466d-81e2-49c90cbb8d07", poster: "delgosha",
    kind: "نمایشگاه نقاشی", venue: "گالری دلگشا", topics: ["art"],
    startDay: "۱۱", startMonth: "آبان", day: "۱۳", month: "آذر", hours: "۱۶:۰۰ تا ۲۰:۰۰", endDate: "2026-12-04T20:00:00+03:30"
  },
  {
    title: "خاطرم سرشار باد (نمایشگاه)", id: "cf207eab-61b5-4340-ab98-c5e56a7e1bd9", poster: "khateram",
    kind: "نمایشگاه", venue: "گالری ایرانشهر", topics: ["art"],
    startDay: "۲۵", startMonth: "آبان", day: "۲۲", month: "آذر", hours: "۰۹:۰۰ تا ۲۱:۰۰", endDate: "2026-12-13T21:00:00+03:30"
  },
  {
    title: "جان اشیا (نمایشگاه)", id: "addf0a86-78a4-4759-8c53-49ab3dd0fa1e", poster: "jan-ashya",
    kind: "نمایشگاه", venue: "نگارخانه لاله", topics: ["art"],
    startDay: "۲۵", startMonth: "آبان", day: "۱۵", month: "آذر", hours: "۱۰:۰۰ تا ۱۸:۰۰", endDate: "2026-12-06T18:00:00+03:30"
  },
  {
    title: "نشست‌های لذت به مثابه هسته سخت", id: "4b53d2b3-0a6c-4a10-878a-33a9263943d4", poster: "degareh",
    kind: "نشست گفت‌وگو", venue: "خونه‌کار دگره", topics: ["books"],
    startDay: "۲۰", startMonth: "آبان", day: "۹", month: "دی", hours: "۱۷:۰۰ تا ۲۱:۰۰", endDate: "2026-12-30T21:00:00+03:30"
  },
  {
    title: "پرده سوم (نمایشگاه)", id: "a6fac8b3-b62b-4fbf-8a5a-432606fb74b7", poster: "ghaf",
    kind: "نمایشگاه گروهی", venue: "نگارخانه قاف", topics: ["coffee", "art"],
    startDay: "۲۵", startMonth: "آبان", day: "۶", month: "آذر", hours: "۱۶:۰۰ تا ۲۰:۰۰", endDate: "2026-11-27T20:00:00+03:30"
  },
  {
    title: "منشا ارواح (رویداد ویژه همقدم)", id: "73e8c6e0-8a8e-4514-bd05-085bbd8923ef", poster: "mansha",
    kind: "رویداد ویژهٔ هم‌قدم", venue: "عمارت منشا", topics: [], singleDay: true,
    day: "۵", month: "آذر", hours: "۱۹:۰۰ تا ۲۲:۰۰", endDate: "2026-11-26T22:00:00+03:30"
  }
];

const form = document.getElementById("event-search");
const input = document.getElementById("search-input");
const clear = document.getElementById("clear-search");
const tablist = document.getElementById("topics");
const tabs = Array.from(tablist.querySelectorAll("[data-topic]"));
const topicNames = new Map(tabs.map(tab => [tab.dataset.topic, tab.textContent.trim()]));
const results = document.getElementById("results");
const content = document.getElementById("result-content");
const status = document.getElementById("result-status");
const section = document.getElementById("experiences");
const eventTemplate = document.getElementById("event-template");
const emptyTemplate = document.getElementById("empty-template");
const alternativesTemplate = document.getElementById("other-events-template");
const themeToggle = document.getElementById("theme-toggle");
const themePreference = "hmghadam.landing.theme";
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
let activeTopic = topicFromAddress();
let expiryTimer;

function normalizeText(value) {
  return value.normalize("NFKC").toLowerCase()
    .replace(/[\u064b-\u065f\u0670\u0640]/gu, "")
    .replace(/[يى]/gu, "ی").replace(/ك/gu, "ک").replace(/[أإآ]/gu, "ا")
    .replace(/[۰-۹]/gu, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/gu, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/گفت *و *گو/gu, "گفتگو").trim();
}

function topicFromAddress() {
  const key = location.hash.slice("#topic-".length);
  return location.hash.startsWith("#topic-") && topicNames.has(key) ? key : "all";
}

function matchesQuery(event, terms) {
  const topicText = event.topics.map(key => topicNames.get(key)).join(" ");
  const text = normalizeText([event.title, event.kind, event.venue, "تهران", topicText,
    event.startDay, event.startMonth, event.day, event.month, event.hours, event.hours.replaceAll(":۰۰", "")].join(" "));
  const compact = text.replaceAll(" ", "");
  return terms.every(term => text.includes(term) || compact.includes(term));
}

function eventCard(event) {
  const card = eventTemplate.content.firstElementChild.cloneNode(true);
  card.href = appOrigin + "/events/" + event.id;
  const end = event.day + " " + event.month;
  const start = event.startDay && event.startMonth;
  const date = start ? "از " + event.startDay + " " + event.startMonth + " تا " + end : (event.singleDay ? "" : "تا ") + end;
  card.setAttribute("aria-label", event.title + "، تهران، " + event.venue + "، " + date + "، ساعت " + event.hours + "، جزئیات رویداد");
  card.querySelector(".poster").src = "hamghadam-landing/assets/event-" + event.poster + ".webp";
  const badge = card.querySelector(".date-badge");
  badge.querySelector("strong").textContent = start ? event.startDay + "–" + event.day : (event.singleDay ? "" : "تا ") + event.day;
  badge.querySelector("span").textContent = start && event.startMonth !== event.month ? event.startMonth + "–" + event.month : event.month;
  card.querySelector("h3").textContent = event.title;
  card.querySelector(".hours").textContent = event.hours;
  return card;
}

function eventCollection(records, compact) {
  const collection = document.createElement("div");
  collection.className = compact ? "event-list" : "event-carousel";
  collection.append(...records.map(eventCard));
  if (!compact) {
    collection.setAttribute("role", "group");
    collection.setAttribute("aria-label", "پوستر رویدادها");
    collection.addEventListener("keydown", event => {
      const cards = Array.from(collection.children);
      const current = cards.indexOf(event.target);
      const next = rtlTabDestination(event.key, current, cards.length);
      if (current >= 0 && next !== undefined) {
        event.preventDefault();
        cards[next].focus({preventScroll: true});
        cards[next].scrollIntoView({block: "nearest", inline: "nearest"});
      }
    });
  }
  return collection;
}

function emptyState(hasCriteria) {
  const state = emptyTemplate.content.firstElementChild.cloneNode(true);
  let title = "قرار بعدی‌ات رو توی تقویم پیدا کن.";
  if (input.value.trim()) title = "توی گزیده‌ها نتیجه‌ای برای این جست‌وجو پیدا نشد.";
  else if (activeTopic !== "all") title = "فعلاً رویدادی در گزیده‌های «" + topicNames.get(activeTopic) + "» نداریم.";
  state.querySelector("h3").textContent = title;
  state.querySelector("p").textContent = hasCriteria
    ? "یه موضوع دیگه رو امتحان کنیم؟ می‌تونی فیلترها رو پاک کنی یا تقویم کامل رو ببینی."
    : "برای دیدن تازه‌ترین برنامه‌ها، به تقویم هم‌قدم سر بزن.";
  const reset = state.querySelector(".reset-filter");
  reset.hidden = !hasCriteria;
  reset.addEventListener("click", () => {
    input.value = "";
    selectTopic("all");
    input.focus({preventScroll: true});
  });
  state.querySelector("a").href = hasCriteria ? appOrigin + "/events" : appOrigin + "/events?view=all";
  return state;
}

function render(announce = false) {
  const now = Date.now();
  const terms = normalizeText(input.value).split(" ").filter(Boolean);
  const available = events.filter(event => Date.parse(event.endDate) > now);
  const selected = available.filter(event =>
    (activeTopic === "all" || event.topics.includes(activeTopic)) && matchesQuery(event, terms)
  );
  for (const tab of tabs) {
    const active = tab.dataset.topic === activeTopic;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  results.setAttribute("aria-labelledby", "tab-" + activeTopic);
  clear.hidden = input.value.length === 0;
  const showAlternatives = !selected.length && available.length > 0;
  const hasCriteria = activeTopic !== "all" || Boolean(input.value.trim());
  if (selected.length) {
    content.replaceChildren(eventCollection(selected, hasCriteria));
  } else {
    content.replaceChildren(emptyState(hasCriteria));
    if (showAlternatives) {
      const others = alternativesTemplate.content.firstElementChild.cloneNode(true);
      others.append(eventCollection(available, false));
      content.append(others);
    }
  }
  if (announce) {
    status.textContent = selected.length.toLocaleString("fa-IR") + " رویداد در «" + topicNames.get(activeTopic) + "»."
      + (showAlternatives ? " پیشنهادهای دیگر تهران در ادامه آمده‌اند." : "");
  }
  clearTimeout(expiryTimer);
  if (available.length) {
    const next = Math.min(...available.map(event => Date.parse(event.endDate)));
    expiryTimer = setTimeout(() => render(), Math.min(next - now + 100, 2147483647));
  }
}

function selectTopic(key) {
  if (key !== activeTopic) {
    const hash = "#topic-" + key;
    try { history.pushState(null, "", hash); } catch { location.hash = hash; }
    activeTopic = key;
  }
  render(true);
}

function plainClick(event) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function rtlTabDestination(key, index, length) {
  return {
    ArrowLeft: (index + 1) % length,
    ArrowRight: (index - 1 + length) % length,
    Home: 0,
    End: length - 1
  }[key];
}

tablist.setAttribute("role", "tablist");
results.setAttribute("role", "tabpanel");
for (const [index, tab] of tabs.entries()) {
  tab.href = "#topic-" + tab.dataset.topic;
  tab.setAttribute("role", "tab");
  tab.setAttribute("aria-controls", "results");
  tab.addEventListener("click", event => {
    if (!plainClick(event)) return;
    event.preventDefault();
    selectTopic(tab.dataset.topic);
  });
  tab.addEventListener("keydown", event => {
    const next = rtlTabDestination(event.key, index, tabs.length);
    if (next !== undefined) {
      event.preventDefault();
      selectTopic(tabs[next].dataset.topic);
      tabs[next].focus({preventScroll: true});
      tabs[next].scrollIntoView({block: "nearest", inline: "nearest"});
    } else if (event.key === " ") {
      event.preventDefault();
      selectTopic(tab.dataset.topic);
    }
  });
}

const wall = document.querySelector(".poster-wall");
const stage = document.getElementById("poster-stage");
const track = document.getElementById("fan-track");
const posters = Array.from(track.querySelectorAll("[data-topic-key]"));
const previous = wall.querySelector(".flip-prev");
const next = wall.querySelector(".flip-next");
const destination = document.getElementById("poster-go");
const selection = document.getElementById("poster-selection");
const announcement = document.getElementById("poster-announcement");
const halfway = Math.floor(posters.length / 2);
let currentPoster = 0;

function posterIndex(index) {
  return (index + posters.length) % posters.length;
}

function showPoster(index, focus = false, announce = false) {
  currentPoster = posterIndex(index);
  posters.forEach((poster, position) => {
    // Negative slots sit on the left. In RTL, that is the next topic.
    const slot = halfway - posterIndex(position - currentPoster + halfway);
    const wrapped = Math.abs(Number(poster.dataset.slot) - slot) > halfway;
    poster.classList.toggle("wrap-slot", wrapped);
    poster.dataset.slot = String(slot);
    poster.setAttribute("aria-selected", String(position === currentPoster));
    poster.tabIndex = position === currentPoster ? 0 : -1;
  });
  const active = posters[currentPoster];
  destination.href = "#topic-" + active.dataset.topicKey;
  destination.querySelector("span").textContent = active.dataset.action;
  selection.setAttribute("aria-labelledby", active.id);
  if (focus) active.focus({preventScroll: true});
  centerPhonePosters(track);
  if (announce) {
    announcement.textContent = topicNames.get(active.dataset.topicKey) + "، پوستر "
      + (currentPoster + 1).toLocaleString("fa-IR") + " از " + posters.length.toLocaleString("fa-IR");
  }
}

track.setAttribute("role", "tablist");
selection.setAttribute("role", "tabpanel");
posters.forEach((poster, index) => {
  poster.setAttribute("role", "tab");
  poster.setAttribute("aria-controls", selection.id);
  poster.href = "#topic-" + poster.dataset.topicKey;
  poster.addEventListener("click", event => {
    if (!plainClick(event)) return;
    event.preventDefault();
    showPoster(index);
  });
  poster.addEventListener("keydown", event => {
    const target = rtlTabDestination(event.key, index, posters.length);
    if (target !== undefined || event.key === " ") {
      event.preventDefault();
      showPoster(target ?? index, true);
    }
  });
});
previous.hidden = next.hidden = false;
previous.addEventListener("click", () => showPoster(currentPoster - 1, false, true));
next.addEventListener("click", () => showPoster(currentPoster + 1, false, true));

destination.addEventListener("click", event => {
  if (!plainClick(event)) return;
  event.preventDefault();
  const key = posters[currentPoster].dataset.topicKey;
  input.value = "";
  selectTopic(key);
  document.getElementById("tab-" + key).focus({preventScroll: true});
  section.scrollIntoView({block: "start"});
});

function previewAddressTopic() {
  const index = posters.findIndex(poster => poster.dataset.topicKey === activeTopic);
  showPoster(index >= 0 ? index : 0);
}
previewAddressTopic();
watchPhonePosters(track, direction => showPoster(currentPoster + direction, false, true));
wall.classList.add("wall-ready");

let gesture = null;
let ignoreDragClick = false;
stage.addEventListener("dragstart", event => event.preventDefault());
stage.addEventListener("pointerdown", event => {
  if (isPhonePosterLayout()) return;
  if (!event.isPrimary || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  gesture = {id: event.pointerId, x: event.clientX, y: event.clientY, moving: false};
});
stage.addEventListener("pointermove", event => {
  if (!gesture || gesture.id !== event.pointerId) return;
  const dx = event.clientX - gesture.x;
  const dy = event.clientY - gesture.y;
  if (!gesture.moving) {
    if (Math.abs(dy) > 9 && Math.abs(dy) > Math.abs(dx)) {
      gesture = null;
      return;
    }
    if (Math.abs(dx) < 7 || Math.abs(dx) < 1.25 * Math.abs(dy)) return;
    gesture.moving = true;
    stage.setPointerCapture(event.pointerId);
    stage.classList.add("dragging");
  }
  const offset = Math.max(-75, Math.min(75, dx * .38));
  track.style.setProperty("--drag-shift", offset + "px");
});
function finishDrag() {
  gesture = null;
  stage.classList.remove("dragging");
  track.style.removeProperty("--drag-shift");
}
stage.addEventListener("pointerup", event => {
  if (!gesture || gesture.id !== event.pointerId) return;
  const dx = event.clientX - gesture.x;
  if (gesture.moving) {
    ignoreDragClick = true;
    setTimeout(() => { ignoreDragClick = false; }, 0);
    const threshold = Math.max(36, Math.min(75, stage.clientWidth * .11));
    if (Math.abs(dx) >= threshold) showPoster(currentPoster + (dx > 0 ? 1 : -1), false, true);
  }
  finishDrag();
});
stage.addEventListener("pointercancel", finishDrag);
stage.addEventListener("lostpointercapture", finishDrag);
stage.addEventListener("pointerleave", () => { if (gesture && !gesture.moving) finishDrag(); });
stage.addEventListener("click", event => {
  if (ignoreDragClick) {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);



form.hidden = false;
input.addEventListener("input", () => render(true));
form.addEventListener("submit", event => {
  event.preventDefault();
  render(true);
  results.focus({preventScroll: true});
  results.scrollIntoView({block: "nearest"});
});
clear.addEventListener("click", () => {
  input.value = "";
  render(true);
  input.focus();
});
window.addEventListener("hashchange", () => {
  if (location.hash.startsWith("#topic-") || ["", "#top", "#experiences"].includes(location.hash)) {
    activeTopic = topicFromAddress();
    previewAddressTopic();
    render(true);
  }
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) render();
});

for (const card of document.querySelectorAll(".story")) {
  const cover = card.querySelector(".story-cover img");
  card.addEventListener("focus", () => {
    const row = card.parentElement;
    if (row.scrollWidth > row.clientWidth && card.matches(":focus-visible")) {
      card.scrollIntoView({block: "nearest", inline: "start", behavior: "instant"});
    }
  });
  function updateCover() {
    if (!cover.complete) {
      card.setAttribute("aria-busy", "true");
      return;
    }
    card.removeAttribute("aria-busy");
    card.classList.toggle("cover-unavailable", cover.naturalWidth === 0);
  }
  cover.addEventListener("load", updateCover);
  cover.addEventListener("error", updateCover);
  updateCover();
}

const venues = Array.from(document.querySelectorAll(".places-directory .venue"));
const streetMap = document.querySelector(".street-map");
const venuePin = streetMap.querySelector(".map-pin");
const directions = streetMap.querySelector(".map-route");

function syncVenueMap() {
  const venue = venues.find(item => item.open);
  venuePin.setAttribute("aria-expanded", String(Boolean(venue)));
  if (!venue) return;
  const name = venue.querySelector(".venue-name").textContent;
  const district = venue.querySelector(".district").textContent;
  streetMap.dataset.place = venue.id;
  streetMap.setAttribute("aria-label", "نقشهٔ محلهٔ " + name);
  venuePin.href = "#" + venue.id;
  venuePin.setAttribute("aria-controls", venue.id);
  venuePin.setAttribute("aria-label", "نمایش نشانی " + name);
  directions.href = venue.querySelector(".venue-address a").href;
  directions.setAttribute("aria-label", "مسیریابی به " + name + " در نشان");
  directions.querySelector("strong").textContent = name;
  directions.querySelector(".route-copy > span").textContent = "تهران، " + district;
}
for (const venue of venues) venue.addEventListener("toggle", syncVenueMap);
venuePin.addEventListener("click", event => {
  if (!plainClick(event)) return;
  event.preventDefault();
  const venue = document.getElementById(streetMap.dataset.place);
  venue.open = true;
  syncVenueMap();
  venue.querySelector("summary").focus();
});

function revealLinkedVenue() {
  const venue = venues.find(item => "#" + item.id === location.hash);
  if (venue) venue.open = true;
  syncVenueMap();
}
window.addEventListener("hashchange", revealLinkedVenue);
revealLinkedVenue();

function readTheme() {
  let saved;
  try { saved = localStorage.getItem(themePreference); } catch {}
  return ["light", "dark"].includes(saved) ? saved : systemTheme.matches ? "dark" : "light";
}
function applyTheme(mode) {
  document.documentElement.dataset.theme = mode;
  document.getElementById("favicon-dark").media = mode === "dark" ? "all" : "not all";
  document.getElementById("favicon-light").media = mode === "light" ? "all" : "not all";
  document.getElementById("theme-meta").content = mode === "dark" ? "#111827" : "#ffffff";
  const label = mode === "dark" ? "تغییر به حالت روشن" : "تغییر به حالت تیره";
  themeToggle.setAttribute("aria-label", label);
  themeToggle.title = label;
  themeToggle.querySelector("use").setAttribute("href", mode === "dark" ? "#i-sun" : "#i-moon");
}
themeToggle.hidden = false;
applyTheme(readTheme());
themeToggle.addEventListener("click", () => {
  const mode = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  try { localStorage.setItem(themePreference, mode); } catch {}
  applyTheme(mode);
});
systemTheme.addEventListener("change", () => applyTheme(readTheme()));
window.addEventListener("storage", event => {
  if (event.key === themePreference || event.key === null) applyTheme(readTheme());
});
render();
if (location.hash.startsWith("#topic-")) section.scrollIntoView({behavior: "instant"});
