"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ClientError } from "@/lib/client";
export function useResource<T>(url: string | null, initialData?: T) {
  const initial = useRef({ url, data: initialData });
  const leftInitialUrl = useRef(false);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ url: string | null; data: T | null; error: string; errorStatus?: number; loading: boolean }>({ url: initialData === undefined ? null : url, data: initialData ?? null, error: "", loading: initialData === undefined });
  useEffect(() => {
    if (url !== initial.current.url) leftInitialUrl.current = true;
    if (!url || (!leftInitialUrl.current && revision === 0 && initial.current.data !== undefined)) return;
    let active = true;
    void api<T>(url).then(data => { if (active) setState({ url, data, error: "", loading: false }); }).catch((error: Error) => { if (active) setState({ url, data: null, error: error.message, errorStatus: error instanceof ClientError ? error.status : undefined, loading: false }); });
    return () => { active = false; };
  }, [url, revision]);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  return { data: state.url === url ? state.data : null, error: state.url === url ? state.error : "", errorStatus: state.url === url ? state.errorStatus : undefined, loading: !!url && (state.url !== url || state.loading), reload };
}
