import { Explorer } from "@/components/evenline/explorer";
export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  return <Explorer showResults={(await searchParams).view === "all"}/>;
}
