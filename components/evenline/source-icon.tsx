import icons from "./source-icons.json";
import vectors from "./vector-manifest.json";
import { SourceIcon } from "./primitives";
import { MapPin } from "lucide-react";
type Asset = { src: string; width: number; height: number };
const source = icons as Record<string, Record<string, { light: Asset; dark: Asset }[]>>;
export function FigmaIcon({ screen = 20, name, index = 0, directional = false, size }: { screen?: number; name: string; index?: number; directional?: boolean; size?: number }) {
  const asset = source[screen]?.[name]?.[index];
  if (!asset) throw new Error(`Missing Figma icon ${screen}/${name}/${index}`);
  if (name === "map-pin") return <MapPin size={size ?? asset.light.width} fill="none" aria-hidden="true" />;
  return <SourceIcon asset={size ? {...asset.light,width:size,height:size*asset.light.height/asset.light.width} : asset.light} dark={size ? {...asset.dark,width:size,height:size*asset.dark.height/asset.dark.width} : asset.dark} size={size ?? asset.light.width} directional={directional} />;
}
export function Illustration({ kind }: { kind: "events" | "payment" | "password" | "verification" | "recovery" }) {
  if (kind === "events" || kind === "payment" || kind === "password") {
    return <span className="el-illustration el-illustration-3d" aria-hidden="true"><img className="el-light-asset" src={`/illustrations/${kind}-light.png`} width={180} height={180} alt="" /><img className="el-dark-asset" src={`/illustrations/${kind}-dark.png`} width={180} height={180} alt="" /></span>;
  }
  const ids = { verification: ["1234:1060", "1440:4045"], recovery: ["1236:1173", "1440:4027"] } as const;
  const [light, dark] = ids[kind];
  return <span className="el-illustration" aria-hidden="true"><img className="el-light-asset" src={vectors[light].src} width={vectors[light].width} height={vectors[light].height} alt="" /><img className="el-dark-asset" src={vectors[dark].src} width={vectors[dark].width} height={vectors[dark].height} alt="" /></span>;
}
