import { fa } from "@/lib/types";
import { copy } from "@/locales/fa";

// Displaying an amount is independent from whether checkout is available.
export function Price({ value }: { value: number }) {
  return <>{value === 0 ? copy.free : <>{fa(value)} <small>{copy.toman}</small></>}</>;
}
