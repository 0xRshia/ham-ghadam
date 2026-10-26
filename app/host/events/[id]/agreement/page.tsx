import { OrganizerAgreementPage } from "@/components/legal/organizer-agreement-page";
export default async function Page({ params }: { params: Promise<{id:string}> }) { return <OrganizerAgreementPage id={(await params).id} />; }
