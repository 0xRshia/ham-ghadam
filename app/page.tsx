import { HomeEntry } from "@/components/evenline/home-entry";
export default async function Page({ searchParams }: { searchParams: Promise<{ layout?: string }> }) {
  const { layout } = await searchParams;
  return <HomeEntry layout={layout === "v2" ? "v2" : "v1"} />;
}
