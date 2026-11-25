import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { ArGame } from "@/components/squirrel-game/ar-game";
import { squirrelAccountOrigin } from "@/lib/squirrel-reward-receive";
import { squirrelArCopy } from "@/locales/squirrel-fa";
import "./squirrel-game.css";

export const metadata: Metadata = {
  title: `${squirrelArCopy.title} | هم‌قدم`,
  description: squirrelArCopy.intro,
  manifest: "/game/squirrel.webmanifest",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#ffffff" };

export default async function SquirrelGamePage() {
  const host = (await headers()).get("host")?.toLowerCase();
  const homeHref = host === "game.hmghadam.com" ? squirrelAccountOrigin + "/" : "/";
  return <ArGame homeHref={homeHref} />;
}
