"use client";
import { useState } from "react";
import { AppLink } from "@/components/event/app-navigation";
import { useAuth } from "@/components/event/auth-context";
import type { FaqContent, AboutContent } from "@/lib/content-shapes";
import { copy, faqTopicPatterns } from "@/locales/fa";
import { privacyContent } from "@/locales/privacy-fa";
import { Header } from "./primitives";
import { FigmaIcon } from "./source-icon";
import { Avatar } from "./community";

function ContentHeader({ title, screen }: { title: string; screen: number }) {
  const {user}=useAuth();
  return <header className="el-content-header"><AppLink href="/settings" className="el-icon-button" aria-label={copy.settings}><FigmaIcon screen={screen} name="layout-grid"/></AppLink><h1>{title}</h1><AppLink href="/account" aria-label={copy.profile}>{user ? <Avatar name={user.name}/> : <span className="el-content-profile"><FigmaIcon screen={44} name="profile-circle"/></span>}</AppLink></header>;
}
function FaqItem({ item, initialOpen }: { item: FaqContent["items"][number]; initialOpen: boolean }) {
  const [expanded,setExpanded]=useState(false);
  return <details open={initialOpen || undefined}><summary><span>{item.question}</span><FigmaIcon screen={49} name="chevron-up"/></summary><p className={expanded ? "" : "el-faq-excerpt"}>{item.answer}</p><button className="el-text-action" onClick={()=>setExpanded(!expanded)}>{expanded ? copy.less : copy.more}</button></details>;
}

export function FaqPage({ content }: { content: FaqContent }) {
  const [query,setQuery]=useState(""),[topic,setTopic]=useState("");
  const topics=[{id:"tickets",label:copy.ticketHelp,icon:"status",match:faqTopicPatterns.tickets},{id:"hosting",label:copy.hostingHelp,icon:"profile-circle",match:faqTopicPatterns.hosting},{id:"location",label:copy.locationHelp,icon:"convertshape",match:faqTopicPatterns.location}];
  const items=content.items.filter(item=>(!topic || topics.find(value=>value.id===topic)!.match.test(item.question)) && `${item.question} ${item.answer}`.includes(query.trim()));
  return <main className="el-content-page"><ContentHeader title={copy.faq} screen={49}/><label className="el-search"><FigmaIcon screen={49} name="Search"/><input aria-label={copy.searchHelp} placeholder={copy.searchHelp} value={query} onChange={event=>setQuery(event.target.value)}/></label><section className="el-help-topics"><div className="el-section-heading"><h2>{copy.browseTopics}</h2><button className="el-text-action" onClick={()=>{setTopic("");setQuery("");}}>{copy.all}</button></div><div className="el-topic-carousel">{topics.map(item=><button className="el-topic-card" key={item.id} aria-pressed={topic===item.id} onClick={()=>setTopic(topic===item.id?"":item.id)}><span className="el-topic-icon"><FigmaIcon screen={49} name={item.icon}/></span><span>{copy.questionsAbout}</span><strong>{item.label}</strong></button>)}</div></section><section className="el-faq-list"><h2>{copy.featuredQuestions}</h2>{items.map((item,index)=><FaqItem key={item.question} item={item} initialOpen={index===0}/>)}{!items.length && <p className="el-muted">{copy.noContent}</p>}<p>{copy.contactHelp} <AppLink className="el-text-action" href="/contact">{copy.contactUs}</AppLink></p></section></main>;
}
export function AboutPage({ content }: { content: AboutContent }) {
  return <main className="el-content-page"><ContentHeader title={copy.about} screen={52}/><section className="el-about-hero"><img src="/figma/photos/e60a2eb38fc085dd2f829a6df3c33521f7da4958.webp" alt=""/><div><h1>{content.title}</h1><AppLink className="el-button el-button-primary" href="/events">{copy.findEvents}</AppLink></div></section><div className="el-about-content"><p className="el-content-box">{content.intro}</p><h2>{copy.whatYouCanDo}</h2><div className="el-about-features">{content.sections.map((section,index)=><section key={section.heading}><span className="el-about-feature-icon"><FigmaIcon screen={52} name={index===0?"map-pin":"global"}/></span><div><h3>{section.heading}</h3><p>{section.body}</p></div></section>)}</div></div></main>;
}
export function PrivacyPage() {
  const [query,setQuery]=useState("");
  const sections=privacyContent.filter(item=>`${item.heading} ${item.body}`.includes(query.trim()));
  return <main className="el-content-page"><ContentHeader title={copy.privacy} screen={51}/><label className="el-search"><FigmaIcon screen={51} name="Search"/><input aria-label={copy.searchPolicy} placeholder={copy.searchPolicy} value={query} onChange={event=>setQuery(event.target.value)}/></label><div className="el-policy-content el-content-box">{sections.map(item=><section key={item.heading}><h2>{item.heading}</h2><p>{item.body}</p></section>)}{!sections.length && <p>{copy.noContent}</p>}<AppLink className="el-text-action" href="/contact">{copy.contactUs}</AppLink></div></main>;
}
export function LanguagePage() {
  return <main><Header title={copy.language} back="/settings"/><div className="el-settings-content"><label className="el-language-row"><span>{copy.persian}</span><input type="radio" checked readOnly name="language" value="fa"/></label><p className="el-muted">{copy.languageDescription}</p></div></main>;
}
