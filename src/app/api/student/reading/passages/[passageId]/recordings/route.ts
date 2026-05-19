// GET /api/student/reading/passages/[passageId]/recordings
//
// Returns the calling student's prior recordings for this passage,
// grouped by page. Powers the per-page recorder panel inside the
// passage reader — shows attempts-used + best grade so the kid knows
// where they stand before recording again.

import { NextRequest, NextResponse } from 'next/server';
import { and, asc, desc, eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  passagePageRecordings,
  readingPassages,
  storyPages,
} from '@/lib/db/schema';
import { toProxyAudioUrl } from '@/lib/storage/r2-client';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ passageId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'student') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }
    const { passageId } = await params;

    // Confirm the passage is at least visible to this student.
    const [passageRow] = await db
      .select({ id: readingPassages.id })
      .from(readingPassages)
      .where(
        and(
          eq(readingPassages.id, passageId),
          eq(readingPassages.status, 'published'),
          eq(readingPassages.isActive, true),
        ),
      )
      .limit(1);
    if (!passageRow) {
      return NextResponse.json({ error: 'Passage not found' }, { status: 404 });
    }

    const rows = await db
      .select({
        id: passagePageRecordings.id,
        pageId: passagePageRecordings.pageId,
        pageNumber: storyPages.pageNumber,
        attemptNumber: passagePageRecordings.attemptNumber,
        audioUrl: passagePageRecordings.audioUrl,
        submittedAt: passagePageRecordings.submittedAt,
        transcript: passagePageRecordings.transcript,
        letterGrade: passagePageRecordings.letterGrade,
        accuracyScore: passagePageRecordings.accuracyScore,
        wpmScore: passagePageRecordings.wpmScore,
        analysisJson: passagePageRecordings.analysisJson,
      })
      .from(passagePageRecordings)
      .innerJoin(storyPages, eq(storyPages.id, passagePageRecordings.pageId))
      .where(
        and(
          eq(passagePageRecordings.passageId, passageId),
          eq(passagePageRecordings.studentId, user.id),
        ),
      )
      .orderBy(asc(storyPages.pageNumber), desc(passagePageRecordings.attemptNumber));

    // Group by pageNumber → attempts[]. The first row per page after the
    // ORDER BY is the latest attempt; "best" needs a numeric scan since
    // letterGrade strings aren't naturally ordered.
    const byPage = new Map<
      number,
      Array<(typeof rows)[number]>
    >();
    for (const r of rows) {
      const list = byPage.get(r.pageNumber) ?? [];
      list.push(r);
      byPage.set(r.pageNumber, list);
    }

    const pages = Array.from(byPage.entries())
      .sort(([a], [b]) => a - b)
      .map(([pageNumber, attempts]) => {
        const best = attempts.reduce<typeof attempts[number] | null>((acc, cur) => {
          const accAcc = acc ? Number(acc.accuracyScore ?? 0) : -1;
          const curAcc = Number(cur.accuracyScore ?? 0);
          return curAcc > accAcc ? cur : acc;
        }, null);
        return {
          pageNumber,
          attempts: attempts.map((a) => ({
            id: a.id,
            attemptNumber: a.attemptNumber,
            audioUrl: toProxyAudioUrl(a.audioUrl),
            submittedAt: a.submittedAt.toISOString(),
            transcript: a.transcript,
            letterGrade: a.letterGrade,
            accuracyScore: a.accuracyScore == null ? null : Number(a.accuracyScore),
            wpmScore: a.wpmScore == null ? null : Number(a.wpmScore),
            // expectedView / heardView / op-counts power the
            // word-level diff in StudentAttemptCard.
            analysisJson: a.analysisJson,
          })),
          best: best
            ? {
                id: best.id,
                attemptNumber: best.attemptNumber,
                letterGrade: best.letterGrade,
                accuracyScore: best.accuracyScore == null ? null : Number(best.accuracyScore),
                wpmScore: best.wpmScore == null ? null : Number(best.wpmScore),
              }
            : null,
        };
      });

    return NextResponse.json({ pages });
  } catch (err) {
    logError(err, 'api/student/reading/passages/recordings');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
