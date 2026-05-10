// GET /api/teacher/students/[studentId]/reading-mastery
//
// Per-vocabulary mastery rows for one student, surfaced on the
// teacher's per-student detail page. Mirrors the spelling
// word-mastery endpoint's auth pattern: teachers can only access
// students enrolled in one of their own classes (admins bypass).

import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  classEnrollments,
  classes,
  studentVocabularyMastery,
  vocabulary,
} from '@/lib/db/schema';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ studentId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { studentId } = await params;

    if (user.role === 'teacher') {
      const enrollment = await db
        .select({ id: classes.id })
        .from(classEnrollments)
        .innerJoin(classes, eq(classes.id, classEnrollments.classId))
        .where(
          and(
            eq(classEnrollments.studentId, studentId),
            eq(classes.teacherId, user.id),
          ),
        )
        .limit(1);
      if (enrollment.length === 0) {
        return NextResponse.json({ error: 'Student not found' }, { status: 404 });
      }
    }

    const rows = await db
      .select({
        vocabularyId: studentVocabularyMastery.vocabularyId,
        word: vocabulary.word,
        partOfSpeech: vocabulary.partOfSpeech,
        afFLevel: vocabulary.afFLevel,
        exposures: studentVocabularyMastery.exposures,
        successes: studentVocabularyMastery.successes,
        failures: studentVocabularyMastery.failures,
        // numeric(4,3) comes back as a string; the client coerces.
        masteryScore: studentVocabularyMastery.masteryScore,
        lastSeenAt: studentVocabularyMastery.lastSeenAt,
      })
      .from(studentVocabularyMastery)
      .innerJoin(
        vocabulary,
        eq(vocabulary.id, studentVocabularyMastery.vocabularyId),
      )
      .where(eq(studentVocabularyMastery.studentId, studentId))
      // Default ordering is by lastSeenAt desc so the teacher first
      // sees the most-recently-touched words; the UI can re-sort.
      .orderBy(desc(studentVocabularyMastery.lastSeenAt));

    const items = rows.map((r) => ({
      vocabularyId: r.vocabularyId,
      word: r.word,
      partOfSpeech: r.partOfSpeech,
      afFLevel: r.afFLevel,
      exposures: r.exposures,
      successes: r.successes,
      failures: r.failures,
      masteryScore: Number(r.masteryScore),
      successRate:
        r.successes + r.failures > 0
          ? r.successes / (r.successes + r.failures)
          : null,
      lastSeenAt: r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    logError(error, 'api/teacher/students/[studentId]/reading-mastery');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
