import { discountPercent } from "@/lib/discount";
import { fa } from "@/lib/types";
import { copy } from "@/locales/fa";
import { Price } from "./event-card";

export function TicketPrice({ price, originalPrice }: { price: number; originalPrice?: number | null }) {
  const percent = discountPercent(price, originalPrice);
  return <span className="el-ticket-price">
    {percent !== null && <span className="el-ticket-price-before"><span className="el-discount-badge" aria-label={`${fa(percent)}٪ ${copy.discountLabel}`}>{fa(percent)}٪</span><del><span className="el-sr-only">{copy.originalPriceLabel}: </span><Price value={originalPrice!} /></del></span>}
    <strong>{percent !== null && <span className="el-sr-only">{copy.discountedPriceLabel}: </span>}<Price value={price} /></strong>
  </span>;
}
