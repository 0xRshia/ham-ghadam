import { manshaPaymentReturn } from "@/lib/mansha-orders";
import { boundary } from "@/lib/server";

export const GET = (req: Request) => boundary(() => manshaPaymentReturn(req));
