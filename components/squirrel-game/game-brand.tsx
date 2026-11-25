import Image from "next/image";
import { squirrelCopy } from "@/locales/squirrel-fa";

export function GameBrand() {
  return <span className="sg-brand">
    <Image src="/game/hamghadam-mark.png" alt={squirrelCopy.name} width={1080} height={1080} unoptimized />
  </span>;
}
