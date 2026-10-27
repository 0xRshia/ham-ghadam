import { notFound, permanentRedirect } from "next/navigation";
import { getPostBySlug, getRedirect, isPublished } from "./store";
import { postPath, type Post } from "./types";

export function publicPost(kind: Post["kind"], slug: string) {
  const post = getPostBySlug(kind, slug);
  if (post && isPublished(post)) return post;
  const target = getRedirect(kind, slug);
  if (target) permanentRedirect(postPath(target));
  notFound();
}
