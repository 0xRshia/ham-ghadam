import { redirect } from "next/navigation";
export default async function Page({params}:{params:Promise<{id:string}>}) {redirect(`/host/events/${encodeURIComponent((await params).id)}`);}
