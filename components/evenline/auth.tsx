"use client";
import { TERMS_VERSION } from "@/lib/legal-versions";
import legalStyles from "@/components/legal/legal.module.css";
import { Phone } from "lucide-react";
import { VerificationCode } from "./verification-code";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppLink, useAppNavigate } from "@/components/event/app-navigation";
import { useAuth } from "@/components/event/auth-context";
import { useEventBrowse } from "@/components/event/event-browse-provider";
import { useDeadlineClock } from "@/hooks/use-deadline-clock";
import { api } from "@/lib/client";
import { loginDestination } from "@/lib/login-destination";
import { listenForSmsCode } from "@/lib/sms-autofill";
import { authBackHref, authHomeHref, authHref, type AuthMode } from "@/lib/auth-navigation";
import { digits, fa, faDigits, type AuthRequestResponse, type User } from "@/lib/types";
import { copy } from "@/locales/fa";
import { Button, Header, ErrorState, LoadingState } from "./primitives";
import { FigmaIcon, Illustration } from "./source-icon";

type Challenge = Exclude<AuthRequestResponse, { user: User }>;
export function AuthPage({ mode = "login" }: { mode?: AuthMode }) {
  return <Suspense fallback={<LoadingState />}><AuthForm key={mode} mode={mode} /></Suspense>;
}
function AuthForm({ mode }: { mode: AuthMode }) {
  const { refresh }=useAuth();const navigate=useAppNavigate();const params=useSearchParams();
  const {completeMapIntroduction}=useEventBrowse();
  const [acceptTerms,setAcceptTerms]=useState(false);
  const acceptance={acceptTerms,termsVersion:TERMS_VERSION};
  const [phone,setPhone]=useState("");const [name,setName]=useState("");const [code,setCode]=useState("");
  const [challenge,setChallenge]=useState<Challenge | null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const lock=useRef(false),requests=useRef({active:true,attempt:0});
  const smsRequest=useRef<AbortController | null>(null);
  useEffect(()=>()=>{smsRequest.current?.abort();},[]);
  useEffect(()=>{const current=requests.current;current.active=true;return()=>{current.active=false;current.attempt++;};},[]);
  const now=useDeadlineClock(challenge?.resendAt,1000,challenge?.serverNow);
  const resendWait=challenge && now !== null ? Math.max(0,Math.ceil((challenge.resendAt-now)/1000)) : 0;
  const next=params.get("next"),layout=params.get("layout");
  const backHref=authBackHref(mode,next,layout);
  const authLink = (path: "/login" | "/signup") => authHref(path,next,layout);
  const isCurrent=(request:number)=>requests.current.active && requests.current.attempt===request;
  function cancelPending() { smsRequest.current?.abort();requests.current.attempt++;lock.current=false;setBusy(false); }
  function back() {
    cancelPending();
    if(challenge){setChallenge(null);setCode("");setError("");return;}
    if(backHref===authHomeHref(layout))completeMapIntroduction();
    navigate(backHref,{replace:true});
  }
  async function signedIn(user: User,request:number) { if(!isCurrent(request))return;await refresh();if(!isCurrent(request))return;const destination=loginDestination(params.get("next"),user.isHost,user.isAdmin);navigate(mode==="signup" && !user.isHost && !user.isAdmin ? `/onboarding?next=${encodeURIComponent(destination)}` : destination,{replace:true}); }
  async function requestCode(request:number) {
    smsRequest.current?.abort();
    const controller=new AbortController();smsRequest.current=controller;
    let receivedCode="";
    const timeout=setTimeout(()=>controller.abort(),300000);
    controller.signal.addEventListener("abort",()=>clearTimeout(timeout),{once:true});
    // Start listening before asking the server to send the SMS.
    if(!listenForSmsCode(value=>{if(isCurrent(request)){receivedCode=value;setCode(value);}controller.abort();},controller.signal))controller.abort();
    let response: AuthRequestResponse;
    try { response=await api<AuthRequestResponse>("/api/auth/request",{phone:digits(phone),name,...acceptance}); }
    catch(error){controller.abort();throw error;}
    if(!isCurrent(request))return;
    if("user" in response){controller.abort();await signedIn(response.user,request);return;}
    setChallenge(response);setCode(receivedCode);
  }
  async function runRequest(action:(request:number)=>Promise<void>) {
    if(lock.current)return;lock.current=true;setBusy(true);setError("");
    const request=++requests.current.attempt;
    try {
      await action(request);
    }catch(error){if(isCurrent(request))setError((error as Error).message);}finally{if(isCurrent(request)){lock.current=false;setBusy(false);}}
  }
  async function submit() {
    await runRequest(async request=>{
      if(!acceptTerms)throw new Error("برای ادامه، شرایط و مقررات هم‌قدم را تأیید کنید.");
      // Accounts are phone-only: both login and signup finish through the SMS code,
      // and /api/auth/verify creates the account on first sign-in.
      if(challenge){smsRequest.current?.abort();const result=await api<{user:User}>("/api/auth/verify",{challengeId:challenge.challengeId,code,name,...acceptance});await signedIn(result.user,request);}
      else await requestCode(request);
    });
  }
  const termsConsent = <label className={legalStyles.consent}><input type="checkbox" required checked={acceptTerms} disabled={busy} onChange={event=>setAcceptTerms(event.target.checked)} /><span><a href="/terms" target="_blank" rel="noreferrer">شرایط و مقررات</a> استفاده از هم‌قدم را مطالعه کرده‌ام و می‌پذیرم.</span></label>;
  const title=challenge ? copy.verifyCode : mode==="signup" ? copy.createAccount : copy.welcomeBack;
  return <main className="el-auth-page"><Header back={backHref} onBack={back} />
    <form className={`el-auth-form el-auth-${mode}${challenge ? " el-auth-verification" : ""}`} onSubmit={event=>{event.preventDefault();void submit();}}>
      {challenge && <Illustration kind="verification" />}
      <div className="el-auth-heading"><h1>{title}</h1><p>{challenge ? <>{copy.codeSent} <bdi>{faDigits(phone)}</bdi></> : mode==="signup" ? copy.signupHint : copy.loginHint}</p></div>
      {challenge ? <><VerificationCode label={copy.verifyCode} value={code} onChange={value=>{smsRequest.current?.abort();setCode(value);}}/>{termsConsent}<Button disabled={busy || code.length!==6} type="submit">{copy.verify}</Button><button className="el-text-action" type="button" disabled={busy||resendWait>0} onClick={()=>void runRequest(requestCode)}>{resendWait>0?`${copy.resend} (${fa(resendWait)})`:copy.resend}</button></> : <>
        {mode==="signup" && <label className="el-auth-field"><span className="el-sr-only">{copy.buyer}</span><FigmaIcon screen={7} name="user" /><input placeholder={copy.buyer} value={name} onChange={e=>setName(e.target.value)} required minLength={2} maxLength={80} autoComplete="name" /></label>}
        <label className="el-auth-field"><span className="el-sr-only">{copy.phone}</span><Phone size={20} aria-hidden="true" /><input type="tel" inputMode="tel" autoComplete="tel" placeholder={copy.phone} value={phone} onChange={event=>setPhone(event.target.value)} required maxLength={16} dir="ltr" /></label>
        {termsConsent}
        <Button type="submit" disabled={busy} aria-busy={busy}>{busy ? copy.loading : copy.sendCode}</Button>
        {mode==="signup" && <p className="el-auth-terms"><AppLink href="/privacy" onNavigate={cancelPending}>{copy.privacy}</AppLink></p>}
        <p className="el-auth-footer">{mode==="login"?copy.noAccount:copy.haveAccount} <AppLink href={authLink(mode==="login"?"/signup":"/login")} onNavigate={cancelPending}>{mode==="login"?copy.signUp:copy.signIn}</AppLink></p>
      </>}
      {error && <ErrorState message={error} />}
    </form>
  </main>;
}
