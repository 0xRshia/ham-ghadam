import { TierEditor } from "@/components/evenline/tier-editor";
export default async function Page({params}:{params:Promise<{id:string}>}) {return <TierEditor id={(await params).id}/>;}
