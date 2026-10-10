import { copy } from "@/locales/fa";
import { ThemeMenu } from "@/components/event/theme-menu";
import { FigmaIcon } from "./source-icon";

export function HomeHeaderSkeleton() {
  return <div className="el-home-heading-skeleton" aria-hidden="true"><i/><b/></div>;
}
export function HomeLoading() {
  return <main className="el-catalog"><header className="el-home-header"><HomeHeaderSkeleton/><div className="el-home-actions"><ThemeMenu className="el-home-action"/><span className="el-home-action el-notification"><FigmaIcon screen={16} name="Notification"/></span></div></header><div className="el-search" aria-hidden="true"><FigmaIcon screen={16} name="Search"/><span className="el-muted">{copy.search}</span></div><CatalogSkeleton/></main>;
}
export function BrandSplash() {
  return <div className="el-splash" role="status" aria-label={copy.loading}><strong>{copy.app}</strong></div>;
}

export function EventSkeleton({ variant="list" }: { variant?: "list" | "card" | "feature" }) {
  if (variant === "feature") return <div className="el-skeleton-event el-skeleton-feature" aria-hidden="true"><div className="el-skeleton-feature-badge"/><div className="el-skeleton-feature-panel"><i/><i/><div><i/><b/></div></div></div>;
  return <div className={`el-skeleton-event el-skeleton-${variant}`} aria-hidden="true"><div className="el-skeleton-image"/>{variant==="card" && <div className="el-skeleton-meta"><i/><i/></div>}<div className="el-skeleton-title"><i/>{variant==="list" && <i/>}</div><div className="el-skeleton-bottom"><i/><b/></div></div>;
}
export function CatalogSkeleton({ layout = "v1" }: { layout?: "v1" | "v2" }) {
  return <div role="status" aria-label={copy.loading}>{layout === "v1" && <section className="el-upcoming el-skeleton-section"><div className="el-skeleton-heading"/><EventSkeleton variant="feature"/></section>}<section className="el-popular el-skeleton-section"><div className="el-section-heading"><div className="el-skeleton-heading"/></div><div className="el-carousel el-feature-carousel"><EventSkeleton variant="feature"/><EventSkeleton variant="feature"/></div></section></div>;
}
