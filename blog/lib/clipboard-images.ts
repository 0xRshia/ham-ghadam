const LONE_URL = /^https?:\/\/\S+$/i;

/**
 * Decides which clipboard files a paste into the Markdown editor should upload as images.
 *
 * Office suites and spreadsheets put a rendered bitmap next to the copied text, so any
 * real plain text keeps the paste as text. Browsers' "Copy image" may add the image
 * address as plain text; that alone still counts as an image paste.
 */
export function pastedImageFiles(plainText: string, files: readonly File[]): File[] {
  const text = plainText.trim();
  if (text && !LONE_URL.test(text)) return [];
  return files.filter((file) => file.type.startsWith("image/"));
}
