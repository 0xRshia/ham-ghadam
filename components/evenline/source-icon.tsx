import icons from "./source-icons.json";
import vectors from "./vector-manifest.json";
import { SourceIcon } from "./primitives";
type Asset = { src: string; width: number; height: number };
const source = icons as Record<string, Record<string, { light: Asset; dark: Asset }[]>>;
export function FigmaIcon({ screen = 20, name, index = 0, directional = false, size }: { screen?: number; name: string; index?: number; directional?: boolean; size?: number }) {
  const asset = source[screen]?.[name]?.[index];
  if (!asset) throw new Error(`Missing Figma icon ${screen}/${name}/${index}`);
  return <SourceIcon asset={size ? {...asset.light,width:size,height:size*asset.light.height/asset.light.width} : asset.light} dark={size ? {...asset.dark,width:size,height:size*asset.dark.height/asset.dark.width} : asset.dark} size={size ?? asset.light.width} directional={directional} />;
}
export function Illustration({ kind }: { kind: "events" | "payment" | "password" | "verification" | "recovery" }) {
  const ids = { verification: ["1234:1060", "1440:4045"], recovery: ["1236:1173", "1440:4027"], events: ["1444:11700", "1479:10493"], payment: ["1444:11701", "1479:10492"], password: ["1444:11702", "1479:10494"] } as const;
  const [light, dark] = ids[kind];
  return <span className="el-illustration" aria-hidden="true"><img className="el-light-asset" src={vectors[light].src} width={vectors[light].width} height={vectors[light].height} alt="" /><img className="el-dark-asset" src={vectors[dark].src} width={vectors[dark].width} height={vectors[dark].height} alt="" /></span>;
}
