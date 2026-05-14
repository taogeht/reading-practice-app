import { NextRequest, NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { canGenerateReadingContent } from '@/lib/auth/reading-content';
import { db } from '@/lib/db';
import {
  readingPassages,
  readingQuestions,
  storyPages,
} from '@/lib/db/schema';
import { logError, logInfo } from '@/lib/logger';
import {
  generateSingleQuestion,
  type GeneratedQuestion,
  type PassagePlan,
} from '@/lib/reading/generate';
import {
  fetchTargetVocab,
  resolveCumulativeVocab,
} from '@/lib/reading/generate/vocab';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ passageId: string; questionId: string }>;
}

/** Per-question regeneration: replace ONE readingQuestions row with a
 *  freshly generated question of the same type. Other questions stay.
 *  The new question is told (in-prompt) which existing questions to
 *  not duplicate. */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }
    if (!(await canGenerateReadingContent(user))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { passageId, questionId } = await params;

    // 1. Load passage + plan + pages + every question.
    const [passage] = await db
      .select()
      .from(readingPassages)
      .where(eq(readingPassages.id, passageId))
      .limit(1);
    if (!passage) {
      return NextResponse.json({ error: 'Passage not found' }, { status: 404 });
    }
    const planFromMeta = (passage.generationMeta as { plan?: unknown } | null)?.plan as
      | PassagePlan
      | undefined;
    if (!planFromMeta) {
      return NextResponse.json(
        {
          error:
            'Plan not available for this passage. Regenerate the entire passage to enable per-question regeneration.',
        },
        { status: 400 },
      );
    }

    const allPages = await db
      .select()
      .from(storyPages)
      .where(eq(storyPages.passageId, passageId))
      .orderBy(storyPages.pageNumber);

    const allQuestions = await db
      .select()
      .from(readingQuestions)
      .where(eq(readingQuestions.passageId, passageId))
      .orderBy(readingQuestions.orderIndex);

    const target = allQuestions.find((q) => q.id === questionId);
    if (!target) {
      return NextResponse.json(
        { error: `Question ${questionId} not in passage ${passageId}` },
        { status: 404 },
      );
    }

    // 2. Convert the OTHER questions (everything except the target) into
    //    the GeneratedQuestion shape the regen lib expects.
    const others: GeneratedQuestion[] = allQuestions
      .filter((q) => q.id !== questionId)
      .map(rowToGeneratedQuestion);

    // 3. Resolve target + cumulative vocab the same way passage.ts does.
    const targetIds = (passage.targetVocabIds as string[]) ?? [];
    const targetRowsFull = await fetchTargetVocab(targetIds);
    const cumulativeFull = await resolveCumulativeVocab(targetRowsFull, undefined);
    const targetVocabRows = targetRowsFull.map((r) => ({
      id: r.id,
      word: r.word,
      mandarinTranslation: r.mandarinTranslation,
      isPicturable: r.isPicturable,
    }));
    const cumulativeVocabRows = cumulativeFull.map((r) => ({
      id: r.id,
      word: r.word,
      isPicturable: r.isPicturable,
    }));

    // 4. Generate.
    const result = await generateSingleQuestion({
      plan: planFromMeta,
      pages: allPages.map((p) => ({ pageNumber: p.pageNumber, text: p.text })),
      questionType: target.questionType,
      orderIndex: target.orderIndex,
      existingOtherQuestions: others,
      targetVocabRows,
      cumulativeVocabRows,
      readingLevelId: passage.readingLevel,
      passageId,
    });

    const q = result.question;

    // 5. Update the row in place. type stays the same (we asked for
    //    same-type regen); evidence_quote / evidence_page_number flip
    //    null for non-MCQ types.
    await db
      .update(readingQuestions)
      .set({
        questionText: q.questionText,
        payload: q.payload,
        evidenceQuote: q.type === 'mcq_comprehension' ? q.evidenceQuote : null,
        evidencePageNumber:
          q.type === 'mcq_comprehension' ? q.evidencePageNumber : null,
        updatedAt: new Date(),
      })
      .where(eq(readingQuestions.id, questionId));

    await db
      .update(readingPassages)
      .set({ updatedAt: sql`now()` })
      .where(eq(readingPassages.id, passageId));

    logInfo(
      `question regenerated`,
      `api/teacher/reading/passages/regenerate-question passage_id=${passageId} question_id=${questionId} type=${target.questionType} regenerated_by=${user.id}`,
    );

    return NextResponse.json(
      { question: q, meta: result.meta },
      { status: 200 },
    );
  } catch (error) {
    logError(error, 'api/teacher/reading/passages/regenerate-question');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

/** Convert a readingQuestions DB row into a GeneratedQuestion. The
 *  payload column is jsonb-typed so we trust its shape per the
 *  questionType discriminator (the orchestrator validated when it
 *  wrote). */
function rowToGeneratedQuestion(row: typeof readingQuestions.$inferSelect): GeneratedQuestion {
  if (row.questionType === 'mcq_comprehension') {
    return {
      type: 'mcq_comprehension',
      questionText: row.questionText,
      orderIndex: row.orderIndex,
      payload: row.payload as { options: string[]; correctIndex: number },
      evidenceQuote: row.evidenceQuote ?? '',
      evidencePageNumber: row.evidencePageNumber ?? 1,
    };
  }
  if (row.questionType === 'vocab_matching') {
    // V2 payload shape — { version: 2, pairs: [{ word, vocabId, imageKey }] }.
    // Pre-V2 rows are surfaced as legacy_vocab_matching_format errors by
    // the validator; in regen we still treat them as V2-shaped here so
    // the model has a "do not duplicate these words" signal. The trailing
    // imageKey is ignored by the regen prompt builder.
    return {
      type: 'vocab_matching',
      questionText: row.questionText,
      orderIndex: row.orderIndex,
      payload: row.payload as {
        version: 2;
        pairs: { word: string; vocabId: string; imageKey: string }[];
      },
    };
  }
  return {
    type: 'sequence_order',
    questionText: row.questionText,
    orderIndex: row.orderIndex,
    payload: row.payload as { events: string[] },
  };
}
