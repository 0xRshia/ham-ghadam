import { Catalog } from "@/components/evenline/catalog";
export default async function Page({ searchParams }: { searchParams: Promise<{ layout?: string }> }) {
  const { layout } = await searchParams;
  return <Catalog layout={layout === "v2" ? "v2" : "v1"} />;
}
