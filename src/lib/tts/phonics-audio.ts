import { googleTtsClient } from './client';
import { r2Client } from '@/lib/storage/r2-client';

// Phonics audio uses Google's most natural female voice. The same voice for
// every word in every classroom — that's the whole point of swapping off the
// browser's Web Speech API.
const PHONICS_VOICE_ID = 'en-US-Journey-F';
// Slightly slower than the default speaking rate so beginning readers can
// catch each phoneme. Tuned by ear with sample short-i/o/u CVCs.
const PHONICS_SPEAKING_RATE = 0.9;

// Stable per-word key — "pig" is generated once and reused across every unit
// that includes "pig". Lowercased + non-alphanumeric stripped to keep R2 keys
// safe (so "ice cream" → "ice-cream.mp3").
function audioKey(word: string): string {
  const slug = word
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `audio/phonics/${slug}.mp3`;
}

// Returns the proxy URL for a phonics word's audio. If the file doesn't exist
// in R2 yet, generates it with Google TTS (Journey-F) and uploads first.
//
// Failure-tolerant: returns null on any error — the UI falls back to the
// browser's Web Speech API, so the experience degrades gracefully when TTS
// is misconfigured or R2 is unreachable rather than blocking playback.
export async function ensurePhonicsAudio(word: string): Promise<string | null> {
  const trimmed = word.trim();
  if (!trimmed) return null;
  const key = audioKey(trimmed);

  try {
    const exists = await r2Client.fileExists(key);
    if (exists) {
      return r2Client.getProxyUrl(key);
    }
  } catch {
    // Proceed to attempt generation — fileExists is a best-effort optimization.
  }

  if (!googleTtsClient.isConfigured()) {
    return null;
  }

  const result = await googleTtsClient.generateSpeech({
    text: trimmed,
    voice_id: PHONICS_VOICE_ID,
    speakingRate: PHONICS_SPEAKING_RATE,
  });
  if (!result.success || !result.audioBuffer) {
    return null;
  }

  try {
    await r2Client.uploadFile(
      key,
      result.audioBuffer,
      result.contentType ?? 'audio/mpeg',
      { 'artifact-type': 'phonics-tts', word: trimmed },
    );
  } catch {
    return null;
  }

  return r2Client.getProxyUrl(key);
}

// Bulk version — runs ensures in parallel and returns a word→URL map. Words
// that fail (TTS error, R2 error) are simply omitted from the map; the
// caller treats their absence as "fall back to Web Speech for that one".
export async function ensurePhonicsAudioBatch(
  words: string[],
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(words.map((w) => w.trim()).filter(Boolean)));
  const results = await Promise.all(
    unique.map(async (word) => {
      const url = await ensurePhonicsAudio(word);
      return [word, url] as const;
    }),
  );
  const out: Record<string, string> = {};
  for (const [word, url] of results) {
    if (url) out[word] = url;
  }
  return out;
}
