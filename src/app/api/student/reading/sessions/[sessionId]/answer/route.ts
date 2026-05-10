// POST /api/student/reading/sessions/[sessionId]/answer
//
// Body: {
//   questionId: string,
//   answerGiven: any,    // shape depends on question type, see below
//   timeSeconds: number  // self-reported time spent on this question
// }
//
// Determines correctness server-side, INSERTs into
// studentReadingAnswers, increments session counters, and returns
// { isCorrect, correctAnswer } so the client can render feedback.
//
// Correctness rules:
//   mcq_comprehension → answer.selectedIndex === payload.correctIndex
//   vocab_matching    → every pairing has wordVocabId === pictureVocabId
//                       AND every pair from the canonical set is paired
//   sequence_order    → answer.eventOrder is a permutation of
//                       [0..events.length-1] in canonical order [0,1,..]
//
// answerGiven shapes (client side ↔ server side):
//   mcq_comprehension → { selectedIndex: number }
//   vocab_matching    → { pairings: Array<{ wordVocabId: string,
//                                            pictureVocabId: string }> }
//   sequence_order    → { eventOrder: number[] } where each entry is
//                       an index into payload.events
//
// The unique constraint on (session_id, question_id) means
// re-submitting the same question is an error. We surface that as 409.

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  readingQuestions,
  studentReadingAnswers,
  studentReadingSessions,
} from '@/lib/db/schema';
import { logError } from '@/lib/logger';
import { awardXp } from '@/lib/gamification/award';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

interface McqAnswer {
  selectedIndex: number;
}
interface VocabAnswer {
  pairings: Array<{ wordVocabId: string; pictureVocabId: string }>;
}
interface SequenceAnswer {
  eventOrder: number[];
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'student') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }
    const { sessionId } = await params;
    const body = await request.json().catch(() => null);
    const questionId = typeof body?.questionId === 'string' ? body.questionId : '';
    const answerGiven = body?.answerGiven;
    const timeSeconds =
      typeof body?.timeSeconds === 'number' && Number.isFinite(body.timeSeconds)
        ? Math.max(0, Math.floor(body.timeSeconds))
        : 0;
    if (!questionId || answerGiven == null) {
      return NextResponse.json(
        { error: 'questionId and answerGiven are required' },
        { status: 400 },
      );
    }

    // Authorise: session must belong to the calling student AND still be
    // in_progress. We disallow answers against completed/abandoned
    // sessions to keep stats clean.
    const [session] = await db
      .select({
        id: studentReadingSessions.id,
        passageId: studentReadingSessions.passageId,
        completionStatus: studentReadingSessions.completionStatus,
      })
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
    if (session.completionStatus !== 'in_progress') {
      return NextResponse.json(
        { error: 'Session is not in progress' },
        { status: 409 },
      );
    }

    // The question must belong to this session's passage. Otherwise a
    // student could answer a question from another passage and have it
    // count toward this session.
    const [question] = await db
      .select({
        id: readingQuestions.id,
        passageId: readingQuestions.passageId,
        questionType: readingQuestions.questionType,
        payload: readingQuestions.payload,
      })
      .from(readingQuestions)
      .where(eq(readingQuestions.id, questionId))
      .limit(1);
    if (!question || question.passageId !== session.passageId) {
      return NextResponse.json(
        { error: 'Question does not belong to this session' },
        { status: 400 },
      );
    }

    // Server-side correctness. Each branch returns { isCorrect,
    // correctAnswer } in a shape the client can render directly.
    let isCorrect = false;
    let correctAnswer: unknown = null;
    if (question.questionType === 'mcq_comprehension') {
      const payload = question.payload as { options: string[]; correctIndex: number };
      const a = answerGiven as Partial<McqAnswer>;
      if (
        typeof a?.selectedIndex !== 'number' ||
        !Number.isInteger(a.selectedIndex)
      ) {
        return NextResponse.json(
          { error: 'mcq answer must include integer selectedIndex' },
          { status: 400 },
        );
      }
      isCorrect = a.selectedIndex === payload.correctIndex;
      correctAnswer = { correctIndex: payload.correctIndex };
    } else if (question.questionType === 'vocab_matching') {
      const payload = question.payload as {
        version?: number;
        pairs: { word: string; vocabId: string; imageKey?: string }[];
      };
      const a = answerGiven as Partial<VocabAnswer>;
      if (!Array.isArray(a?.pairings)) {
        return NextResponse.json(
          { error: 'vocab answer must include pairings[]' },
          { status: 400 },
        );
      }
      const expectedIds = new Set(payload.pairs.map((p) => p.vocabId));
      // Correct iff (a) the student paired every canonical word and
      // (b) each pairing's wordVocabId === its pictureVocabId.
      const allWordsCovered =
        a.pairings.length === payload.pairs.length &&
        a.pairings.every((p) => expectedIds.has(p.wordVocabId));
      const allRight = a.pairings.every(
        (p) => p.wordVocabId === p.pictureVocabId,
      );
      isCorrect = allWordsCovered && allRight;
      // Client uses this to highlight which pairings were wrong and
      // show the correct mapping (each word → its own picture).
      correctAnswer = {
        pairings: payload.pairs.map((p) => ({
          wordVocabId: p.vocabId,
          pictureVocabId: p.vocabId,
        })),
      };
    } else {
      // sequence_order
      const payload = question.payload as { events: string[] };
      const a = answerGiven as Partial<SequenceAnswer>;
      if (!Array.isArray(a?.eventOrder)) {
        return NextResponse.json(
          { error: 'sequence answer must include eventOrder[]' },
          { status: 400 },
        );
      }
      const canonical = payload.events.map((_, i) => i);
      isCorrect =
        a.eventOrder.length === canonical.length &&
        a.eventOrder.every((idx, i) => idx === canonical[i]);
      correctAnswer = { eventOrder: canonical };
    }

    // INSERT the answer + bump session counters in one transaction so
    // concurrent /answer requests can't double-count.
    try {
      await db.transaction(async (tx) => {
        await tx.insert(studentReadingAnswers).values({
          sessionId,
          questionId,
          answerGiven,
          isCorrect,
          timeSeconds,
        });
        await tx
          .update(studentReadingSessions)
          .set({
            questionsAnswered: sql`${studentReadingSessions.questionsAnswered} + 1`,
            questionsCorrect: sql`${studentReadingSessions.questionsCorrect} + ${isCorrect ? 1 : 0}`,
          })
          .where(eq(studentReadingSessions.id, sessionId));
      });
    } catch (err) {
      // Unique violation = same question answered twice in this
      // session. Surface as 409 so the client can choose how to
      // recover (typically: ignore + advance using the previous
      // answer's outcome).
      if (err instanceof Error && /unique_session_question/.test(err.message)) {
        return NextResponse.json(
          { error: 'Question already answered in this session' },
          { status: 409 },
        );
      }
      throw err;
    }

    // XP fires. Wrapped in try/catch via awardXp itself (already
    // swallows errors), but we also gate the bonus event on the
    // primary one's success here so a partial XP write isn't
    // misleading. Per-question XP only fires when isCorrect=true:
    //   - reading_question_correct          → 5 XP base
    //   - reading_question_first_try_correct → 2 XP bonus
    // First-try is implicit at the session level: the unique
    // (session, question) constraint means each question is
    // answered exactly once per session, so reaching this point
    // (after the INSERT succeeded above) is by definition the
    // first attempt for this session. Across sessions for the
    // same passage, this still rewards "got it right on this
    // re-read" — that aligns with the rest of the XP economy.
    if (isCorrect) {
      try {
        await awardXp(user.id, 'reading_question_correct', questionId);
        await awardXp(user.id, 'reading_question_first_try_correct', questionId);
      } catch (err) {
        // awardXp already logs; this catch is belt-and-braces in
        // case the helper itself throws synchronously.
        console.error('[answer] reading XP award failed:', err);
      }
    }

    return NextResponse.json({ isCorrect, correctAnswer });
  } catch (error) {
    logError(error, 'api/student/reading/sessions/[sessionId]/answer');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
