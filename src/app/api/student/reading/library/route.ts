// GET /api/student/reading/library?level=N
//
// Returns the published reading passages at a given level, with
// per-row session flags computed against the calling student's
// studentReadingSessions rows. Used by /student/reading.

import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  readingPassages,
  studentReadingSessions,
} from '@/lib/db/schema';
import { logError } from '@/lib/logger';
import { READING_LEVELS } from '@/lib/reading/levels';

export const runtime = 'nodejs';

const MAX_RESULTS = 50;

interface LibraryRow {
  id: string;
  title: string;
  coverImageUrl: string;
  pageCount: number;
  readBefore: boolean;
  inProgress: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'student' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const levelRaw = url.searchParams.get('level');
    const level = parseInt(levelRaw ?? '', 10);
    if (!Number.isInteger(level) || !READING_LEVELS.some((l) => l.id === level)) {
      return NextResponse.json(
        { error: 'level must be an integer 1-5' },
        { status: 400 },
      );
    }

    // Aggregate per-passage session flags via a single GROUP BY join.
    // bool_or() is true if ANY matching session has the predicate
    // status — covers students with multiple sessions on the same
    // passage (one completed, one re-attempt). Admins get readBefore=
    // false / inProgress=false uniformly since they don't have a
    // students row; the LEFT JOIN's null-side returns false for both.
    const rows = await db
      .select({
        id: readingPassages.id,
        title: readingPassages.title,
        coverImageKey: readingPassages.coverImageKey,
        pageCount: readingPassages.pageCount,
        createdAt: readingPassages.createdAt,
        // bool_or(NULL) is NULL — coalesce so the column type narrows
        // to boolean for the result mapper below.
        readBefore: sql<boolean>`COALESCE(bool_or(${studentReadingSessions.completionStatus} = 'completed'), false)`,
        inProgress: sql<boolean>`COALESCE(bool_or(${studentReadingSessions.completionStatus} = 'in_progress'), false)`,
      })
      .from(readingPassages)
      .leftJoin(
        studentReadingSessions,
        and(
          eq(studentReadingSessions.passageId, readingPassages.id),
          // Filter the join, not the WHERE — otherwise non-matching
          // students' sessions would scrub out passages the student
          // hasn't started yet.
          eq(studentReadingSessions.studentId, user.id),
        ),
      )
      .where(
        and(
          eq(readingPassages.status, 'published'),
          eq(readingPassages.isActive, true),
          eq(readingPassages.readingLevel, level),
        ),
      )
      .groupBy(readingPassages.id)
      // Server-side ordering matches the spec: in-progress first, then
      // unread (newest first), then read (newest first). Postgres can
      // sort by raw SQL expressions without the column needing to be
      // in the SELECT list.
      .orderBy(
        sql`COALESCE(bool_or(${studentReadingSessions.completionStatus} = 'in_progress'), false) DESC`,
        sql`COALESCE(bool_or(${studentReadingSessions.completionStatus} = 'completed'), false) ASC`,
        desc(readingPassages.createdAt),
      )
      .limit(MAX_RESULTS);

    const passages: LibraryRow[] = rows.map((r) => {
      const readBefore = Boolean(r.readBefore);
      // Badge precedence: a kid who has finished a story shouldn't see
      // their accomplishment hidden when they re-open it for a re-read
      // (which writes a fresh in_progress session). The aggregations
      // above keep both flags true; we collapse to readBefore here so
      // the green ✓ wins over the yellow … in the library.
      const inProgress = readBefore ? false : Boolean(r.inProgress);
      return {
        id: r.id,
        title: r.title,
        // The image proxy never expires; passages without a cover (e.g.
        // skip-images drafts that somehow got published) get a null URL
        // so the client can render its placeholder tile.
        coverImageUrl: r.coverImageKey ? `/api/images/${r.coverImageKey}` : '',
        pageCount: r.pageCount,
        readBefore,
        inProgress,
      };
    });

    return NextResponse.json({ passages });
  } catch (error) {
    logError(error, 'api/student/reading/library');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

