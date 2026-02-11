import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { stories } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { r2Client } from '@/lib/storage/r2-client';
import { logError } from '@/lib/logger';
import { normalizeTtsAudio } from '@/types/story';

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
    const body = await request.json().catch(() => ({}));
    const requestedAudioId: string | undefined = body?.audioId;

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

    const audioEntries = normalizeTtsAudio(story.ttsAudio);
    if (audioEntries.length === 0) {
      return NextResponse.json({ error: 'Story has no audio to refresh' }, { status: 400 });
    }

    const entryToRefresh = requestedAudioId
      ? audioEntries.find((entry) => entry.id === requestedAudioId)
      : audioEntries[0];

    if (!entryToRefresh) {
      return NextResponse.json({ error: 'Requested audio track not found' }, { status: 404 });
    }

    // Extract the key from the existing URL or metadata
    let audioKey = entryToRefresh.storageKey || '';

    try {
      if (!audioKey) {
        const candidateUrl = entryToRefresh.url;
        if (!candidateUrl) {
          return NextResponse.json({ error: 'Audio entry has no URL to refresh' }, { status: 400 });
        }

        if (candidateUrl.includes('r2.cloudflarestorage.com')) {
          const urlParts = candidateUrl.split('/');
          audioKey = urlParts.slice(-3).join('/');
        } else {
          const parsed = new URL(candidateUrl);
          audioKey = decodeURIComponent(parsed.pathname.substring(1));
        }
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

    // Generate the permanent proxy URL
    const newAudioUrl = r2Client.getProxyUrl(audioKey);

    const updatedEntries = audioEntries.map((entry) =>
      entry.id === entryToRefresh.id
        ? { ...entry, url: newAudioUrl, storageKey: audioKey }
        : entry,
    );

    await db
      .update(stories)
      .set({
        ttsAudio: updatedEntries as any,
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
