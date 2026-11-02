export type ArCamera = { deviceId: string; label: string };

// `environment` selects a direction, not a lens. Prefer a named physical 1x
// camera over ultrawide/telephoto and virtual dual/triple camera devices.
export function rearCameras(devices: Pick<MediaDeviceInfo, "kind" | "deviceId" | "label">[], currentId = ""): ArCamera[] {
  const front = /front|user|facetime|selfie|avant|vorder|前置|جلو/i;
  const rear = /back|rear|environment|arrière|rück|trasera|پشت|خلف|后置|後置/i;
  const secondary = /ultra|telephoto|tele camera|depth|macro|0[.,]5|فوق|عریض/i;
  const virtual = /dual|triple|fusion|virtual/i;
  function score(camera: ArCamera) {
    const label = camera.label;
    return (rear.test(label) ? 30 : 0) + (/main|primary|wide angle|wide camera|اصلی/i.test(label) ? 60 : 0)
      + (/^back camera$|camera2?\s*0[, ]/i.test(label) ? 70 : 0)
      + (camera.deviceId === currentId ? 5 : 0) - (secondary.test(label) ? 200 : 0) - (virtual.test(label) ? 80 : 0);
  }
  return devices.filter(device => device.kind === "videoinput" && device.deviceId && !front.test(device.label))
    .map(device => ({ deviceId: device.deviceId, label: device.label }))
    .sort((a,b) => score(b)-score(a));
}

export async function prepareArCamera(preferred: string | undefined, signal: AbortSignal, media = navigator.mediaDevices) {
  signal.throwIfAborted();
  // Unlock labels before ranking lenses. Release the probe before the SDK opens
  // its stream: iOS cannot reliably run two physical camera streams together.
  const probe = await media.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } });
  let currentId = "";
  try { currentId = probe.getVideoTracks()[0]?.getSettings().deviceId ?? ""; }
  finally { probe.getTracks().forEach(track => track.stop()); }
  signal.throwIfAborted();
  const cameras = rearCameras(await media.enumerateDevices(), currentId);
  signal.throwIfAborted();
  const selected = cameras.find(camera => camera.deviceId === preferred) ?? cameras[0];
  if (!selected) throw new Error("camera");
  return { cameras, selected };
}

export function bindArCamera(deviceId: string, media = navigator.mediaDevices) {
  // XR8.run only exposes FRONT/BACK, not a deviceId. Adapt its camera requests
  // for this session without changing the distributed engine. Restore on exit.
  const original = media.getUserMedia;
  let disposed = false;
  const streams = new Set<MediaStream>();
  const request: typeof media.getUserMedia = async constraints => {
    if (disposed) throw new DOMException("AR session ended", "AbortError");
    if (!constraints?.video) return original.call(media, constraints);
    const video = typeof constraints.video === "object" ? { ...constraints.video } : {};
    delete video.facingMode;
    const stream = await original.call(media, { ...constraints, video: { ...video, deviceId: { exact: deviceId } } });
    const actual = stream.getVideoTracks()[0]?.getSettings().deviceId;
    if (disposed || (actual && actual !== deviceId)) {
      stream.getTracks().forEach(track => track.stop());
      throw new DOMException("Selected camera unavailable", disposed ? "AbortError" : "NotReadableError");
    }
    streams.add(stream);
    return stream;
  };
  media.getUserMedia = request;
  return () => {
    disposed = true;
    if (media.getUserMedia === request) media.getUserMedia = original;
    streams.forEach(stream => stream.getTracks().forEach(track => track.stop())); streams.clear();
  };
}
