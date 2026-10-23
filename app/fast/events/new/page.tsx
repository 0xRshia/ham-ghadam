import { requireFastPage } from "@/lib/fast-page-auth";
import { fastOrganizers } from "@/lib/fast-events";
import { FastShell } from "@/components/fast/shell";
import { FastEventEditor } from "@/components/fast/event-editor";
export default async function Page() {
  await requireFastPage();
  return <FastShell><FastEventEditor organizers={await fastOrganizers()} /></FastShell>;
}
