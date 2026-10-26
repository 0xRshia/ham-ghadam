"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppLink } from "@/components/event/app-navigation";
import { useEventBrowse } from "@/components/event/event-browse-provider";
import { authHomeHref, authHref } from "@/lib/auth-navigation";
import { copy } from "@/locales/fa";
import artwork from "./onboarding-art.json";
import { Button, LoadingState } from "./primitives";

function OnboardingArt({ kind }: { kind: "discover" | "follow" | "start" }) {
  const light=artwork[`${kind}-light`],dark=artwork[`${kind}-dark`];
  return <div className={`el-onboarding-art el-onboarding-art-${kind}`} aria-hidden="true"><img className="el-light-asset" src={light.src} width={light.width} height={light.height} alt=""/><img className="el-dark-asset" src={dark.src} width={dark.width} height={dark.height} alt=""/>{kind==="start" && <span className="el-welcome-brand"><img src="/favicon.svg" width={72} height={72} alt=""/></span>}</div>;
}
export function WelcomePage() {
  return <Suspense fallback={<LoadingState />}><WelcomeSteps /></Suspense>;
}
function WelcomeSteps() {
  const [step,setStep]=useState(0);
  const params=useSearchParams();
  const {completeMapIntroduction}=useEventBrowse();
  const layout=params.get("layout");
  const skip=<AppLink className="el-text-action el-welcome-skip" href={authHomeHref(layout)} replace onNavigate={completeMapIntroduction}>{copy.skip}</AppLink>;
  useEffect(()=>{window.scrollTo({top:0,behavior:"instant"});},[step]);
  if(step===2)return <main className="el-get-started">{skip}<div className="el-start-heading"><h1>{copy.startTitle}</h1><p>{copy.startDescription}</p></div><OnboardingArt kind="start"/><AppLink className="el-button el-button-primary" href={authHref("/login",params.get("next"),layout)}>{copy.signIn}</AppLink><p className="el-auth-footer">{copy.noAccount} <AppLink href={authHref("/signup",params.get("next"),layout)}>{copy.signUp}</AppLink></p></main>;
  return <main className="el-welcome-page">{skip}<div className="el-welcome-heading"><h1>{step===0?copy.welcomeTitle:copy.followWelcomeTitle}</h1><p>{step===0?copy.welcomeDescription:copy.followWelcomeDescription}</p></div><OnboardingArt kind={step===0?"discover":"follow"}/><Button onClick={()=>setStep(step+1)}>{copy.getStarted}</Button></main>;
}
