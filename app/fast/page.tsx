import { requireFastPage } from "@/lib/fast-page-auth";
import { fastOrganizers } from "@/lib/fast-events";
import { FastShell } from "@/components/fast/shell";
import { FastEventList } from "@/components/fast/event-list";
export default async function Page() {
  await requireFastPage();
  return <FastShell><FastEventList organizers={await fastOrganizers()} /></FastShell>;
}
