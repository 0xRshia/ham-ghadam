"use client";
import { VerificationCode } from "./verification-code";
import { Suspense, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppLink, useAppNavigate } from "@/components/event/app-navigation";
import { useAuth } from "@/components/event/auth-context";
import { useDeadlineClock } from "@/hooks/use-deadline-clock";
import { api } from "@/lib/client";
import { loginDestination } from "@/lib/login-destination";
import { digits, fa, faDigits, type AuthRequestResponse, type User } from "@/lib/types";
import { copy } from "@/locales/fa";
import { Button, Header, ErrorState, LoadingState } from "./primitives";
import { FigmaIcon, Illustration } from "./source-icon";

type AuthMode = "login" | "signup" | "forgot";
type Challenge = Exclude<AuthRequestResponse, { user: User }>;
export function AuthPage({ mode = "login" }: { mode?: AuthMode }) {
  return <Suspense fallback={<LoadingState />}><AuthForm key={mode} mode={mode} /></Suspense>;
}
function PasswordInput({ label, value, onChange, confirm = false }: { label: string; value: string; onChange: (value: string) => void; confirm?: boolean }) {
  const [visible,setVisible]=useState(false);
  return <label className="el-auth-field"><span className="el-sr-only">{label}</span><FigmaIcon screen={5} name="lock" /><input type={visible ? "text" : "password"} placeholder={label} value={value} onChange={e=>onChange(e.target.value)} autoComplete={confirm ? "new-password" : "current-password"} required minLength={confirm ? 12 : undefined} maxLength={128} /><button type="button" className="el-icon-button" aria-label={visible ? copy.hidePassword : copy.showPassword} aria-pressed={visible} onClick={()=>setVisible(!visible)}><FigmaIcon screen={5} name="eye-off" /></button></label>;
}
function AuthForm({ mode }: { mode: AuthMode }) {
  const { refresh }=useAuth();const navigate=useAppNavigate();const params=useSearchParams();
  const [phone,setPhone]=useState("");const [name,setName]=useState("");const [password,setPassword]=useState("");const [repeat,setRepeat]=useState("");const [code,setCode]=useState("");
  const [challenge,setChallenge]=useState<Challenge | null>(null);const [resetToken,setResetToken]=useState("");const [success,setSuccess]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [otpLogin,setOtpLogin]=useState(false);
  const lock=useRef(false);const now=useDeadlineClock(challenge?.resendAt,1000,challenge?.serverNow);
  const resendWait=challenge && now !== null ? Math.max(0,Math.ceil((challenge.resendAt-now)/1000)) : 0;
  const authHref = (path: string) => params.get("next") ? `${path}?next=${encodeURIComponent(params.get("next")!)}` : path;
  async function signedIn(user: User) { await refresh();const destination=loginDestination(params.get("next"),user.isHost,user.isAdmin);navigate(mode==="signup" && !user.isHost && !user.isAdmin ? `/onboarding?next=${encodeURIComponent(destination)}` : destination,{replace:true}); }
  async function requestCode() {
    const response=await api<AuthRequestResponse>("/api/auth/request",{phone:digits(phone),name});
    if("user" in response){await signedIn(response.user);return;}
    setChallenge(response);setCode("");
  }
  async function submit() {
    if(lock.current)return;lock.current=true;setBusy(true);setError("");
    try {
      if(resetToken){if(password!==repeat)throw new Error(copy.passwordMismatch);await api("/api/auth/password-reset",{resetToken,password});await refresh();setResetToken("");setSuccess(true);}
      else if(challenge){
        if(mode==="forgot"){const result=await api<{resetToken:string}>("/api/auth/password-reset",{action:"verify",challengeId:challenge.challengeId,code});setChallenge(null);setResetToken(result.resetToken);setPassword("");}
        else {const result=await api<{user:User}>(mode==="signup" ? "/api/auth/register" : "/api/auth/verify",{challengeId:challenge.challengeId,code,name,...(mode==="signup"?{password}:{})});await signedIn(result.user);}
      } else if(mode==="login"&&!otpLogin){const result=await api<{user:User}>("/api/auth/password",{phone:digits(phone),password});await signedIn(result.user);}
      else await requestCode();
    }catch(error){setError((error as Error).message);}finally{lock.current=false;setBusy(false);}
  }
  const title=success ? copy.passwordChanged : resetToken ? copy.resetPassword : challenge ? copy.verifyCode : mode==="signup" ? copy.createAccount : mode==="forgot" ? copy.forgotPassword : copy.welcomeBack;
  return <main className="el-auth-page"><Header back={mode==="login"?"/welcome":"/login"} onBack={challenge ? ()=>{setChallenge(null);setError("");} : undefined} />
    {success ? <div className="el-success"><Illustration kind="password" /><h1>{title}</h1><p>{copy.passwordChangedDescription}</p><AppLink className="el-button el-button-primary" href={loginDestination(params.get("next"))}>{copy.continue}</AppLink></div> : <form className={`el-auth-form el-auth-${resetToken ? "reset" : mode}${challenge ? " el-auth-verification" : ""}`} onSubmit={event=>{event.preventDefault();void submit();}}>
      {(challenge || mode === "forgot" && !resetToken) && <Illustration kind={challenge ? "verification" : "recovery"} />}
      <div className="el-auth-heading"><h1>{title}</h1><p>{resetToken ? copy.newPasswordHint : challenge ? <>{copy.codeSent} <bdi>{faDigits(phone)}</bdi></> : mode==="forgot" ? copy.recoveryHint : mode==="signup" ? copy.signupHint : copy.loginHint}</p></div>
      {challenge ? <><VerificationCode label={copy.verifyCode} value={code} onChange={setCode}/><Button disabled={busy || code.length!==6} type="submit">{copy.verify}</Button><button className="el-text-action" type="button" disabled={busy||resendWait>0} onClick={async()=>{setBusy(true);setError("");try{await requestCode();}catch(error){setError((error as Error).message);}finally{setBusy(false);}}}>{resendWait>0?`${copy.resend} (${fa(resendWait)})`:copy.resend}</button></> : resetToken ? <><PasswordInput label={copy.newPassword} value={password} onChange={setPassword} confirm /><PasswordInput label={copy.repeatPassword} value={repeat} onChange={setRepeat} confirm /><p className="el-muted">{copy.passwordHint}</p><Button disabled={busy} type="submit">{copy.saveChanges}</Button></> : <>
        {mode==="signup" && <label className="el-auth-field"><span className="el-sr-only">{copy.buyer}</span><FigmaIcon screen={7} name="user" /><input placeholder={copy.buyer} value={name} onChange={e=>setName(e.target.value)} required minLength={2} maxLength={80} autoComplete="name" /></label>}
        <label className="el-auth-field"><span className="el-sr-only">{copy.phone}</span><input type="tel" inputMode="tel" autoComplete="tel" placeholder={copy.phone} value={phone} onChange={event=>setPhone(event.target.value)} required maxLength={16} dir="ltr" /></label>
        {mode!=="forgot"&&!otpLogin && <PasswordInput label={copy.password} value={password} onChange={setPassword} confirm={mode==="signup"} />}
        {mode==="login" && !otpLogin && <AppLink className="el-forgot-link" href={authHref("/forgot-password")}>{copy.forgotPassword}</AppLink>}
        {mode==="signup" && <p className="el-muted">{copy.passwordHint}</p>}
        <Button type="submit" disabled={busy} aria-busy={busy}>{busy ? copy.loading : mode==="login"&&!otpLogin ? copy.signIn : copy.sendCode}</Button>
        {mode==="login" && <button className="el-button el-button-secondary" type="button" onClick={()=>{setOtpLogin(!otpLogin);setError("");}}>{otpLogin?copy.passwordLogin:copy.smsLogin}</button>}
        {mode==="signup" && <p className="el-auth-terms">{copy.signupTerms} <AppLink href="/privacy">{copy.privacy}</AppLink></p>}
        {mode!=="forgot" && <p className="el-auth-footer">{mode==="login"?copy.noAccount:copy.haveAccount} <AppLink href={authHref(mode==="login"?"/signup":"/login")}>{mode==="login"?copy.signUp:copy.signIn}</AppLink></p>}
      </>}
      {error && <ErrorState message={error} />}
    </form>}
  </main>;
}
