import { ReactNode } from "react";
import { AdminShellGuard } from "@/components/layouts/admin-shell-guard";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShellGuard>{children}</AdminShellGuard>;
}
