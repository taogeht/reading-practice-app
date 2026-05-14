// POST /api/teacher/reading/passages/[passageId]/audio
//
// Generate TTS audio for every page of a reading passage and persist the
// R2 key + voice on each storyPages row. Sequential (not parallel) so we
// don't fan out N concurrent Google TTS calls per request — each page is
// usually <300 chars so the latency cost is minor.
//
// Body: { voiceId: string, speakingRate?: number }
//   - voiceId: any voice in googleTtsClient.getVoices() (defaults to
//     en-US-Journey-F if omitted)
//   - speakingRate: 0.25..4.0; Google TTS Journey voices ignore this and
//     return audio at native speed. Studio / Neural2 voices honor it.
//     The UI surfaces this caveat next to the slider.
//
// On success returns { pages: [{pageNumber, audioUrl, voice}] }.
//
// Auth: teacher or admin.

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getCurrentUser } from '@/lib/auth';
import { canGenerateReadingContent } from '@/lib/auth/reading-content';
import { db } from '@/lib/db';
import { readingPassages, storyPages } from '@/lib/db/schema';
import { r2Client } from '@/lib/storage/r2-client';
import { googleTtsClient } from '@/lib/tts/client';
import { logError, logInfo } from '@/lib/logger';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ passageId: string }>;
}

interface RequestBody {
  voiceId?: string;
  speakingRate?: number;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 401 });
    }
    if (!(await canGenerateReadingContent(user))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { passageId } = await params;

    const [passage] = await db
      .select({ id: readingPassages.id, title: readingPassages.title })
      .from(readingPassages)
      .where(eq(readingPassages.id, passageId))
      .limit(1);
    if (!passage) {
      return NextResponse.json({ error: 'Passage not found' }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const voiceId = body.voiceId ?? 'en-US-Journey-F';
    const voice = googleTtsClient.getVoices().find((v) => v.voice_id === voiceId);
    if (!voice) {
      return NextResponse.json({ error: `Unknown voiceId: ${voiceId}` }, { status: 400 });
    }
    const speakingRate = typeof body.speakingRate === 'number' ? body.speakingRate : 1.0;
    if (speakingRate < 0.25 || speakingRate > 4.0) {
      return NextResponse.json(
        { error: 'speakingRate must be between 0.25 and 4.0' },
        { status: 400 },
      );
    }

    if (!googleTtsClient.isConfigured()) {
      return NextResponse.json(
        { error: 'Google Cloud TTS is not configured on this server' },
        { status: 503 },
      );
    }

    const pages = await db
      .select({
        id: storyPages.id,
        pageNumber: storyPages.pageNumber,
        text: storyPages.text,
      })
      .from(storyPages)
      .where(eq(storyPages.passageId, passageId))
      .orderBy(storyPages.pageNumber);

    if (pages.length === 0) {
      return NextResponse.json({ error: 'Passage has no pages' }, { status: 400 });
    }

    logInfo(
      `tts batch started`,
      `api/teacher/reading/passages/audio passage_id=${passageId} voice=${voiceId} rate=${speakingRate} pages=${pages.length} user_id=${user.id}`,
    );

    // Sequential — Google TTS quota is per-minute character-count, and
    // sequential N×300-char calls cost <2 seconds total for a typical
    // 8-page passage. Parallel would buy ~1 second at the cost of
    // confusing partial-failure semantics.
    const results: { pageNumber: number; audioUrl: string; voice: string }[] = [];
    for (const page of pages) {
      const tts = await googleTtsClient.generateSpeech({
        text: page.text,
        voice_id: voiceId,
        speakingRate,
      });
      if (!tts.success || !tts.audioBuffer) {
        logError(
          new Error(tts.error ?? 'unknown TTS error'),
          `api/teacher/reading/passages/audio passage_id=${passageId} page=${page.pageNumber}`,
        );
        return NextResponse.json(
          {
            error: `TTS failed on page ${page.pageNumber}: ${tts.error ?? 'unknown'}`,
            partialResults: results,
          },
          { status: 502 },
        );
      }
      const key = r2Client.generateStoryAudioKey(passageId, page.pageNumber, voiceId);
      await r2Client.uploadFile(key, tts.audioBuffer, tts.contentType ?? 'audio/mpeg', {
        'passage-id': passageId,
        'page-number': String(page.pageNumber),
        voice: voiceId,
        'speaking-rate': String(speakingRate),
      });
      await db
        .update(storyPages)
        .set({ ttsAudioKey: key, ttsVoice: voiceId })
        .where(eq(storyPages.id, page.id));
      results.push({
        pageNumber: page.pageNumber,
        audioUrl: r2Client.getProxyUrl(key),
        voice: voiceId,
      });
    }

    logInfo(
      `tts batch complete`,
      `api/teacher/reading/passages/audio passage_id=${passageId} voice=${voiceId} rate=${speakingRate} pages=${results.length}`,
    );

    return NextResponse.json({ pages: results });
  } catch (err) {
    logError(err, 'api/teacher/reading/passages/audio');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
