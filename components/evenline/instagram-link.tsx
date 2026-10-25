import { SourceIcon } from "./primitives";
import { instagramUrl } from "@/lib/instagram";

export function InstagramLink({ handle }: { handle: string | null | undefined }) {
  const href = instagramUrl(handle);
  if (!href) return null;
  return <a className="el-instagram-link" href={href} target="_blank" rel="noopener noreferrer" aria-label={`اینستاگرام برگزارکننده: @${handle}`}>
    <SourceIcon asset={{ src: "/icons/instagram.svg", width: 16, height: 16 }} size={16} /><bdi dir="ltr">@{handle}</bdi>
  </a>;
}
