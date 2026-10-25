import { redirect } from "next/navigation";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/events/${encodeURIComponent((await params).id)}`);
}
