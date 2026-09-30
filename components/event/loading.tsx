import { faContent } from "@/locales/domain-fa";
import { Skeleton } from "@/components/ui/skeleton";
import { ScannerHeader } from "./scanner-header";
import styles from "./loading.module.css";
import groupStyles from "./event-group.module.css";
import detail from "./event-detail.module.css";
import layouts from "./page-layouts.module.css";

export type LoadingVariant = "discovery" | "catalog" | "event" | "account" | "reservations" | "host" | "host-event" | "scanner";

function EventCardSkeleton({ mobilePair = false }: { mobilePair?: boolean }) {
  return (
    <div className={`${styles.card}${mobilePair ? ` ${styles.mobilePair}` : ""}`}>
      <Skeleton className={`event-image ${styles.cover}`} />
      <div className={styles.cardBody}>
        <Lines heading />
        <div className={styles.cardFooter}>
          <Skeleton className={styles.shortLine} />
          <Skeleton className={styles.action} />
        </div>
      </div>
    </div>
  );
}

function Lines({ heading = false }: { heading?: boolean }) {
  return (
    <div className={styles.lines}>
      <Skeleton className={heading ? styles.title : styles.line} />
      <Skeleton className={styles.line} />
      <Skeleton className={styles.shortLine} />
    </div>
  );
}

function Stats() {
  return (
    <div className="stats-grid">
      {Array.from({ length: 4 }, (_, index) => (
        <div className={`stat-card ${styles.lines}`} key={index}>
          <Skeleton className={styles.shortLine} />
          <Skeleton className={styles.title} />
        </div>
      ))}
    </div>
  );
}

function TableRows() {
  return (
    <div className={styles.table}>
      {Array.from({ length: 6 }, (_, row) => (
        <div className={styles.tableRow} key={row}>
          {Array.from({ length: 5 }, (_, column) => (
            <Skeleton className={styles.line} key={column} />
          ))}
        </div>
      ))}
    </div>
  );
}

function LoadingContent({ variant }: { variant: LoadingVariant }) {
  switch (variant) {
    case "discovery":
      return (
        <div>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className={`${groupStyles.group} ${index === 1 ? groupStyles.primary : ""}`}>
              <div className={groupStyles.heading}>
                {index === 1 ? <div className={styles.lines}>
                  {[0, 1, 2].map((word) => <Skeleton key={word} className={styles.shortLine} />)}
                </div> : <Skeleton className={styles.title} />}
              </div>
              <div className={groupStyles.viewport}>
                <div className={groupStyles.track}>
                  {[0, 1, 2].map((item) => (
                    <div key={item} className={groupStyles.slide}><EventCardSkeleton mobilePair /></div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    case "catalog":
      return (
        <div className="event-grid">
          {Array.from({ length: 6 }, (_, index) => (
            <EventCardSkeleton key={index} />
          ))}
        </div>
      );
    case "event":
      return (
        <>
          <Skeleton className={styles.backLink} />
          <Skeleton className={detail.hero} />
          <div className={`${detail.article} ${styles.lines}`}>
            <Lines heading />
            <Lines />
            <Skeleton className={styles.field} />
          </div>
        </>
      );
    case "account":
    case "reservations":
      return (
        <>
          {variant === "account" && <Skeleton className={styles.accountProfile} />}
          <Skeleton className={styles.tabs} />
          <div className={`reservation-list ${layouts.reservationList}`}>
            {Array.from({ length: 3 }, (_, index) => (
              <div className={`reservation-card ${layouts.ticketCard}`} key={index}>
                <Skeleton className={layouts.ticketImage} />
                <div className={`reservation-info ${layouts.ticketInfo}`}>
                  <div className={layouts.ticketHeader}>
                    <Skeleton className={styles.reservationStatus} />
                    <Skeleton className={styles.reservationStatus} />
                  </div>
                  <Lines heading />
                </div>
                <div className={`reservation-actions ${layouts.ticketActions}`}>
                  <Skeleton className={styles.action} />
                  <Skeleton className={styles.action} />
                </div>
              </div>
            ))}
          </div>
        </>
      );
    case "host":
      return (
        <>
          <Stats />
          <div className="charts-grid">
            {[0, 1].map((index) => (
              <div className={`chart-panel ${styles.lines}`} key={index}>
                <Skeleton className={styles.shortLine} />
                <Skeleton className="host-chart" />
              </div>
            ))}
          </div>
          <Skeleton className={styles.tabs} />
          <TableRows />
        </>
      );
    case "host-event":
      return (
        <>
          <div className="page-heading"><Lines heading /></div>
          <Stats />
          <div className={`chart-panel ${styles.lines}`}>
            <Lines />
            <Skeleton className={styles.action} />
          </div>
          <Skeleton className={styles.field} />
          <TableRows />
        </>
      );
    case "scanner":
      return (
        <>
          <div className="scanner-heading"><Lines heading /></div>
          <div className="scanner-layout">
            <div className="scanner-console">
              <Skeleton className={`scanner-camera ${styles.cover}`} />
              <div className={styles.cardBody}>
                <Skeleton className={styles.field} />
                <Skeleton className={styles.field} />
                <Lines />
              </div>
            </div>
            <div className="scanner-result-area">
              <div className={`scanner-result-placeholder ${styles.lines}`}>
                <Skeleton className={styles.symbol} />
                <Lines heading />
              </div>
            </div>
          </div>
        </>
      );
  }
}

export function Loading({ variant = "catalog" }: { variant?: LoadingVariant }) {
  return (
    <>
      <span data-motion-skip className="sr-only" role="status">{faContent.loadingInformation}</span>
      <div data-motion-skip className={styles.loading} data-loading={variant} aria-busy="true">
        <div className={styles.content} aria-hidden="true">
          <LoadingContent variant={variant} />
        </div>
      </div>
    </>
  );
}

/** Route fallbacks share the same geometry as the client-side request states. */
export function LoadingPage({ variant }: { variant: LoadingVariant }) {
  const catalog = variant === "catalog" || variant === "discovery";
  return (
    <main data-motion-skip className={variant === "scanner" ? "scanner-page" : `container ${catalog ? "discover" : "subpage"}${variant === "event" ? ` ${detail.page}` : ""}`}>
      {variant === "scanner" ? (
        <ScannerHeader />
      ) : variant !== "event" && variant !== "host-event" ? (
        <div className={catalog ? styles.catalogHeading : "page-heading"} aria-hidden="true">
          <Lines heading />
          {catalog && (
            <>
              <Skeleton className={styles.search} />
              <div className={styles.categoryGrid}>
                {Array.from({ length: 6 }, (_, index) => (
                  <Skeleton className={styles.categoryTile} key={index} />
                ))}
              </div>
            </>
          )}
        </div>
      ) : null}
      <Loading variant={variant} />
    </main>
  );
}
