import type { Metadata } from "next";
import { Coffee } from "lucide-react";
import { AppLink } from "@/components/event/app-navigation";
import { Header } from "@/components/evenline/primitives";
import { copy } from "@/locales/fa";

export const metadata: Metadata = { title: copy.cafeHopping };

export default function CafesPage() {
  return <main>
    <Header title={copy.cafeHopping} />
    <section className="el-empty" aria-labelledby="cafes-empty-title">
      <Coffee size={56} strokeWidth={1.3} aria-hidden="true" />
      <h2 id="cafes-empty-title">{copy.cafesEmpty}</h2>
      <p>{copy.cafesEmptyDescription}</p>
      <AppLink className="el-button el-button-primary" href="/events">{copy.findEvents}</AppLink>
    </section>
  </main>;
}
