import type { Metadata } from "next";
import { ManshaMenu } from "@/components/venue-order/mansha-menu";
import { MANSHA_MENU_URL } from "@/lib/mansha-menu";
import { getManshaMenu, manshaCheckoutAvailable } from "@/lib/mansha-orders";
import { manshaCopy as t } from "@/locales/mansha-fa";

export const metadata: Metadata = {
  title: `${t.orderMenu} | ${t.venue}`,
};

export const dynamic = "force-dynamic";

export default async function ManshaMenuPage() {
  const [menu, checkoutAvailable] = await Promise.all([getManshaMenu(), manshaCheckoutAvailable()]);
  return <ManshaMenu
    menu={menu.items}
    pricesConfirmed={menu.pricesConfirmed}
    originalMenuUrl={MANSHA_MENU_URL}
    checkoutAvailable={checkoutAvailable}
  />;
}
