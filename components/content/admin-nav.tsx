"use client";
import { faContent } from "@/locales/domain-fa";
import { AppLink } from "@/components/event/app-navigation";
import styles from "./admin-pages.module.css";

const links = [
  ["/admin", faContent.adminPanelShort],
  ["/admin/articles", faContent.articles],
  ["/admin/content", faContent.sitePages],
  ["/admin/contact", faContent.contactMessages],
  ["/admin/reviews", faContent.manageReviews],
] as const;

export function AdminNav({ active }: { active: string }) {
  return <nav className={styles.adminNav} aria-label={faContent.adminSections}>{links.map(([href, label]) => <AppLink className={active === href ? styles.active : ""} key={href} href={href}>{label}</AppLink>)}</nav>;
}
