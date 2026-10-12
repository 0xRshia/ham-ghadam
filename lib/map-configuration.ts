import { config } from "@/db";
export type MapConfiguration = { tileUrl: string; attributionLabel: string; attributionUrl: string; neshanKey?: string };
export function mapConfiguration(env: Cloudflare.Env = config()): MapConfiguration {
  const key = env.NESHAN_MAP_KEY?.trim();
  if (key) {
    if (!/^web\.[A-Za-z0-9_-]+$/.test(key)) throw new Error("Invalid Neshan web map key");
    return { tileUrl: "", attributionLabel: "© نشان · OpenStreetMap", attributionUrl: "https://neshan.org/", neshanKey: key };
  }
  if (!env.MAP_TILE_URL) return {tileUrl:"https://tile.openstreetmap.org/{z}/{x}/{y}.png",attributionLabel:"© OpenStreetMap",attributionUrl:"https://www.openstreetmap.org/copyright"};
  const tile=new URL(env.MAP_TILE_URL),attribution=new URL(env.MAP_ATTRIBUTION_URL??"");
  if (tile.protocol!=="https:" || tile.username || tile.password || attribution.protocol!=="https:" || !env.MAP_ATTRIBUTION_LABEL || !["{x}","{y}","{z}"].every(key=>env.MAP_TILE_URL!.includes(key))) throw new Error("Invalid map provider configuration");
  return {tileUrl:env.MAP_TILE_URL,attributionLabel:env.MAP_ATTRIBUTION_LABEL,attributionUrl:attribution.href};
}
