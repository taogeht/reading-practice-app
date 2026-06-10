import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { classes, classEnrollments, students, users } from "@/lib/db/schema";
import { accessibleClassIds } from "@/lib/auth/class-access";
import { StudentsIndex, type StudentRow } from "@/components/teacher/students-index";

export const runtime = "nodejs";

// Top-level index of every student across the teacher's accessible classes.
export default async function TeacherStudentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "teacher" && user.role !== "admin") redirect("/unauthorized");

  const classIds = await accessibleClassIds(user.id, user.role);

  const rows =
    classIds.length === 0
      ? []
      : await db
          .select({
            studentId: students.id,
            firstName: users.firstName,
            lastName: users.lastName,
            gradeLevel: students.gradeLevel,
            avatarUrl: students.avatarUrl,
            className: classes.name,
          })
          .from(classEnrollments)
          .innerJoin(students, eq(classEnrollments.studentId, students.id))
          .innerJoin(users, eq(students.id, users.id))
          .innerJoin(classes, eq(classEnrollments.classId, classes.id))
          .where(inArray(classEnrollments.classId, classIds));

  // One row per (student, class) — collapse to one card per student with the
  // class names gathered.
  const byId = new Map<string, StudentRow>();
  for (const r of rows) {
    let s = byId.get(r.studentId);
    if (!s) {
      s = {
        id: r.studentId,
        name: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "Unnamed student",
        gradeLevel: r.gradeLevel,
        avatarUrl: r.avatarUrl,
        classes: [],
      };
      byId.set(r.studentId, s);
    }
    if (r.className && !s.classes.includes(r.className)) s.classes.push(r.className);
  }

  const list = Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));

  return <StudentsIndex students={list} />;
}
