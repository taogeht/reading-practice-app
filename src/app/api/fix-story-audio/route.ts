import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { stories } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { r2Client } from '@/lib/storage/r2-client';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !['teacher', 'admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the story ID and audio key from request
    const body = await request.json();
    const { storyId, audioKey } = body;

    if (!storyId || !audioKey) {
      return NextResponse.json({ error: 'storyId and audioKey are required' }, { status: 400 });
    }

    // Check if the audio file exists
    const fileExists = await r2Client.fileExists(audioKey);
    if (!fileExists) {
      return NextResponse.json({ error: 'Audio file not found' }, { status: 404 });
    }

    // Generate a presigned URL
    const presignedUrl = await r2Client.generatePresignedDownloadUrl(audioKey, 7 * 24 * 3600); // 7 days

    // Update the story with the new audio URL
    await db
      .update(stories)
      .set({
        ttsAudioUrl: presignedUrl,
        ttsGeneratedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(stories.id, storyId));

    return NextResponse.json({
      success: true,
      audioUrl: presignedUrl,
      message: 'Story audio URL updated successfully',
    });

  } catch (error) {
    console.error('Error fixing story audio:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}