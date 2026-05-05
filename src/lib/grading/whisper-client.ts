// Thin wrapper around OpenAI's audio/transcriptions endpoint. We use fetch +
// FormData directly rather than pulling in the openai SDK, since we only need
// this one endpoint and the SDK adds ~100kb of types we don't use.

const WHISPER_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const WHISPER_MODEL = 'whisper-1';

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
): Promise<WhisperResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new WhisperError('OPENAI_API_KEY is not set');

  const blob =
    audio instanceof Blob ? audio : new Blob([new Uint8Array(audio)], { type: mimeType });

  const form = new FormData();
  form.append('file', blob, filename);
  form.append('model', WHISPER_MODEL);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  // English-only assignment for v1; remove this if we ever support multi-language.
  form.append('language', 'en');

  const res = await fetch(WHISPER_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new WhisperError(
      `Whisper API ${res.status}: ${errBody.slice(0, 500)}`,
      res.status,
    );
  }

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
