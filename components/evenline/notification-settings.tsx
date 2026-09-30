"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useResource } from "@/hooks/use-resource";
import { api } from "@/lib/client";
import type { NotificationPreferences, Profile } from "@/lib/community-types";
import { copy } from "@/locales/fa";
import { AccountGate } from "./community";
import { ErrorState, Header, LoadingState } from "./primitives";
import { FigmaIcon } from "./source-icon";
import { AppLink } from "@/components/event/app-navigation";
import type { EmailStatus } from "./email-settings";

const subscribeMounted = () => () => {};
async function endpointFingerprint(endpoint: string) {
  const bytes = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(bytes),value => value.toString(16).padStart(2,"0")).join("");
}
type PushState = { configured: boolean; publicKey: string | null; subscribed: boolean };
function NotificationRow({ title, description, icon, checked, disabled, onChange }: { title: string; description: string; icon: string; checked: boolean; disabled?: boolean; onChange: (enabled: boolean) => void }) {
  return <label className="el-notification-setting"><span className="el-notification-setting-icon"><FigmaIcon screen={50} name={icon}/></span><span className="el-notification-setting-copy"><strong>{title}</strong><span>{description}</span></span><input type="checkbox" role="switch" className="el-toggle" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)}/></label>;
}
function BrowserPushSetting() {
  const [state,setState] = useState<PushState | null>(null), [busy,setBusy] = useState(false), [error,setError] = useState("");
  const mounted = useSyncExternalStore(subscribeMounted,()=>true,()=>false);
  const supported = mounted ? "serviceWorker" in navigator && "PushManager" in window && "Notification" in window : null;
  const denied = !!supported && Notification.permission === "denied";
  useEffect(() => {
    let active = true;
    if (!supported) return;
    void (async () => {
      const registration = await navigator.serviceWorker.getRegistration("/notifications-sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      const response = await api<PushState>(`/api/push-subscriptions${subscription ? `?fingerprint=${await endpointFingerprint(subscription.endpoint)}` : ""}`);
      if (active) setState(response);
    })().catch(() => { if (active) setError(copy.pushFailed); });
    return () => { active = false; };
  },[supported]);
  async function change(enabled: boolean) {
    if (busy || !state) return;
    setBusy(true); setError("");
    let created: PushSubscription | null = null;
    try {
      if (!enabled) {
        const registration = await navigator.serviceWorker.getRegistration("/notifications-sw.js");
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          await api("/api/push-subscriptions",{ endpoint:subscription.endpoint },"DELETE");
          await subscription.unsubscribe();
        }
        setState({ ...state,subscribed:false });
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") throw new Error(copy.pushDenied);
        await navigator.serviceWorker.register("/notifications-sw.js",{ scope:"/" });
        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        const key = Uint8Array.from(atob(state.publicKey!.replace(/-/g,"+").replace(/_/g,"/")),character => character.charCodeAt(0));
        if (subscription?.options.applicationServerKey && !equalKey(subscription.options.applicationServerKey,key)) {
          await subscription.unsubscribe(); subscription = null;
        }
        if (!subscription) { subscription = await registration.pushManager.subscribe({ userVisibleOnly:true,applicationServerKey:key }); created = subscription; }
        await api("/api/push-subscriptions",subscription.toJSON());
        setState({ ...state,subscribed:true });
      }
    } catch (error) {
      if (created) await created.unsubscribe().catch(() => false);
      setError(error instanceof Error && error.message === copy.pushDenied ? copy.pushDenied : copy.pushFailed);
    } finally { setBusy(false); }
  }
  const status = supported === false ? copy.pushUnsupported : state && !state.configured ? copy.pushUnconfigured : denied ? copy.pushDenied : "";
  return <><NotificationRow title={copy.browserPush} description={copy.browserPushHint} icon="Notification" checked={!!state?.subscribed} disabled={busy || !supported || !state || (!state.configured && !state.subscribed) || (denied && !state.subscribed)} onChange={enabled => void change(enabled)}/>{status && <p className="el-notification-setting-status">{status}</p>}{error && <ErrorState message={error}/>}</>;
}
function equalKey(buffer: ArrayBuffer, key: Uint8Array) {
  const existing = new Uint8Array(buffer);
  return existing.length === key.length && existing.every((value,index) => value === key[index]);
}
function Preferences({ initial, email }: { initial: NotificationPreferences; email:EmailStatus }) {
  const [preferences,setPreferences] = useState(initial), [busy,setBusy] = useState(false), [error,setError] = useState("");
  async function change(key: keyof NotificationPreferences, enabled: boolean) {
    if (busy) return;
    setBusy(true); setError("");
    const next = { ...preferences,[key]:enabled,...(key==="email" && !enabled ? {newsletter:false} : {}) };
    try { await api("/api/profile",{ notification_preferences:next },"PATCH"); setPreferences(next); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  const rows = [
    { key:"email",title:copy.emailAlerts,description:copy.emailAlertsHint,icon:"mail" },
    { key:"newsletter",title:copy.newsletter,description:copy.newsletterHint,icon:"news" },
    { key:"following",title:copy.followingAlerts,description:copy.followingAlertsHint,icon:"user" },
    { key:"reminders",title:copy.reminderAlerts,description:copy.reminderAlertsHint,icon:"alert-circle" },
    { key:"favorites",title:copy.favoriteAlerts,description:copy.favoriteAlertsHint,icon:"heart" },
    { key:"collections",title:copy.collectionAlerts,description:copy.collectionAlertsHint,icon:"layout-grid" },
  ] as const;
  return <>{rows.map(row => <NotificationRow key={row.key} title={row.title} description={row.description} icon={row.icon} checked={preferences[row.key]} disabled={busy || (row.key==="email" && !preferences.email && (!email.configured || !email.account)) || (row.key==="newsletter" && !preferences.email)} onChange={enabled => void change(row.key,enabled)}/>)}
    {!email.configured && <p className="el-notification-setting-status">{copy.emailUnconfigured}</p>}
    <AppLink className="el-text-action" href="/settings/email">{email.account ? copy.emailSettings : copy.verifyEmail}</AppLink>
    {error && <ErrorState message={error}/>}</>;
}
function SettingsContent() {
  const resource = useResource<{ profile: Profile }>("/api/profile");
  const email = useResource<EmailStatus>("/api/account/email");
  if (resource.loading || email.loading) return <LoadingState/>;
  if (resource.error || !resource.data) return <ErrorState message={resource.error} retry={resource.reload}/>;
  if (!email.data) return <ErrorState message={email.error} retry={email.reload}/>;
  return <div className="el-notification-settings"><BrowserPushSetting/><Preferences initial={resource.data.profile.notification_preferences} email={email.data}/></div>;
}
export function NotificationSettings() {
  return <main><Header title={copy.notificationSettings} back="/settings"/><AccountGate><SettingsContent/></AccountGate></main>;
}
