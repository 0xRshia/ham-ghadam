import { ProgramEditor } from "@/components/evenline/program-editor";
export default async function Page({params}:{params:Promise<{id:string}>}) {return <ProgramEditor id={(await params).id}/>;}
