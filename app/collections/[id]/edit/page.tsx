import { CollectionPage } from "@/components/evenline/collections";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <CollectionPage id={(await params).id} edit/>; }
