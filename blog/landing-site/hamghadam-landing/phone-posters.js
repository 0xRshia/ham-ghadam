// The five posters form a rotating window. The three middle slots are visible.
export function isPhonePosterLayout() {
  return window.matchMedia("(max-width: 650px)").matches;
}

/** @param {HTMLElement} track */
function selectionOffset(track) {
  const selected = track.querySelector('[data-slot="0"]');
  const card = selected.getBoundingClientRect();
  const rail = track.getBoundingClientRect();
  return card.left + card.width / 2 - rail.left - rail.width / 2;
}

/** @param {HTMLElement} track */
export function centerPhonePosters(track) {
  if (isPhonePosterLayout()) track.scrollLeft += selectionOffset(track);
}

/** @param {HTMLElement} track @param {(direction: number) => void} turn */
export function watchPhonePosters(track, turn) {
  function settle() {
    if (!isPhonePosterLayout()) return;
    const offset = selectionOffset(track);
    if (Math.abs(offset) > track.clientWidth / 6) turn(offset > 0 ? 1 : -1);
  }

  let timer;
  function afterScroll() {
    clearTimeout(timer);
    timer = setTimeout(settle, 150);
  }
  const nativeEnd = "onscrollend" in track;
  const event = nativeEnd ? "scrollend" : "scroll";
  const listener = nativeEnd ? settle : afterScroll;
  track.addEventListener(event, listener);
  const observer = new ResizeObserver(() => centerPhonePosters(track));
  observer.observe(track);
  centerPhonePosters(track);
  return () => {
    clearTimeout(timer);
    track.removeEventListener(event, listener);
    observer.disconnect();
  };
}
