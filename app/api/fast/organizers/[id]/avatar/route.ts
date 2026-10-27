import { database } from "@/db";
import { boundary, json, sameOrigin } from "@/lib/server";
import { requireFast } from "@/lib/fast-auth";
import { discardEventRequest, readEventSubmission } from "@/lib/event-media";
import { ApiError } from "@/lib/server";
import { avatarOrganizer, importOrganizerInstagramAvatar, organizerAvatarStatus, saveOrganizerAvatar } from "@/lib/organizer-avatar";
import { organizerAvatarCopy as t } from "@/locales/organizer-avatar-fa";

type Context = { params: Promise<{ id: string }> };
export const GET = (req: Request, { params }: Context) => boundary(async () => {
  await requireFast(req);
  return json(await organizerAvatarStatus((await params).id));
});
export const PUT = (req: Request, { params }: Context) => boundary(async () => {
  let organizer: Awaited<ReturnType<typeof avatarOrganizer>>;
  try {
    sameOrigin(req); await requireFast(req, true);
    organizer = await avatarOrganizer((await params).id);
  } catch (error) { await discardEventRequest(req); throw error; }
  const { uploads } = await readEventSubmission(req);
  if (uploads.length !== 1 || uploads[0].role !== "cover") throw new ApiError(400, t.invalidUpload);
  return json(await saveOrganizerAvatar(organizer, uploads[0], "upload"), 201);
});
export const POST = (req: Request, { params }: Context) => boundary(async () => {
  sameOrigin(req); await requireFast(req, true);
  return json(await importOrganizerInstagramAvatar((await params).id));
});
export const DELETE = (req: Request, { params }: Context) => boundary(async () => {
  sameOrigin(req); await requireFast(req, true);
  const id = (await params).id;
  await avatarOrganizer(id);
  await database().prepare("DELETE FROM organizer_media WHERE organizer_id=?").bind(id).run();
  return json(await organizerAvatarStatus(id));
});
