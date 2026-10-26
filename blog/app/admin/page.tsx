import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { BlogError } from "@/lib/validation";
import { AdminEditor } from "@/components/admin-editor";

export default async function AdminPage() {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof BlogError && error.status === 401) redirect("/admin/login");
    throw error;
  }
  return <AdminEditor />;
}
