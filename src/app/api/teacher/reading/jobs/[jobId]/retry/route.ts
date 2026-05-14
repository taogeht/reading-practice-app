// POST /api/teacher/reading/jobs/[jobId]/retry
//
// Re-fire a previous batch with the same settings. Validates the
// original target_vocab_ids still resolve to picturable rows when
// the question mix demands it (a teacher might retry weeks later,
// after the vocab table has been re-marked). Inserts a NEW
// generation-job row with `parent_job_id` pointing back at the
// original; returns the new job id.
//
// Implementation note: rather than duplicate the queue-and-launch
// plumbing from /generate, this route just re-POSTs to the main
// endpoint internally. The pattern keeps validation + job-row
// lifecycle in a single place. The internal fetch carries the
// teacher's auth cookie via request.headers.get('cookie').
//
// Auth: teacher (must own the parent) or admin.

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { canGenerateReadingContent } from '@/lib/auth/reading-content';
import { db } from '@/lib/db';
import { readingGenerationJobs, vocabulary } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';
import { logError } from '@/lib/logger';
import {
  applyOverridesToLevel,
  getReadingLevel,
} from '@/lib/reading/levels';
import type { GenerateOverrides } from '@/lib/reading/generate';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }
    if (!(await canGenerateReadingContent(user))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { jobId } = await params;

    const [row] = await db
      .select()
      .from(readingGenerationJobs)
      .where(eq(readingGenerationJobs.id, jobId))
      .limit(1);
    if (!row) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    if (user.role !== 'admin' && row.teacherId !== user.id) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const overrides = row.overridesUsed as GenerateOverrides;

    // Re-validate target_vocab_ids when the original job ran in
    // specific mode. Words can disappear (vocabulary edits) or lose
    // their picturable flag (the curated false set could grow over
    // time) — a stale retry would fail downstream with a worse
    // error. Catch that here.
    if (
      overrides.targetVocabSelectionMode === 'specific' &&
      Array.isArray(overrides.targetVocabIds) &&
      overrides.targetVocabIds.length > 0
    ) {
      const baseLevel = getReadingLevel(row.readingLevelId);
      const effective = applyOverridesToLevel(baseLevel, overrides);
      const needsPicturable = effective.questionTypeMix.vocab_matching > 0;

      const ids = overrides.targetVocabIds;
      const rows = await db
        .select({
          id: vocabulary.id,
          word: vocabulary.word,
          isPicturable: vocabulary.isPicturable,
        })
        .from(vocabulary)
        .where(inArray(vocabulary.id, ids));
      const found = new Set(rows.map((r) => r.id));
      const missing = ids.filter((id) => !found.has(id));
      if (missing.length > 0) {
        return NextResponse.json(
          {
            error:
              "Some of the original vocabulary words no longer exist. Adjust the settings and try again.",
            issues: missing,
          },
          { status: 400 },
        );
      }
      if (needsPicturable) {
        const blockers = rows.filter((r) => !r.isPicturable);
        if (blockers.length > 0) {
          return NextResponse.json(
            {
              error:
                'Some of the original vocabulary words are no longer picture-friendly. Adjust the settings and try again.',
              issues: blockers.map((b) => b.word),
            },
            { status: 400 },
          );
        }
      }
    }

    // Forward to /generate. Doing this via fetch (server-side) lets
    // us reuse every validation step + job-row creation without
    // duplicating ~200 lines. The cookie header carries the
    // teacher's session.
    const url = new URL('/api/teacher/reading/generate', request.url);
    const cookie = request.headers.get('cookie') ?? '';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        readingLevelId: row.readingLevelId,
        countToGenerate: row.countRequested,
        overrides,
        parentJobId: row.id,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        issues?: string[];
      };
      return NextResponse.json(
        {
          error: body.error ?? 'Retry could not start',
          issues: body.issues ?? [],
        },
        { status: res.status },
      );
    }
    const body = (await res.json()) as {
      jobId: string;
      countToGenerate: number;
      estimatedMinutes: number;
      message: string;
    };
    return NextResponse.json(body);
  } catch (err) {
    logError(err, 'api/teacher/reading/jobs/[jobId]/retry');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
