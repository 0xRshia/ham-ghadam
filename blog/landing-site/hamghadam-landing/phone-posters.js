// The five posters form a rotating window. The three middle slots are visible.
export function isPhonePosterLayout() {
  return window.matchMedia("(max-width: 650px)").matches;
}

/** @param {HTMLElement} track */
export function centerPhonePosters(track) {
  if (isPhonePosterLayout()) track.scrollLeft = (track.scrollWidth - track.clientWidth) / 2;
}

/** @param {HTMLElement} track @param {(direction: number) => void} turn */
export function watchPhonePosters(track, turn) {
  function settle() {
    if (!isPhonePosterLayout()) return;
    const center = (track.scrollWidth - track.clientWidth) / 2;
    const distance = track.scrollLeft - center;
    if (center > 0 && Math.abs(distance) > center / 2) turn(distance < 0 ? 1 : -1);
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
