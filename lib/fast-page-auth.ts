import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { fastCredentials, fastSession } from "@/lib/fast-auth";

export async function requireFastPage() {
  if (!fastCredentials()) redirect("/fast/login");
  if (!await fastSession((await headers()).get("cookie"))) redirect("/fast/login");
}
