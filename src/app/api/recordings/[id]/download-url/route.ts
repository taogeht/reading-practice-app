import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { recordings, assignments } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { r2Client } from '@/lib/storage/r2-client';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !['teacher', 'admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the recording and verify teacher has access to it
    const recording = await db
      .select({
        id: recordings.id,
        audioUrl: recordings.audioUrl,
        assignmentId: recordings.assignmentId,
      })
      .from(recordings)
      .innerJoin(assignments, eq(recordings.assignmentId, assignments.id))
      .where(and(
        eq(recordings.id, params.id),
        eq(assignments.teacherId, user.id)
      ))
      .limit(1);

    if (!recording.length) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
    }

    // Extract the key from the audioUrl
    const audioUrl = recording[0].audioUrl;
    console.log('Original audio URL:', audioUrl);

    // Extract the key from the URL - everything after the domain
    const urlParts = audioUrl.split('/');
    const domainIndex = urlParts.findIndex(part => part.includes('.r2.cloudflarestorage.com'));
    if (domainIndex === -1) {
      throw new Error('Invalid R2 URL format');
    }
    const key = urlParts.slice(domainIndex + 1).join('/');
    console.log('Extracted key:', key);

    // Generate presigned download URL (valid for 1 hour)
    const presignedUrl = await r2Client.generatePresignedDownloadUrl(key, 3600);

    return NextResponse.json({
      success: true,
      downloadUrl: presignedUrl,
    });

  } catch (error) {
    console.error('Error generating download URL:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}