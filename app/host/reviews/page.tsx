"use client";
import { faContent } from "@/locales/domain-fa";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Star } from "lucide-react";
import { AppLink } from "@/components/event/app-navigation";
import { useAuth } from "@/components/event/auth-context";
import { Blank, ErrorBox, Loading } from "@/components/event/shared";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import { api } from "@/lib/client";
import { date, fa } from "@/lib/types";
type Item = {
  id: string;
  event_id: string;
  event_title: string;
  author_name: string;
  rating: number;
  comment: string;
  status: string;
  created_at: number;
  reply_id: string | null;
  reply_comment: string | null;
  reply_status: string | null;
};
type Result = {
  items: Item[];
  total: number;
  page: number;
  totalPages: number;
  status: string;
};
const labels: Record<string, string> = {
  pending: faContent.pendingSiteReview,
  published: faContent.published,
  rejected: faContent.rejected,
  hidden: faContent.hidden,
};
export default function HostReviews() {
  const { user } = useAuth();
  return <HostReviewsSession key={user?.id ?? "guest"} />;
}
function HostReviewsSession() {
  const { user, loading: authLoading } = useAuth();
  const [page, setPage] = useState(1),
    [status, setStatus] = useState("all"),
    [data, setData] = useState<Result | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [drafts, setDrafts] = useState<Record<string, string>>({}),
    [saving, setSaving] = useState<string | null>(null);
  const version = useRef(0);
  const load = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      const request = ++version.current;
      try {
        const result = await api<Result>(
          `/api/host/reviews?page=${page}&status=${status}`,
        );
        if (request === version.current && isCurrent()) {
          setData(result);
          setDrafts(
            Object.fromEntries(
              result.items.map((item) => [item.id, item.reply_comment ?? ""]),
            ),
          );
        }
      } catch (e) {
        if (request === version.current && isCurrent())
          setError((e as Error).message);
      } finally {
        if (request === version.current && isCurrent()) setLoading(false);
      }
    },
    [page, status],
  );
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled && user?.isHost) void load(() => !cancelled);
    });
    return () => {
      cancelled = true;
    };
  }, [load, user]);
  async function reply(item: Item) {
    setSaving(item.id);
    try {
      await api(
        `/api/host/reviews/${encodeURIComponent(item.id)}`,
        { comment: drafts[item.id] ?? "" },
        "PUT",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(null);
    }
  }
  if (authLoading || (user?.isHost && loading && !data))
    return (
      <main className="container subpage">
        <Loading variant="host" />
      </main>
    );
  if (!user?.isHost)
    return (
      <main className="container subpage">
        <Blank
          title={faContent.hostAccessRequired}
          description={faContent.reviewsLoginHint}
        />
      </main>
    );
  return (
    <main className="container subpage host-reviews">
      <header className="page-heading host-heading">
        <div>
          <div className="eyebrow">{faContent.verifiedFeedbackEyebrow}</div>
          <h1>{faContent.reviews}</h1>
          <p>
            {faContent.hostReviewsHint}</p>
        </div>
        <AppLink className="button outline" href="/host">
          <MessageSquare size={17} />
          {faContent.backToDashboard}</AppLink>
      </header>
      {error && <ErrorBox message={error} retry={() => void load()} />}
      <div className="host-review-filter">
        <label htmlFor="host-review-status">{faContent.status}</label>
        <select
          id="host-review-status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="all">{faContent.all}</option>
          <option value="pending">{faContent.pendingSiteReview}</option>
          <option value="published">{faContent.published}</option>
          <option value="rejected">{faContent.rejected}</option>
          <option value="hidden">{faContent.hidden}</option>
        </select>
        <span>{fa(data?.total ?? 0)} {" " + faContent.review}</span>
      </div>
      {data?.items.length ? (
        <div className="host-review-list">
          {data.items.map((item) => (
            <article className="host-review-card" key={item.id}>
              <div className="host-review-card-heading">
                <div>
                  <strong>{item.event_title}</strong>
                  <span>
                    {item.author_name} · {date(item.created_at)}
                  </span>
                </div>
                <span className="host-review-rating">
                  <Star size={16} fill="currentColor" />
                  {fa(item.rating)} {" " + faContent.outOfFive}</span>
              </div>
              <span
                className={`status ${item.status === "published" ? "success" : ""}`}
              >
                {labels[item.status] ?? item.status}
              </span>
              {item.comment && <p>{item.comment}</p>}
              {item.reply_status && (
                <p className="host-review-reply-state">
                  {faContent.replyStatus + " "}{labels[item.reply_status] ?? item.reply_status}
                </p>
              )}
              <label>
                {faContent.yourReply}<textarea
                  maxLength={1200}
                  rows={3}
                  value={drafts[item.id] ?? ""}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [item.id]: event.target.value,
                    }))
                  }
                />
              </label>
              <small>{faContent.replyApprovalHint}</small>
              <button
                className="button"
                disabled={saving === item.id || !(drafts[item.id] ?? "").trim()}
                onClick={() => void reply(item)}
              >
                {saving === item.id
                  ? faContent.sending
                  : item.reply_id
                    ? faContent.editResubmit
                    : faContent.sendReply}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <Blank
          title={faContent.noReviewsToShow}
          description={faContent.hostReviewsEmptyHint}
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
