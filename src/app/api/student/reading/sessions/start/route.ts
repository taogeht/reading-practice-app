// POST /api/student/reading/sessions/start
//
// Body: { passageId: string, force?: boolean }
//
// Resumes an existing in_progress session if one exists for
// (student, passage); otherwise creates a fresh row. With force=true
// the existing in_progress row is marked 'abandoned' and a new
// session takes its place — used by the "Start over" button.
//
// Auth: student only. Admins don't have a students row so this would
// fail an FK on the studentId column.

import { NextRequest, NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  readingPassages,
  studentReadingSessions,
} from '@/lib/db/schema';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'student') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => null);
    const passageId = typeof body?.passageId === 'string' ? body.passageId : '';
    const force = Boolean(body?.force);
    if (!passageId) {
      return NextResponse.json(
        { error: 'passageId is required' },
        { status: 400 },
      );
    }

    // Confirm the passage is one the student is allowed to start.
    const [passage] = await db
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
    if (!passage) {
      return NextResponse.json({ error: 'Passage not found' }, { status: 404 });
    }

    // Force path: explicitly abandon the existing in_progress row,
    // then insert a fresh one. Both happen in a single transaction so
    // the partial unique index sees a consistent state — the abandon
    // UPDATE removes the old row's index entry before the INSERT runs.
    if (force) {
      const newSession = await db.transaction(async (tx) => {
        await tx
          .update(studentReadingSessions)
          .set({
            completionStatus: 'abandoned',
            finishedAt: new Date(),
          })
          .where(
            and(
              eq(studentReadingSessions.studentId, user.id),
              eq(studentReadingSessions.passageId, passageId),
              eq(studentReadingSessions.completionStatus, 'in_progress'),
            ),
          );
        const [created] = await tx
          .insert(studentReadingSessions)
          .values({ studentId: user.id, passageId })
          .returning();
        return created;
      });
      if (!newSession) {
        return NextResponse.json(
          { error: 'Failed to create session' },
          { status: 500 },
        );
      }
      return NextResponse.json({
        sessionId: newSession.id,
        resumed: false,
        pagesViewed: 0,
        questionsAnswered: 0,
      });
    }

    // Non-force path: atomic upsert. The partial unique index
    // `idx_one_in_progress_per_student_passage` (migration 0038)
    // guarantees at most one in_progress row per (student, passage),
    // so INSERT … ON CONFLICT DO NOTHING is the canonical idempotent
    // pattern. Two parallel POSTs (StrictMode double-mount, rapid
    // clicks) collapse to a single insert + a single SELECT-fallback,
    // both returning the same session id.
    //
    // The CTE form is one round-trip:
    //   - INSERT path → returns the new row with resumed=false
    //   - CONFLICT path → INSERT returns nothing, the UNION ALL leg
    //     pulls the existing row with resumed=true
    // ON CONFLICT against a partial unique index requires the
    // index_predicate form (cols + WHERE) — Postgres won't accept
    // ON CONSTRAINT here because CREATE UNIQUE INDEX makes an index,
    // not a named constraint. The WHERE predicate must match the
    // index's exactly: completion_status = 'in_progress'.
    const result = await db.execute(sql`
      WITH attempt AS (
        INSERT INTO student_reading_sessions (student_id, passage_id)
        VALUES (${user.id}, ${passageId})
        ON CONFLICT (student_id, passage_id)
          WHERE completion_status = 'in_progress'
          DO NOTHING
        RETURNING id, pages_viewed, questions_answered
      )
      SELECT id, pages_viewed, questions_answered, false AS resumed
      FROM attempt
      UNION ALL
      SELECT id, pages_viewed, questions_answered, true AS resumed
      FROM student_reading_sessions
      WHERE student_id = ${user.id}
        AND passage_id = ${passageId}
        AND completion_status = 'in_progress'
        AND NOT EXISTS (SELECT 1 FROM attempt)
      ORDER BY resumed
      LIMIT 1
    `);

    const row = result.rows[0] as
      | {
          id: string;
          pages_viewed: number;
          questions_answered: number;
          resumed: boolean;
        }
      | undefined;
    if (!row) {
      return NextResponse.json(
        { error: 'Failed to create or resume session' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      sessionId: row.id,
      resumed: row.resumed,
      pagesViewed: row.pages_viewed,
      questionsAnswered: row.questions_answered,
    });
  } catch (error) {
    logError(error, 'api/student/reading/sessions/start');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
