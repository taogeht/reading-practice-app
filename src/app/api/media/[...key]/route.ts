import { NextRequest, NextResponse } from 'next/server';
import { eq, or } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { studentMedia } from '@/lib/db/schema';
import { r2Client } from '@/lib/storage/r2-client';
import { userCanAccessStudentMedia } from '@/lib/auth/class-access';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/media/[...key] - Stream student media (photos/audio of minors) from R2.
// Every key is sensitive, so we resolve the owning student via the student_media
// row (matching the file or thumbnail key) and scope to that student + their
// managing teachers + admins.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { key: keyParts } = await params;
    if (keyParts.some((p) => p === '..')) {
      return NextResponse.json({ error: 'Invalid media key' }, { status: 400 });
    }
    const mediaKey = keyParts.join('/');

    if (!mediaKey) {
      return NextResponse.json({ error: 'Missing media key' }, { status: 400 });
    }

    const media = await db.query.studentMedia.findFirst({
      where: or(eq(studentMedia.fileKey, mediaKey), eq(studentMedia.thumbnailKey, mediaKey)),
    });
    if (!media) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 });
    }

    const allowed =
      (user.role === 'student' && user.id === media.studentId) ||
      user.role === 'admin' ||
      (user.role === 'teacher' &&
        (await userCanAccessStudentMedia(user.id, user.role, media.studentId)));
    if (!allowed) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 });
    }

    const result = await r2Client.getObject(mediaKey);

    if (!result) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 });
    }

    const { body, contentType, contentLength } = result;

    const headers: Record<string, string> = {
      'Content-Type': contentType || 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
      'Vary': 'Cookie',
    };

    if (contentLength !== undefined) {
      headers['Content-Length'] = String(contentLength);
    }

    return new NextResponse(body as ReadableStream, {
      status: 200,
      headers,
    });
  } catch (error) {
    logError(error, 'api/media/[...key]');
    return NextResponse.json({ error: 'Failed to stream media' }, { status: 500 });
  }
}
