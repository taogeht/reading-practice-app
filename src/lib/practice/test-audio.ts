import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { generatedTests } from '@/lib/db/schema';
import { googleTtsClient } from '@/lib/tts/client';
import { r2Client } from '@/lib/storage/r2-client';
import { logError } from '@/lib/logger';
import type { TestDocument, TestItem } from './test-types';

type ResolvedTts = {
  client: typeof googleTtsClient | null;
  voiceId: string | undefined;
};

// Resolves which TTS client + voice to use with Google Cloud Journey voices.
function resolveTts(voiceId?: string): ResolvedTts {
  if (!googleTtsClient.isConfigured()) return { client: null, voiceId: undefined };
  if (voiceId) {
    const [, ...rest] = voiceId.split(':');
    const v = rest.join(':') || voiceId;
    return { client: googleTtsClient, voiceId: v };
  }
  return { client: googleTtsClient, voiceId: undefined };
}

// Re-reads the test row, sets one item's audioUrl by id, writes the document
// back. Re-reading per call keeps the background pass from clobbering a
// concurrent edit; audio generation is sequential so there's no write/write race.
async function patchItemAudio(testId: string, itemId: string, audioUrl: string): Promise<boolean> {
  const rows = await db
    .select({ document: generatedTests.document })
    .from(generatedTests)
    .where(eq(generatedTests.id, testId))
    .limit(1);
  const doc = rows[0]?.document;
  if (!doc) return false;

  let touched = false;
  for (const section of doc.sections) {
    for (const item of section.items) {
      if (item.id === itemId) {
        item.audioUrl = audioUrl;
        touched = true;
      }
    }
  }
  if (!touched) return false;

  await db.update(generatedTests).set({ document: doc }).where(eq(generatedTests.id, testId));
  return true;
}

// Generates a TTS clip for every listening item that has audioText but no audio
// yet, patching each url in as it lands so the test page can poll progressively.
// Fire-and-forget: never throws, swallows per-item errors. Mirrors the
// practice-questions / test-images background passes.
export async function generateTestAudio(
  testId: string,
  document: TestDocument,
  voiceId?: string,
): Promise<void> {
  const { client, voiceId: resolvedVoice } = resolveTts(voiceId);
  if (!client) {
    logError(new Error('No TTS provider configured'), 'tests.audio');
    return;
  }

  const pending = document.sections
    .flatMap((s) => s.items)
    .filter((it) => it.audioText && !it.audioUrl);

  for (const item of pending) {
    try {
      const result = await client.generateSpeech({
        text: item.audioText as string,
        voice_id: resolvedVoice,
      });
      if (!result.success || !result.audioBuffer) {
        logError(new Error(result.error || 'TTS failed'), `tests.audio[${item.id}]`);
        continue;
      }
      const buffer = Buffer.isBuffer(result.audioBuffer)
        ? result.audioBuffer
        : Buffer.from(result.audioBuffer);
      const key = r2Client.generateTestAudioKey(testId, item.id, Date.now());
      const audioUrl = await r2Client.uploadFile(key, buffer, result.contentType || 'audio/mpeg');
      await patchItemAudio(testId, item.id, audioUrl);
    } catch (err) {
      logError(err, `tests.audio[${item.id}]`);
    }
    // Light rate-limit between synthesis calls.
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

// Regenerates a single listening item's audio (optionally with a different
// voice) and returns the new url, or null if the item has no audioText. Throws
// on synthesis failure so the caller can surface it.
export async function regenerateTestItemAudio(
  testId: string,
  itemId: string,
  voiceId?: string,
): Promise<{ audioUrl: string } | null> {
  const rows = await db
    .select({ document: generatedTests.document })
    .from(generatedTests)
    .where(eq(generatedTests.id, testId))
    .limit(1);
  const doc = rows[0]?.document;
  if (!doc) return null;

  let target: TestItem | null = null;
  for (const section of doc.sections) {
    for (const item of section.items) {
      if (item.id === itemId) target = item;
    }
  }
  if (!target || !target.audioText) return null;

  const { client, voiceId: resolvedVoice } = resolveTts(voiceId);
  if (!client) throw new Error('No TTS provider configured');

  const result = await client.generateSpeech({ text: target.audioText, voice_id: resolvedVoice });
  if (!result.success || !result.audioBuffer) {
    throw new Error(result.error || 'TTS failed');
  }
  const buffer = Buffer.isBuffer(result.audioBuffer)
    ? result.audioBuffer
    : Buffer.from(result.audioBuffer);
  const key = r2Client.generateTestAudioKey(testId, itemId, Date.now());
  const audioUrl = await r2Client.uploadFile(key, buffer, result.contentType || 'audio/mpeg');

  target.audioUrl = audioUrl;
  await db.update(generatedTests).set({ document: doc }).where(eq(generatedTests.id, testId));
  return { audioUrl };
}
