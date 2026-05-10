// POST /api/student/reading/sessions/[sessionId]/complete
//
// Finalises the session: status='completed', finishedAt=now(),
// timeSecondsTotal computed from startedAt. Idempotent — calling on
// an already-completed session returns the existing tallies without
// touching the row OR firing XP / re-running the mastery rollup.
//
// XP fires (post-transition only):
//   - reading_story_completed   → first-ever completion of this
//     passage by this student. Subsequent re-reads of a completed
//     passage don't fire it again.
//   - reading_perfect_score     → questionsCorrect === totalQuestions.
//
// Mastery rollup runs once per first transition to 'completed' via
// recomputeStudentVocabularyMastery, which itself fires
// vocab_word_mastered for each (vocab) row that crosses the 0.85
// threshold from below.

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  readingQuestions,
  studentReadingSessions,
} from '@/lib/db/schema';
import { logError } from '@/lib/logger';
import { awardXp } from '@/lib/gamification/award';
import { recomputeStudentVocabularyMastery } from '@/lib/reading/mastery';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'student') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }
    const { sessionId } = await params;

    const [session] = await db
      .select()
      .from(studentReadingSessions)
      .where(
        and(
          eq(studentReadingSessions.id, sessionId),
          eq(studentReadingSessions.studentId, user.id),
        ),
      )
      .limit(1);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // total_questions = number of readingQuestions on this passage.
    // We don't trust the client's number here so the summary stays
    // honest even if the client misses a question.
    const [{ totalQuestions } = { totalQuestions: 0 }] = await db
      .select({
        totalQuestions: sql<number>`COUNT(*)::int`,
      })
      .from(readingQuestions)
      .where(eq(readingQuestions.passageId, session.passageId));

    if (session.completionStatus === 'completed') {
      return NextResponse.json({
        questionsCorrect: session.questionsCorrect,
        totalQuestions,
        timeSecondsTotal: session.timeSecondsTotal ?? 0,
        alreadyCompleted: true,
      });
    }

    // Detect "first-ever completion of this passage" BEFORE we write
    // the new completed row. The unique-index race fix from Track C
    // means at most one in_progress session exists per (student,
    // passage), but completed/abandoned rows can stack — so we ask
    // "are there ANY completed rows for this pair already?" and
    // gate the one-time XP event on that.
    const [{ completedBefore } = { completedBefore: 0 }] = await db
      .select({
        completedBefore: sql<number>`COUNT(*)::int`,
      })
      .from(studentReadingSessions)
      .where(
        and(
          eq(studentReadingSessions.studentId, user.id),
          eq(studentReadingSessions.passageId, session.passageId),
          eq(studentReadingSessions.completionStatus, 'completed'),
        ),
      );
    const isFirstCompletion = completedBefore === 0;

    const finishedAt = new Date();
    const timeSecondsTotal = Math.max(
      0,
      Math.floor((finishedAt.getTime() - session.startedAt.getTime()) / 1000),
    );

    await db
      .update(studentReadingSessions)
      .set({
        completionStatus: 'completed',
        finishedAt,
        timeSecondsTotal,
      })
      .where(eq(studentReadingSessions.id, sessionId));

    // Post-transition: XP + mastery rollup. All wrapped in their own
    // try/catch so a failure in any branch doesn't break the API
    // response (the kid still sees the summary screen).
    if (isFirstCompletion) {
      try {
        await awardXp(user.id, 'reading_story_completed', session.passageId);
      } catch (err) {
        console.error('[complete] reading_story_completed XP failed:', err);
      }
    }
    if (totalQuestions > 0 && session.questionsCorrect === totalQuestions) {
      try {
        await awardXp(user.id, 'reading_perfect_score', session.passageId);
      } catch (err) {
        console.error('[complete] reading_perfect_score XP failed:', err);
      }
    }
    try {
      // Mastery rollup fires vocab_word_mastered internally when a
      // word crosses the 0.85 threshold from below. Errors are
      // logged inside the helper.
      await recomputeStudentVocabularyMastery(user.id, session.passageId);
    } catch (err) {
      console.error('[complete] mastery rollup failed:', err);
    }

    return NextResponse.json({
      questionsCorrect: session.questionsCorrect,
      totalQuestions,
      timeSecondsTotal,
      alreadyCompleted: false,
    });
  } catch (error) {
    logError(error, 'api/student/reading/sessions/[sessionId]/complete');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
