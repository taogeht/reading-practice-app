import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function TeacherLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "teacher" && user.role !== "admin") {
    redirect("/unauthorized");
  }

  return <>{children}</>;
}
