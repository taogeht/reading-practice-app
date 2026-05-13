// POST /api/student/reading/passages/[passageId]/pages/[pageNumber]/record
//
// Student-facing endpoint that accepts a per-page audio recording and
// triggers AI grading. Mirrors /api/recordings/upload but writes to
// passage_page_recordings instead of recordings. Capped at 3 attempts
// per (page, student).

import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  passagePageRecordings,
  readingPassages,
  storyPages,
} from '@/lib/db/schema';
import {
  generatePassageRecordingKey,
  uploadRecordingToR2,
} from '@/lib/storage/r2-client';
import { logError } from '@/lib/logger';
import { awardXp } from '@/lib/gamification/award';
import {
  aiGradingEnabled,
  analyzePageRecordingInBackground,
} from '@/lib/grading/analyze-recording';

export const runtime = 'nodejs';

const MAX_ATTEMPTS = 3;

interface RouteParams {
  params: Promise<{ passageId: string; pageNumber: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'student') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }

    const { passageId, pageNumber: pageNumberStr } = await params;
    const pageNumber = Number(pageNumberStr);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      return NextResponse.json({ error: 'Invalid pageNumber' }, { status: 400 });
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    if (!audioFile) {
      return NextResponse.json({ error: 'Audio file is required' }, { status: 400 });
    }

    // Confirm the passage is published + active and grab the matching
    // page row in one shot. Joining on storyPages keeps the page-text
    // fetch tied to the same authorization check (no extra round trip,
    // no chance of the published guard slipping past a hand-crafted
    // pageNumber).
    const rows = await db
      .select({
        passageId: readingPassages.id,
        pageId: storyPages.id,
        pageText: storyPages.text,
      })
      .from(readingPassages)
      .innerJoin(
        storyPages,
        and(
          eq(storyPages.passageId, readingPassages.id),
          eq(storyPages.pageNumber, pageNumber),
        ),
      )
      .where(
        and(
          eq(readingPassages.id, passageId),
          eq(readingPassages.status, 'published'),
          eq(readingPassages.isActive, true),
        ),
      )
      .limit(1);
    if (!rows.length) {
      return NextResponse.json(
        { error: 'Passage page not found or not published' },
        { status: 404 },
      );
    }
    const { pageId, pageText } = rows[0];

    // Attempt cap — read the highest existing attempt for this (page, student)
    // and bump. Matches the /api/recordings/upload pattern.
    const prior = await db
      .select({ attemptNumber: passagePageRecordings.attemptNumber })
      .from(passagePageRecordings)
      .where(
        and(
          eq(passagePageRecordings.pageId, pageId),
          eq(passagePageRecordings.studentId, user.id),
        ),
      )
      .orderBy(desc(passagePageRecordings.attemptNumber))
      .limit(1);
    const attemptNumber = prior.length > 0 ? (prior[0].attemptNumber ?? 0) + 1 : 1;
    if (attemptNumber > MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: `Maximum attempts (${MAX_ATTEMPTS}) reached for this page` },
        { status: 409 },
      );
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const extension = (() => {
      const mimeSubtype = audioFile.type?.split('/')[1] || '';
      if (mimeSubtype.includes('mpeg')) return 'mp3';
      if (mimeSubtype.includes('ogg')) return 'ogg';
      if (mimeSubtype.includes('webm')) return 'webm';
      if (mimeSubtype.includes('wav')) return 'wav';
      if (mimeSubtype.includes('mp4')) return 'mp4';
      if (mimeSubtype.includes('m4a')) return 'm4a';
      return mimeSubtype.replace(/[^a-z0-9]/gi, '') || 'webm';
    })();

    const key = generatePassageRecordingKey(
      user.id,
      passageId,
      pageNumber,
      attemptNumber,
      extension,
    );
    const audioUrl = await uploadRecordingToR2(key, buffer, audioFile.type);

    const [row] = await db
      .insert(passagePageRecordings)
      .values({
        passageId,
        pageId,
        studentId: user.id,
        attemptNumber,
        audioUrl,
        fileSizeBytes: buffer.length,
        audioDurationSeconds: null,
        submittedAt: new Date(),
      })
      .returning();

    const award = await awardXp(user.id, 'recording_submitted', row.id);

    // Always grade page recordings — they're short reference passages, and
    // the existing aiGradingEnabled() env flag is the safety valve.
    if (aiGradingEnabled()) {
      analyzePageRecordingInBackground({
        recordingId: row.id,
        audioBuffer: buffer,
        audioMime: audioFile.type || 'audio/webm',
        audioExtension: extension,
        pageText,
      });
    }

    return NextResponse.json({
      success: true,
      recording: {
        id: row.id,
        attemptNumber: row.attemptNumber,
        audioUrl: row.audioUrl,
        submittedAt: row.submittedAt,
        status: 'submitted',
      },
      award,
    });
  } catch (err) {
    logError(err, 'api/student/reading/passages/pages/record');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
