// Persist only completion; coordinates remain in the mounted browsing context.
export const mapIntroductionKey = "hg_map_introduction_completed";

export function readMapIntroduction(): boolean {
  try { return window.localStorage.getItem(mapIntroductionKey) === "1"; }
  catch { return false; }
}

export function saveMapIntroduction(): void {
  try { window.localStorage.setItem(mapIntroductionKey, "1"); }
  catch { /* The provider retains in-memory completion when storage is blocked. */ }
}
