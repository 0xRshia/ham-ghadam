import { ArrowLeft } from "lucide-react";
import { AppLink } from "@/components/event/app-navigation";
import { squirrelCopy as copy } from "@/locales/squirrel-fa";
import styles from "./squirrel-game-entry.module.css";

export function SquirrelGameEntry() {
  return <AppLink href="/play/squirrel" className={styles.entry}>
    <img src="/play/squirrel-icon.svg" width={48} height={48} alt="" />
    <span><small>{copy.launchHint}</small><strong>{copy.launchTitle}</strong></span>
    <span className={styles.action}>{copy.launchAction}<ArrowLeft size={16} /></span>
  </AppLink>;
}
