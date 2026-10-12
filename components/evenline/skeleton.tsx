import { copy } from "@/locales/fa";
import { FigmaIcon } from "./source-icon";

export function HomeHeaderSkeleton() {
  return <div className="el-home-heading-skeleton" aria-hidden="true"><i/><b/></div>;
}
export function HomeLoading() {
  return <main className="el-catalog el-catalog-v2"><header className="el-home-header"><HomeHeaderSkeleton/><div className="el-home-actions"><span className="el-home-action el-notification"><FigmaIcon screen={16} name="Notification"/></span></div></header><div className="el-search" aria-hidden="true"><FigmaIcon screen={16} name="Search"/><span className="el-muted">{copy.search}</span></div><div className="el-filter-chips" aria-hidden="true"><span className="el-skeleton-heading"/></div><CatalogSkeleton layout="v2"/></main>;
}
export function BrandSplash() {
  return <div className="el-splash" role="status" aria-label={copy.loading}><strong>{copy.app}</strong></div>;
}

export function EventSkeleton({ variant="list" }: { variant?: "list" | "card" | "feature" }) {
  return <div className={`el-skeleton-event el-skeleton-${variant}`} aria-hidden="true"><div className="el-skeleton-image"/>{variant==="card" && <div className="el-skeleton-meta"><i/><i/></div>}<div className="el-skeleton-title"><i/>{variant==="list" && <i/>}</div><div className="el-skeleton-bottom"><i/><b/></div></div>;
}
export function CatalogSkeleton({ layout = "v1" }: { layout?: "v1" | "v2" }) {
  if (layout === "v2") return <div role="status" aria-label={copy.loading}><section className="el-popular el-skeleton-section"><div className="el-skeleton-heading"/><div className="el-carousel el-feature-carousel"><EventSkeleton variant="feature"/><EventSkeleton variant="feature"/></div></section><section className="el-search-section el-skeleton-section"><div className="el-skeleton-heading"/><div className="el-search-events"><EventSkeleton/></div></section></div>;
  return <div role="status" aria-label={copy.loading}><section className="el-upcoming el-skeleton-section"><div className="el-skeleton-heading"/><EventSkeleton/></section><section className="el-popular el-skeleton-section"><div className="el-skeleton-heading"/><div className="el-carousel"><EventSkeleton variant="card"/><EventSkeleton variant="card"/></div></section></div>;
}
