import { faContent, faMessages } from "@/locales/domain-fa";
import { PDFDocument } from "pdf-lib";
import { clock, date, fa } from "@/lib/types";
import { reservationAmountLabel, reservationStatusLabel, type ReceiptResponse } from "@/lib/account-types";

const FONT = '"IRANSansX", Tahoma, sans-serif';
const WIDTH = 840;
const CONTENT_WIDTH = 664;
const SCALE = 2;

function wrappedLines(ctx: CanvasRenderingContext2D, value: string, width: number, size: number, weight: number) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  const lines: string[] = [];
  for (const word of value.replace(/\s+/g, " ").trim().split(" ")) {
    const candidate = lines.length ? `${lines[lines.length - 1]} ${word}` : word;
    if (ctx.measureText(candidate).width <= width) {
      if (lines.length) lines[lines.length - 1] = candidate;
      else lines.push(candidate);
      continue;
    }
    if (ctx.measureText(word).width <= width) {
      lines.push(word);
      continue;
    }
    let part = "";
    for (const character of word) {
      if (part && ctx.measureText(part + character).width > width) {
        lines.push(part);
        part = "";
      }
      part += character;
    }
    if (part) lines.push(part);
  }
  return lines.length ? lines : [""];
}

function drawText(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color: string, weight = 400) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.direction = "rtl";
  ctx.fillText(value, x, y);
}

export async function createReceiptPdf(receipt: ReceiptResponse["receipt"], serverNow: number): Promise<Blob> {
  const fonts = await Promise.all([
    document.fonts.load(`400 24px ${FONT}`, faContent.appName),
    document.fonts.load(`700 38px ${FONT}`, faContent.reservationReceipt),
  ]);
  if (fonts.some((font) => !font.length)) throw new Error(faContent.receiptFontFailed);
  const pdf = await PDFDocument.create();
  pdf.setTitle(faMessages.receiptTitle(String(receipt.title)));
  pdf.setAuthor(faContent.appName);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(faContent.receiptUnsupported);
  const fields: [string, string][] = [
    [faContent.eventTitle, receipt.title],
    [faContent.buyerName, receipt.name || faContent.notRecorded],
    [faContent.mobile, receipt.phone],
    [faContent.bookingDate, faMessages.dateAtTime(String(date(receipt.created_at, true)), String(clock(receipt.created_at)))],
    [faContent.eventTime, faMessages.dateAtTime(String(date(receipt.starts_at, true)), String(clock(receipt.starts_at)))],
    [faContent.venue, `${receipt.venue} · ${receipt.city}`],
    [faContent.address, receipt.address],
    [faContent.ticketCount, faMessages.peopleCount(String(fa(receipt.quantity)))],
    [faContent.bookingAmount, reservationAmountLabel(receipt.status, receipt.payment_state, receipt.total)],
    [faContent.status, reservationStatusLabel(receipt.status, receipt.payment_state, receipt.total,
      receipt.status === "hold" ? (receipt.expires_at ?? 0) : receipt.ends_at, serverNow)],
    [faContent.reservationId, receipt.id],
    [faContent.paymentId, receipt.reference ?? faContent.notRecorded],
  ];
  const rows = fields.map(([label, value]) => ({
    label,
    lines: wrappedLines(ctx, value, CONTENT_WIDTH, 23, 700),
  }));
  const rowHeights = rows.map(({ lines }) => Math.max(66, 30 + lines.length * 28 + 10));
  let y = 252;
  const rowBottom = y + rowHeights.reduce((total, height) => total + height, 0);
  const note = faContent.receiptTaxDisclaimer;
  const noteLines = wrappedLines(ctx, note, CONTENT_WIDTH, 15, 400);
  const pageHeight = rowBottom + 24 + noteLines.length * 21 + 52;

  canvas.width = WIDTH * SCALE;
  canvas.height = pageHeight * SCALE;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#f7f4f0";
  ctx.fillRect(0, 0, WIDTH, pageHeight);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(40, 40, 760, pageHeight - 80, 24);
  ctx.fill();
  ctx.fillStyle = "#f49851";
  ctx.beginPath();
  ctx.roundRect(40, 40, 760, 176, [24, 24, 0, 0]);
  ctx.fill();
  drawText(ctx, faContent.appName, 752, 74, 44, "#171717", 700);
  drawText(ctx, faContent.reservationReceipt, 752, 132, 29, "#171717", 700);

  rows.forEach(({ label, lines }, index) => {
    drawText(ctx, label, 752, y, 17, "#767676", 400);
    lines.forEach((line, lineIndex) => drawText(ctx, line, 752, y + 24 + lineIndex * 28, 23, "#171717", 700));
    const height = rowHeights[index];
    ctx.strokeStyle = "#e6e0da";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(88, y + height - 4);
    ctx.lineTo(752, y + height - 4);
    ctx.stroke();
    y += height;
  });
  noteLines.forEach((line, index) => drawText(ctx, line, 752, y + 20 + index * 21, 15, "#767676"));

  const page = pdf.addPage([420, pageHeight / 2]);
  page.drawImage(await pdf.embedPng(canvas.toDataURL("image/png")), {
    x: 0,
    y: 0,
    width: 420,
    height: pageHeight / 2,
  });
  return new Blob([new Uint8Array(await pdf.save())], { type: "application/pdf" });
}
