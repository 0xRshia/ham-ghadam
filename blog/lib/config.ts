import { isAbsolute, resolve } from "node:path";

export function origin() {
  const configured = process.env.BLOG_ORIGIN;
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("BLOG_ORIGIN must be configured in production");
  }
  const url = new URL(configured || "http://localhost:9090");
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error("BLOG_ORIGIN must be an HTTP(S) origin without a path or credentials");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:" && !loopback) {
    throw new Error("BLOG_ORIGIN must use HTTPS in production");
  }
  return url.origin;
}

export function dataDirectory() {
  const configured = process.env.BLOG_DATA_DIR;
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("BLOG_DATA_DIR must be configured in production");
  }
  if (configured && !isAbsolute(configured)) {
    throw new Error("BLOG_DATA_DIR must be an absolute path");
  }
  return configured || resolve(process.cwd(), "data");
}

export function databasePath() {
  return resolve(dataDirectory(), "blog.sqlite");
}
