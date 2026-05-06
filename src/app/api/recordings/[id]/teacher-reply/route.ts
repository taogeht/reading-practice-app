import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { r2Client } from '@/lib/storage/r2-client';
import { logError } from '@/lib/logger';
import { userCanManageRecording } from '@/lib/auth/class-access';

export const runtime = 'nodejs';

const MAX_REPLY_BYTES = 10 * 1024 * 1024; // 10 MB — way more than 60s of opus

// Extracts the R2 key from a stored proxy URL like "/api/audio/<key>".
// Returns null if the URL doesn't look like a proxy URL we own.
function keyFromProxyUrl(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/^\/api\/audio\/(.+)$/);
  return m ? m[1] : null;
}

function pickExtension(mimeType: string | undefined): string {
  if (!mimeType) return 'webm';
  const sub = mimeType.split('/')[1] || '';
  if (sub.includes('mpeg')) return 'mp3';
  if (sub.includes('ogg')) return 'ogg';
  if (sub.includes('webm')) return 'webm';
  if (sub.includes('wav')) return 'wav';
  if (sub.includes('mp4')) return 'mp4';
  if (sub.includes('m4a')) return 'm4a';
  return sub.replace(/[^a-z0-9]/gi, '') || 'webm';
}

// Verifies the user can manage the recording's class (primary or co-teacher,
// admins always pass). Returns the existing reply URL alongside so the
// caller can clean up the prior R2 object if any.
async function authorizeTeacher(recordingId: string, userId: string, role: string) {
  if (!(await userCanManageRecording(userId, role, recordingId))) {
    return { error: 'Forbidden', status: 403 } as const;
  }
  const rows = await db
    .select({
      recordingId: recordings.id,
      existingUrl: recordings.teacherReplyAudioUrl,
    })
    .from(recordings)
    .where(eq(recordings.id, recordingId))
    .limit(1);
  if (!rows.length) return { error: 'Recording not found', status: 404 } as const;
  return { row: rows[0] } as const;
}

// POST /api/recordings/[id]/teacher-reply
// multipart/form-data: { audio: File, durationSeconds?: number }
// Uploads the teacher's voice reply, replaces any prior reply (deleting the
// old R2 object), and stores the proxy URL on the recording row.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id: recordingId } = await params;
    const auth = await authorizeTeacher(recordingId, user.id, user.role);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const form = await request.formData();
    const audio = form.get('audio');
    const durationParam = form.get('durationSeconds');

    if (!(audio instanceof File)) {
      return NextResponse.json({ error: 'audio file is required' }, { status: 400 });
    }
    if (audio.size === 0) {
      return NextResponse.json({ error: 'audio file is empty' }, { status: 400 });
    }
    if (audio.size > MAX_REPLY_BYTES) {
      return NextResponse.json({ error: 'audio file is too large' }, { status: 413 });
    }

    const durationSeconds =
      typeof durationParam === 'string' && Number.isFinite(Number(durationParam))
        ? Math.max(0, Math.round(Number(durationParam)))
        : null;

    const arrayBuffer = await audio.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const ext = pickExtension(audio.type);
    const key = `audio/teacher-replies/${user.id}/${recordingId}/${Date.now()}.${ext}`;
    const url = await r2Client.uploadFile(key, buffer, audio.type || 'audio/webm', {
      'artifact-type': 'teacher-reply',
      'recording-id': recordingId,
      'teacher-id': user.id,
    });

    // Best-effort delete of any prior reply on this recording. If the prior
    // URL doesn't match our proxy pattern (legacy data, manual edit) we just
    // skip — the row gets overwritten regardless.
    const priorKey = keyFromProxyUrl(auth.row.existingUrl);
    if (priorKey) {
      r2Client.deleteFile(priorKey).catch((err) => {
        logError(err, 'api/recordings/teacher-reply: delete prior R2 key');
      });
    }

    await db
      .update(recordings)
      .set({
        teacherReplyAudioUrl: url,
        teacherReplyDurationSeconds: durationSeconds,
        teacherReplyUploadedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(recordings.id, recordingId));

    return NextResponse.json({
      ok: true,
      audioUrl: url,
      durationSeconds,
      uploadedAt: new Date().toISOString(),
    });
  } catch (error) {
    logError(error, 'api/recordings/teacher-reply POST');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/recordings/[id]/teacher-reply
// Removes the reply audio from R2 and clears the columns. Idempotent.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id: recordingId } = await params;
    const auth = await authorizeTeacher(recordingId, user.id, user.role);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const priorKey = keyFromProxyUrl(auth.row.existingUrl);
    if (priorKey) {
      r2Client.deleteFile(priorKey).catch((err) => {
        logError(err, 'api/recordings/teacher-reply: delete on DELETE');
      });
    }

    await db
      .update(recordings)
      .set({
        teacherReplyAudioUrl: null,
        teacherReplyDurationSeconds: null,
        teacherReplyUploadedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(recordings.id, recordingId));

    return NextResponse.json({ ok: true });
  } catch (error) {
    logError(error, 'api/recordings/teacher-reply DELETE');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
