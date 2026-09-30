import { faContent } from "@/locales/domain-fa";
import { ShieldCheck } from "lucide-react";

export function ScannerHeader() {
  return (
    <header className="scanner-header">
      <div className="brand"><img src="/favicon.svg" alt="" />{faContent.appName}</div>
      <span><ShieldCheck size={17} /> {" " + faContent.eventAdmission}</span>
    </header>
  );
}
