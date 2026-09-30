import { faContent, faMessages } from "@/locales/domain-fa";
import { PDFDocument } from "pdf-lib";
import QRCode from "qrcode";
import { clock, date, fa } from "./types";
import type { TicketDownloadResponse } from "./ticket-types";

const WIDTH = 840;
const HEIGHT = 1188;
const SCALE = 2;
const FONT = '"IRANSansX", Tahoma, sans-serif';
const colors = {
  paper: "#fef3ea",
  primaryText: "#825430",
  white: "#ffffff",
  ink: "#0f0f0f",
  muted: "#656565",
  primary: "#f49851",
  border: "#d8cfc7",
};

function text(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color = colors.ink,
  weight = 400,
  align: CanvasTextAlign = "right",
) {
  context.font = `${weight} ${size}px ${FONT}`;
  context.fillStyle = color;
  context.textAlign = align;
  context.direction = "rtl";
  context.textBaseline = "top";
  context.fillText(value, x, y);
}

function wrapText(context: CanvasRenderingContext2D, value: string, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of value.replace(/\s+/g, " ").trim().split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width <= width) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    for (const character of word) {
      if (line && context.measureText(line + character).width > width) {
        lines.push(line);
        line = "";
      }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function textBlock(
  context: CanvasRenderingContext2D,
  value: string,
  y: number,
  height: number,
  maxSize: number,
  weight = 400,
) {
  for (let size = maxSize; size >= 14; size -= 1) {
    context.font = `${weight} ${size}px ${FONT}`;
    const lines = wrapText(context, value, 672);
    const lineHeight = size * 1.45;
    if (lines.length * lineHeight > height) continue;
    lines.forEach((line, index) =>
      text(context, line, 756, y + index * lineHeight, size, colors.ink, weight),
    );
    return;
  }
  throw new Error(faContent.ticketTextTooLong);
}

function roundedBox(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
}

/** Browser text shaping preserves Persian joining and direction in the PDF. */
export async function createTicketPdf(data: TicketDownloadResponse): Promise<Blob> {
  const { reservation, tickets } = data;
  if (
    !tickets.length ||
    tickets.length !== reservation.quantity ||
    new Set(tickets.map((ticket) => ticket.qr)).size !== tickets.length ||
    tickets.some((ticket) => !/^hg-ticket:v1:[a-f0-9]{64}$/.test(ticket.qr))
  ) {
    throw new Error(faContent.ticketIssuanceIncomplete);
  }
  const loadedFonts = await Promise.all([
    document.fonts.load(`400 24px ${FONT}`, faContent.appName),
    document.fonts.load(`700 38px ${FONT}`, faContent.appName),
  ]);
  if (loadedFonts.some((fonts) => fonts.length === 0)) {
    throw new Error(faContent.ticketFontFailed);
  }
  const pdf = await PDFDocument.create();
  pdf.setTitle(faMessages.paymentTicketDescription(String(reservation.title)));
  pdf.setAuthor(faContent.appName);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * SCALE;
  canvas.height = HEIGHT * SCALE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error(faContent.ticketUnsupported);
  context.scale(SCALE, SCALE);

  for (const ticket of tickets) {
    context.fillStyle = colors.paper;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    roundedBox(context, 36, 36, 768, 1116, 28, colors.white);
    context.save();
    context.beginPath();
    context.roundRect(36, 36, 768, 1116, 28);
    context.clip();
    context.fillStyle = colors.primary;
    context.fillRect(36, 36, 768, 130);
    context.restore();

    text(context, faContent.appName, 756, 65, 48, colors.ink, 700);
    text(context, faContent.shortTagline, 756, 124, 19, colors.ink);
    text(context, faContent.admissionTicket, 84, 84, 25, colors.ink, 700, "left");
    text(context, faMessages.ticketOrdinal(String(fa(ticket.ordinal)), String(fa(reservation.quantity))), 756, 193, 22, colors.primaryText, 700);
    textBlock(context, reservation.title, 235, 113, 38, 700);

    text(context, date(reservation.starts_at, true), 756, 364, 26, colors.ink, 700);
    text(context, faMessages.ticketTime(String(clock(reservation.starts_at)), String(clock(reservation.ends_at))), 756, 405, 22, colors.muted);

    context.strokeStyle = colors.border;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(84, 450);
    context.lineTo(756, 450);
    context.stroke();

    text(context, faContent.namedFor, 756, 475, 20, colors.muted);
    textBlock(context, reservation.name || faContent.originalNameMissing, 510, 75, 28, 700);
    text(context, faContent.venue, 756, 606, 20, colors.muted);
    textBlock(context, `${reservation.venue} · ${reservation.city}`, 642, 76, 27, 700);
    textBlock(context, reservation.address, 736, 110, 24);

    context.setLineDash([6, 7]);
    context.beginPath();
    context.moveTo(54, 874);
    context.lineTo(786, 874);
    context.stroke();
    context.setLineDash([]);
    for (const x of [36, 804]) {
      context.beginPath();
      context.arc(x, 874, 16, 0, Math.PI * 2);
      context.fillStyle = colors.paper;
      context.fill();
    }

    const qr = document.createElement("canvas");
    await QRCode.toCanvas(qr, ticket.qr, {
      errorCorrectionLevel: "M",
      margin: 4,
      scale: 10,
      color: { dark: "#000000ff", light: "#ffffffff" },
    });
    const qrSize = qr.width / SCALE;
    context.imageSmoothingEnabled = false;
    context.drawImage(qr, 198 - qrSize / 2, 1011 - qrSize / 2, qrSize, qrSize);
    context.imageSmoothingEnabled = true;

    text(context, faContent.showCodeAtEntry, 756, 977, 22, colors.ink, 700);
    text(context, faContent.ticketSingleAdmission, 756, 1015, 19, colors.muted);
    text(context, faContent.keepTicketUntilEvent, 756, 1050, 19, colors.muted);
    text(context, faMessages.ticketIdentifier(String(ticket.id)), 756, 1100, 14, colors.muted);
    text(context, faContent.meetupTicketFooter, WIDTH / 2, 1165, 17, colors.primaryText, 700, "center");

    const image = await pdf.embedPng(canvas.toDataURL("image/png"));
    const page = pdf.addPage([420, 594]);
    page.drawImage(image, { x: 0, y: 0, width: 420, height: 594 });
  }
  const bytes = await pdf.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}
