import { redirect } from "next/navigation";
// Password sign-in is disabled; keep old recovery links landing on SMS login.
export default function Page() { redirect("/login"); }
