"use client";
import { VerificationCode } from "./verification-code";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useResource } from "@/hooks/use-resource";
import { api } from "@/lib/client";
import { copy } from "@/locales/fa";
import { AccountGate } from "./community";
import { Button, ErrorState, Header, LoadingState } from "./primitives";
import { AppLink } from "@/components/event/app-navigation";
export type EmailStatus = {configured:boolean;account:{email:string;verified_at:number}|null};
function EmailForm({ status }: {status:EmailStatus}) {
  const [email,setEmail]=useState(status.account?.email ?? ""),[account,setAccount]=useState(status.account);
  const [challenge,setChallenge]=useState<{challengeId:string;email:string}|null>(null),[code,setCode]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
  async function submit() {
    setBusy(true);setError("");setSuccess("");
    try {
      if (challenge) {
        const verified=await api<{email:string;verifiedAt:number}>("/api/account/email",{action:"verify",challengeId:challenge.challengeId,code});
        setAccount({email:verified.email,verified_at:verified.verifiedAt});setChallenge(null);setCode("");setSuccess(copy.emailVerified);
      } else {
        setChallenge(await api("/api/account/email",{action:"request",email}));setCode("");
      }
    } catch (error) {setError((error as Error).message);} finally {setBusy(false);}
  }
  return <form className="el-profile-edit" onSubmit={event=>{event.preventDefault();void submit();}}>
    {!status.configured && <p className="el-muted">{copy.emailUnconfigured}</p>}
    {account && <p>{copy.verifiedEmail}: <bdi dir="ltr">{account.email}</bdi></p>}
    {challenge ? <><p>{copy.emailCodeSent} <bdi dir="ltr">{challenge.email}</bdi></p><VerificationCode label={copy.emailVerificationCode} value={code} onChange={setCode}/><Button disabled={busy || code.length!==6}>{copy.verify}</Button><button className="el-text-action" type="button" disabled={busy} onClick={()=>{setChallenge(null);setCode("");}}>{copy.changeEmail}</button></> : <><label className="el-input-field"><span>{copy.email}</span><input dir="ltr" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event=>setEmail(event.target.value)}/></label><Button disabled={busy || !status.configured}>{copy.verifyEmail}</Button></>}
    {error && <ErrorState message={error}/>} {success && <p role="status">{success}</p>}
    <AppLink className="el-text-action" href="/settings/notifications">{copy.notificationSettings}</AppLink>
    {account && <button type="button" className="el-text-action" disabled={busy} onClick={async()=>{setBusy(true);setError("");try{await api("/api/account/email",{},"DELETE");setAccount(null);setChallenge(null);setEmail("");setSuccess(copy.emailRemoved);}catch(error){setError((error as Error).message);}finally{setBusy(false);}}}>{copy.removeEmail}</button>}
  </form>;
}
function EmailContent() {
  const resource=useResource<EmailStatus>("/api/account/email");
  return resource.loading ? <LoadingState/> : resource.data ? <EmailForm status={resource.data}/> : <ErrorState message={resource.error} retry={resource.reload}/>;
}
export function EmailSettings() {return <main><Header title={copy.emailSettings} back="/settings/notifications"/><AccountGate><EmailContent/></AccountGate></main>;}
export function EmailUnsubscribe() {
  const params=useSearchParams(),[busy,setBusy]=useState(false),[done,setDone]=useState(false),[error,setError]=useState("");
  const query=new URLSearchParams({user:params.get("user") ?? "",token:params.get("token") ?? ""});
  return <main><Header title={copy.unsubscribeEmail}/><div className="el-profile-edit">{done ? <p role="status">{copy.emailUnsubscribed}</p> : <><p>{copy.unsubscribeEmailHint}</p><Button disabled={busy} onClick={async()=>{setBusy(true);setError("");try{await api(`/api/email/unsubscribe?${query}`,{});setDone(true);}catch(error){setError((error as Error).message);}finally{setBusy(false);}}}>{copy.unsubscribeEmail}</Button></>}{error && <ErrorState message={error}/>}<AppLink href="/settings/notifications">{copy.notificationSettings}</AppLink></div></main>;
}
