import { requireFastPage } from "@/lib/fast-page-auth";
import { FastShell } from "@/components/fast/shell";
import { FastWalletAdmin } from "@/components/fast/wallet-admin";
export default async function Page() {
  await requireFastPage();
  return <FastShell><FastWalletAdmin /></FastShell>;
}
