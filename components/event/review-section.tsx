"use client";
import { faContent, faMessages } from "@/locales/domain-fa";
import { useCallback, useEffect, useRef, useState } from "react";
import { Star, Trash2 } from "lucide-react";
import { useAuth } from "@/components/event/auth-context";
import { api } from "@/lib/client";
import { fa, date } from "@/lib/types";
import detail from "./event-detail.module.css";
type Review = {
  id: string;
  rating: number;
  comment: string;
  author_name: string;
  created_at: number;
  reply: string | null;
  reply_created_at: number | null;
};
type Result = {
  reviews: Review[];
  total: number;
  page: number;
  totalPages: number;
  rating_count: number;
  rating_average: number | null;
  viewerReview: {
    id: string;
    rating: number;
    comment: string;
    status: string;
    updated_at: number;
  } | null;
  canReview: boolean;
};
export function ReviewSection({
  eventId,
  sample,
}: {
  eventId: string;
  sample: boolean;
}) {
  const { user } = useAuth();
  const [page, setPage] = useState(1),
    [data, setData] = useState<Result | null>(null),
    [loading, setLoading] = useState(true),
    [rating, setRating] = useState(0),
    [comment, setComment] = useState(""),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const version = useRef(0);
  const load = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      const request = ++version.current;
      try {
        const result = await api<Result>(
          `/api/events/${encodeURIComponent(eventId)}/reviews?page=${page}`,
        );
        if (request === version.current && isCurrent()) {
          setData(result);
          if (result.viewerReview) {
            setRating(result.viewerReview.rating);
            setComment(result.viewerReview.comment);
          }
        }
      } catch (e) {
        if (request === version.current && isCurrent())
          setError((e as Error).message);
      } finally {
        if (request === version.current && isCurrent()) setLoading(false);
      }
    },
    [eventId, page],
  );
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) void load(() => !cancelled);
    });
    return () => {
      cancelled = true;
    };
  }, [load, user?.id]);
  async function submit() {
    setSaving(true);
    setError("");
    try {
      await api(`/api/events/${encodeURIComponent(eventId)}/reviews`, {
        rating,
        comment,
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function withdraw() {
    if (!data?.viewerReview) return;
    setSaving(true);
    try {
      await api(
        `/api/reviews/${encodeURIComponent(data.viewerReview.id)}`,
        undefined,
        "DELETE",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const viewer = data?.viewerReview;
  const canWrite = !!user && !!data?.canReview;
  return (
    <section
      className={detail.reviewSection}
      aria-labelledby="event-reviews-title"
      data-motion-group
    >
      <header className={detail.reviewHeading}>
        <div>
          <div className="eyebrow">{faContent.attendeeExperiences}</div>
          <h2 id="event-reviews-title">{faContent.ratingReviews}</h2>
        </div>
        {data && (
          <div
            className={detail.ratingSummary}
            aria-label={
              data.rating_average
                ? faMessages.ratingAverageSummary(String(data.rating_average.toFixed(1)), String(data.rating_count))
                : faContent.noReviews
            }
          >
            <Star size={19} fill="currentColor" />
            <strong>
              {data.rating_average
                ? fa(Math.round(data.rating_average * 10) / 10)
                : "—"}
            </strong>
            <span>{fa(data.rating_count)} {" " + faContent.review}</span>
          </div>
        )}
      </header>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {canWrite && (
        <form
          className={detail.reviewForm}
          onSubmit={(event) => {
            event.preventDefault();
            if (rating) void submit();
          }}
        >
          <h3>
            {viewer?.status === "published"
              ? faContent.editYourExperience
              : faContent.shareExperience}
          </h3>
          <fieldset disabled={saving}>
            <legend>{faContent.yourRating}</legend>
            <div
              className={detail.ratingOptions}
              role="radiogroup"
              aria-label={faContent.ratingRange}
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <label key={value}>
                  <input
                    type="radio"
                    name={`rating-${eventId}`}
                    value={value}
                    checked={rating === value}
                    onChange={() => setRating(value)}
                  />
                  <span aria-hidden="true">
                    <Star
                      fill={value <= rating ? "currentColor" : "none"}
                      size={24}
                    />
                  </span>
                  <span className={detail.srOnly}>{value} {" " + faContent.outOfFive}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className={detail.commentField}>
            {faContent.optionalReview}<textarea
              value={comment}
              maxLength={2000}
              onChange={(event) => setComment(event.target.value)}
              rows={4}
            />
          </label>
          <div className={detail.reviewFormActions}>
            <button className="button" disabled={saving || !rating}>
              {saving ? faContent.submitting : faContent.submitForReview}
            </button>
            {viewer && (
              <button
                type="button"
                className="text-button"
                disabled={saving}
                onClick={() => void withdraw()}
              >
                <Trash2 size={15} />
                {faContent.withdrawReview}</button>
            )}
          </div>
          <p className={detail.reviewNote}>
            {faContent.reviewEligibilityHint}</p>
        </form>
      )}
      {!user && !sample && (
        <p className={detail.reviewNote}>
          {faContent.reviewLoginHint}</p>
      )}
      {viewer?.status === "pending" && (
        <p className={detail.reviewNote}>
          {faContent.reviewPendingHint}</p>
      )}
      {viewer?.status === "rejected" && (
        <p className={detail.reviewNote}>
          {faContent.reviewRejectedHint}</p>
      )}
      {loading && !data ? (
        <p aria-live="polite">{faContent.loadingReviews}</p>
      ) : data?.reviews.length ? (
        <ul className={detail.reviewList}>
          {data.reviews.map((review) => (
            <li key={review.id} className={detail.reviewCard}>
              <div className={detail.reviewMeta}>
                <strong>{review.author_name || faContent.attendee}</strong>
                <time>{date(review.created_at)}</time>
                <span
                  aria-label={faMessages.reviewRating(String(review.rating))}
                  className={detail.reviewStars}
                >
                  {Array.from({ length: 5 }, (_, index) => (
                    <Star
                      key={index}
                      size={15}
                      fill={index < review.rating ? "currentColor" : "none"}
                    />
                  ))}
                </span>
              </div>
              {review.comment && <p>{review.comment}</p>}
              {review.reply && (
                <div className={detail.hostReply}>
                  <strong>{faContent.hostReply}</strong>
                  <p>{review.reply}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className={detail.reviewEmpty}>
          {loading
            ? faContent.loadingReviews
            : faContent.noApprovedReviews}
        </p>
      )}
      {data && data.totalPages > 1 && (
        <nav
          className={detail.reviewPagination}
          aria-label={faContent.reviewPages}
        >
          <button
            className="button outline"
            disabled={page <= 1 || loading}
            onClick={() => setPage((current) => current - 1)}
          >
            {faContent.previous}</button>
          <span>
            {faContent.pageOf + " "}{fa(page)} {" " + faContent.from + " "}{fa(data.totalPages)}
          </span>
          <button
            className="button outline"
            disabled={page >= data.totalPages || loading}
            onClick={() => setPage((current) => current + 1)}
          >
            {faContent.next}</button>
        </nav>
      )}
    </section>
  );
}
