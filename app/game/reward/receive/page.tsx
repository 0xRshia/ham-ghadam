import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { SquirrelRewardReceive } from "./squirrel-reward-receive";
import { squirrelWalletRewardCopy } from "@/locales/squirrel-fa";

export const metadata: Metadata = {
  title: `${squirrelWalletRewardCopy.title} | هم‌قدم`,
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function SquirrelRewardReceivePage() {
  if ((await headers()).get("host")?.toLowerCase() === "game.hmghadam.com") notFound();
  return <SquirrelRewardReceive />;
}
