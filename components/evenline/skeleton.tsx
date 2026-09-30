import { copy } from "@/locales/fa";
import { FigmaIcon } from "./source-icon";

export function HomeHeaderSkeleton() {
  return <div className="el-home-heading-skeleton" aria-hidden="true"><i/><b/></div>;
}
export function HomeLoading() {
  return <main className="el-catalog"><header className="el-home-header"><HomeHeaderSkeleton/><span className="el-notification"><FigmaIcon screen={16} name="Notification"/></span></header><div className="el-search" aria-hidden="true"><FigmaIcon screen={16} name="Search"/><span className="el-muted">{copy.search}</span></div><CatalogSkeleton/></main>;
}
export function BrandSplash() {
  return <div className="el-splash" role="status" aria-label={copy.loading}><strong>{copy.app}</strong></div>;
}

export function EventSkeleton({ variant="list" }: { variant?: "list" | "card" }) {
  return <div className={`el-skeleton-event el-skeleton-${variant}`} aria-hidden="true"><div className="el-skeleton-image"/>{variant==="card" && <div className="el-skeleton-meta"><i/><i/></div>}<div className="el-skeleton-title"><i/>{variant==="list" && <i/>}</div><div className="el-skeleton-bottom"><i/><b/></div></div>;
}
export function CatalogSkeleton() {
  return <div role="status" aria-label={copy.loading}><section className="el-upcoming el-skeleton-section"><div className="el-skeleton-heading"/><EventSkeleton/></section><section className="el-popular el-skeleton-section"><div className="el-skeleton-heading"/><div className="el-carousel"><EventSkeleton variant="card"/><EventSkeleton variant="card"/></div></section></div>;
}
