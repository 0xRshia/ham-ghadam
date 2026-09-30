"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
export function useResource<T>(url: string | null) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ url: string | null; data: T | null; error: string; loading: boolean }>({ url: null, data: null, error: "", loading: true });
  useEffect(() => {
    if (!url) return;
    let active = true;
    void api<T>(url).then(data => { if (active) setState({ url, data, error: "", loading: false }); }).catch((error: Error) => { if (active) setState({ url, data: null, error: error.message, loading: false }); });
    return () => { active = false; };
  }, [url, revision]);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  return { data: state.url === url ? state.data : null, error: state.url === url ? state.error : "", loading: !!url && (state.url !== url || state.loading), reload };
}
