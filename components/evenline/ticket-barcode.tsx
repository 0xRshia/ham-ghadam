"use client";
import { useEffect,useRef,useState } from "react";
import { copy } from "@/locales/fa";
export function TicketBarcode({value}:{value:string}) {
  const target=useRef<HTMLDivElement>(null),[failed,setFailed]=useState(false);
  useEffect(()=>{
    let active=true;
    void import("jsbarcode").then(({default:barcode})=>{
      const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
      barcode(svg,value,{format:"CODE128",width:2,height:38,displayValue:false,margin:0,marginLeft:20,marginRight:20,background:"#ffffff",lineColor:"#111827"});
      const width=svg.getAttribute("width")!,height=svg.getAttribute("height")!;
      svg.setAttribute("viewBox",`0 0 ${parseFloat(width)} ${parseFloat(height)}`);svg.setAttribute("preserveAspectRatio","none");svg.setAttribute("aria-hidden","true");
      if(active)target.current?.replaceChildren(svg);
    }).catch(()=>{if(active)setFailed(true);});
    return()=>{active=false;};
  },[value]);
  return <div className="el-ticket-barcode" ref={target} role="img" aria-label={`${copy.bookingReference}: ${value}`}>{failed&&<span>{value}</span>}</div>;
}
