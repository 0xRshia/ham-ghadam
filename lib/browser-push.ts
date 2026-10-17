const appPushScope = "/app-notifications/";

export async function getAppPushRegistration() {
  const registration = await navigator.serviceWorker.getRegistration(appPushScope);
  // getRegistration matches scopes, so it can return Kavenegar's root worker.
  return registration?.scope === new URL(appPushScope, location.origin).href
    ? registration
    : undefined;
}

export async function registerAppPushWorker() {
  const registration = await navigator.serviceWorker.register("/notifications-sw.js", {
    scope: appPushScope,
  });
  if (registration.active?.state === "activated") return registration;
  const worker = registration.installing ?? registration.waiting ?? registration.active;
  if (!worker) throw new Error("App push worker is unavailable");

  // navigator.serviceWorker.ready follows the page's scope, owned by Kavenegar.
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error("App push worker activation timed out")), 15000);
    function finish(error?: Error) {
      window.clearTimeout(timeout);
      worker!.removeEventListener("statechange", checkState);
      if (error) reject(error);
      else resolve();
    }
    function checkState() {
      if (worker!.state === "activated") finish();
      else if (worker!.state === "redundant") finish(new Error("App push worker activation failed"));
    }
    worker.addEventListener("statechange", checkState);
    checkState();
  });
  return registration;
}
