declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    MEDIA_PATH?: string;
    MAP_TILE_URL?: string;
    NESHAN_MAP_KEY?: string;
    MAP_ATTRIBUTION_LABEL?: string;
    MAP_ATTRIBUTION_URL?: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    EMAIL_TOKEN_SECRET?: string;
    VAPID_PUBLIC_KEY?: string;
    VAPID_PRIVATE_KEY?: string;
    VAPID_SUBJECT?: string;
    NOTIFICATION_JOB_SECRET?: string;
    EVENT_SYNC_JOB_SECRET?: string;
    EVENT_SYNC_IMAGE_HOSTS?: string;
    INSTAGRAM_BUSINESS_ACCOUNT_ID?: string;
    INSTAGRAM_GRAPH_ACCESS_TOKEN?: string;
    INSTAGRAM_GRAPH_API_VERSION?: string;
    IDEKAVAN_API_KEY?: string;
    IDEKAVAN_SENDER?: string;
    OTP_SECRET?: string;
    ZARINPAL_MERCHANT_ID?: string;
    SKIP_PAY_DEV?: string;
    APP_ORIGIN?: string;
    HOST_PHONES?: string;
    ADMIN_PHONES?: string;
    FAST_ADMIN_USERNAME?: string;
    FAST_ADMIN_PASSWORD_HASH?: string;
    // TODO(PRODUCTION): REMOVE_TEMP_LOGIN
    TEMP_LOGIN_ENABLED?: string;
    SEED_SAMPLE_EVENTS?: string;
  }
}
