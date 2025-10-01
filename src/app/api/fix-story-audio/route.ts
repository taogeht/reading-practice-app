import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { stories } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { r2Client } from '@/lib/storage/r2-client';
import { logError } from '@/lib/logger';
import { normalizeTtsAudio, getVoiceLabel, type StoryTtsAudio } from '@/types/story';
import { randomUUID } from 'crypto';

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
    const presignedUrl = await r2Client.generatePresignedDownloadUrl(audioKey, 7 * 24 * 3600);
    const metadata = await r2Client.getFileMetadata(audioKey);

    const [story] = await db
      .select({ ttsAudio: stories.ttsAudio })
      .from(stories)
      .where(eq(stories.id, storyId))
      .limit(1);

    const existingEntries = normalizeTtsAudio(story?.ttsAudio);
    const existingIndex = existingEntries.findIndex((entry) => entry.storageKey === audioKey);

    const newEntry: StoryTtsAudio = {
      id: String(metadata?.metadata?.['audio-id'] || randomUUID()),
      url: presignedUrl,
      durationSeconds: null,
      generatedAt: new Date().toISOString(),
      voiceId: metadata?.metadata?.['voice-id'] ?? null,
      label: getVoiceLabel(
        metadata?.metadata?.['voice-id'] ?? null,
        metadata?.metadata?.['voice-label'] ?? null,
      ),
      storageKey: audioKey,
    };

    const updatedEntries = [...existingEntries];
    if (existingIndex >= 0) {
      updatedEntries[existingIndex] = newEntry;
    } else {
      updatedEntries.push(newEntry);
    }

    await db
      .update(stories)
      .set({
        ttsAudio: updatedEntries as any,
        updatedAt: new Date(),
      })
      .where(eq(stories.id, storyId));

    return NextResponse.json({
      success: true,
      audioUrl: presignedUrl,
      message: 'Story audio URL updated successfully',
    });

  } catch (error) {
    logError(error, 'api/fix-story-audio');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
