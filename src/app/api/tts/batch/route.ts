import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { googleTtsClient } from '@/lib/tts/client';
import { r2Client } from '@/lib/storage/r2-client';
import { db } from '@/lib/db';
import { stories } from '@/lib/db/schema';
import { inArray, eq } from 'drizzle-orm';
import { logError } from '@/lib/logger';
import { normalizeTtsAudio, type StoryTtsAudio } from '@/types/story';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    // Authenticate the request - only teachers and admins can generate TTS
    const user = await getCurrentUser();

    if (!user || !['teacher', 'admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { storyIds, voiceId } = body;

    // Validate inputs
    if (!storyIds || !Array.isArray(storyIds) || storyIds.length === 0) {
      return NextResponse.json(
        { error: 'storyIds array is required and cannot be empty' },
        { status: 400 }
      );
    }

    if (storyIds.length > 50) {
      return NextResponse.json(
        { error: 'Cannot process more than 50 stories at once' },
        { status: 400 }
      );
    }

    // Fetch stories that need TTS generation
    const storiesToProcess = await db
      .select()
      .from(stories)
      .where(inArray(stories.id, storyIds));

    if (storiesToProcess.length === 0) {
      return NextResponse.json(
        { error: 'No valid stories found' },
        { status: 404 }
      );
    }

    // Prepare texts for batch generation
    const textsForTTS = storiesToProcess.map(story => ({
      id: story.id,
      text: story.content,
      voice_id: voiceId,
    }));

    // Check quota before proceeding
    const totalCharacters = textsForTTS.reduce((sum, item) => sum + item.text.length, 0);
    // Generate TTS for all stories
    const results = await googleTtsClient.generateBatchSpeech(textsForTTS);

    const successfulUploads: string[] = [];
    const failures: Array<{ storyId: string; error: string }> = [];

    // Process results and upload to R2
    for (const result of results) {
      if (result.result.success && result.result.audioBuffer) {
        try {
          const filename = `story-${result.id}-${Date.now()}.mp3`;
          const audioKey = r2Client.generateAudioKey('tts', filename);

          const buffer = Buffer.isBuffer(result.result.audioBuffer)
            ? result.result.audioBuffer
            : Buffer.from(result.result.audioBuffer);

          const resolvedVoiceId = voiceId || googleTtsClient.getVoices()[0]?.voice_id || 'default';
          const voiceDefinition = googleTtsClient
            .getVoices()
            .find((voice) => voice.voice_id === resolvedVoiceId);

          const metadata: Record<string, string> = {
            'generated-by': 'google-tts',
            'voice-id': resolvedVoiceId,
            'generated-at': new Date().toISOString(),
            'user-id': user.id,
            'story-id': result.id,
            'audio-id': randomUUID(),
            'storage-key': audioKey,
          };

          const publicUrl = await r2Client.uploadFile(
            audioKey,
            buffer,
            result.result.contentType || 'audio/mpeg',
            metadata,
          );

          const storyRecord = storiesToProcess.find((story) => story.id === result.id);
          const existingEntries = normalizeTtsAudio(storyRecord?.ttsAudio);
          const newEntry: StoryTtsAudio = {
            id: metadata['audio-id'],
            url: publicUrl,
            durationSeconds: null,
            generatedAt: metadata['generated-at'],
            voiceId: resolvedVoiceId,
            label: voiceDefinition?.name ?? `Voice ${resolvedVoiceId}`,
            storageKey: audioKey,
          };

          await db
            .update(stories)
            .set({
              ttsAudio: [...existingEntries, newEntry] as any,
              updatedAt: new Date(),
            })
            .where(eq(stories.id, result.id));

          successfulUploads.push(result.id);
        } catch (uploadError) {
          failures.push({
            storyId: result.id,
            error: `Upload failed: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`,
          });
        }
      } else {
        failures.push({
          storyId: result.id,
          error: result.result.error || 'TTS generation failed',
        });
      }
    }

    // Return results summary
    return NextResponse.json({
      success: true,
      summary: {
        total: storiesToProcess.length,
        successful: successfulUploads.length,
        failed: failures.length,
      },
      successfulStories: successfulUploads,
      failures: failures.length > 0 ? failures : undefined,
      quotaUsed: totalCharacters,
    });

  } catch (error) {
    logError(error, 'api/tts/batch');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
