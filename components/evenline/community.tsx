"use client";
import { type ReactNode, useState } from "react";
import { AppLink, useAppNavigate } from "@/components/event/app-navigation";
import { useAuth } from "@/components/event/auth-context";
import { useResource } from "@/hooks/use-resource";
import { useEventCatalog } from "@/hooks/use-event-catalog";
import { api } from "@/lib/client";
import { fa, faDigits, date, clock, type EventItem, type User } from "@/lib/types";
import type { Collection, Organizer, Profile, NotificationItem } from "@/lib/community-types";
import { copy } from "@/locales/fa";
import { Header, Button, LoadingState, ErrorState, useFavorites } from "./primitives";
import { Illustration, FigmaIcon } from "./source-icon";
import { EventCard } from "./event-card";
import { Avatar, AvatarEditor } from "./avatar";
import type { EmailStatus } from "./email-settings";
export { Avatar } from "./avatar";

export function AccountGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  return loading ? <LoadingState /> : user ? children : <div className="el-empty"><Illustration kind="password" /><h2>{copy.welcomeBack}</h2><p>{copy.accountRequired}</p><AppLink className="el-button el-button-primary" href="/login">{copy.login}</AppLink></div>;
}
export function EmptyContent({ title = copy.noContent }: { title?: string }) {
  return <div className="el-empty el-empty-compact"><Illustration kind="events" /><h2>{title}</h2><AppLink className="el-button el-button-primary" href="/events">{copy.findEvents}</AppLink></div>;
}
function Tabs({ value, onChange }: { value: string; onChange: (tab: string) => void }) {
  return <div className="el-profile-tabs" role="tablist" aria-label={copy.profileSections}>{[{ id: "events", label: copy.events }, { id: "collections", label: copy.collections }, { id: "about", label: copy.aboutProfile }].map(tab => <button key={tab.id} role="tab" id={`tab-${tab.id}`} aria-selected={value === tab.id} aria-controls="profile-panel" tabIndex={value === tab.id ? 0 : -1} onKeyDown={event => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { const tabs = ["events","collections","about"]; const index = tabs.indexOf(value); const next = tabs[(index + (event.key === "ArrowRight" ? 2 : 1)) % 3]; onChange(next); document.getElementById(`tab-${next}`)?.focus(); } }} onClick={() => onChange(tab.id)}>{tab.label}</button>)}</div>;
}
export function CollectionCard({ collection }: { collection: Collection }) {
  const { user } = useAuth();
  return <article className="el-collection-card"><AppLink href={`/collections/${encodeURIComponent(collection.id)}`}><div className="el-collection-image">{collection.image && <img src={collection.image} alt="" loading="lazy" />}</div><div className="el-collection-title"><h3>{collection.title}</h3><p>{copy.by} {collection.owner_name}</p></div></AppLink><div className="el-collection-meta"><span>{fa(collection.event_count)} {copy.upcomingCount}</span><div className="el-avatar-stack" aria-label={`${fa(collection.followers)} ${copy.followers}`}>{collection.follower_preview.map((follower,index)=><Avatar key={index} name={follower.name} src={follower.avatar_url}/>)}</div></div>{user?.id===collection.owner_id ? <AppLink className="el-button el-button-secondary" href={`/collections/${collection.id}/edit`}>{copy.editCollection}</AppLink> : <FollowControl resource="collections" id={collection.id} ownerId={collection.owner_id} following={collection.following} />}</article>;
}
export function ProfilePage() {
  return <main><Header title={copy.profile} actions={<><AppLink className="el-icon-button" href="/account/edit" aria-label={copy.editProfile}><FigmaIcon screen={44} name="edit-2" /></AppLink><AppLink className="el-icon-button" href="/settings" aria-label={copy.settings}><FigmaIcon screen={44} name="settings" /></AppLink></>} /><AccountGate><ProfileContent /></AccountGate></main>;
}
function ProfileContent() {
  const resource = useResource<{ profile: Profile; user: User; counts: { bookings: number; following: number } }>("/api/profile");
  const collections = useResource<{ collections: Collection[] }>("/api/collections");
  const { catalog } = useEventCatalog(); const { ids } = useFavorites();
  const [tab, setTab] = useState("events");
  const [creating, setCreating] = useState(false); const [error,setError] = useState(""); const navigate = useAppNavigate();
  if (resource.loading) return <LoadingState />;
  if (!resource.data || resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  const { profile, user, counts } = resource.data;
  const events = catalog?.events.filter(event => ids.includes(event.id)) ?? [];
  return <>
    <div className="el-profile-identity"><Avatar large name={user.name} src={profile.avatar_url} /><h1>{user.name || copy.profile}</h1><p><bdi>{faDigits(user.phone)}</bdi></p></div>
    <div className="el-profile-stats"><AppLink href="/favorites"><strong>{fa(ids.length)}</strong><span>{copy.favorites}</span></AppLink><AppLink href="/reservations"><strong>{fa(counts.bookings)}</strong><span>{copy.tickets}</span></AppLink><AppLink href="/following"><strong>{fa(counts.following)}</strong><span>{copy.following}</span></AppLink></div>
    <section className="el-profile-panel"><Tabs value={tab} onChange={setTab} /><div id="profile-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
      {tab === "events" && (events.length ? <div className="el-list-stack">{events.map(event => <EventCard key={event.id} event={event} variant="list" />)}</div> : <EmptyContent title={copy.favoriteEmpty} />)}
      {tab === "collections" && <div className="el-list-stack">{collections.error && <ErrorState message={collections.error} retry={collections.reload} />}<div className="el-collection-carousel">{collections.data?.collections.map(collection => <CollectionCard key={collection.id} collection={collection} />)}</div><form className="el-collection-create" onSubmit={async event => { event.preventDefault(); const title = String(new FormData(event.currentTarget).get("title") ?? ""); setCreating(true);setError("");try { const result = await api<{ id: string }>("/api/collections",{title});navigate(`/collections/${result.id}/edit`); } catch(error){setError((error as Error).message);}finally{setCreating(false);} }}><label className="el-input-field"><span>{copy.newCollection}</span><input name="title" required minLength={2} maxLength={100} /></label><Button disabled={creating}>{copy.createCollection}</Button></form>{error && <ErrorState message={error} />}</div>}
      {tab === "about" && <div className="el-list-stack"><p>{profile.bio || copy.noBiography}</p><p className="el-muted">{profile.city}</p>{user.isHost && <AppLink className="el-button el-button-secondary" href="/host">{copy.hostDashboard}</AppLink>}{user.isAdmin && <AppLink className="el-button el-button-secondary" href="/admin">{copy.adminDashboard}</AppLink>}</div>}
    </div></section>
  </>;
}
export function EditProfilePage() {
  return <main><Header title={copy.editProfile} back="/account" /><AccountGate><EditProfileContent /></AccountGate></main>;
}
function EditProfileContent() {
  const resource = useResource<{ profile: Profile; user: User; security:{hasPassword:boolean} }>("/api/profile");
  const email = useResource<EmailStatus>("/api/account/email");
  if (resource.loading || email.loading) return <LoadingState />;
  if (!resource.data) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!email.data) return <ErrorState message={email.error} retry={email.reload}/>;
  return <ProfileForm profile={resource.data.profile} user={resource.data.user} hasPassword={resource.data.security.hasPassword} email={email.data.account?.email ?? null}/>;
}
function ProfileForm({ profile, user, hasPassword, email }: { profile: Profile; user: User; hasPassword:boolean; email:string|null }) {
  const { refresh } = useAuth(); const [error,setError] = useState("");const [busy,setBusy] = useState(false);const [saved,setSaved] = useState(false),[avatar,setAvatar]=useState(profile.avatar_url);
  return <form className="el-profile-edit el-profile-form" onSubmit={async event => { event.preventDefault();const values=new FormData(event.currentTarget);setBusy(true);setError("");setSaved(false);try{await api("/api/me",{name:values.get("name")},"PATCH");await refresh();setSaved(true);}catch(error){setError((error as Error).message);}finally{setBusy(false);} }}>
    <AvatarEditor name={user.name} src={avatar} onChange={setAvatar}/><div className="el-edit-fields">
      <label className="el-input-field"><span>{copy.fullName}</span><span className="el-profile-input"><FigmaIcon screen={45} name="user"/><input name="name" defaultValue={user.name} required minLength={2} maxLength={80} autoComplete="name" /></span></label>
      <div className="el-input-field"><span>{copy.email}</span><AppLink className="el-profile-input" href="/settings/email" aria-label={copy.emailSettings}><FigmaIcon screen={45} name="mail"/><bdi dir={email ? "ltr" : "rtl"}>{email ?? copy.noVerifiedEmail}</bdi></AppLink></div>
      <div className="el-input-field"><span className="el-profile-field-heading"><span>{copy.password}</span><AppLink href="/forgot-password">{copy.edit}</AppLink></span><AppLink className="el-profile-input" href="/forgot-password" aria-label={copy.resetPassword}><FigmaIcon screen={45} name="lock"/><span>{hasPassword ? <><span className="el-profile-password-mask" aria-hidden="true">{Array.from({length:7},(_,index)=><i key={index}/>)}</span><span className="el-sr-only">{copy.passwordIsSet}</span></> : copy.passwordNotSet}</span><FigmaIcon screen={45} name="eye-off"/></AppLink></div>
    </div>{error && <ErrorState message={error} />}{saved && <p role="status">{copy.changesSaved}</p>}<Button disabled={busy} aria-busy={busy}>{copy.saveChanges}</Button>
    <div className="el-profile-additional"><AppLink href="/account/details">{copy.profileDetails}</AppLink>{avatar && <button type="button" className="el-text-action" disabled={busy} onClick={async()=>{setBusy(true);setError("");try{await api("/api/profile/avatar",{},"DELETE");setAvatar(null);}catch(error){setError((error as Error).message);}finally{setBusy(false);}}}>{copy.removeAvatar}</button>}</div>
  </form>;
}
export function ProfileDetailsPage() {return <main><Header title={copy.profileDetails} back="/account/edit"/><AccountGate><ProfileDetails/></AccountGate></main>;}
function ProfileDetails() {
  const resource=useResource<{profile:Profile}>("/api/profile"),[busy,setBusy]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState(false);
  if(resource.loading)return <LoadingState/>;
  if(!resource.data)return <ErrorState message={resource.error} retry={resource.reload}/>;
  return <form className="el-profile-edit" onSubmit={async event=>{event.preventDefault();const fields=new FormData(event.currentTarget);setBusy(true);setError("");setSaved(false);try{await api("/api/profile",{city:fields.get("city"),bio:fields.get("bio")},"PATCH");setSaved(true);}catch(error){setError((error as Error).message);}finally{setBusy(false);}}}><div className="el-edit-fields"><label className="el-input-field"><span>{copy.city}</span><input name="city" defaultValue={resource.data.profile.city} maxLength={80}/></label><label className="el-input-field"><span>{copy.biography}</span><textarea name="bio" defaultValue={resource.data.profile.bio} maxLength={1000} rows={3}/></label></div>{error && <ErrorState message={error}/>} {saved && <p role="status">{copy.changesSaved}</p>}<Button disabled={busy}>{copy.saveChanges}</Button></form>;
}
export function FollowButton({ organizer, onChange }: { organizer: Organizer; onChange?: () => void }) {
  return <FollowControl resource="organizers" id={organizer.id} ownerId={organizer.id} following={!!organizer.following} onChange={onChange}/>;
}
export function FollowControl({ resource, id, ownerId, following, onChange }: { resource: "organizers" | "collections"; id: string; ownerId: string; following: boolean; onChange?: () => void }) {
  const { user } = useAuth();const navigate = useAppNavigate();const [override,setOverride] = useState<{ userId: string; following: boolean } | null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const selected = override && override.userId === user?.id ? override.following : following;
  return <div className="el-follow-control"><button className={`el-follow${selected ? " selected" : ""}`} disabled={busy || user?.id === ownerId} aria-pressed={selected} onClick={async () => { if (!user) {navigate(`/login?next=${encodeURIComponent(`/${resource}/${id}`)}`);return;}setBusy(true);setError("");try {await api(`/api/${resource}/${id}/follow`,{},selected ? "DELETE" : "PUT");setOverride({userId:user.id,following:!selected});onChange?.();}catch(error){setError((error as Error).message);}finally{setBusy(false);} }}>{selected ? copy.following : copy.follow}</button>{error && <p role="alert" className="el-inline-error">{error}</p>}</div>;
}
export function OrganizerCard({ organizer }: { organizer: Organizer }) {
  return <article className="el-collection-card el-onboarding-organizer"><AppLink href={`/organizers/${encodeURIComponent(organizer.id)}`}><div className="el-collection-image">{organizer.cover_image && <img src={organizer.cover_image} alt="" loading="lazy"/>}</div><div className="el-collection-title"><h3>{organizer.name}</h3><p>{organizer.bio || `${fa(organizer.event_count)} ${copy.events}`}</p></div></AppLink><div className="el-collection-meta"><span>{organizer.city}</span><span>{fa(organizer.followers)} {copy.followers}</span></div><FollowButton organizer={organizer}/></article>;
}
export function OrganizerRow({ organizer }: { organizer: Organizer }) {
  return <article className="el-organizer-row"><AppLink href={`/organizers/${organizer.id}`}><Avatar name={organizer.name} src={organizer.avatar_url} /><div><h3>{organizer.name}</h3><p>{organizer.city || `${fa(organizer.event_count)} ${copy.events}`}</p></div></AppLink><FollowButton organizer={organizer} /></article>;
}
export function FollowingPage() {
  const [showAll,setShowAll]=useState(false);const resource=useResource<{ organizers: Organizer[] }>(`/api/organizers${showAll ? "" : "?following=true"}`);
  return <main><Header title={copy.following} back="/account" /><div className="el-segmented" role="group" aria-label={copy.organizers}><button aria-pressed={!showAll} onClick={()=>setShowAll(false)}>{copy.following}</button><button aria-pressed={showAll} onClick={()=>setShowAll(true)}>{copy.discoverOrganizers}</button></div>{resource.loading ? <LoadingState /> : resource.error ? <ErrorState message={resource.error} retry={resource.reload} /> : resource.data?.organizers.length ? resource.data.organizers.map(organizer=><OrganizerRow key={organizer.id} organizer={organizer} />) : <EmptyContent title={copy.noFollowing} />}</main>;
}
export function OrganizerPage({ id }: { id: string }) {
  const resource = useResource<{ organizer: Organizer; events: EventItem[]; collections: Collection[] }>(`/api/organizers/${encodeURIComponent(id)}`);
  const [tab,setTab]=useState("events");
  if(resource.loading)return <main><Header /><LoadingState /></main>;
  if(!resource.data)return <main><Header /><ErrorState message={resource.error} retry={resource.reload} /></main>;
  const { organizer,events,collections }=resource.data;
  return <main className="el-organizer-page"><div className="el-organizer-banner">{events[0]?.image && <img src={events[0].image} alt="" />}<Header back="/following" /></div><div className="el-organizer-identity"><Avatar name={organizer.name} src={organizer.avatar_url} large /><h1>{organizer.name}</h1><p>{fa(organizer.followers)} {copy.followers}</p><FollowButton organizer={organizer} onChange={resource.reload} /></div><Tabs value={tab} onChange={setTab} /><div id="profile-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="el-list-stack">{tab === "events" && events.map(event=><EventCard key={event.id} event={event} variant="list" />)}{tab === "collections" && (collections.length ? <div className="el-collection-carousel">{collections.map(collection=><CollectionCard key={collection.id} collection={collection} />)}</div> : <EmptyContent />)}{tab === "about" && <><h2>{copy.aboutProfile}</h2><p>{organizer.bio || copy.noBiography}</p><p>{organizer.city}</p></>}</div></main>;
}
export function NotificationsPage() {
  return <main><Header title={copy.notifications} /><AccountGate><NotificationsContent /></AccountGate></main>;
}
function NotificationsContent() {
  const resource=useResource<{ notifications: NotificationItem[] }>("/api/notifications"); const [error,setError]=useState("");
  async function read(id?: string) {try{await api("/api/notifications",id ? {id} : {all:true},"PATCH");resource.reload();}catch(error){setError((error as Error).message);}}
  if(resource.loading)return <LoadingState />;
  if(resource.error)return <ErrorState message={resource.error} retry={resource.reload} />;
  return <><div className="el-notification-actions"><button className="el-text-action" onClick={()=>void read()}>{copy.markAllRead}</button></div>{error && <ErrorState message={error} />}{!resource.data?.notifications.length ? <EmptyContent title={copy.noNotifications} /> : resource.data.notifications.map(item=><AppLink key={item.id} className={`el-notification-row${item.read_at ? "" : " unread"}`} href={item.href} onNavigate={()=>{void read(item.id);}}><span className="el-notification-icon"><FigmaIcon screen={42} name="ticket" /></span><div><strong>{item.title}</strong><p>{item.message}</p><time dateTime={new Date(item.created_at).toISOString()}><FigmaIcon screen={42} name="clock" />{date(item.created_at)} · {clock(item.created_at)}</time></div></AppLink>)}</>;
}
