import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { StudentLayoutShell } from "@/components/layouts/student-layout-shell";
import { getCurrentUser } from "@/lib/auth";

export default async function StudentLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/student-login");
  }

  if (user.role !== "student") {
    redirect("/unauthorized");
  }

  return <StudentLayoutShell user={user}>{children}</StudentLayoutShell>;
}
