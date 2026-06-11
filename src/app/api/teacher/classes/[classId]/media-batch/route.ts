import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { studentMedia, classEnrollments } from '@/lib/db/schema';
import { eq, inArray, and } from 'drizzle-orm';
import { r2Client } from '@/lib/storage/r2-client';
import { detectMediaType, MEDIA_LIMITS } from '@/lib/storage/media-validation';
import { logError } from '@/lib/logger';
import { userCanManageClass } from '@/lib/auth/class-access';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_RECIPIENTS = 100;

// Confirms every id is enrolled in the class. Returns the unknown id if any.
async function validateRecipients(classId: string, studentIds: string[]): Promise<string | null> {
  const rows = await db
    .select({ studentId: classEnrollments.studentId })
    .from(classEnrollments)
    .where(and(eq(classEnrollments.classId, classId), inArray(classEnrollments.studentId, studentIds)));
  const enrolled = new Set(rows.map((r) => r.studentId));
  for (const id of studentIds) if (!enrolled.has(id)) return id;
  return null;
}

function validateFile(mimeType: unknown, fileSize: unknown) {
  if (typeof mimeType !== 'string' || typeof fileSize !== 'number') {
    return { error: 'mimeType and fileSize are required', status: 400 as const };
  }
  const mediaType = detectMediaType(mimeType);
  if (!mediaType) return { error: `File type "${mimeType}" is not supported.`, status: 400 as const };
  if (fileSize > MEDIA_LIMITS[mediaType].maxSize) {
    const maxMB = MEDIA_LIMITS[mediaType].maxSize / (1024 * 1024);
    return { error: `File is too large. Maximum size for ${mediaType} is ${maxMB}MB.`, status: 400 as const };
  }
  return { mediaType };
}

// POST = init: validate + return ONE presigned URL pointing at a class-scoped
// staging key. The client uploads the file once; commit (PUT) fans it out.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }
    const { classId } = await params;
    if (!(await userCanManageClass(user.id, user.role, classId))) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await request.json();
    const { studentIds, fileName, fileSize, mimeType } = body;
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json({ error: 'Pick at least one student' }, { status: 400 });
    }
    if (studentIds.length > MAX_RECIPIENTS) {
      return NextResponse.json({ error: `Too many recipients (max ${MAX_RECIPIENTS})` }, { status: 400 });
    }
    if (typeof fileName !== 'string' || !fileName) {
      return NextResponse.json({ error: 'fileName is required' }, { status: 400 });
    }
    const fileCheck = validateFile(mimeType, fileSize);
    if ('error' in fileCheck) return NextResponse.json({ error: fileCheck.error }, { status: fileCheck.status });

    const unknown = await validateRecipients(classId, studentIds);
    if (unknown) return NextResponse.json({ error: 'A selected student is not in this class.' }, { status: 400 });

    const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uploadKey = `media/_batch/${classId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${sanitized}`;
    const presignedUrl = await r2Client.generatePresignedUploadUrl(uploadKey, mimeType, 600);

    return NextResponse.json({ uploadKey, presignedUrl, mediaType: fileCheck.mediaType });
  } catch (error) {
    logError(error, 'api/teacher/classes/[classId]/media-batch POST');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT = commit: copy the uploaded staging object to a per-student key for each
// recipient and create one student_media row each. Each row is independent
// (own key + object), so the existing media proxy / list / delete work unchanged.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }
    const { classId } = await params;
    if (!(await userCanManageClass(user.id, user.role, classId))) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const body = await request.json();
    const { uploadKey, studentIds, title, description, fileName, fileSize, mimeType } = body;

    if (!Array.isArray(studentIds) || studentIds.length === 0 || studentIds.length > MAX_RECIPIENTS) {
      return NextResponse.json({ error: 'Invalid recipients' }, { status: 400 });
    }
    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'A title is required' }, { status: 400 });
    }
    if (typeof fileName !== 'string' || !fileName) {
      return NextResponse.json({ error: 'fileName is required' }, { status: 400 });
    }
    // The source must be a staging object for THIS class — never an arbitrary key.
    if (typeof uploadKey !== 'string' || !uploadKey.startsWith(`media/_batch/${classId}/`)) {
      return NextResponse.json({ error: 'Invalid upload reference' }, { status: 400 });
    }
    const fileCheck = validateFile(mimeType, fileSize);
    if ('error' in fileCheck) return NextResponse.json({ error: fileCheck.error }, { status: fileCheck.status });
    const mediaType = fileCheck.mediaType;

    const unknown = await validateRecipients(classId, studentIds);
    if (unknown) return NextResponse.json({ error: 'A selected student is not in this class.' }, { status: 400 });

    // Fan out: copy the staging object to each student's own key first, then
    // insert all rows. Copying before any DB write keeps a failure clean
    // (orphan objects at worst, never orphan rows).
    const rows = [] as {
      studentId: string;
      uploadedById: string;
      mediaType: typeof mediaType;
      title: string;
      description: string | null;
      fileKey: string;
      fileUrl: string;
      fileSizeBytes: number;
      mimeType: string;
    }[];
    for (const studentId of studentIds) {
      const destKey = r2Client.generateMediaKey(studentId, mediaType, fileName);
      await r2Client.copyFile(uploadKey, destKey);
      rows.push({
        studentId,
        uploadedById: user.id,
        mediaType,
        title: title.trim(),
        description: typeof description === 'string' && description.trim() ? description.trim() : null,
        fileKey: destKey,
        fileUrl: mediaType === 'video' ? destKey : `/api/media/${destKey}`,
        fileSizeBytes: fileSize,
        mimeType,
      });
    }

    const inserted = await db.insert(studentMedia).values(rows).returning({ id: studentMedia.id });

    // Best-effort cleanup of the staging object now that copies exist.
    void r2Client.deleteFile(uploadKey).catch((err) => logError(err, 'media-batch staging cleanup'));

    return NextResponse.json({ created: inserted.length });
  } catch (error) {
    logError(error, 'api/teacher/classes/[classId]/media-batch PUT');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
