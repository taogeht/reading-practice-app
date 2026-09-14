import { redirect } from "next/navigation";
import { eq, inArray, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { classes, classEnrollments, students, users, academicTerms } from "@/lib/db/schema";
import { accessibleClassIds } from "@/lib/auth/class-access";
import { splitByTerm } from "@/lib/classes/term-grouping";
import { StudentsIndex, type StudentRow } from "@/components/teacher/students-index";

export const runtime = "nodejs";

// Top-level index of every student across the teacher's current accessible classes.
export default async function TeacherStudentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "teacher" && user.role !== "admin") redirect("/unauthorized");

  const classIds = await accessibleClassIds(user.id, user.role);
  if (classIds.length === 0) {
    return <StudentsIndex students={[]} />;
  }

  // Fetch the teacher's accessible classes along with term info
  const teacherClasses = await db
    .select({
      id: classes.id,
      name: classes.name,
      active: classes.active,
      promotedToClassId: classes.promotedToClassId,
      termId: classes.termId,
      termName: academicTerms.name,
      termIsCurrent: academicTerms.isCurrent,
    })
    .from(classes)
    .leftJoin(academicTerms, eq(classes.termId, academicTerms.id))
    .where(inArray(classes.id, classIds));

  // Determine which classes are "current":
  // 1. Must be active and not promoted to a successor class.
  // 2. If the school has a current term, must belong to the current term.
  const activeClasses = teacherClasses.filter(
    (c) => Boolean(c.active) && !c.promotedToClassId
  );

  const termSplit = splitByTerm(
    activeClasses.map((c) => ({
      ...c,
      active: true,
      termName: c.termName ?? null,
      termIsCurrent: Boolean(c.termIsCurrent),
    }))
  );

  const currentClasses = termSplit.hasCurrentTerm
    ? activeClasses.filter((c) => Boolean(c.termIsCurrent))
    : activeClasses;

  const currentClassIds = currentClasses.map((c) => c.id);

  if (currentClassIds.length === 0) {
    return <StudentsIndex students={[]} />;
  }

  const rows = await db
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
    .where(
      and(
        inArray(classEnrollments.classId, currentClassIds),
        eq(users.active, true)
      )
    );

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
