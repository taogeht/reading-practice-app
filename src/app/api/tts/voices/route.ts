import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { googleTtsClient } from '@/lib/tts/client';
import { logError, createRequestContext } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    // Authenticate the request - only teachers and admins can view voices
    const user = await getCurrentUser();

    if (!user || !['teacher', 'admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Fetch available voices from Google Cloud configuration
    const voices = googleTtsClient.getVoices();

    // Filter for voices suitable for reading content
    const suitableVoices = voices.filter(voice => {
      const name = voice.name.toLowerCase();
      const category = voice.category?.toLowerCase() || '';
      
      // Prefer clear, professional voices for educational content
      return (
        category === 'professional' ||
        category === 'narration' ||
        name.includes('narrative') ||
        name.includes('professional') ||
        name.includes('clear') ||
        name.includes('educational')
      );
    });

    // If no suitable voices found, return all voices
    const voicesToReturn = suitableVoices.length > 0 ? suitableVoices : voices;

    return NextResponse.json({
      voices: voicesToReturn,
      total: voicesToReturn.length,
      recommended: suitableVoices.slice(0, Math.min(voicesToReturn.length, 5)),
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
