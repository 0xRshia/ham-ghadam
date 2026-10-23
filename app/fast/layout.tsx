import type { Metadata } from "next";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "مدیریت رویدادها | هم‌قدم", robots: { index: false, follow: false } };
export default function FastLayout({ children }: { children: React.ReactNode }) { return children; }
