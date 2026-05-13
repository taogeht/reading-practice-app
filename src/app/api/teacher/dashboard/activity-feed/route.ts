// GET /api/teacher/dashboard/activity-feed
//
// Last 20 milestone student events across the calling teacher's
// accessible classes. Used by the collapsible "Recent class activity"
// card on /teacher/dashboard. Per-student "primary class" attribution:
// we take the FIRST class from the teacher's accessible list that the
// student is enrolled in. Good enough for v1 — most students only sit
// in one of any given teacher's classes.
//
// Filters to high-signal completion events only (recording_submitted,
// reading_story_completed, etc.) so the feed reads like a synopsis,
// not a firehose. Page-finishes and per-question events are excluded.
//
// Auth: teacher or admin.

import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { accessibleClassIds } from '@/lib/auth/class-access';
import { db } from '@/lib/db';
import {
  classEnrollments,
  classes,
  studentXpEvents,
  users,
} from '@/lib/db/schema';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

const FEED_LIMIT = 20;

// Event types worth surfacing on a teacher's "what did my kids do
// recently" feed. Anything not in this list (page-finished,
// per-question correct, daily logins, streak bonuses) is noise.
const MILESTONE_EVENT_TYPES = [
  'recording_submitted',
  'reading_story_completed',
  'reading_perfect_score',
  'spelling_won',
  'vocab_word_mastered',
  'practice_first_try_bonus',
] as const;

// Human-readable verb for each event type. Past tense, kid-as-subject.
function describeEvent(eventType: string): string {
  switch (eventType) {
    case 'recording_submitted':
      return 'submitted a recording';
    case 'reading_story_completed':
      return 'finished a reading passage';
    case 'reading_perfect_score':
      return 'aced a reading passage';
    case 'spelling_won':
      return 'won a spelling game';
    case 'vocab_word_mastered':
      return 'mastered a vocabulary word';
    case 'practice_first_try_bonus':
      return 'aced a practice question';
    default:
      return eventType.replace(/_/g, ' ');
  }
}

export async function GET(_request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    const allowedClassIds = await accessibleClassIds(user.id, user.role);
    if (allowedClassIds.length === 0) {
      return NextResponse.json({ items: [] });
    }

    // studentId -> { id, name, classId, className }. One row per student
    // in the teacher's classes. If a student sits in multiple of the
    // teacher's classes, the first enrollment wins (good enough — see
    // file header).
    const enrolledRows = await db
      .select({
        studentId: classEnrollments.studentId,
        classId: classes.id,
        className: classes.name,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(classEnrollments)
      .innerJoin(classes, eq(classes.id, classEnrollments.classId))
      .innerJoin(users, eq(users.id, classEnrollments.studentId))
      .where(inArray(classes.id, allowedClassIds));

    const studentInfo = new Map<
      string,
      { classId: string; className: string; firstName: string; lastName: string }
    >();
    for (const row of enrolledRows) {
      if (!studentInfo.has(row.studentId)) {
        studentInfo.set(row.studentId, {
          classId: row.classId,
          className: row.className,
          firstName: row.firstName ?? '',
          lastName: row.lastName ?? '',
        });
      }
    }

    const studentIds = Array.from(studentInfo.keys());
    if (studentIds.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const events = await db
      .select({
        id: studentXpEvents.id,
        studentId: studentXpEvents.studentId,
        eventType: studentXpEvents.eventType,
        points: studentXpEvents.points,
        sourceId: studentXpEvents.sourceId,
        createdAt: studentXpEvents.createdAt,
      })
      .from(studentXpEvents)
      .where(
        and(
          inArray(studentXpEvents.studentId, studentIds),
          inArray(
            studentXpEvents.eventType,
            MILESTONE_EVENT_TYPES as unknown as string[],
          ),
        ),
      )
      .orderBy(desc(studentXpEvents.createdAt))
      .limit(FEED_LIMIT);

    const items = events
      .map((e) => {
        const info = studentInfo.get(e.studentId);
        if (!info) return null;
        return {
          id: e.id,
          studentId: e.studentId,
          studentName: `${info.firstName} ${info.lastName}`.trim() || 'Student',
          classId: info.classId,
          className: info.className,
          eventType: e.eventType,
          summary: describeEvent(e.eventType),
          points: e.points,
          sourceId: e.sourceId,
          createdAt: e.createdAt.toISOString(),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    return NextResponse.json({ items });
  } catch (err) {
    logError(err, 'api/teacher/dashboard/activity-feed');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
