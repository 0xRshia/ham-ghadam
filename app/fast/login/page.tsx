import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FastShell } from "@/components/fast/shell";
import { FastLogin } from "@/components/fast/login";
import { fastCredentials, fastSession } from "@/lib/fast-auth";
export default async function Page() {
  const configured = !!fastCredentials();
  if (configured && await fastSession((await headers()).get("cookie"))) redirect("/fast");
  return <FastShell login><FastLogin configured={configured} /></FastShell>;
}
