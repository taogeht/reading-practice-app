import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { stories } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { r2Client } from '@/lib/storage/r2-client';
import { logError, createRequestContext } from '@/lib/logger';

export const runtime = 'nodejs';

// POST /api/stories/[id]/refresh-audio - Refresh the audio URL with a new presigned URL
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user || !['teacher', 'admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: storyId } = await params;

    // Fetch the story
    const storyData = await db
      .select()
      .from(stories)
      .where(eq(stories.id, storyId))
      .limit(1);

    if (storyData.length === 0) {
      return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    }

    const story = storyData[0];

    if (!story.ttsAudioUrl) {
      return NextResponse.json({ error: 'Story has no audio to refresh' }, { status: 400 });
    }

    // Extract the key from the existing URL
    let audioKey: string;
    
    console.log('Current audio URL:', story.ttsAudioUrl);
    
    try {
      if (story.ttsAudioUrl.includes('r2.cloudflarestorage.com')) {
        // Old format: extract key from the end of the URL
        const urlParts = story.ttsAudioUrl.split('/');
        audioKey = urlParts.slice(-3).join('/'); // Get last 3 parts (audio/tts/filename)
        console.log('Extracted key from R2 URL:', audioKey);
      } else if (story.ttsAudioUrl.includes('amazonaws.com') || story.ttsAudioUrl.includes('r2.dev')) {
        // Presigned URL format: extract key from the path
        const url = new URL(story.ttsAudioUrl);
        audioKey = decodeURIComponent(url.pathname.substring(1)); // Remove leading /
        console.log('Extracted key from presigned URL:', audioKey);
      } else {
        console.error('Unknown URL format:', story.ttsAudioUrl);
        return NextResponse.json({ error: 'Unknown audio URL format' }, { status: 400 });
      }
    } catch (error) {
      logError(error, 'api/stories/[id]/refresh-audio');
      return NextResponse.json({ error: 'Invalid audio URL format' }, { status: 400 });
    }

    // Check if the file exists in R2
    const fileExists = await r2Client.fileExists(audioKey);
    if (!fileExists) {
      return NextResponse.json({ error: 'Audio file not found in storage' }, { status: 404 });
    }

    // Generate a new presigned URL
    const newAudioUrl = await r2Client.generatePresignedDownloadUrl(audioKey, 7 * 24 * 3600); // 7 days

    // Update the story with the new URL
    await db
      .update(stories)
      .set({
        ttsAudioUrl: newAudioUrl,
        updatedAt: new Date(),
      })
      .where(eq(stories.id, storyId));

    return NextResponse.json({
      success: true,
      audioUrl: newAudioUrl,
      message: 'Audio URL refreshed successfully',
    });

  } catch (error) {
    logError(error, 'api/stories/[id]/refresh-audio');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}