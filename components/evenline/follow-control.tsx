"use client";

import { useAuth } from "@/components/event/auth-context";
import { useAppNavigate } from "@/components/event/app-navigation";
import { useFollowState } from "@/hooks/use-follow-state";
import type { Organizer } from "@/lib/community-types";
import { copy } from "@/locales/fa";

export function FollowButton({ organizer, onChange }: { organizer: Organizer; onChange?: () => void }) {
  return <FollowControl resource="organizers" id={organizer.id} ownerId={organizer.id} following={!!organizer.following} onChange={onChange} />;
}

export function FollowControl({ resource, id, ownerId, following, onChange }: {
  resource: "organizers" | "collections"; id: string; ownerId: string; following: boolean; onChange?: () => void;
}) {
  const { user, loading } = useAuth();
  const navigate = useAppNavigate();
  const state = useFollowState(resource, id, user?.id);
  const selected = state.following ?? following;
  return <div className="el-follow-control">
    <button type="button" className={`el-follow${selected ? " selected" : ""}`} disabled={loading || state.busy || user?.id === ownerId}
      aria-pressed={selected} aria-busy={!!state.busy} onClick={() => {
        if (!user) {
          navigate(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
          return;
        }
        void state.toggle(selected).then(changed => { if (changed) onChange?.(); });
      }}>{selected ? copy.followingAction : copy.follow}</button>
    {state.error && <p role="alert" className="el-inline-error">{state.error}</p>}
  </div>;
}
