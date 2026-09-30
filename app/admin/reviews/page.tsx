"use client";
import { faContent } from "@/locales/domain-fa";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, EyeOff, X } from "lucide-react";
import { useAuth } from "@/components/event/auth-context";
import { AppLink } from "@/components/event/app-navigation";
import { Blank, ErrorBox, Loading } from "@/components/event/shared";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import { api } from "@/lib/client";
import { date, fa } from "@/lib/types";
type Item = {
  id: string;
  record_id: string;
  kind: "review" | "reply";
  event_id: string;
  event_title: string;
  host_name: string;
  author_name: string;
  rating: number;
  comment: string;
  status: string;
  created_at: number;
  reply_comment: string | null;
};
type Result = {
  items: Item[];
  total: number;
  page: number;
  totalPages: number;
  status: string;
  kind: string;
};
export default function AdminReviews() {
  const { user } = useAuth();
  return <AdminReviewsSession key={user?.id ?? "guest"} />;
}
function AdminReviewsSession() {
  const { user, loading: authLoading } = useAuth();
  const [page, setPage] = useState(1),
    [status, setStatus] = useState("pending"),
    [kind, setKind] = useState("all"),
    [data, setData] = useState<Result | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [saving, setSaving] = useState<string | null>(null);
  const version = useRef(0);
  const load = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      const request = ++version.current;
      try {
        const result = await api<Result>(
          `/api/admin/reviews?page=${page}&status=${status}&kind=${kind}`,
        );
        if (request === version.current && isCurrent()) setData(result);
      } catch (e) {
        if (request === version.current && isCurrent())
          setError((e as Error).message);
      } finally {
        if (request === version.current && isCurrent()) setLoading(false);
      }
    },
    [page, status, kind],
  );
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled && user?.isAdmin) void load(() => !cancelled);
    });
    return () => {
      cancelled = true;
    };
  }, [load, user]);
  async function moderate(item: Item, next: string) {
    setSaving(item.id);
    setError("");
    try {
      await api(
        `/api/admin/reviews/${encodeURIComponent(item.id)}`,
        { kind: item.kind, status: next },
        "PATCH",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(null);
    }
  }
  if (authLoading || (user?.isAdmin && loading && !data))
    return (
      <main className="container subpage">
        <Loading variant="host" />
      </main>
    );
  if (!user?.isAdmin)
    return (
      <main className="container subpage">
        <Blank
          title={faContent.adminAccessRequired}
          description={faContent.moderationDescription}
        />
      </main>
    );
  return (
    <main className="container subpage host-reviews">
      <header className="page-heading host-heading">
        <div>
          <div className="eyebrow">{faContent.moderationEyebrow}</div>
          <h1>{faContent.manageReviews}</h1>
          <p>
            {faContent.moderationHint}</p>
        </div>
        <AppLink className="button outline" href="/admin">
          {faContent.managementPanel}</AppLink>
      </header>
      {error && <ErrorBox message={error} retry={() => void load()} />}
      <div className="host-review-filter">
        <label htmlFor="admin-review-status">{faContent.status}</label>
        <select
          id="admin-review-status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="pending">{faContent.awaitingReview}</option>
          <option value="published">{faContent.published}</option>
          <option value="rejected">{faContent.rejected}</option>
          <option value="hidden">{faContent.hidden}</option>
          <option value="withdrawn">{faContent.withdrawn}</option>
        </select>
        <label htmlFor="admin-review-kind">{faContent.type}</label>
        <select
          id="admin-review-kind"
          value={kind}
          onChange={(event) => {
            setKind(event.target.value);
            setPage(1);
          }}
        >
          <option value="all">{faContent.all}</option>
          <option value="review">{faContent.review}</option>
          <option value="reply">{faContent.hostReply}</option>
        </select>
        <span>{fa(data?.total ?? 0)} {" " + faContent.item}</span>
      </div>
      {data?.items.length ? (
        <div className="host-review-list">
          {data.items.map((item) => (
            <article
              className="host-review-card"
              key={`${item.kind}:${item.id}`}
            >
              <div className="host-review-card-heading">
                <div>
                  <strong>
                    {item.kind === "review"
                      ? faContent.attendeeReview
                      : faContent.hostReply}{" "}
                    · {item.event_title}
                  </strong>
                  <span>
                    {item.kind === "review" ? item.author_name : item.host_name}{" "}
                    · {date(item.created_at)}
                  </span>
                </div>
                {item.kind === "review" && (
                  <span className="host-review-rating">
                    {fa(item.rating)} {" " + faContent.outOfFive}</span>
                )}
              </div>
              {item.kind === "review" ? (
                <p>{item.comment || faContent.noText}</p>
              ) : (
                <>
                  <p className="host-review-context">
                    {faContent.reviewText + " "}{item.author_name}:{" "}
                    {item.comment || faContent.noText}
                  </p>
                  <p>{item.reply_comment}</p>
                </>
              )}
              <span className="status">{item.status}</span>
              <div className="host-review-actions">
                <button
                  className="button"
                  disabled={saving === item.id || item.status === "withdrawn"}
                  onClick={() => void moderate(item, "published")}
                >
                  <Check size={16} />
                  {item.status === "published"
                    ? faContent.published
                    : faContent.approveRestore}
                </button>
                <button
                  className="button outline"
                  disabled={saving === item.id || item.status === "withdrawn"}
                  onClick={() => void moderate(item, "rejected")}
                >
                  <X size={16} />
                  {faContent.reject}</button>
                <button
                  className="button outline"
                  disabled={saving === item.id || item.status === "withdrawn"}
                  onClick={() => void moderate(item, "hidden")}
                >
                  <EyeOff size={16} />
                  {faContent.hide}</button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Blank
          title={faContent.noModerationResults}
          description={faContent.moderationEmptyHint}
        />
      )}
      {data && (
        <NumberedPagination
          page={data.page}
          totalPages={data.totalPages}
          onPageChange={setPage}
          disabled={loading}
        />
      )}
    </main>
  );
}
