import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { gradebookTests } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { logError } from '@/lib/logger';
import { userCanManageClass } from '@/lib/auth/class-access';

export const runtime = 'nodejs';

async function authorize(userId: string, role: string, classId: string, testId: string) {
  if (!(await userCanManageClass(userId, role, classId))) return 'forbidden' as const;
  const rows = await db
    .select({ id: gradebookTests.id })
    .from(gradebookTests)
    .where(and(eq(gradebookTests.id, testId), eq(gradebookTests.classId, classId)))
    .limit(1);
  return rows.length ? ('ok' as const) : ('not_found' as const);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string; testId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }
    const { classId, testId } = await params;
    const auth = await authorize(user.id, user.role, classId, testId);
    if (auth === 'forbidden') return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    if (auth === 'not_found') return NextResponse.json({ error: 'Test not found' }, { status: 404 });

    const body = await request.json();
    const { name, testType, testDate } = body;
    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      return NextResponse.json({ error: 'Test name cannot be empty' }, { status: 400 });
    }

    const updated = await db
      .update(gradebookTests)
      .set({
        ...(name !== undefined ? { name: name.trim().slice(0, 120) } : {}),
        ...(testType !== undefined ? { testType: String(testType).trim().slice(0, 40) || 'quiz' } : {}),
        ...(testDate !== undefined ? { testDate: testDate || null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(gradebookTests.id, testId))
      .returning();

    return NextResponse.json({ test: updated[0] });
  } catch (error) {
    logError(error, 'api/teacher/classes/[classId]/gradebook/[testId]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string; testId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }
    const { classId, testId } = await params;
    const auth = await authorize(user.id, user.role, classId, testId);
    if (auth === 'forbidden') return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    if (auth === 'not_found') return NextResponse.json({ error: 'Test not found' }, { status: 404 });

    // Scores cascade-delete via the FK.
    await db.delete(gradebookTests).where(eq(gradebookTests.id, testId));
    return NextResponse.json({ message: 'Test deleted' });
  } catch (error) {
    logError(error, 'api/teacher/classes/[classId]/gradebook/[testId]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
