export function descriptionParagraphs(text: string) {
  return text.replace(/\r\n?/g, "\n").trim().split(/\n(?:[\t ]*\n)+/).map(paragraph => paragraph.trim()).filter(Boolean);
}
