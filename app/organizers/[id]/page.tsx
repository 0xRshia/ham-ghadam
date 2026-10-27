import { OrganizerPage } from "@/components/evenline/community";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  let id = (await params).id;
  // vinext keeps page params URL-encoded, unlike its API route params.
  // Decode here so the client encodes namespaced IDs exactly once for its API.
  try { id = decodeURIComponent(id); } catch { /* An unknown malformed ID keeps the normal not-found response. */ }
  return <OrganizerPage id={id} />;
}
