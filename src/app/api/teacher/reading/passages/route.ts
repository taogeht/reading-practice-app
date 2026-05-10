import { NextRequest, NextResponse } from 'next/server';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  passageStatusEnum,
  readingPassages,
  readingQuestions,
  storyPages,
} from '@/lib/db/schema';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

const VALID_STATUSES = new Set(passageStatusEnum.enumValues);
const VALID_SORTS = new Set(['quality', 'recency'] as const);

/** GET /api/teacher/reading/passages?status=review&level=2&sort=quality
 *  Lists passages for the review queue. Defaults: status=review, no
 *  level filter, sort=quality (highest qualityScore first; ties → most
 *  recently created first). */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status') ?? 'review';
    const levelParam = searchParams.get('level');
    const sortParam = searchParams.get('sort') ?? 'quality';

    const conditions = [];
    if (statusParam !== 'all') {
      if (!VALID_STATUSES.has(statusParam as (typeof passageStatusEnum.enumValues)[number])) {
        return NextResponse.json({ error: `Invalid status '${statusParam}'` }, { status: 400 });
      }
      conditions.push(
        eq(
          readingPassages.status,
          statusParam as (typeof passageStatusEnum.enumValues)[number],
        ),
      );
    }
    if (levelParam) {
      const lvl = parseInt(levelParam, 10);
      if (!Number.isInteger(lvl) || lvl < 1 || lvl > 5) {
        return NextResponse.json({ error: `Invalid level '${levelParam}'` }, { status: 400 });
      }
      conditions.push(eq(readingPassages.readingLevel, lvl));
    }

    if (!VALID_SORTS.has(sortParam as 'quality' | 'recency')) {
      return NextResponse.json({ error: `Invalid sort '${sortParam}'` }, { status: 400 });
    }

    // Quality is stored inside the generationMeta JSON column —
    // generation_meta -> 'qualityReport' -> 'passageReady' wins ties via
    // a coalesced score expression. Recency falls back to created_at.
    const qualityExpr = sql<number>`COALESCE(
      ((${readingPassages.generationMeta}->'qualityReport'->>'proseScore')::numeric * 0.5 +
       (${readingPassages.generationMeta}->'qualityReport'->>'questionsScore')::numeric * 0.5),
      0
    )`;

    const orderBy =
      sortParam === 'quality'
        ? [desc(qualityExpr), desc(readingPassages.createdAt)]
        : [desc(readingPassages.createdAt)];

    const rows = await db
      .select({
        id: readingPassages.id,
        title: readingPassages.title,
        readingLevel: readingPassages.readingLevel,
        status: readingPassages.status,
        pageCount: readingPassages.pageCount,
        coverImageKey: readingPassages.coverImageKey,
        summary: readingPassages.summary,
        generationMeta: readingPassages.generationMeta,
        createdAt: readingPassages.createdAt,
        updatedAt: readingPassages.updatedAt,
        isActive: readingPassages.isActive,
      })
      .from(readingPassages)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(...orderBy)
      .limit(200);

    // Count of questions per passage. Cheap aggregate across the
    // result set's IDs.
    const ids = rows.map((r) => r.id);
    let questionCounts: Record<string, number> = {};
    if (ids.length > 0) {
      const qRows = await db
        .select({
          passageId: readingQuestions.passageId,
          n: count(),
        })
        .from(readingQuestions)
        .where(
          sql`${readingQuestions.passageId} = ANY(${sql.raw(`ARRAY[${ids.map((id) => `'${id}'`).join(',')}]::uuid[]`)})`,
        )
        .groupBy(readingQuestions.passageId);
      questionCounts = Object.fromEntries(qRows.map((r) => [r.passageId, Number(r.n)]));
    }

    const passages = rows.map((r) => ({
      ...r,
      questionCount: questionCounts[r.id] ?? 0,
    }));

    return NextResponse.json({ passages });
  } catch (error) {
    logError(error, 'api/teacher/reading/passages');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
