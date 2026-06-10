import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getTeacherCapabilities } from "@/lib/auth/teacher-capabilities";
import { TEACHER_NAV_V2 } from "@/lib/feature-flags";
import { TeacherShell } from "@/components/teacher/teacher-shell";

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

  if (!TEACHER_NAV_V2) {
    return <>{children}</>;
  }

  // Admins have no teachers row, so getTeacherCapabilities fails closed to
  // all-false and would hide their nav — grant them everything explicitly.
  const caps =
    user.role === "admin"
      ? {
          canManageSpellingLists: true,
          canManageAssignments: true,
          canGenerateReadingContent: true,
          canGeneratePracticeQuestions: true,
          canUseSunnyPreview: true,
        }
      : await getTeacherCapabilities(user.id);

  return (
    <TeacherShell caps={caps} teacherName={user.firstName ?? "Teacher"}>
      {children}
    </TeacherShell>
  );
}
