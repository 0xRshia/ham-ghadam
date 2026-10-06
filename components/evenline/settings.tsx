"use client";
import { AppLink } from "@/components/event/app-navigation";
import { useAuth } from "@/components/event/auth-context";
import { copy } from "@/locales/fa";
import { Header } from "./primitives";
import { FigmaIcon } from "./source-icon";

export function Settings() {
  const { user, logout, loggingOut } = useAuth();
  return <main><Header title={copy.settings} /><div className="el-settings-content">
    <section><h2>{copy.general}</h2><div className="el-setting-list">
      <AppLink href="/settings/language" className="el-setting"><span className="el-setting-icon"><FigmaIcon screen={46} name="global"/></span><strong>{copy.language}</strong><span className="el-muted">{copy.persian}</span><FigmaIcon screen={46} name="chevron-right" directional/></AppLink>
    </div></section>
    <section><h2>{copy.accountSettings}</h2><div className="el-setting-list"><AppLink className="el-setting" href="/settings/notifications"><span className="el-setting-icon"><FigmaIcon screen={50} name="Notification"/></span><strong>{copy.notificationSettings}</strong><FigmaIcon screen={46} name="chevron-right" directional/></AppLink><AppLink className="el-setting" href={user ? "/account/edit" : "/login"}><span className="el-setting-icon"><FigmaIcon screen={46} name="profile-circle"/></span><strong>{user ? copy.editProfile : copy.login}</strong><FigmaIcon screen={46} name="chevron-right" directional/></AppLink><AppLink className="el-setting" href="/forgot-password"><span className="el-setting-icon"><FigmaIcon screen={46} name="lock"/></span><strong>{copy.resetPassword}</strong><FigmaIcon screen={46} name="chevron-right" directional/></AppLink></div></section>
    <section><h2>{copy.other}</h2><div className="el-setting-list">{[{ href: "/faq", text: copy.faq, icon: "question-mark" },{ href: "/privacy", text: copy.privacy, icon: "lock" }, { href: "/about", text: copy.about, icon: "Frame 8" }].map(row => <AppLink key={row.href} className="el-setting" href={row.href}><span className="el-setting-icon"><FigmaIcon screen={46} name={row.icon}/></span><strong>{row.text}</strong><FigmaIcon screen={46} name="chevron-right" directional/></AppLink>)}</div></section>
    {user && <button type="button" className="el-text-action" disabled={loggingOut} onClick={() => void logout()}>{copy.logout}</button>}
  </div></main>;
}
