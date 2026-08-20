import { ReactNode } from "react";
import { AdminShellGuard } from "@/components/layouts/admin-shell-guard";

// Covers the admin pages that sit outside the `(admin)` route group
// (/admin/books, /admin/classes). Without this they rendered bare — no
// sidebar, no way back.
export default function AdminSectionLayout({ children }: { children: ReactNode }) {
  return <AdminShellGuard>{children}</AdminShellGuard>;
}
