"use client";

import { useEffect, useSyncExternalStore } from "react";
import { api } from "@/lib/client";

type FollowState = { following?: boolean; busy: boolean; error: string };
const states = new Map<string, FollowState>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const serverSnapshot = () => undefined;
function publish(key: string, value: FollowState) {
  states.set(key, value);
  listeners.forEach(listener => listener());
}

// Only client-side interaction state; keys isolate accounts and resource types.
export function useFollowState(resource: "organizers" | "collections", id: string, userId?: string) {
  const key = `${userId ?? "guest"}:${resource}:${id}`;
  const state = useSyncExternalStore(subscribe, () => states.get(key), serverSnapshot);
  async function toggle(following: boolean) {
    if (!userId || states.get(key)?.busy) return false;
    publish(key, { following: state?.following, busy: true, error: "" });
    try {
      await api(`/api/${resource}/${encodeURIComponent(id)}/follow`, undefined, following ? "DELETE" : "PUT");
      publish(key, { following: !following, busy: false, error: "" });
      window.dispatchEvent(new Event("hg-follow-change"));
      return true;
    } catch (error) {
      publish(key, { following: state?.following, busy: false, error: (error as Error).message });
      return false;
    }
  }
  return { ...state, toggle };
}

export function useFollowRefresh(refresh: () => void) {
  useEffect(() => {
    window.addEventListener("hg-follow-change", refresh);
    return () => window.removeEventListener("hg-follow-change", refresh);
  }, [refresh]);
}
