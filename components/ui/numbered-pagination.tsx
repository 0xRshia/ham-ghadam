"use client";

import { faContent, faMessages } from "@/locales/domain-fa";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fa } from "@/lib/types";
import { Pagination, PaginationContent, PaginationItem, PaginationEllipsis } from "./pagination";

export function NumberedPagination({ page, totalPages, onPageChange, disabled = false }: {
  page: number; totalPages: number; onPageChange: (page: number) => void; disabled?: boolean;
}) {
  if (totalPages <= 1 && page <= 1) return null;
  // A moderation or deletion can remove the final page. Keep a route back to
  // the remaining results instead of hiding all controls over an empty page.
  const selected = Math.max(1, page);
  const pages = Array.from(new Set([1, selected - 1, selected, selected + 1, totalPages]))
    .filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b);
  return <Pagination className="numbered-pagination" aria-label={faContent.pagination} dir="rtl">
    <PaginationContent>
      <PaginationItem><button type="button" className="icon-button" aria-label={faContent.previousPage}
        disabled={disabled || selected === 1} onClick={() => onPageChange(Math.min(selected - 1, totalPages))}><ChevronRight size={18} /></button></PaginationItem>
      {pages.map((value, index) => <PaginationItem key={value} className="numbered-pagination-item">
        {index > 0 && value - pages[index - 1] > 1 && <PaginationEllipsis />}
        <button type="button" className="icon-button" aria-label={faMessages.pageNumber(String(fa(value)))}
          aria-current={value === selected ? "page" : undefined} disabled={disabled}
          onClick={() => onPageChange(value)}>{fa(value)}</button>
      </PaginationItem>)}
      <PaginationItem><button type="button" className="icon-button" aria-label={faContent.nextPage}
        disabled={disabled || selected >= totalPages} onClick={() => onPageChange(selected + 1)}><ChevronLeft size={18} /></button></PaginationItem>
    </PaginationContent>
  </Pagination>;
}
