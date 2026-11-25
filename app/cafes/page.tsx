import type { Metadata } from "next";
import { Header } from "@/components/evenline/primitives";
import { VenueDirectory } from "@/components/evenline/venue-directory";
import { copy } from "@/locales/fa";

export const metadata: Metadata = { title: copy.cafeHopping };

export default function CafesPage() {
  return <main>
    <Header title={copy.cafeHopping} />
    <VenueDirectory />
  </main>;
}
