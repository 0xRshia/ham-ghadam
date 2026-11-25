import { MapPin } from "lucide-react";
import { AppLink } from "@/components/event/app-navigation";
import { Header } from "@/components/evenline/primitives";
import { copy } from "@/locales/fa";

export default function NotFound() {
  return <main dir="rtl">
    <Header back="/cafes" />
    <section className="el-empty">
      <MapPin aria-hidden="true" />
      <h1>این مکان پیدا نشد</h1>
      <AppLink href="/cafes" className="el-button el-button-primary">{copy.venueResults}</AppLink>
    </section>
  </main>;
}
