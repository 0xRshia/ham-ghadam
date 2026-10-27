import { eventShareCopy } from "@/locales/event-share-fa";

export const EVENT_STORY_WIDTH = 1080;
export const EVENT_STORY_HEIGHT = 1920;

export type EventStorySource = {
  title: string;
  image: string | null;
  date: string;
  time: string;
  place: string;
  url: string;
};

export function eventShareUrl(id: string, origin: string) {
  return new URL(`/events/${encodeURIComponent(id)}`, origin).href;
}

export function eventStoryFilename(id: string) {
  return `hmghadam-${id.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 64) || "event"}-story.png`;
}

/** Wrap real shaped text measurements, including a title without spaces. */
export function wrapStoryText(text: string, maxWidth: number, maxLines: number, measure: (value: string) => number) {
  if (maxWidth <= 0 || maxLines < 1) return [];
  const graphemes = (value: string) => typeof Intl.Segmenter === "function"
    ? Array.from(new Intl.Segmenter("fa", { granularity: "grapheme" }).segment(value), part => part.segment)
    : Array.from(value);
  const lines: string[] = [];
  let line = "";
  for (const word of text.replace(/\s+/gu, " ").trim().split(" ").filter(Boolean)) {
    if (line && measure(`${line} ${word}`) <= maxWidth) { line += ` ${word}`; continue; }
    if (line) { lines.push(line); line = ""; }
    if (measure(word) <= maxWidth) { line = word; continue; }
    for (const part of graphemes(word)) {
      if (line && measure(line + part) > maxWidth) { lines.push(line); line = ""; }
      line += part;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const result = lines.slice(0, maxLines);
  const ending = graphemes(result[maxLines - 1]);
  while (ending.length && measure(ending.join("") + "…") > maxWidth) ending.pop();
  result[maxLines - 1] = ending.join("").trimEnd() + "…";
  return result;
}

function loadStoryImage(source: string | null, signal?: AbortSignal): Promise<HTMLImageElement | null> {
  if (!source || signal?.aborted) return Promise.resolve(null);
  let url: URL;
  try { url = new URL(source, window.location.href); } catch { return Promise.resolve(null); }
  // Anonymous CORS keeps external media from tainting the downloadable canvas.
  if (!["http:", "https:", "blob:"].includes(url.protocol) && !(url.protocol === "data:" && /^data:image\//i.test(source))) return Promise.resolve(null);
  return new Promise(resolve => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    const finish = (value: HTMLImageElement | null) => {
      clearTimeout(timeout);
      image.onload = image.onerror = null;
      signal?.removeEventListener("abort", abort);
      resolve(value);
    };
    const abort = () => { finish(null); image.src = ""; };
    const timeout = setTimeout(abort, 8000);
    signal?.addEventListener("abort", abort, { once: true });
    image.onload = () => finish(image.naturalWidth && image.naturalHeight ? image : null);
    image.onerror = () => finish(null);
    image.src = url.href;
  });
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function textBlock(context: CanvasRenderingContext2D, value: string, y: number, size: number, maxLines: number, color: string, weight = 500) {
  context.font = `${weight} ${size}px Darbareh, Tahoma, sans-serif`;
  context.fillStyle = color;
  const lines = wrapStoryText(value, 860, maxLines, line => context.measureText(line).width);
  for (const [index, line] of lines.entries()) context.fillText(line, 972, y + index * size * 1.5);
  return y + lines.length * size * 1.5;
}

/** The displayed preview and exported PNG are the same rendered artwork. */
export async function renderEventStory(source: EventStorySource, signal?: AbortSignal): Promise<{ blob: Blob; hasCover: boolean }> {
  const fontsReady = document.fonts
    ? Promise.all([document.fonts.load('700 72px "Darbareh"'), document.fonts.load('500 38px "Darbareh"')]).catch(() => undefined)
    : Promise.resolve();
  const [cover, wordmark] = await Promise.all([
    loadStoryImage(source.image, signal),
    loadStoryImage("/brand/hamghadam-wordmark.svg", signal),
    Promise.race([fontsReady, new Promise(resolve => setTimeout(resolve, 4000))]),
  ]);
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  const canvas = document.createElement("canvas");
  canvas.width = EVENT_STORY_WIDTH;
  canvas.height = EVENT_STORY_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  context.direction = "rtl";
  context.textAlign = "right";
  context.textBaseline = "top";

  const background = context.createLinearGradient(0, 0, 1080, 1920);
  background.addColorStop(0, "#502b25");
  background.addColorStop(0.45, "#251d22");
  background.addColorStop(1, "#14151b");
  context.fillStyle = background;
  context.fillRect(0, 0, 1080, 1920);
  const glow = context.createRadialGradient(900, 280, 0, 900, 280, 800);
  glow.addColorStop(0, "rgba(240,127,70,.32)");
  glow.addColorStop(1, "rgba(240,127,70,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, 1080, 1920);

  if (wordmark) context.drawImage(wordmark, 740, 115, 232, 96);
  else textBlock(context, eventShareCopy.brand, 120, 70, 1, "#F07F46", 800);
  context.font = "500 30px Darbareh, Tahoma, sans-serif";
  context.fillStyle = "#e8c1ab";
  context.textAlign = "left";
  context.fillText(eventShareCopy.storyEyebrow, 108, 152);
  context.textAlign = "right";

  context.save();
  roundedRect(context, 108, 270, 864, 864, 36);
  context.fillStyle = "#1c1d24";
  context.fill();
  context.clip();
  if (cover) {
    // Keep the full poster readable. Its image also fills any spare space softly.
    const fillScale = Math.max(864 / cover.naturalWidth, 864 / cover.naturalHeight);
    context.filter = "blur(28px) brightness(.5)";
    context.drawImage(cover, 108 + (864 - cover.naturalWidth * fillScale) / 2, 270 + (864 - cover.naturalHeight * fillScale) / 2, cover.naturalWidth * fillScale, cover.naturalHeight * fillScale);
    context.filter = "none";
    const fitScale = Math.min(864 / cover.naturalWidth, 864 / cover.naturalHeight);
    context.drawImage(cover, 108 + (864 - cover.naturalWidth * fitScale) / 2, 270 + (864 - cover.naturalHeight * fitScale) / 2, cover.naturalWidth * fitScale, cover.naturalHeight * fitScale);
  } else {
    const placeholder = context.createLinearGradient(108, 270, 972, 1134);
    placeholder.addColorStop(0, "#8f4a34");
    placeholder.addColorStop(1, "#2e252c");
    context.fillStyle = placeholder;
    context.fillRect(108, 270, 864, 864);
    context.strokeStyle = "rgba(240,127,70,.4)";
    context.lineWidth = 3;
    for (const radius of [180, 310, 440]) { context.beginPath(); context.arc(540, 650, radius, 0, Math.PI * 2); context.stroke(); }
    if (wordmark) context.drawImage(wordmark, 324, 540, 432, 178);
    context.textAlign = "center";
    context.font = "500 34px Darbareh, Tahoma, sans-serif";
    context.fillStyle = "#fff1e9";
    context.fillText(eventShareCopy.noCover, 540, 800);
    context.textAlign = "right";
  }
  context.restore();

  let position = textBlock(context, source.title, 1190, 64, 3, "#ffffff", 800) + 26;
  const metadata = [source.date, source.time, source.place].filter(Boolean);
  for (const [index, label] of metadata.entries()) {
    position = textBlock(context, label, position, index === 0 ? 36 : 32, 1, index === 0 ? "#ffd6be" : "#d7c7c0", 500) + 10;
  }

  context.strokeStyle = "rgba(255,255,255,.16)";
  context.lineWidth = 2;
  context.beginPath(); context.moveTo(108, 1704); context.lineTo(972, 1704); context.stroke();
  context.font = "500 28px Darbareh, Tahoma, sans-serif";
  context.fillStyle = "#d7c7c0";
  context.fillText(eventShareCopy.storyFooter, 972, 1750);
  context.direction = "ltr";
  context.textAlign = "left";
  context.font = "600 32px Darbareh, Tahoma, sans-serif";
  context.fillStyle = "#F07F46";
  context.fillText(new URL(source.url).hostname, 108, 1750);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("PNG export failed")), "image/png"));
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  return { blob, hasCover: Boolean(cover) };
}
