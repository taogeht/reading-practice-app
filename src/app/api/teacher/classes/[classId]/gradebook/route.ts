import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { gradebookTests, gradebookScores, classEnrollments, students, users } from '@/lib/db/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { logError } from '@/lib/logger';
import { userCanManageClass } from '@/lib/auth/class-access';

export const runtime = 'nodejs';

// Gradebook-lite for a class: the roster, the class's tests, and each student's
// percentage score per test. GET returns everything the entry grid needs; POST
// creates a new (empty) test. Any teacher who manages the class can use it.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }
    const { classId } = await params;
    if (!(await userCanManageClass(user.id, user.role, classId))) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const roster = await db
      .select({ id: students.id, firstName: users.firstName, lastName: users.lastName })
      .from(classEnrollments)
      .innerJoin(students, eq(classEnrollments.studentId, students.id))
      .innerJoin(users, eq(students.id, users.id))
      .where(eq(classEnrollments.classId, classId))
      .orderBy(users.firstName, users.lastName);

    const tests = await db
      .select()
      .from(gradebookTests)
      .where(eq(gradebookTests.classId, classId))
      .orderBy(desc(gradebookTests.testDate), desc(gradebookTests.createdAt));

    const testIds = tests.map((t) => t.id);
    const scores = testIds.length
      ? await db.select().from(gradebookScores).where(inArray(gradebookScores.testId, testIds))
      : [];
    const scoresByTest = new Map<string, { studentId: string; score: number | null }[]>();
    for (const s of scores) {
      const list = scoresByTest.get(s.testId) ?? [];
      list.push({ studentId: s.studentId, score: s.score != null ? Number(s.score) : null });
      scoresByTest.set(s.testId, list);
    }

    return NextResponse.json({
      students: roster,
      tests: tests.map((t) => ({
        id: t.id,
        name: t.name,
        testType: t.testType,
        testDate: t.testDate,
        createdAt: t.createdAt,
        scores: scoresByTest.get(t.id) ?? [],
      })),
    });
  } catch (error) {
    logError(error, 'api/teacher/classes/[classId]/gradebook');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }
    const { classId } = await params;
    if (!(await userCanManageClass(user.id, user.role, classId))) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await request.json();
    const { name, testType, testDate } = body;
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'A test name is required' }, { status: 400 });
    }

    const inserted = await db
      .insert(gradebookTests)
      .values({
        classId,
        name: name.trim().slice(0, 120),
        testType: typeof testType === 'string' && testType.trim() ? testType.trim().slice(0, 40) : 'quiz',
        testDate: testDate || null,
        createdBy: user.id,
      })
      .returning();

    return NextResponse.json(
      { test: { ...inserted[0], scores: [] }, message: 'Test created' },
      { status: 201 },
    );
  } catch (error) {
    logError(error, 'api/teacher/classes/[classId]/gradebook');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
