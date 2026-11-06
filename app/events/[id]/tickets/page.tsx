import { Checkout } from "@/components/evenline/checkout";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <Checkout id={(await params).id} />;
}
