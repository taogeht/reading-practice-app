// GET /api/teacher/students/[studentId]/passage-recordings
//
// Teacher-facing rollup of all passage-page recordings for one student,
// grouped by passage → page → attempts. Powers the new
// StudentPassageRecordingsSection on /teacher/students/[studentId].
//
// Auth: teacher (must share at least one class with the student via
// accessibleClassIds, mirroring the other per-student endpoints we
// recently widened for co-teachers) or admin.

import { NextRequest, NextResponse } from 'next/server';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { accessibleClassIds } from '@/lib/auth/class-access';
import { db } from '@/lib/db';
import {
  classEnrollments,
  classes,
  passagePageRecordings,
  readingPassages,
  storyPages,
} from '@/lib/db/schema';
import { toProxyAudioUrl } from '@/lib/storage/r2-client';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ studentId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }
    const { studentId } = await params;

    // Shared-class check (admins bypass). Co-teachers should see the
    // same data as primary teachers — accessibleClassIds returns both.
    if (user.role === 'teacher') {
      const allowed = await accessibleClassIds(user.id, user.role);
      if (allowed.length === 0) {
        return NextResponse.json({ error: 'Student not found' }, { status: 404 });
      }
      const enrollment = await db
        .select({ id: classes.id })
        .from(classEnrollments)
        .innerJoin(classes, eq(classes.id, classEnrollments.classId))
        .where(
          and(
            eq(classEnrollments.studentId, studentId),
            inArray(classes.id, allowed),
          ),
        )
        .limit(1);
      if (!enrollment.length) {
        return NextResponse.json({ error: 'Student not found' }, { status: 404 });
      }
    }

    const rows = await db
      .select({
        recordingId: passagePageRecordings.id,
        passageId: readingPassages.id,
        passageTitle: readingPassages.title,
        passageReadingLevel: readingPassages.readingLevel,
        passagePageCount: readingPassages.pageCount,
        coverImageKey: readingPassages.coverImageKey,
        pageId: storyPages.id,
        pageNumber: storyPages.pageNumber,
        pageText: storyPages.text,
        attemptNumber: passagePageRecordings.attemptNumber,
        audioUrl: passagePageRecordings.audioUrl,
        submittedAt: passagePageRecordings.submittedAt,
        transcript: passagePageRecordings.transcript,
        letterGrade: passagePageRecordings.letterGrade,
        accuracyScore: passagePageRecordings.accuracyScore,
        wpmScore: passagePageRecordings.wpmScore,
      })
      .from(passagePageRecordings)
      .innerJoin(readingPassages, eq(readingPassages.id, passagePageRecordings.passageId))
      .innerJoin(storyPages, eq(storyPages.id, passagePageRecordings.pageId))
      .where(eq(passagePageRecordings.studentId, studentId))
      .orderBy(
        desc(passagePageRecordings.submittedAt),
        asc(storyPages.pageNumber),
        asc(passagePageRecordings.attemptNumber),
      );

    // Two-level group: passageId → pageNumber → attempts[]. Map iteration
    // order preserves insertion order, which is the descending-by-most-
    // recent ordering we want for the UI.
    const passageMap = new Map<
      string,
      {
        passageId: string;
        title: string;
        readingLevel: number;
        pageCount: number;
        coverImageKey: string | null;
        latestSubmittedAt: string;
        pages: Map<
          number,
          {
            pageNumber: number;
            pageText: string;
            attempts: Array<{
              id: string;
              attemptNumber: number;
              audioUrl: string;
              submittedAt: string;
              transcript: string | null;
              letterGrade: string | null;
              accuracyScore: number | null;
              wpmScore: number | null;
            }>;
          }
        >;
      }
    >();

    for (const r of rows) {
      let p = passageMap.get(r.passageId);
      if (!p) {
        p = {
          passageId: r.passageId,
          title: r.passageTitle,
          readingLevel: r.passageReadingLevel,
          pageCount: r.passagePageCount,
          coverImageKey: r.coverImageKey,
          latestSubmittedAt: r.submittedAt.toISOString(),
          pages: new Map(),
        };
        passageMap.set(r.passageId, p);
      }
      let page = p.pages.get(r.pageNumber);
      if (!page) {
        page = { pageNumber: r.pageNumber, pageText: r.pageText, attempts: [] };
        p.pages.set(r.pageNumber, page);
      }
      page.attempts.push({
        id: r.recordingId,
        attemptNumber: r.attemptNumber,
        audioUrl: toProxyAudioUrl(r.audioUrl),
        submittedAt: r.submittedAt.toISOString(),
        transcript: r.transcript,
        letterGrade: r.letterGrade,
        accuracyScore: r.accuracyScore == null ? null : Number(r.accuracyScore),
        wpmScore: r.wpmScore == null ? null : Number(r.wpmScore),
      });
    }

    const passages = Array.from(passageMap.values()).map((p) => ({
      passageId: p.passageId,
      title: p.title,
      readingLevel: p.readingLevel,
      pageCount: p.pageCount,
      coverImageKey: p.coverImageKey,
      latestSubmittedAt: p.latestSubmittedAt,
      pages: Array.from(p.pages.values()).sort((a, b) => a.pageNumber - b.pageNumber),
    }));

    return NextResponse.json({ passages });
  } catch (err) {
    logError(err, 'api/teacher/students/passage-recordings');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
