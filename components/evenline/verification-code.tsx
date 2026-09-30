"use client";
import { digits, faDigits } from "@/lib/types";

export function VerificationCode({ label, value, onChange }: { label:string; value:string; onChange:(value:string)=>void }) {
  return <label className="el-otp-field"><span className="el-sr-only">{label}</span><input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} required pattern="[0-9]{6}" value={value} onChange={event=>onChange(digits(event.target.value).replace(/\D/g,"").slice(0,6))}/><span className="el-otp-cells" aria-hidden="true">{Array.from({length:6},(_,index)=><span key={index} data-active={index===value.length || undefined}>{faDigits(value[index] ?? "")}</span>)}</span></label>;
}
