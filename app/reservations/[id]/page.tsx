import { TicketPage } from "@/components/evenline/tickets";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <TicketPage id={(await params).id}/>; }
