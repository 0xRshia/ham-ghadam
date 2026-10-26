"use client";
import { TERMS_VERSION } from "@/lib/legal-versions";
import legalStyles from "@/components/legal/legal.module.css";
import { Phone, LockKeyhole, Eye, EyeOff } from "lucide-react";
import { VerificationCode } from "./verification-code";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppLink, useAppNavigate } from "@/components/event/app-navigation";
import { useAuth } from "@/components/event/auth-context";
import { useEventBrowse } from "@/components/event/event-browse-provider";
import { useDeadlineClock } from "@/hooks/use-deadline-clock";
import { api } from "@/lib/client";
import { loginDestination } from "@/lib/login-destination";
import { authBackHref, authHomeHref, authHref, type AuthMode } from "@/lib/auth-navigation";
import { digits, fa, faDigits, type AuthRequestResponse, type User } from "@/lib/types";
import { copy } from "@/locales/fa";
import { Button, Header, ErrorState, LoadingState } from "./primitives";
import { FigmaIcon, Illustration } from "./source-icon";

type Challenge = Exclude<AuthRequestResponse, { user: User }>;
export function AuthPage({ mode = "login" }: { mode?: AuthMode }) {
  return <Suspense fallback={<LoadingState />}><AuthForm key={mode} mode={mode} /></Suspense>;
}
function PasswordInput({ label, value, onChange, confirm = false }: { label: string; value: string; onChange: (value: string) => void; confirm?: boolean }) {
  const [visible,setVisible]=useState(false);
  return <label className="el-auth-field"><span className="el-sr-only">{label}</span><LockKeyhole size={20} aria-hidden="true" /><input type={visible ? "text" : "password"} placeholder={label} value={value} onChange={e=>onChange(e.target.value)} autoComplete={confirm ? "new-password" : "current-password"} required minLength={confirm ? 12 : undefined} maxLength={128} /><button type="button" className="el-icon-button" aria-label={visible ? copy.hidePassword : copy.showPassword} aria-pressed={visible} onClick={()=>setVisible(!visible)}>{visible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}</button></label>;
}
function AuthForm({ mode }: { mode: AuthMode }) {
  const { refresh }=useAuth();const navigate=useAppNavigate();const params=useSearchParams();
  const {completeMapIntroduction}=useEventBrowse();
  const [acceptTerms,setAcceptTerms]=useState(false);
  const acceptance={acceptTerms,termsVersion:TERMS_VERSION};
  const [phone,setPhone]=useState("");const [name,setName]=useState("");const [password,setPassword]=useState("");const [repeat,setRepeat]=useState("");const [code,setCode]=useState("");
  const [challenge,setChallenge]=useState<Challenge | null>(null);const [resetToken,setResetToken]=useState("");const [success,setSuccess]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [otpLogin,setOtpLogin]=useState(false);
  const lock=useRef(false),requests=useRef({active:true,attempt:0});
  useEffect(()=>{const current=requests.current;current.active=true;return()=>{current.active=false;current.attempt++;};},[]);
  const now=useDeadlineClock(challenge?.resendAt,1000,challenge?.serverNow);
  const resendWait=challenge && now !== null ? Math.max(0,Math.ceil((challenge.resendAt-now)/1000)) : 0;
  const next=params.get("next"),layout=params.get("layout");
  const backHref=authBackHref(mode,next,layout);
  const authLink = (path: "/login" | "/signup" | "/forgot-password") => authHref(path,next,layout);
  const isCurrent=(request:number)=>requests.current.active && requests.current.attempt===request;
  function cancelPending() { requests.current.attempt++;lock.current=false;setBusy(false); }
  function back() {
    cancelPending();
    if(challenge){setChallenge(null);setCode("");setError("");return;}
    if(backHref===authHomeHref(layout))completeMapIntroduction();
    navigate(backHref,{replace:true});
  }
  async function signedIn(user: User,request:number) { if(!isCurrent(request))return;await refresh();if(!isCurrent(request))return;const destination=loginDestination(params.get("next"),user.isHost,user.isAdmin);navigate(mode==="signup" && !user.isHost && !user.isAdmin ? `/onboarding?next=${encodeURIComponent(destination)}` : destination,{replace:true}); }
  async function requestCode(request:number) {
    const response=await api<AuthRequestResponse>("/api/auth/request",{phone:digits(phone),name,...acceptance});
    if(!isCurrent(request))return;
    if("user" in response){await signedIn(response.user,request);return;}
    setChallenge(response);setCode("");
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
      if(resetToken){if(password!==repeat)throw new Error(copy.passwordMismatch);await api("/api/auth/password-reset",{resetToken,password,...acceptance});if(!isCurrent(request))return;await refresh();if(!isCurrent(request))return;setResetToken("");setSuccess(true);}
      else if(challenge){
        if(mode==="forgot"){const result=await api<{resetToken:string}>("/api/auth/password-reset",{action:"verify",challengeId:challenge.challengeId,code});if(!isCurrent(request))return;setChallenge(null);setResetToken(result.resetToken);setPassword("");}
        else {const result=await api<{user:User}>(mode==="signup" ? "/api/auth/register" : "/api/auth/verify",{challengeId:challenge.challengeId,code,name,...acceptance,...(mode==="signup"?{password}:{})});await signedIn(result.user,request);}
      } else if(mode==="login"&&!otpLogin){const result=await api<{user:User}>("/api/auth/password",{phone:digits(phone),password,...acceptance});await signedIn(result.user,request);}
      else await requestCode(request);
    });
  }
  const termsConsent = <label className={legalStyles.consent}><input type="checkbox" required checked={acceptTerms} disabled={busy} onChange={event=>setAcceptTerms(event.target.checked)} /><span><a href="/terms" target="_blank" rel="noreferrer">شرایط و مقررات استفاده از هم‌قدم</a> را مطالعه کرده‌ام و می‌پذیرم.</span></label>;
  const title=success ? copy.passwordChanged : resetToken ? copy.resetPassword : challenge ? copy.verifyCode : mode==="signup" ? copy.createAccount : mode==="forgot" ? copy.forgotPassword : copy.welcomeBack;
  return <main className="el-auth-page"><Header back={backHref} onBack={back} />
    {success ? <div className="el-success"><Illustration kind="password" /><h1>{title}</h1><p>{copy.passwordChangedDescription}</p><AppLink className="el-button el-button-primary" href={loginDestination(params.get("next"))}>{copy.continue}</AppLink></div> : <form className={`el-auth-form el-auth-${resetToken ? "reset" : mode}${challenge ? " el-auth-verification" : ""}`} onSubmit={event=>{event.preventDefault();void submit();}}>
      {(challenge || mode === "forgot" && !resetToken) && <Illustration kind={challenge ? "verification" : "recovery"} />}
      <div className="el-auth-heading"><h1>{title}</h1><p>{resetToken ? copy.newPasswordHint : challenge ? <>{copy.codeSent} <bdi>{faDigits(phone)}</bdi></> : mode==="forgot" ? copy.recoveryHint : mode==="signup" ? copy.signupHint : copy.loginHint}</p></div>
      {challenge ? <><VerificationCode label={copy.verifyCode} value={code} onChange={setCode}/>{termsConsent}<Button disabled={busy || code.length!==6} type="submit">{copy.verify}</Button><button className="el-text-action" type="button" disabled={busy||resendWait>0} onClick={()=>void runRequest(requestCode)}>{resendWait>0?`${copy.resend} (${fa(resendWait)})`:copy.resend}</button></> : resetToken ? <><PasswordInput label={copy.newPassword} value={password} onChange={setPassword} confirm /><PasswordInput label={copy.repeatPassword} value={repeat} onChange={setRepeat} confirm /><p className="el-muted">{copy.passwordHint}</p>{termsConsent}<Button disabled={busy} type="submit">{copy.saveChanges}</Button></> : <>
        {mode==="signup" && <label className="el-auth-field"><span className="el-sr-only">{copy.buyer}</span><FigmaIcon screen={7} name="user" /><input placeholder={copy.buyer} value={name} onChange={e=>setName(e.target.value)} required minLength={2} maxLength={80} autoComplete="name" /></label>}
        <label className="el-auth-field"><span className="el-sr-only">{copy.phone}</span><Phone size={20} aria-hidden="true" /><input type="tel" inputMode="tel" autoComplete="tel" placeholder={copy.phone} value={phone} onChange={event=>setPhone(event.target.value)} required maxLength={16} dir="ltr" /></label>
        {mode!=="forgot"&&!otpLogin && <PasswordInput label={copy.password} value={password} onChange={setPassword} confirm={mode==="signup"} />}
        {mode==="login" && !otpLogin && <AppLink className="el-forgot-link" href={authLink("/forgot-password")} onNavigate={cancelPending}>{copy.forgotPassword}</AppLink>}
        {mode==="signup" && <p className="el-muted">{copy.passwordHint}</p>}
        {termsConsent}
        <Button type="submit" disabled={busy} aria-busy={busy}>{busy ? copy.loading : mode==="login"&&!otpLogin ? copy.signIn : copy.sendCode}</Button>
        {mode==="login" && <button className="el-button el-button-secondary" type="button" disabled={busy} onClick={()=>{setOtpLogin(!otpLogin);setError("");}}>{otpLogin?copy.passwordLogin:copy.smsLogin}</button>}
        {mode==="signup" && <p className="el-auth-terms"><AppLink href="/privacy" onNavigate={cancelPending}>{copy.privacy}</AppLink></p>}
        {mode!=="forgot" && <p className="el-auth-footer">{mode==="login"?copy.noAccount:copy.haveAccount} <AppLink href={authLink(mode==="login"?"/signup":"/login")} onNavigate={cancelPending}>{mode==="login"?copy.signUp:copy.signIn}</AppLink></p>}
      </>}
      {error && <ErrorState message={error} />}
    </form>}
  </main>;
}
