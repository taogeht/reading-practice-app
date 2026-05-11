// GET /api/teacher/reading/stats
//
// Counts of reading_passages rows by status. Powers the badges on
// the /teacher/reading hub cards (e.g. "12 awaiting review").
//
// Auth: teacher or admin. The reading library + review queue are
// school-wide today — every teacher sees every passage — so this
// stat is unscoped per-teacher. If we ever scope library content to
// individual classes, this query gains a teacher filter.

import { NextRequest, NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { readingPassages } from '@/lib/db/schema';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

interface StatRow {
  status: 'review' | 'draft' | 'published' | 'archived';
  n: number;
}

export async function GET(_request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    const rows = await db
      .select({
        status: readingPassages.status,
        n: sql<number>`COUNT(*)::int`,
      })
      .from(readingPassages)
      .where(eq(readingPassages.isActive, true))
      .groupBy(readingPassages.status);

    // Default zeros so the client always has the four buckets even
    // when none exist yet (fresh prod, no passages generated).
    const counts: Record<StatRow['status'], number> = {
      review: 0,
      draft: 0,
      published: 0,
      archived: 0,
    };
    for (const r of rows) {
      counts[r.status as StatRow['status']] = r.n;
    }

    return NextResponse.json({ counts });
  } catch (err) {
    logError(err, 'api/teacher/reading/stats');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
