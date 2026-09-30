"use client";
import { useEffect, useState } from "react";
import { AppLink } from "@/components/event/app-navigation";
import { copy } from "@/locales/fa";
import artwork from "./onboarding-art.json";
import { Button } from "./primitives";

function OnboardingArt({ kind }: { kind: "discover" | "follow" | "start" }) {
  const light=artwork[`${kind}-light`],dark=artwork[`${kind}-dark`];
  return <div className={`el-onboarding-art el-onboarding-art-${kind}`} aria-hidden="true"><img className="el-light-asset" src={light.src} width={light.width} height={light.height} alt=""/><img className="el-dark-asset" src={dark.src} width={dark.width} height={dark.height} alt=""/>{kind==="start" && <span className="el-welcome-brand"><img src="/favicon.svg" width={72} height={72} alt=""/></span>}</div>;
}
export function WelcomePage() {
  const [step,setStep]=useState(0);
  useEffect(()=>{window.scrollTo({top:0,behavior:"instant"});},[step]);
  if(step===2)return <main className="el-get-started"><div className="el-start-heading"><h1>{copy.startTitle}</h1><p>{copy.startDescription}</p></div><OnboardingArt kind="start"/><AppLink className="el-button el-button-primary" href="/login">{copy.signIn}</AppLink><p className="el-auth-footer">{copy.noAccount} <AppLink href="/signup">{copy.signUp}</AppLink></p></main>;
  return <main className="el-welcome-page"><button className="el-text-action el-welcome-skip" onClick={()=>setStep(2)}>{copy.skip}</button><div className="el-welcome-heading"><h1>{step===0?copy.welcomeTitle:copy.followWelcomeTitle}</h1><p>{step===0?copy.welcomeDescription:copy.followWelcomeDescription}</p></div><OnboardingArt kind={step===0?"discover":"follow"}/><Button onClick={()=>setStep(step+1)}>{copy.getStarted}</Button></main>;
}
