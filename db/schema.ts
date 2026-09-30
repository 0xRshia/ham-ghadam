import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/sqlite-core";
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  phone: text("phone").notNull().unique(),
  name: text("name").notNull().default(""),
  created_at: integer("created_at").notNull(),
});
export const sessions = sqliteTable(
  "sessions",
  {
    hash: text("hash").primaryKey(),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id),
    expires_at: integer("expires_at").notNull(),
  },
  (t) => [index("idx_sessions_expiry").on(t.expires_at)],
);
export const challenges = sqliteTable("challenges", {
  id: text("id").primaryKey(),
  phone: text("phone").notNull(),
  hash: text("hash").notNull(),
  expires_at: integer("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  consumed: integer("consumed").notNull().default(0),
});
export const limits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resets_at: integer("resets_at").notNull(),
  last_at: integer("last_at").notNull(),
});
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    host_id: text("host_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    venue: text("venue").notNull(),
    address: text("address").notNull(),
    city: text("city").notNull(),
    lat: real("lat"),
    lng: real("lng"),
    maps_url: text("maps_url"),
    starts_at: integer("starts_at").notNull(),
    ends_at: integer("ends_at").notNull(),
    // Zero fails closed for inserts that omit a registration deadline.
    registration_ends_at: integer("registration_ends_at").notNull().default(0),
    price: integer("price").notNull(),
    capacity: integer("capacity"),
    image: text("image"),
    published: integer("published").notNull().default(1),
    sample: integer("sample").notNull().default(0),
    created_at: integer("created_at"),
  },
  (t) => [
    index("idx_events_city_start").on(t.city, t.starts_at),
    index("idx_events_host").on(t.host_id),
  ],
);
export const eventSeries = sqliteTable("event_series", {
  id: text("id").primaryKey(),
  host_id: text("host_id").notNull(),
  title: text("title").notNull(),
  created_at: integer("created_at").notNull(),
}, (t) => [index("idx_event_series_host").on(t.host_id)]);
export const eventPrograms = sqliteTable("event_programs", {
  event_id: text("event_id").primaryKey().references(() => events.id, { onDelete: "cascade" }),
  series_id: text("series_id").references(() => eventSeries.id, { onDelete: "set null" }),
  video_url: text("video_url"),
  agenda_json: text("agenda_json").notNull().default("[]"),
  revision: integer("revision").notNull().default(1),
}, (t) => [index("idx_event_programs_series").on(t.series_id)]);
export const eventMedia = sqliteTable("event_media", {
  id: text("id").primaryKey(),
  event_id: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["cover", "gallery"] }).notNull(),
  position: integer("position").notNull(),
  storage_key: text("storage_key").notNull().unique(),
  content_type: text("content_type").notNull(),
  byte_size: integer("byte_size").notNull(),
  created_at: integer("created_at").notNull(),
}, (t) => [uniqueIndex("idx_event_media_position").on(t.event_id, t.role, t.position)]);
export const reservations = sqliteTable(
  "reservations",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id),
    event_id: text("event_id")
      .notNull()
      .references(() => events.id),
    quantity: integer("quantity").notNull(),
    total: integer("total").notNull(),
    amount_rial: integer("amount_rial").notNull(),
    status: text("status").notNull(),
    request_key: text("request_key").notNull(),
    created_at: integer("created_at").notNull(),
    expires_at: integer("expires_at"),
    authority: text("authority"),
    reference: text("reference"),
    payment_state: text("payment_state").notNull().default("none"),
    attendee_name: text("attendee_name"),
    attendee_phone: text("attendee_phone"),
    attendee_email: text("attendee_email"),
  },
  (t) => [
    uniqueIndex("idx_reservations_request").on(t.user_id, t.request_key),
    uniqueIndex("idx_reservations_authority").on(t.authority),
    index("idx_reservations_event_status").on(
      t.event_id,
      t.status,
      t.expires_at,
    ),
    index("idx_reservations_user_created").on(t.user_id, t.created_at),
  ],
);
export const tickets = sqliteTable(
  "tickets",
  {
    id: text("id").primaryKey(),
    reservation_id: text("reservation_id").notNull().references(() => reservations.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    token: text("token").notNull(),
    created_at: integer("created_at").notNull(),
    checked_in_at: integer("checked_in_at"),
  },
  (t) => [
    uniqueIndex("idx_tickets_reservation_ordinal").on(t.reservation_id, t.ordinal),
    uniqueIndex("idx_tickets_token").on(t.token),
  ],
);
export const eventScanners = sqliteTable("event_scanners", {
  event_id: text("event_id").primaryKey().references(() => events.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  created_at: integer("created_at").notNull(),
});

export const articles = sqliteTable("articles", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  excerpt: text("excerpt").notNull().default(""),
  body: text("body").notNull(),
  category: text("category").notNull().default(""),
  author_name: text("author_name").notNull(),
  status: text("status").notNull().default("draft"),
  published_at: integer("published_at"),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
  updated_by: text("updated_by").references(() => users.id),
}, (t) => [index("idx_articles_status_published").on(t.status, t.published_at)]);

export const articleMedia = sqliteTable("article_media", {
  id: text("id").primaryKey(),
  article_id: text("article_id").notNull().unique().references(() => articles.id, { onDelete: "cascade" }),
  storage_key: text("storage_key").notNull().unique(),
  content_type: text("content_type").notNull(),
  byte_size: integer("byte_size").notNull(),
  created_at: integer("created_at").notNull(),
});

export const siteContent = sqliteTable("site_content", {
  key: text("key").primaryKey(),
  content: text("content").notNull(),
  updated_at: integer("updated_at").notNull(),
  updated_by: text("updated_by").references(() => users.id),
});

export const contactMessages = sqliteTable("contact_messages", {
  id: text("id").primaryKey(),
  user_id: text("user_id").references(() => users.id),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("new"),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
}, (t) => [index("idx_contact_status_created").on(t.status, t.created_at)]);

export const hostCustomerMetadata = sqliteTable("host_customer_metadata", {
  host_id: text("host_id").notNull().references(() => users.id),
  user_id: text("user_id").notNull().references(() => users.id),
  notes: text("notes").notNull().default(""),
  tags: text("tags").notNull().default("[]"),
  updated_at: integer("updated_at").notNull(),
}, (t) => [primaryKey({ columns: [t.host_id, t.user_id] })]);

export const eventReviews = sqliteTable("event_reviews", {
  id: text("id").primaryKey(),
  event_id: text("event_id").notNull().references(() => events.id),
  user_id: text("user_id").notNull().references(() => users.id),
  rating: integer("rating").notNull(),
  comment: text("comment").notNull().default(""),
  status: text("status").notNull().default("pending"),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
  moderated_by: text("moderated_by").references(() => users.id),
  moderated_at: integer("moderated_at"),
}, (t) => [
  uniqueIndex("idx_reviews_event_user").on(t.event_id, t.user_id),
  index("idx_reviews_event_status_created").on(t.event_id, t.status, t.created_at),
  index("idx_reviews_status_created").on(t.status, t.created_at),
]);

export const reviewReplies = sqliteTable("review_replies", {
  id: text("id").primaryKey(),
  review_id: text("review_id").notNull().unique().references(() => eventReviews.id, { onDelete: "cascade" }),
  host_id: text("host_id").notNull().references(() => users.id),
  comment: text("comment").notNull(),
  status: text("status").notNull().default("pending"),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
  moderated_by: text("moderated_by").references(() => users.id),
  moderated_at: integer("moderated_at"),
}, (t) => [index("idx_replies_status_created").on(t.status, t.created_at)]);

export const userProfiles = sqliteTable("user_profiles", {
  user_id: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  bio: text("bio").notNull().default(""),
  city: text("city").notNull().default(""),
  avatar_url: text("avatar_url"),
  interests: text("interests").notNull().default("[]"),
  notification_preferences: text("notification_preferences").notNull().default('{"events":true,"reminders":true,"following":true}'),
  onboarding_completed: integer("onboarding_completed").notNull().default(0),
  updated_at: integer("updated_at").notNull(),
});
export const organizerFollows = sqliteTable("organizer_follows", {
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizer_id: text("organizer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  created_at: integer("created_at").notNull(),
}, t => [primaryKey({ columns: [t.user_id, t.organizer_id] }), index("idx_follows_organizer").on(t.organizer_id)]);
export const eventFavorites = sqliteTable("event_favorites", {
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  event_id: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  created_at: integer("created_at").notNull(),
}, t => [primaryKey({ columns: [t.user_id, t.event_id] })]);
export const collections = sqliteTable("collections", {
  id: text("id").primaryKey(),
  owner_id: text("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  image: text("image"),
  published: integer("published").notNull().default(0),
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
}, t => [index("idx_collections_owner").on(t.owner_id, t.published)]);
export const collectionEvents = sqliteTable("collection_events", {
  collection_id: text("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
  event_id: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  added_at: integer("added_at").notNull().default(0),
}, t => [primaryKey({ columns: [t.collection_id, t.event_id] })]);
export const collectionFollows = sqliteTable("collection_follows", {
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  collection_id: text("collection_id").notNull().references(() => collections.id, { onDelete: "cascade" }),
  created_at: integer("created_at").notNull(),
}, t => [primaryKey({ columns: [t.user_id, t.collection_id] }), index("idx_collection_follows_collection").on(t.collection_id)]);
export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  href: text("href").notNull(),
  deduplication_key: text("deduplication_key").notNull(),
  created_at: integer("created_at").notNull(),
  read_at: integer("read_at"),
}, t => [uniqueIndex("idx_notifications_deduplication").on(t.user_id, t.deduplication_key), index("idx_notifications_user_created").on(t.user_id, t.created_at)]);
export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  session_hash: text("session_hash").references(() => sessions.hash, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  created_at: integer("created_at").notNull(),
});
export const pushDeliveries = sqliteTable("push_deliveries", {
  notification_id: text("notification_id").notNull().references(() => notifications.id, { onDelete: "cascade" }),
  subscription_id: text("subscription_id").notNull().references(() => pushSubscriptions.id, { onDelete: "cascade" }),
  attempts: integer("attempts").notNull().default(0),
  lease_until: integer("lease_until").notNull().default(0),
  next_attempt_at: integer("next_attempt_at").notNull().default(0),
  delivered_at: integer("delivered_at"),
  status_code: integer("status_code"),
}, t => [primaryKey({ columns: [t.notification_id, t.subscription_id] })]);
export const passwordCredentials = sqliteTable("password_credentials", {
  user_id: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  password_hash: text("password_hash").notNull(),
  updated_at: integer("updated_at").notNull(),
});
export const eventTicketTiers = sqliteTable("event_ticket_tiers", {
  id: text("id").primaryKey(),
  event_id: text("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  price: integer("price").notNull(),
  capacity: integer("capacity"),
  active: integer("active").notNull().default(1),
  position: integer("position").notNull().default(0),
}, t => [index("idx_tiers_event").on(t.event_id, t.position)]);
export const reservationItems = sqliteTable("reservation_items", {
  reservation_id: text("reservation_id").notNull().references(() => reservations.id, { onDelete: "cascade" }),
  tier_id: text("tier_id").notNull().references(() => eventTicketTiers.id),
  tier_name: text("tier_name").notNull(),
  quantity: integer("quantity").notNull(),
  unit_price: integer("unit_price").notNull(),
}, t => [primaryKey({ columns: [t.reservation_id, t.tier_id] }), index("idx_reservation_items_tier").on(t.tier_id)]);
export const passwordResetGrants = sqliteTable("password_reset_grants", {
  hash: text("hash").primaryKey(),
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires_at: integer("expires_at").notNull(),
}, t => [index("idx_password_reset_expiry").on(t.expires_at)]);

export const accountEmails = sqliteTable("account_emails", {
  user_id: text("user_id").primaryKey().references(() => users.id, { onDelete:"cascade" }),
  email: text("email").notNull(),
  verified_at: integer("verified_at").notNull(),
  enabled_at: integer("enabled_at"),
});
export const emailChallenges = sqliteTable("email_challenges", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull().references(() => users.id, { onDelete:"cascade" }),
  email: text("email").notNull(),
  hash: text("hash").notNull(),
  created_at: integer("created_at").notNull(),
  expires_at: integer("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  consumed: integer("consumed").notNull().default(0),
}, t => [index("idx_email_challenges_user").on(t.user_id,t.expires_at)]);
export const emailDeliveries = sqliteTable("email_deliveries", {
  notification_id: text("notification_id").primaryKey().references(() => notifications.id, { onDelete:"cascade" }),
  recipient: text("recipient").notNull(),
  verified_at: integer("verified_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  lease_until: integer("lease_until").notNull().default(0),
  next_attempt_at: integer("next_attempt_at").notNull().default(0),
  delivered_at: integer("delivered_at"),
  provider_id: text("provider_id"),
});
export const profileMedia = sqliteTable("profile_media", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull().unique().references(() => users.id, { onDelete:"cascade" }),
  storage_key: text("storage_key").notNull().unique(),
  content_type: text("content_type").notNull(),
  byte_size: integer("byte_size").notNull(),
  created_at: integer("created_at").notNull(),
});
