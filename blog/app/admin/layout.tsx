import type { Metadata } from "next";
import "@/components/admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "مدیریت مجلهٔ هم‌قدم",
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin-area">{children}</div>;
}
