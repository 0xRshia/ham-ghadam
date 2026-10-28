import { requireFastPage } from "@/lib/fast-page-auth";
import { fastOrganizers } from "@/lib/fast-events";
import { FastShell } from "@/components/fast/shell";
import { FastEventList } from "@/components/fast/event-list";
import { fastEventList } from "@/lib/fast-event-list";
export default async function Page() {
  await requireFastPage();
  const [organizers, initial] = await Promise.all([fastOrganizers(), fastEventList(new URL("http://localhost/api/fast/events"))]);
  return <FastShell><FastEventList organizers={organizers} initial={initial} /></FastShell>;
}
