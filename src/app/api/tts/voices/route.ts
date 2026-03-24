import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { googleTtsClient } from '@/lib/tts/client';
import { elevenLabsTtsClient } from '@/lib/tts/elevenlabs-client';
import { logError } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user || !['teacher', 'admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const allVoices: Array<{
      voice_id: string;
      name: string;
      provider: 'google' | 'elevenlabs';
      description?: string;
    }> = [];

    // Add ElevenLabs voices first (higher quality)
    if (elevenLabsTtsClient.isConfigured()) {
      for (const v of elevenLabsTtsClient.getVoices()) {
        allVoices.push({
          voice_id: `elevenlabs:${v.voice_id}`,
          name: v.name,
          provider: 'elevenlabs',
          description: v.description,
        });
      }
    }

    // Add Google voices
    if (googleTtsClient.isConfigured()) {
      for (const v of googleTtsClient.getVoices()) {
        allVoices.push({
          voice_id: `google:${v.voice_id}`,
          name: v.name,
          provider: 'google',
          description: v.description,
        });
      }
    }

    return NextResponse.json({
      voices: allVoices,
      total: allVoices.length,
    });

  } catch (error) {
    logError(error, 'api/tts/voices');
    return NextResponse.json(
      { error: 'Failed to fetch voices' },
      { status: 500 }
    );
  }
}

// Get quota information
export async function POST(request: NextRequest) {
  try {
    // Authenticate the request
    const user = await getCurrentUser();

    if (!user || !['teacher', 'admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { action, textLength } = body;

    if (action === 'check-quota') {
      if (!textLength || typeof textLength !== 'number') {
        return NextResponse.json(
          { error: 'textLength is required for quota check' },
          { status: 400 }
        );
      }

      const quotaInfo = await googleTtsClient.checkQuota(textLength);
      return NextResponse.json(quotaInfo);
    }

    if (action === 'get-subscription') {
      return NextResponse.json({
        hasQuota: true,
        remainingChars: Number.POSITIVE_INFINITY,
        requiredChars: 0,
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error) {
    logError(error, 'api/tts/voices');
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
