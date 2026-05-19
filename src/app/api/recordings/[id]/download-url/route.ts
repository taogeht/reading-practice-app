import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordings, assignments } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { r2Client } from '@/lib/storage/r2-client';
import { logError, createRequestContext } from '@/lib/logger';
import { userCanManageRecording } from '@/lib/auth/class-access';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !['teacher', 'admin', 'student'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Load the recording row up front so we can do BOTH the student
    // self-access check (studentId === user.id) and the teacher path
    // (userCanManageRecording) against the same row, with one SELECT.
    const recording = await db
      .select({
        id: recordings.id,
        audioUrl: recordings.audioUrl,
        studentId: recordings.studentId,
      })
      .from(recordings)
      .where(eq(recordings.id, id))
      .limit(1);

    if (!recording.length) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
    }

    // Students may only fetch THEIR own recording. Teachers/admins go
    // through the existing class-scoped permission check.
    if (user.role === 'student') {
      if (recording[0].studentId !== user.id) {
        return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
      }
    } else if (!(await userCanManageRecording(user.id, user.role, id))) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
    }

    // Extract the R2 key from the stored audioUrl. Audio is uploaded via
    // r2Client.uploadFile() which returns the proxy URL form
    // (`/api/audio/<key>`) — everything written by the app since the proxy
    // landed uses that. The legacy direct-R2-URL form
    // (`https://<bucket>.r2.cloudflarestorage.com/<key>`) may still exist on
    // very old rows, so fall through to the original parser there.
    const audioUrl = recording[0].audioUrl;
    let key: string | null = null;
    if (audioUrl.startsWith('/api/audio/')) {
      key = audioUrl.slice('/api/audio/'.length);
    } else if (audioUrl.includes('.r2.cloudflarestorage.com')) {
      const urlParts = audioUrl.split('/');
      const domainIndex = urlParts.findIndex(part => part.includes('.r2.cloudflarestorage.com'));
      key = urlParts.slice(domainIndex + 1).join('/');
    }
    if (!key) {
      throw new Error(`Unrecognized audio URL format: ${audioUrl.slice(0, 80)}`);
    }

    // Generate presigned download URL (valid for 1 hour)
    const presignedUrl = await r2Client.generatePresignedDownloadUrl(key, 3600);

    return NextResponse.json({
      success: true,
      downloadUrl: presignedUrl,
    });

  } catch (error) {
    logError(error, 'api/recordings/[id]/download-url');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}