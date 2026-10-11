import { Explorer } from "@/components/evenline/explorer";
export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const showResults = (await searchParams).view === "all";
  return <Explorer key={showResults ? "results" : "categories"} showResults={showResults}/>;
}
