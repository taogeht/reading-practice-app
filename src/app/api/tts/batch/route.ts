import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { elevenLabsClient } from '@/lib/elevenlabs/client';
import { r2Client } from '@/lib/storage/r2-client';
import { db } from '@/lib/db';
import { stories } from '@/lib/db/schema';
import { inArray, eq } from 'drizzle-orm';

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
    const quotaCheck = await elevenLabsClient.checkQuota(totalCharacters);
    
    if (!quotaCheck.hasQuota) {
      return NextResponse.json(
        { 
          error: 'Insufficient ElevenLabs quota',
          details: {
            required: quotaCheck.requiredChars,
            remaining: quotaCheck.remainingChars,
          }
        },
        { status: 402 }
      );
    }

    // Generate TTS for all stories
    const results = await elevenLabsClient.generateBatchSpeech(textsForTTS);
    
    const successfulUploads: string[] = [];
    const failures: Array<{ storyId: string; error: string }> = [];

    // Process results and upload to R2
    for (const result of results) {
      if (result.result.success && result.result.audioBuffer) {
        try {
          const filename = `story-${result.id}-${Date.now()}.mp3`;
          const audioKey = r2Client.generateAudioKey('tts', filename);
          
          const publicUrl = await r2Client.uploadFile(
            audioKey,
            Buffer.from(result.result.audioBuffer),
            'audio/mpeg',
            {
              'generated-by': 'elevenlabs',
              'voice-id': voiceId || 'default',
              'generated-at': new Date().toISOString(),
              'user-id': user.id,
              'story-id': result.id,
            }
          );

          // Update story record
          await db
            .update(stories)
            .set({
              ttsAudioUrl: publicUrl,
              ttsGeneratedAt: new Date(),
              elevenLabsVoiceId: voiceId,
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
    console.error('Error in batch TTS generation:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}