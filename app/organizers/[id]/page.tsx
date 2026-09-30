import { OrganizerPage } from "@/components/evenline/community";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <OrganizerPage id={(await params).id} />; }
