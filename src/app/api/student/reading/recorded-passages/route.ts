// GET /api/student/reading/recorded-passages
//
// Lists every passage the calling student has at least one page recording on.
// Powers the "Reading passages you've recorded" section on /student/dashboard.

import { NextRequest, NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  passagePageRecordings,
  readingPassages,
} from '@/lib/db/schema';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(_request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'student') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    // One row per passage. distinct-pages counts unique pages this
    // student has recorded on (not total attempts). avg accuracy uses
    // the per-page best accuracy via a subquery.
    const rows = await db.execute<{
      passage_id: string;
      title: string;
      cover_image_key: string | null;
      page_count: number;
      pages_recorded: number;
      best_avg_accuracy: number | null;
      latest_submitted_at: string;
    }>(sql`
      WITH best_per_page AS (
        SELECT page_id,
               MAX(submitted_at) AS latest_submitted_at,
               MAX(accuracy_score) AS best_accuracy
        FROM ${passagePageRecordings}
        WHERE student_id = ${user.id}
        GROUP BY page_id
      )
      SELECT
        rp.id              AS passage_id,
        rp.title           AS title,
        rp.cover_image_key AS cover_image_key,
        rp.page_count      AS page_count,
        COUNT(DISTINCT bpp.page_id)::int AS pages_recorded,
        AVG(bpp.best_accuracy)           AS best_avg_accuracy,
        MAX(bpp.latest_submitted_at)     AS latest_submitted_at
      FROM ${passagePageRecordings} ppr
      JOIN ${readingPassages} rp ON rp.id = ppr.passage_id
      JOIN best_per_page bpp     ON bpp.page_id = ppr.page_id
      WHERE ppr.student_id = ${user.id}
        AND rp.is_active = true
      GROUP BY rp.id, rp.title, rp.cover_image_key, rp.page_count
      ORDER BY latest_submitted_at DESC
    `);

    const list = (rows as unknown as { rows?: typeof rows }).rows ?? (rows as unknown as Array<{
      passage_id: string;
      title: string;
      cover_image_key: string | null;
      page_count: number;
      pages_recorded: number;
      best_avg_accuracy: number | string | null;
      latest_submitted_at: string;
    }>);

    return NextResponse.json({
      passages: list.map((r) => ({
        passageId: r.passage_id,
        title: r.title,
        coverImageKey: r.cover_image_key,
        pageCount: r.page_count,
        pagesRecorded: r.pages_recorded,
        bestAvgAccuracy:
          r.best_avg_accuracy == null ? null : Number(r.best_avg_accuracy),
        latestSubmittedAt: r.latest_submitted_at,
      })),
    });
  } catch (err) {
    logError(err, 'api/student/reading/recorded-passages');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
