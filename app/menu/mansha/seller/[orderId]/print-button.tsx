"use client";

import { Printer } from "lucide-react";
import { manshaCopy as copy } from "@/locales/mansha-fa";

export function PrintButton() {
  return (
    <button type="button" className="button outline" onClick={() => window.print()}>
      <Printer size={17} aria-hidden="true" />
      {copy.printReceipt}
    </button>
  );
}
