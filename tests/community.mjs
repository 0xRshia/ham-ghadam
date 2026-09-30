export async function testCommunity({
  db,
  call,
  event,
  check,
  now,
  base,
  host,
  buyer,
  stranger,
  admin,
}) {
  const realEventId = event("community-real", 20);
  const secondRealEventId = event("community-second-real", 20);
  const sampleEventId = event("community-sample", 20);
  const reservationIds = [];
  const request = async (method, route, data, token, origin = base) => {
    const response = await fetch(origin + route, {
      method,
      headers: {
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
        ...(method !== "GET" ? { Origin: origin } : {}),
        ...(token ? { Cookie: `hg_session=${token}` } : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: AbortSignal.timeout(5000),
    });
    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      result = { error: text };
    }
    return { status: response.status, data: result, text };
  };
  const purchase = (userId, eventId, suffix) => {
    const id = `community-reservation-${suffix}`;
    reservationIds.push(id);
    db.prepare(
      "INSERT INTO reservations(id,user_id,event_id,quantity,total,amount_rial,status,request_key,created_at,payment_state,attendee_name,attendee_phone) VALUES(?,?,?,?,?,?,'confirmed',?,?, 'paid',?,?)",
    ).run(
      id,
      userId,
      eventId,
      1,
      12000,
      120000,
      `community-key-${suffix}`,
      now - 100000 + suffix,
      `Snapshot ${suffix}`,
      `0999999${String(7000 + suffix).slice(-4)}`,
    );
    return id;
  };
  try {
    const endedAt = now - 60_000;
    db.prepare(
      "UPDATE events SET starts_at=?,ends_at=?,registration_ends_at=? WHERE id IN (?,?,?)",
    ).run(
      endedAt - 3_600_000,
      endedAt,
      endedAt - 3_600_000,
      realEventId,
      secondRealEventId,
      sampleEventId,
    );
    db.prepare("UPDATE events SET sample=1 WHERE id=?").run(sampleEventId);
    purchase(buyer.id, realEventId, 1);
    purchase(buyer.id, secondRealEventId, 3);
    db.prepare(
      "UPDATE reservations SET payment_state='skipped_dev' WHERE id=?",
    ).run("community-reservation-3");
    purchase(stranger.id, sampleEventId, 2);

    check(
      (
        await call(
          `/api/events/${realEventId}/reviews`,
          { rating: 5, comment: "آزمون" },
          stranger.token,
        )
      ).status === 403,
      "Only a confirmed buyer can submit a review",
    );
    check(
      (
        await call(
          `/api/events/${sampleEventId}/reviews`,
          { rating: 5, comment: "نمونه" },
          stranger.token,
        )
      ).status === 403,
      "Sample events never accept reviews even with a confirmed reservation",
    );
    const wrongOrigin = await call(
      `/api/events/${realEventId}/reviews`,
      { rating: 5, comment: "آزمون" },
      buyer.token,
      "https://not-the-site.example",
    );
    check(
      wrongOrigin.status === 403,
      "Review mutations reject cross-origin requests",
    );

    const submitted = await call(
      `/api/events/${realEventId}/reviews`,
      { rating: 4, comment: "تجربهٔ اول" },
      buyer.token,
    );
    check(
      submitted.status === 200 && submitted.data.status === "pending",
      "Eligible review enters pending moderation",
    );
    const reviewId = db
      .prepare("SELECT id FROM event_reviews WHERE event_id=? AND user_id=?")
      .get(realEventId, buyer.id).id;
    const privateView = await call(
      `/api/events/${realEventId}/reviews`,
      undefined,
      buyer.token,
    );
    const publicView = await call(`/api/events/${realEventId}/reviews`);
    check(
      privateView.data.viewerReview?.id === reviewId &&
        privateView.data.reviews.length === 0,
      "The author can see a pending review while public visitors cannot",
    );
    check(
      publicView.data.rating_count === 0 &&
        publicView.data.rating_average === null,
      "Pending reviews do not affect public ratings",
    );
    check(
      (
        await request(
          "PUT",
          `/api/host/reviews/${reviewId}`,
          { comment: "پاسخ نامعتبر" },
          stranger.token,
        )
      ).status === 403,
      "A non-host cannot reply to an event review",
    );
    check(
      (await call("/api/admin/reviews", undefined, host.token)).status === 403,
      "A host without admin access cannot read the moderation queue",
    );
    check(
      (await call("/api/host?page=1.5", undefined, host.token)).status === 400,
      "The legacy zero-based attendee API rejects fractional page offsets",
    );

    await request(
      "PUT",
      `/api/host/reviews/${reviewId}`,
      { comment: "پاسخ میزبان" },
      host.token,
    );
    const reply = db
      .prepare("SELECT id,status FROM review_replies WHERE review_id=?")
      .get(reviewId);
    check(
      reply?.status === "pending",
      "Host replies have an independent pending state",
    );
    const hostView = await call("/api/host/reviews", undefined, host.token);
    check(
      hostView.status === 200 &&
        hostView.data.items.some((item) => item.id === reviewId),
      "A host can review feedback on the host's own events",
    );
    const hostCannotSeeCustomers = await call(
      "/api/host/customers",
      undefined,
      stranger.token,
    );
    check(
      hostCannotSeeCustomers.status === 403,
      "Customer records require the host role",
    );

    const queue = await call(
      "/api/admin/reviews?status=pending",
      undefined,
      admin.token,
    );
    check(
      queue.status === 200 && queue.data.items.length >= 2,
      "Only an admin can inspect pending reviews and host replies",
    );
    const reviewModeration = await request(
      "PATCH",
      `/api/admin/reviews/${reviewId}`,
      { kind: "review", status: "published" },
      admin.token,
    );
    check(reviewModeration.status === 200, "An admin can publish a review");
    const publishedWithoutReply = await call(
      `/api/events/${realEventId}/reviews`,
    );
    check(
      publishedWithoutReply.data.rating_count === 1 &&
        publishedWithoutReply.data.rating_average === 4 &&
        !publishedWithoutReply.data.reviews[0].reply,
      "Published reviews affect ratings while pending replies remain private",
    );
    const detail = await call(`/api/events/${realEventId}`);
    check(
      detail.data.event.rating_count === 1 &&
        detail.data.event.rating_average === 4,
      "Event detail exposes published-only rating aggregates",
    );

    const replyModeration = await request(
      "PATCH",
      `/api/admin/reviews/${reply.id}`,
      { kind: "reply", status: "published" },
      admin.token,
    );
    check(
      replyModeration.status === 200,
      "An admin can publish a host reply separately",
    );
    const publishedWithReply = await call(`/api/events/${realEventId}/reviews`);
    check(
      publishedWithReply.data.reviews[0].reply === "پاسخ میزبان",
      "A published reply appears under its review",
    );
    await request(
      "PATCH",
      `/api/admin/reviews/${reply.id}`,
      { kind: "reply", status: "hidden" },
      admin.token,
    );
    const hiddenReply = await call(`/api/events/${realEventId}/reviews`);
    check(
      hiddenReply.data.rating_count === 1 && !hiddenReply.data.reviews[0].reply,
      "Hiding a reply leaves its published review and rating intact",
    );
    await request(
      "PATCH",
      `/api/admin/reviews/${reply.id}`,
      { kind: "reply", status: "published" },
      admin.token,
    );

    await call(
      `/api/events/${realEventId}/reviews`,
      { rating: 2, comment: "ویرایش تجربه" },
      buyer.token,
    );
    const edited = await call(`/api/events/${realEventId}/reviews`);
    check(
      edited.data.rating_count === 0 && edited.data.reviews.length === 0,
      "Editing a published review returns it to moderation and removes its public rating",
    );
    await request(
      "PATCH",
      `/api/admin/reviews/${reviewId}`,
      { kind: "review", status: "published" },
      admin.token,
    );
    const restored = await call(`/api/events/${realEventId}/reviews`);
    check(
      restored.data.rating_count === 1 && restored.data.rating_average === 2,
      "An admin can restore an edited review and its new rating",
    );

    const savedNotes = await call(
      "/api/host/customers",
      { userId: buyer.id, notes: "=1+1", tags: ["بازگشت", "ویژه"] },
      host.token,
    );
    check(
      savedNotes.status === 200,
      "Hosts can save private notes and tags for a real purchaser",
    );
    const customer = await call(
      `/api/host/customers/${buyer.id}`,
      undefined,
      host.token,
    );
    check(
      customer.data.customer?.notes === "=1+1" &&
        customer.data.customer?.tags.includes("بازگشت") &&
        customer.data.history[0]?.attendee_name === "Snapshot 3" &&
        customer.data.history[0]?.is_demo === 1,
      "CRM joins account identity, demo-labeled booking snapshots and host-private metadata",
    );
    const searched = await call(
      "/api/host/customers?q=Snapshot%201",
      undefined,
      host.token,
    );
    check(
      searched.status === 200 &&
        searched.data.customers?.[0]?.purchase_count === 2 &&
        searched.data.customers?.[0]?.demo_count === 1 &&
        searched.data.customers?.[0]?.spend === 12000,
      "CRM search matches one booking snapshot, preserves full totals and excludes demo spend",
    );
    const sampleCustomer = await call(
      "/api/host/customers?q=Snapshot%202",
      undefined,
      host.token,
    );
    check(
      sampleCustomer.status === 200 &&
        sampleCustomer.data.customers?.[0]?.demo_count === 1 &&
        sampleCustomer.data.customers?.[0]?.spend === 0,
      "Sample event bookings are labeled demo and never treated as collected money",
    );
    const csv = await request(
      "GET",
      "/api/host/customers/export",
      undefined,
      host.token,
    );
    check(
      csv.status === 200 && csv.text.includes("'=1+1"),
      "CRM export includes all matches and escapes spreadsheet formulas",
    );

    await request(
      "PATCH",
      `/api/admin/reviews/${reviewId}`,
      { kind: "review", status: "hidden" },
      admin.token,
    );
    const hidden = await call(`/api/events/${realEventId}/reviews`);
    check(
      hidden.data.rating_count === 0,
      "Hiding a review removes it from public ratings",
    );
    const withdrawn = await request(
      "DELETE",
      `/api/reviews/${reviewId}`,
      undefined,
      buyer.token,
    );
    check(
      withdrawn.status === 200 &&
        db.prepare("SELECT status FROM event_reviews WHERE id=?").get(reviewId)
          .status === "withdrawn",
      "Withdrawing a review preserves its unique audit record",
    );
  } finally {
    db.prepare("DELETE FROM host_customer_metadata WHERE host_id=?").run(
      host.id,
    );
    db.prepare(
      "DELETE FROM review_replies WHERE review_id IN (SELECT id FROM event_reviews WHERE event_id IN (?,?,?))",
    ).run(realEventId, secondRealEventId, sampleEventId);
    db.prepare("DELETE FROM event_reviews WHERE event_id IN (?,?,?)").run(
      realEventId,
      secondRealEventId,
      sampleEventId,
    );
    db.prepare("DELETE FROM reservations WHERE id IN (?,?,?)").run(
      ...reservationIds,
    );
    db.prepare("DELETE FROM events WHERE id IN (?,?,?)").run(
      realEventId,
      secondRealEventId,
      sampleEventId,
    );
  }
}
