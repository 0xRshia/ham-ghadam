import type { Metadata, Viewport } from "next";
import { ArGame } from "@/components/squirrel-game/ar-game";
import { squirrelArCopy } from "@/locales/squirrel-fa";
import "./squirrel-game.css";

export const metadata: Metadata = {
  title: `${squirrelArCopy.title} | هم‌قدم`,
  description: squirrelArCopy.intro,
  manifest: "/game/squirrel.webmanifest",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f6f0e6" };

export default function SquirrelGamePage() {
  return <ArGame />;
}
