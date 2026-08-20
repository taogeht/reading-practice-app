import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminLayoutShell } from "@/components/layouts/admin-layout-shell";
import { getCurrentUser } from "@/lib/auth";

// Admin auth check + sidebar chrome, shared by both admin layouts.
//
// There are two, because admin pages live in two places: the `(admin)` route
// group (/users, /schools, /settings…) and a plain `admin/` directory
// (/admin/books, /admin/classes). A route group's layout does not apply
// outside the group, so /admin/books rendered with no sidebar at all until
// src/app/admin/layout.tsx existed. Both layouts now render this, so the guard
// and the chrome cannot drift apart.
export async function AdminShellGuard({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    redirect("/unauthorized");
  }

  // Spelled out rather than passing `user` straight through: getCurrentUser
  // returns the wide role union, and the shell's prop demands the literal
  // "admin". The redirect above has already ruled everything else out.
  return (
    <AdminLayoutShell
      user={{
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: "admin",
      }}
    >
      {children}
    </AdminLayoutShell>
  );
}
