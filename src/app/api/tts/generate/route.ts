import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { googleTtsClient } from '@/lib/tts/client';
import { r2Client } from '@/lib/storage/r2-client';
import { db } from '@/lib/db';
import { stories } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logError, createRequestContext } from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    // Authenticate the request - only teachers and admins can generate TTS
    const user = await getCurrentUser();

    if (!user || !['teacher', 'admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { storyId, text, voiceId } = body;

    // Validate inputs
    if ((!storyId && !text) || (storyId && text)) {
      return NextResponse.json(
        { error: 'Either storyId or text is required, but not both' },
        { status: 400 }
      );
    }

    let textToGenerate = text;
    let storyToUpdate = null;

    // If storyId is provided, fetch the story content
    if (storyId) {
      const story = await db
        .select()
        .from(stories)
        .where(eq(stories.id, storyId))
        .limit(1);

      if (story.length === 0) {
        return NextResponse.json(
          { error: 'Story not found' },
          { status: 404 }
        );
      }

      storyToUpdate = story[0];
      textToGenerate = storyToUpdate.content;
    }

    // Generate TTS audio
    const ttsResult = await googleTtsClient.generateSpeech({
      text: textToGenerate,
      voice_id: voiceId,
    });

    if (!ttsResult.success || !ttsResult.audioBuffer) {
      return NextResponse.json(
        { error: ttsResult.error || 'TTS generation failed' },
        { status: 500 }
      );
    }

    // Generate filename and upload to R2
    const filename = storyId 
      ? `story-${storyId}-${Date.now()}.mp3`
      : `tts-${Date.now()}.mp3`;
    
    const audioKey = r2Client.generateAudioKey('tts', filename);
    
    const buffer = Buffer.isBuffer(ttsResult.audioBuffer)
      ? ttsResult.audioBuffer
      : Buffer.from(ttsResult.audioBuffer);

    const selectedVoiceId = voiceId || googleTtsClient.getVoices()[0]?.voice_id || 'default';

    const metadata: Record<string, string> = {
      'generated-by': 'google-tts',
      'voice-id': selectedVoiceId,
      'generated-at': new Date().toISOString(),
      'user-id': user.id,
    };

    if (storyId) {
      metadata['story-id'] = storyId;
    }

    const publicUrl = await r2Client.uploadFile(
      audioKey,
      buffer,
      ttsResult.contentType || 'audio/mpeg',
      metadata,
    );

    // If this was for a story, update the story record
    if (storyToUpdate) {
      await db
        .update(stories)
        .set({
          ttsAudioUrl: publicUrl,
          ttsGeneratedAt: new Date(),
          elevenLabsVoiceId: selectedVoiceId,
          updatedAt: new Date(),
        })
        .where(eq(stories.id, storyId));
    }

    // Return success response
    return NextResponse.json({
      success: true,
      audioUrl: publicUrl,
      audioKey,
      storyId: storyToUpdate?.id,
      message: storyToUpdate 
        ? 'TTS audio generated and story updated successfully'
        : 'TTS audio generated successfully',
    });

  } catch (error) {
    logError(error, 'api/tts/generate');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
