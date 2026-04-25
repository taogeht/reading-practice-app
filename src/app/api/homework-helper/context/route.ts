import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { classEnrollments, classes, spellingLists, spellingWords } from '@/lib/db/schema';
import { isValidUnit } from '@/lib/practice/units';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Teacher/admin preview mode: unit comes from query string, no student context lookup
  if (user.role === 'teacher' || user.role === 'admin') {
    const unitParam = Number(request.nextUrl.searchParams.get('unit'));
    const unit = isValidUnit(unitParam) ? unitParam : 1;
    return NextResponse.json({ currentUnit: unit, spellingWords: [] });
  }

  if (user.role !== 'student') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const enrollment = await db
    .select({ classId: classEnrollments.classId, currentUnit: classes.currentUnit })
    .from(classEnrollments)
    .innerJoin(classes, eq(classes.id, classEnrollments.classId))
    .where(and(eq(classEnrollments.studentId, user.id), eq(classes.active, true)))
    .orderBy(desc(classes.updatedAt))
    .limit(1);

  if (enrollment.length === 0) {
    return NextResponse.json({ currentUnit: 1, spellingWords: [] });
  }

  const { classId, currentUnit } = enrollment[0];

  const list = await db
    .select({ id: spellingLists.id })
    .from(spellingLists)
    .where(and(eq(spellingLists.classId, classId), eq(spellingLists.active, true)))
    .orderBy(desc(spellingLists.weekNumber), desc(spellingLists.createdAt))
    .limit(1);

  if (list.length === 0) {
    return NextResponse.json({ currentUnit, spellingWords: [] });
  }

  const words = await db
    .select({ word: spellingWords.word })
    .from(spellingWords)
    .where(eq(spellingWords.spellingListId, list[0].id))
    .orderBy(spellingWords.orderIndex);

  return NextResponse.json({
    currentUnit,
    spellingWords: words.map((w) => w.word),
  });
}
