"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { squirrelCopy as copy } from "@/locales/squirrel-fa";

export function useGameCamera() {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"off" | "starting" | "on" | "error">("off");
  const [error, setError] = useState("");
  const stream = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const mounted = useRef(false);

  const release = useCallback(() => {
    generation.current++;
    stream.current?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    stream.current = null;
    if (video.current) { video.current.pause(); video.current.srcObject = null; }
  }, [video]);

  const stop = useCallback(() => {
    release();
    if (mounted.current) { setStatus("off"); setError(""); }
  }, [release]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; release(); };
  }, [release]);

  const start = useCallback(async () => {
    release();
    const request = generation.current;
    setError("");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError(!window.isSecureContext ? copy.insecure : copy.unsupported);
      setStatus("error");
      return false;
    }
    setStatus("starting");
    let acquired: MediaStream | null = null;
    try {
      acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } });
      if (request !== generation.current || !mounted.current || document.hidden) {
        acquired.getTracks().forEach(track => track.stop());
        return false;
      }
      if (!video.current) throw new Error("Video unavailable");
      stream.current = acquired;
      video.current.srcObject = acquired;
      await video.current.play();
      if (request !== generation.current || !mounted.current) {
        acquired.getTracks().forEach(track => track.stop());
        return false;
      }
      acquired.getVideoTracks().forEach(track => {
        track.onended = () => {
          if (request !== generation.current) return;
          release();
          setStatus("error");
          setError(copy.interrupted);
        };
      });
      setStatus("on");
      return true;
    } catch (cause) {
      acquired?.getTracks().forEach(track => track.stop());
      if (request !== generation.current || !mounted.current) return false;
      release();
      const name = cause instanceof Error ? cause.name : "";
      setError(name === "NotAllowedError" || name === "SecurityError" ? copy.denied : name === "NotFoundError" ? copy.missing : copy.failed);
      setStatus("error");
      return false;
    }
  }, [release, video]);

  return { status, error, start, stop, videoRef: video };
}
