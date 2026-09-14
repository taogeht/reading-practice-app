// Provider-agnostic Whisper speech-to-text client. Supports:
//   openai → OpenAI whisper-1 (default)
//   groq   → Groq whisper-large-v3-turbo (fastest, ~70% cheaper)
//
// Switching providers is controlled by the admin setting 'audio.transcriptionModel'
// (or WHISPER_PROVIDER env var).

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { systemSettings } from '@/lib/db/schema';

export type WhisperProvider = 'openai' | 'groq';

export const WHISPER_PROVIDER_SETTING_KEY = 'audio.transcriptionModel';
const DEFAULT_WHISPER_PROVIDER: WhisperProvider = 'openai';

function normalizeWhisperProvider(raw: unknown): WhisperProvider | null {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (v === 'groq' || v === 'groq-whisper' || v === 'grok') return 'groq';
  if (v === 'openai' || v === 'whisper-1') return 'openai';
  return null;
}

const CACHE_TTL_MS = 5_000;
let cachedProvider: { provider: WhisperProvider; at: number } | null = null;

export async function getWhisperProvider(): Promise<WhisperProvider> {
  if (cachedProvider && Date.now() - cachedProvider.at < CACHE_TTL_MS) {
    return cachedProvider.provider;
  }

  let provider: WhisperProvider | null = null;
  try {
    const [row] = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, WHISPER_PROVIDER_SETTING_KEY))
      .limit(1);
    provider = normalizeWhisperProvider(row?.value);
  } catch (err) {
    console.warn('[whisperClient] could not read audio.transcriptionModel setting:', err);
  }

  if (!provider) provider = normalizeWhisperProvider(process.env.WHISPER_PROVIDER);
  if (!provider) provider = DEFAULT_WHISPER_PROVIDER;

  cachedProvider = { provider, at: Date.now() };
  return provider;
}

interface ProviderConfig {
  provider: WhisperProvider;
  endpoint: string;
  model: string;
  apiKey: string;
}

function resolveProviderConfig(provider: WhisperProvider): ProviderConfig {
  if (provider === 'groq') {
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      return {
        provider: 'groq',
        endpoint: 'https://api.groq.com/openai/v1/audio/transcriptions',
        model: 'whisper-large-v3-turbo',
        apiKey: groqKey,
      };
    }
    console.warn('[whisperClient] GROQ_API_KEY is not set. Falling back to OpenAI Whisper.');
  }

  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey) throw new WhisperError('Neither GROQ_API_KEY nor OPENAI_API_KEY is set');
  return {
    provider: 'openai',
    endpoint: 'https://api.openai.com/v1/audio/transcriptions',
    model: 'whisper-1',
    apiKey: openAiKey,
  };
}

// Resilience mirrors the image clients: bounded per-attempt timeout + retry
// with backoff on transient failures. A stuck fetch here used to hang the
// whole grading task indefinitely (no timeout, no retry).
const ATTEMPT_TIMEOUT_MS = 90_000; // transcribing a multi-minute WebM takes ~10-30s on OpenAI, <1s on Groq
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1_000, 4_000]; // waits between attempts 1→2 and 2→3

export interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

export interface WhisperResult {
  text: string;
  duration: number; // seconds
  words: WhisperWord[];
  language?: string;
}

export class WhisperError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'WhisperError';
  }
}

export async function transcribeAudio(
  audio: Buffer | Blob,
  filename: string,
  mimeType: string,
  prompt?: string,
): Promise<WhisperResult> {
  const provider = await getWhisperProvider();
  const config = resolveProviderConfig(provider);

  const blob =
    audio instanceof Blob ? audio : new Blob([new Uint8Array(audio)], { type: mimeType });

  const form = new FormData();
  form.append('file', blob, filename);
  form.append('model', config.model);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  // English-only assignment for v1; remove this if we ever support multi-language.
  form.append('language', 'en');
  if (prompt && prompt.trim()) {
    form.append('prompt', prompt.trim().slice(0, 1000));
  }

  let res: Response | null = null;
  let lastError: WhisperError | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      res = await fetch(config.endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}` },
        body: form,
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });
    } catch (err) {
      // Network failure or per-attempt timeout — always retryable.
      lastError = new WhisperError(
        `Whisper request failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${err instanceof Error ? err.message : String(err)}`,
      );
      res = null;
    }

    if (res) {
      if (res.ok) break;
      const errBody = await res.text().catch(() => '');
      lastError = new WhisperError(
        `Whisper API ${res.status}: ${errBody.slice(0, 500)}`,
        res.status,
      );
      // Only rate limits and server errors are worth retrying.
      if (res.status !== 429 && res.status < 500) throw lastError;
      res = null;
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 1]));
    }
  }
  if (!res) throw lastError ?? new WhisperError('Whisper request failed');

  const json = (await res.json()) as {
    text?: string;
    duration?: number;
    words?: { word: string; start: number; end: number }[];
    language?: string;
  };

  return {
    text: json.text ?? '',
    duration: json.duration ?? 0,
    words: (json.words ?? []).map((w) => ({ word: w.word, start: w.start, end: w.end })),
    language: json.language,
  };
}
