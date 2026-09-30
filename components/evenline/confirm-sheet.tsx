"use client";
import { useEffect, useRef } from "react";
import { copy } from "@/locales/fa";
import { Button } from "./primitives";

export function ConfirmSheet({ open, title, action, busy, onConfirm, onClose }: { open: boolean; title: string; action: string; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  return <dialog ref={dialog} className="el-sheet el-confirm-sheet" aria-label={title} onCancel={event=>{if(busy)event.preventDefault();else onClose();}} onClose={onClose}><div className="el-sheet-handle"/><p>{title}</p><div className="el-confirm-actions"><Button autoFocus variant="secondary" disabled={busy} onClick={onClose}>{copy.cancel}</Button><Button disabled={busy} onClick={onConfirm}>{action}</Button></div></dialog>;
}
