"use client";
import { faContent } from "@/locales/domain-fa";
import { BookOpen, FileText, MessageSquare, ShieldCheck } from "lucide-react";
import { AppLink } from "@/components/event/app-navigation";
import { useAuth } from "@/components/event/auth-context";
import { Blank, Loading } from "@/components/event/shared";
import { AdminNav } from "@/components/content/admin-nav";
import styles from "@/components/content/admin-pages.module.css";

const sections = [
  ["/admin/articles", BookOpen, faContent.articles, faContent.articlesDescription],
  ["/admin/content", FileText, faContent.sitePages, faContent.sitePagesDescription],
  ["/admin/contact", MessageSquare, faContent.contactMessages, faContent.messagesDescription],
  ["/admin/reviews", ShieldCheck, faContent.reviews, faContent.reviewsDescription],
] as const;

export default function AdminHome() {
  const { user, loading } = useAuth();
  if (loading) return <main className="container subpage"><Loading variant="host" /></main>;
  if (!user?.isAdmin) return <main className="container subpage"><Blank title={faContent.adminLoginRequired} description={faContent.adminLoginHint}><AppLink className="button" href="/admin/login">{faContent.adminLogin}</AppLink></Blank></main>;
  return <main className={`container ${styles.adminPage}`}>
    <AdminNav active="/admin" />
    <header className={styles.adminHeading}><div><span className="eyebrow">{faContent.adminPanel}</span><h1>{faContent.manageSiteContent}</h1><p>{faContent.adminOverviewHint}</p></div></header>
    <div className={styles.adminGrid}>{sections.map(([href, Icon, title, detail]) => <AppLink className={styles.adminTile} href={href} key={href}><Icon size={22} /><strong>{title}</strong><span>{detail}</span></AppLink>)}</div>
  </main>;
}
