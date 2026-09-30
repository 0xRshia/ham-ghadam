import HostEventPanel from "@/components/event/host-event-panel";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <HostEventPanel key={id} id={id} />;
}
