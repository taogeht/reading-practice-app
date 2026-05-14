// GET /api/student/reading/passages/[passageId]
//
// Returns everything the reader needs to render — pages + questions —
// in a single fetch. Auth: student or admin. The passage must be
// status='published' AND is_active=true; anything else returns 404
// to avoid leaking review-queue or archived content to students.
//
// Question payloads are minimised before they leave the server:
//   - mcq_comprehension: correctIndex is stripped (kid would otherwise
//     see the answer in DevTools). evidenceQuote is also stripped —
//     teacher-review-only field.
//   - vocab_matching: pairs ship with word + vocabId + imageKey. The
//     vocabId is needed by the client to compute pairings, so it ships
//     even though it identifies the right answer indirectly.
//   - sequence_order: events ship in canonical order — the client
//     shuffles them for display.

import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  readingPassages,
  readingQuestions,
  storyPages,
} from '@/lib/db/schema';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ passageId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'student' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }
    const { passageId } = await params;

    const [passage] = await db
      .select({
        id: readingPassages.id,
        title: readingPassages.title,
        pageCount: readingPassages.pageCount,
        readingLevel: readingPassages.readingLevel,
        coverImageKey: readingPassages.coverImageKey,
      })
      .from(readingPassages)
      .where(
        and(
          eq(readingPassages.id, passageId),
          eq(readingPassages.status, 'published'),
          eq(readingPassages.isActive, true),
        ),
      )
      .limit(1);
    if (!passage) {
      return NextResponse.json({ error: 'Passage not found' }, { status: 404 });
    }

    const pageRows = await db
      .select({
        pageNumber: storyPages.pageNumber,
        text: storyPages.text,
        imageKey: storyPages.imageKey,
        ttsAudioKey: storyPages.ttsAudioKey,
        updatedAt: storyPages.updatedAt,
      })
      .from(storyPages)
      .where(eq(storyPages.passageId, passageId))
      .orderBy(storyPages.pageNumber);

    const questionRows = await db
      .select({
        id: readingQuestions.id,
        questionType: readingQuestions.questionType,
        questionText: readingQuestions.questionText,
        orderIndex: readingQuestions.orderIndex,
        payload: readingQuestions.payload,
      })
      .from(readingQuestions)
      .where(eq(readingQuestions.passageId, passageId))
      .orderBy(readingQuestions.orderIndex);

    const pages = pageRows.map((p) => ({
      pageNumber: p.pageNumber,
      text: p.text,
      imageUrl: p.imageKey ? `/api/images/${p.imageKey}` : '',
      // Narration audio is optional — only present when a teacher
      // generated TTS for this passage via /teacher/reading/review.
      // ?v=<updatedAt> defeats the audio proxy's 1-year cache header
      // so regenerated audio plays immediately for kids who had the
      // old version cached locally.
      audioUrl: p.ttsAudioKey
        ? `/api/audio/${p.ttsAudioKey}?v=${encodeURIComponent(p.updatedAt.toISOString())}`
        : '',
    }));

    const questions = questionRows.map((q) => {
      if (q.questionType === 'mcq_comprehension') {
        const raw = q.payload as { options: string[]; correctIndex: number };
        return {
          id: q.id,
          type: 'mcq_comprehension' as const,
          questionText: q.questionText,
          orderIndex: q.orderIndex,
          // correctIndex DELIBERATELY OMITTED. The /answer endpoint
          // looks it up server-side and reveals it post-submission.
          payload: { options: raw.options },
        };
      }
      if (q.questionType === 'vocab_matching') {
        const raw = q.payload as {
          version?: number;
          pairs: { word: string; vocabId: string; imageKey: string }[];
        };
        return {
          id: q.id,
          type: 'vocab_matching' as const,
          questionText: q.questionText,
          orderIndex: q.orderIndex,
          payload: {
            version: raw.version ?? 1,
            pairs: raw.pairs.map((p) => ({
              word: p.word,
              vocabId: p.vocabId,
              imageUrl: p.imageKey
                ? p.imageKey.startsWith('skipped:')
                  ? ''
                  : `/api/images/${p.imageKey}`
                : '',
            })),
          },
        };
      }
      // sequence_order
      const raw = q.payload as { events: string[] };
      return {
        id: q.id,
        type: 'sequence_order' as const,
        questionText: q.questionText,
        orderIndex: q.orderIndex,
        payload: { events: raw.events },
      };
    });

    return NextResponse.json({
      passage: {
        id: passage.id,
        title: passage.title,
        pageCount: passage.pageCount,
        readingLevel: passage.readingLevel,
      },
      pages,
      questions,
    });
  } catch (error) {
    logError(error, 'api/student/reading/passages/[passageId]');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
