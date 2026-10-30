"use client";
import { type ReactNode, useState } from "react";
import { useSearchParams } from "next/navigation";
import { NotificationsContent } from "./notifications";
import { useFollowRefresh } from "@/hooks/use-follow-state";
import { FollowButton, FollowControl } from "./follow-control";
import { OrganizerBiography, OrganizerCover, ShareOrganizer } from "./organizer-profile-parts";
import { InstagramLink } from "./instagram-link";
import { OrganizerLink } from "./organizer-link";
export { FollowButton, FollowControl } from "./follow-control";
import { AppLink, useAppNavigate } from "@/components/event/app-navigation";
import { useAuth } from "@/components/event/auth-context";
import { useResource } from "@/hooks/use-resource";
import { useEventCatalog } from "@/hooks/use-event-catalog";
import { api } from "@/lib/client";
import { fa, faDigits, type EventItem, type User } from "@/lib/types";
import type { Collection, Organizer, Profile } from "@/lib/community-types";
import { copy } from "@/locales/fa";
import { organizerBackHref } from "@/lib/organizer-navigation";
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
  return <article className="el-collection-card"><AppLink href={`/collections/${encodeURIComponent(collection.id)}`}><div className="el-collection-image"><OrganizerCover src={collection.image} /></div><div className="el-collection-title"><h3>{collection.title}</h3><p>{copy.by} {collection.owner_name}</p></div></AppLink><div className="el-collection-meta"><span>{fa(collection.event_count)} {copy.upcomingCount}</span><div className="el-avatar-stack" aria-label={`${fa(collection.followers)} ${copy.followers}`}>{collection.follower_preview.map((follower,index)=><Avatar key={index} name={follower.name} src={follower.avatar_url}/>)}</div></div>{user?.id===collection.owner_id ? <AppLink className="el-button el-button-secondary" href={`/collections/${collection.id}/edit`}>{copy.editCollection}</AppLink> : <FollowControl resource="collections" id={collection.id} ownerId={collection.owner_id} following={collection.following} />}</article>;
}
export function ProfilePage() {
  return <main><Header title={copy.profile} actions={<><AppLink className="el-icon-button" href="/account/edit" aria-label={copy.editProfile}><FigmaIcon screen={44} name="edit-2" /></AppLink><AppLink className="el-icon-button" href="/settings" aria-label={copy.settings}><FigmaIcon screen={44} name="settings" /></AppLink></>} /><AccountGate><ProfileContent /></AccountGate></main>;
}
function ProfileContent() {
  const resource = useResource<{ profile: Profile; user: User; counts: { bookings: number; following: number } }>("/api/profile");
  useFollowRefresh(resource.reload);
  const collections = useResource<{ collections: Collection[] }>("/api/collections");
  const { catalog } = useEventCatalog(); const { ids } = useFavorites();
  const [tab, setTab] = useState("events");
  const [creating, setCreating] = useState(false); const [error,setError] = useState(""); const navigate = useAppNavigate();
  if (resource.loading) return <LoadingState />;
  if (!resource.data || resource.error) return <ErrorState message={resource.error} retry={resource.reload} />;
  const { profile, user, counts } = resource.data;
  const events = catalog?.events.filter(event => ids.includes(event.id)) ?? [];
  return <>
    <div className="el-profile-identity"><Avatar large name={user.name} src={profile.avatar_url} /><h2>{user.name || copy.profile}</h2><p><bdi>{faDigits(user.phone)}</bdi></p></div>
    <div className="el-profile-stats"><AppLink href="/favorites"><strong>{fa(ids.length)}</strong><span>{copy.favorites}</span></AppLink><AppLink href="/following"><strong>{fa(counts.following)}</strong><span>{copy.following}</span></AppLink></div>
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
  const resource = useResource<{ profile: Profile; user: User }>("/api/profile");
  const email = useResource<EmailStatus>("/api/account/email");
  if (resource.loading || email.loading) return <LoadingState />;
  if (!resource.data) return <ErrorState message={resource.error} retry={resource.reload} />;
  if (!email.data) return <ErrorState message={email.error} retry={email.reload}/>;
  return <ProfileForm profile={resource.data.profile} user={resource.data.user} email={email.data.account?.email ?? null}/>;
}
function ProfileForm({ profile, user, email }: { profile: Profile; user: User; email:string|null }) {
  const { refresh } = useAuth(); const [error,setError] = useState("");const [busy,setBusy] = useState(false);const [saved,setSaved] = useState(false),[avatar,setAvatar]=useState(profile.avatar_url);
  return <form className="el-profile-edit el-profile-form" onSubmit={async event => { event.preventDefault();const values=new FormData(event.currentTarget);setBusy(true);setError("");setSaved(false);try{await api("/api/me",{name:values.get("name")},"PATCH");await refresh();setSaved(true);}catch(error){setError((error as Error).message);}finally{setBusy(false);} }}>
    <AvatarEditor name={user.name} src={avatar} onChange={setAvatar}/><div className="el-edit-fields">
      <label className="el-input-field"><span>{copy.fullName}</span><span className="el-profile-input"><FigmaIcon screen={45} name="user"/><input name="name" defaultValue={user.name} required minLength={2} maxLength={80} autoComplete="name" /></span></label>
      <div className="el-input-field"><span>{copy.email}</span><AppLink className="el-profile-input" href="/settings/email" aria-label={copy.emailSettings}><FigmaIcon screen={45} name="mail"/><bdi dir={email ? "ltr" : "rtl"}>{email ?? copy.noVerifiedEmail}</bdi></AppLink></div>
    </div>{error && <ErrorState message={error} />}{saved && <p role="status">{copy.changesSaved}</p>}<Button disabled={busy} aria-busy={busy}>{copy.saveChanges}</Button>
    <div className="el-profile-additional"><AppLink href="/account/details">{copy.profileDetails}</AppLink>{avatar && <button type="button" className="el-text-action" disabled={busy} onClick={async()=>{setBusy(true);setError("");try{await api("/api/profile/avatar",{},"DELETE");setAvatar(null);}catch(error){setError((error as Error).message);}finally{setBusy(false);}}}>{copy.removeAvatar}</button>}</div>
  </form>;
}
export function ProfileDetailsPage() {return <main><Header title={copy.profileDetails} back="/account/edit"/><AccountGate><ProfileDetails/></AccountGate></main>;}
function ProfileDetails() {
  const resource=useResource<{profile:Profile;cities:string[]}>("/api/profile"),[busy,setBusy]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState(false);
  if(resource.loading)return <LoadingState/>;
  if(!resource.data)return <ErrorState message={resource.error} retry={resource.reload}/>;
  return <form className="el-profile-edit" onSubmit={async event=>{event.preventDefault();const fields=new FormData(event.currentTarget);setBusy(true);setError("");setSaved(false);try{await api("/api/profile",{city:fields.get("city"),bio:fields.get("bio")},"PATCH");setSaved(true);}catch(error){setError((error as Error).message);}finally{setBusy(false);}}}><div className="el-edit-fields"><label className="el-input-field"><span>{copy.city}</span><select name="city" defaultValue={resource.data.profile.city} aria-describedby={resource.data.profile.city && !resource.data.cities.includes(resource.data.profile.city) ? "profile-city-help" : undefined}><option value="">{copy.cityUnselected}</option>{resource.data.profile.city && !resource.data.cities.includes(resource.data.profile.city) && <option value={resource.data.profile.city} disabled>{resource.data.profile.city}</option>}{resource.data.cities.map(city => <option key={city} value={city}>{city}</option>)}</select>{resource.data.profile.city && !resource.data.cities.includes(resource.data.profile.city) && <small id="profile-city-help">{copy.cityUnavailable}</small>}</label><label className="el-input-field"><span>{copy.biography}</span><textarea name="bio" defaultValue={resource.data.profile.bio} maxLength={1000} rows={3}/></label></div>{error && <ErrorState message={error}/>} {saved && <p role="status">{copy.changesSaved}</p>}<Button disabled={busy}>{copy.saveChanges}</Button></form>;
}
export function OrganizerCard({ organizer }: { organizer: Organizer }) {
  return <article className="el-collection-card el-onboarding-organizer"><OrganizerLink organizerId={organizer.id}><div className="el-collection-image"><OrganizerCover src={organizer.cover_image} /></div><div className="el-collection-title"><h3>{organizer.name}</h3><p>{organizer.bio || `${fa(organizer.event_count)} ${copy.events}`}</p></div></OrganizerLink><InstagramLink handle={organizer.instagram_handle} /><div className="el-collection-meta"><span>{organizer.city}</span><span>{fa(organizer.followers)} {copy.followers}</span></div><FollowButton organizer={organizer}/></article>;
}
export function OrganizerRow({ organizer }: { organizer: Organizer }) {
  return <article className="el-organizer-row"><div className="el-organizer-row-identity"><OrganizerLink organizerId={organizer.id}><Avatar name={organizer.name} src={organizer.avatar_url} /><div><h3>{organizer.name}</h3><p>{organizer.city || `${fa(organizer.event_count)} ${copy.events}`}</p></div></OrganizerLink><InstagramLink handle={organizer.instagram_handle} /></div><FollowButton organizer={organizer} /></article>;
}
export function FollowingPage() {
  const { user, loading } = useAuth();
  const params = useSearchParams();
  const discovering = params.get("view") === "discover";
  const next = params.get("view") === "discover" ? "/following?view=discover" : "/following";
  return <main className="el-following-page"><Header title={discovering ? copy.discoverOrganizers : copy.following} back={discovering ? "/" : "/account"} />
    {loading ? <LoadingState /> : user || discovering ? <FollowingContent key={user?.id ?? "guest"} /> : <div className="el-empty"><Illustration kind="password" /><h2>{copy.accountRequired}</h2><AppLink className="el-button el-button-primary" href={`/login?next=${encodeURIComponent(next)}`}>{copy.login}</AppLink></div>}
  </main>;
}
function FollowingContent() {
  const { user } = useAuth();
  const params = useSearchParams();
  const [showAll, setShowAll] = useState(params.get("view") === "discover");
  const followed = useResource<{ organizers: Organizer[] }>("/api/organizers?following=true");
  const all = useResource<{ organizers: Organizer[] }>("/api/organizers");
  useFollowRefresh(followed.reload);
  useFollowRefresh(all.reload);
  const followedIds = new Set(followed.data?.organizers.map(organizer => organizer.id));
  const suggestions = all.data?.organizers.filter(organizer => organizer.id !== user?.id && !organizer.following && !followedIds.has(organizer.id)).slice(0, 8) ?? [];
  const current = showAll ? all : followed;
  return <>
    <div className="el-segmented" role="group" aria-label={copy.organizers}>
      {user && <button aria-pressed={!showAll} onClick={() => setShowAll(false)}>{copy.following}</button>}
      <button aria-pressed={showAll} onClick={() => setShowAll(true)}>{copy.discoverOrganizers}</button>
    </div>
    <section className="el-following-list" aria-label={showAll ? copy.discoverOrganizers : copy.following}>
      {current.loading ? <LoadingState /> : current.error ? <ErrorState message={current.error} retry={current.reload} /> : current.data?.organizers.length ? current.data.organizers.map(organizer => <OrganizerRow key={organizer.id} organizer={organizer} />) : <EmptyContent title={copy.noFollowing} />}
    </section>
    {!showAll && !followed.loading && !followed.error && <section className="el-organizer-suggestions" aria-label={copy.suggestedOrganizers}>
      <h2>{copy.suggestedOrganizers}</h2>
      {all.loading ? <LoadingState /> : all.error ? <ErrorState message={all.error} retry={all.reload} /> : suggestions.length ? <div className="el-organizer-suggestion-carousel">{suggestions.map(organizer => <article className="el-organizer-suggestion" key={organizer.id}>
        <OrganizerLink organizerId={organizer.id}><Avatar name={organizer.name} src={organizer.avatar_url} /><h3>{organizer.name}</h3><p>{organizer.city || fa(organizer.event_count) + " " + copy.events}</p></OrganizerLink>
        <FollowButton organizer={organizer} />
      </article>)}</div> : <p className="el-muted">{copy.noOrganizerSuggestions}</p>}
    </section>}
  </>;
}
export function OrganizerPage({ id }: { id: string }) {
  const { user, loading } = useAuth();
  const params = useSearchParams();
  const navigate = useAppNavigate();
  const back = organizerBackHref(id, params.get("from"));
  const onBack = () => navigate(back, { replace: true });
  if (loading) return <main><Header back={back} onBack={onBack} /><LoadingState /></main>;
  // Isolate tab/biography state when navigating between organizer profiles.
  return <OrganizerProfile key={`${id}:${user?.id ?? "guest"}`} id={id} back={back} onBack={onBack} />;
}
function OrganizerProfile({ id, back, onBack }: { id: string; back: string; onBack: () => void }) {
  const { user } = useAuth();
  const resource = useResource<{ organizer: Organizer; events: EventItem[]; collections: Collection[] }>("/api/organizers/" + encodeURIComponent(id));
  useFollowRefresh(resource.reload);
  const [tab, setTab] = useState("events");
  if (resource.loading) return <main><Header back={back} onBack={onBack} /><LoadingState /></main>;
  if (!resource.data || resource.error) return <main><Header back={back} onBack={onBack} /><ErrorState message={resource.error || copy.organizerUnavailable} retry={resource.reload} />{resource.errorStatus === 404 && <p className="el-organizer-unavailable">{copy.organizerUnavailable}<AppLink href="/events">{copy.findEvents}</AppLink></p>}</main>;
  const { organizer, events, collections } = resource.data;
  const owner = user?.id === organizer.id;
  return <main className="el-organizer-page">
    <div className="el-organizer-banner"><OrganizerCover src={organizer.cover_image} /><Header back={back} onBack={onBack} actions={<ShareOrganizer name={organizer.name} />} /></div>
    <div className="el-organizer-identity"><Avatar name={organizer.name} src={organizer.avatar_url} large /><h1>{organizer.name}</h1><InstagramLink handle={organizer.instagram_handle} /><p aria-live="polite">{fa(organizer.followers)} {copy.followers}</p>
      <div className="el-organizer-actions">{owner ? <><AppLink className="el-button el-button-primary" href="/account/edit">{copy.editProfile}</AppLink><AppLink className="el-button el-button-secondary" href="/host">{copy.hostDashboard}</AppLink></> : <FollowButton organizer={organizer} />}</div>
    </div>
    <Tabs value={tab} onChange={setTab} />
    <div id="profile-panel" role="tabpanel" aria-labelledby={"tab-" + tab} className="el-organizer-panel">
      {tab === "events" && (events.length ? <div className="el-list-stack">{events.map(event => <EventCard key={event.id} event={event} variant="list" action="price" />)}</div> : <EmptyContent title={copy.noOrganizerEvents} />)}
      {tab === "collections" && (collections.length ? <div className="el-collection-carousel">{collections.map(collection => <CollectionCard key={collection.id} collection={collection} />)}</div> : <EmptyContent />)}
      {tab === "about" && <div className="el-organizer-about"><OrganizerBiography text={organizer.bio} />{organizer.city && <p className="el-muted">{organizer.city}</p>}</div>}
    </div>
  </main>;
}
export function NotificationsPage() {
  return <main className="el-notifications-page"><Header title={copy.notifications} /><AccountGate><NotificationsContent /></AccountGate></main>;
}
