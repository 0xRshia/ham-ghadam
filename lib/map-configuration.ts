import { config } from "@/db";
export type MapConfiguration = { tileUrl: string; attributionLabel: string; attributionUrl: string };
export function mapConfiguration(): MapConfiguration {
  const env=config();
  if (!env.MAP_TILE_URL) return {tileUrl:"https://tile.openstreetmap.org/{z}/{x}/{y}.png",attributionLabel:"© OpenStreetMap",attributionUrl:"https://www.openstreetmap.org/copyright"};
  const tile=new URL(env.MAP_TILE_URL),attribution=new URL(env.MAP_ATTRIBUTION_URL??"");
  if (tile.protocol!=="https:" || tile.username || tile.password || attribution.protocol!=="https:" || !env.MAP_ATTRIBUTION_LABEL || !["{x}","{y}","{z}"].every(key=>env.MAP_TILE_URL!.includes(key))) throw new Error("Invalid map provider configuration");
  return {tileUrl:env.MAP_TILE_URL,attributionLabel:env.MAP_ATTRIBUTION_LABEL,attributionUrl:attribution.href};
}
