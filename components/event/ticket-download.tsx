"use client";

import { faContent, faMessages } from "@/locales/domain-fa";
import { ButtonLabel } from "@/components/ui/button-label";
import { useEffect, useId, useRef, useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { api } from "@/lib/client";
import { fa } from "@/lib/types";
import type { TicketDownloadResponse } from "@/lib/ticket-types";
import styles from "./ticket-download.module.css";

export function TicketDownload({
  reservationId,
  quantity,
  prominent = false,
  fullWidth = false,
}: {
  reservationId: string;
  quantity: number;
  prominent?: boolean;
  fullWidth?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);
  const lastUrl = useRef<string | null>(null);
  const errorId = useId();

  useEffect(() => () => {
    if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
  }, []);

  async function download() {
    setBusy(true);
    setError("");
    try {
      const [data, { createTicketPdf }] = await Promise.all([
        api<TicketDownloadResponse>(`/api/reservations/${encodeURIComponent(reservationId)}/tickets`),
        import("@/lib/ticket-pdf"),
      ]);
      const blob = await createTicketPdf(data);
      const url = URL.createObjectURL(blob);
      const name = `hamghadam-tickets-${reservationId}.pdf`;
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
      lastUrl.current = url;
      setFile({ url, name });
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : faContent.ticketGenerationFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`${styles.download}${fullWidth ? ` ${styles.fullWidth}` : ""}`}>
      <button
        type="button"
        className={`button${prominent ? "" : " outline"}`}
        disabled={busy}
        aria-busy={busy}
        aria-describedby={error ? errorId : undefined}
        onClick={download}
      >
        <ButtonLabel busy={busy} pending={<><LoaderCircle size={17} className={styles.spinner} />{faContent.preparingTicket}</>}>
          <Download size={17} />{quantity > 1 ? faContent.downloadAllTicketsPdf : faContent.downloadTicketPdf}
        </ButtonLabel>
      </button>
      {prominent && <small className={styles.hint}>{quantity > 1 ? faMessages.ticketPages(String(fa(quantity))) : faContent.keepTicketHint}</small>}
      {file && (
        <p className={styles.ready} role="status">
          {faContent.fileReady + " "}<a href={file.url} download={file.name}>{faContent.saveAgain}</a>
          {" · "}<a href={file.url} target="_blank" rel="noreferrer">{faContent.openTicket}</a>
        </p>
      )}
      {error && <p id={errorId} className={styles.error} role="alert">{error}</p>}
    </div>
  );
}
