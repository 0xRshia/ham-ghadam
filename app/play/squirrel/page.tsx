import type { Metadata, Viewport } from "next";
import { CameraGame } from "@/components/squirrel-game/camera-game";
import { squirrelCopy } from "@/locales/squirrel-fa";
import "./squirrel-game.css";

export const metadata: Metadata = {
  title: `${squirrelCopy.title} | هم‌قدم`,
  description: squirrelCopy.intro,
  manifest: "/play/squirrel.webmanifest",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f6f0e6" };

export default function SquirrelGamePage() {
  return <CameraGame />;
}
