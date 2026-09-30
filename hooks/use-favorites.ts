"use client";
import { useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/components/event/auth-context";
import { useResource } from "@/hooks/use-resource";
import { api } from "@/lib/client";
import { copy } from "@/locales/fa";
const storageKey = "hmghadam:favorite-events";
const changeEvent = "hmghadam:favorites-changed";
function subscribe(listener: () => void) {
  window.addEventListener("storage",listener); window.addEventListener(changeEvent,listener);
  return () => { window.removeEventListener("storage",listener); window.removeEventListener(changeEvent,listener); };
}
function snapshot() { try { return localStorage.getItem(storageKey) ?? "[]"; } catch { return "[]"; } }
export function useFavorites() {
  const { user, loading: authLoading } = useAuth();
  const stored = useSyncExternalStore(subscribe,snapshot,() => "[]");
  const resource = useResource<{ ids: string[] }>(user ? `/api/favorites?account=${encodeURIComponent(user.id)}` : null);
  const [override, setOverride] = useState<{ userId: string; ids: string[] } | null>(null);
  const [error, setError] = useState("");
  const busy = useRef(false);
  let local: string[] = [];
  try { const value: unknown = JSON.parse(stored); if (Array.isArray(value)) local = value.filter((item): item is string => typeof item === "string"); } catch { /* Invalid browser preferences are discarded. */ }
  const ids = user ? override?.userId === user.id ? override.ids : resource.data?.ids ?? [] : local;
  async function toggle(id: string) {
    if (busy.current || authLoading || (user && resource.loading)) return;
    const selected = ids.includes(id);
    const next = selected ? ids.filter(item => item !== id) : [...ids,id];
    setError("");
    if (!user) {
      try { localStorage.setItem(storageKey,JSON.stringify(next)); window.dispatchEvent(new Event(changeEvent)); }
      catch { setError(copy.saveFailed); }
      return;
    }
    busy.current = true;
    setOverride({ userId: user.id, ids: next });
    try { await api(`/api/favorites/${encodeURIComponent(id)}`,{},selected ? "DELETE" : "PUT"); }
    catch (error) { setOverride({ userId: user.id, ids }); setError((error as Error).message); }
    finally { busy.current = false; }
  }
  return { ids, toggle, loading: authLoading || (!!user && resource.loading), error: error || resource.error };
}
