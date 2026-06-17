// OpenAI GPT Image 1 mini client — the cheap alternative to Gemini for image
// generation. Selected via the `image.generationModel` system setting (see
// ./index). We use raw fetch rather than the openai SDK, matching the Whisper
// client (src/lib/grading/whisper-client.ts) — one or two endpoints don't
// justify the dependency.
//
// Model: gpt-image-1-mini, quality "low" — the cheapest tier, intended for
// quality testing. Text-to-image goes to /v1/images/generations; a prompt with
// a reference image (reading-passage character consistency, avatar pipeline)
// goes to /v1/images/edits. Both return base64 PNG in data[0].b64_json.

import type {
  GenerateImagePanelOptions,
  ImageClient,
  ImageGenerationResult,
} from './types';
import { buildScenePrompt, buildSpellingPrompt } from './prompts';

const GENERATIONS_ENDPOINT = 'https://api.openai.com/v1/images/generations';
const EDITS_ENDPOINT = 'https://api.openai.com/v1/images/edits';

const MODEL = 'gpt-image-1-mini';
const QUALITY = 'low';
const SIZE = '1024x1024';
const TIMEOUT_MS = 90_000; // GPT Image can be slow; covered by route maxDuration=60 on fire-and-forget paths

class GptImageClient implements ImageClient {
  private apiKey: string | null;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || null;
  }

  isConfigured(): boolean {
    return this.apiKey !== null;
  }

  async generateImage(word: string): Promise<ImageGenerationResult> {
    if (!word || !word.trim()) {
      return { success: false, error: 'No word provided for image generation.' };
    }
    return this.generate(buildSpellingPrompt(word), `"${word}"`);
  }

  async generateScene(description: string): Promise<ImageGenerationResult> {
    if (!description || !description.trim()) {
      return { success: false, error: 'No description provided for image generation.' };
    }
    return this.generate(buildScenePrompt(description), description.slice(0, 60));
  }

  async generateImagePanel(opts: GenerateImagePanelOptions): Promise<ImageGenerationResult> {
    if (!opts.prompt || !opts.prompt.trim()) {
      return { success: false, error: 'No prompt provided for image generation.' };
    }
    const label = opts.label ?? opts.prompt.slice(0, 60);
    if (opts.referenceImage) {
      return this.edit(opts.prompt, opts.referenceImage, label);
    }
    return this.generate(opts.prompt, label);
  }

  // ---------- transport ----------

  /** Text-to-image via /v1/images/generations. */
  private async generate(prompt: string, label: string): Promise<ImageGenerationResult> {
    return this.withRetry(label, () =>
      this.callJson(GENERATIONS_ENDPOINT, {
        model: MODEL,
        prompt,
        n: 1,
        size: SIZE,
        quality: QUALITY,
      }, label),
    );
  }

  /** Prompt + reference image via /v1/images/edits (multipart form). */
  private async edit(
    prompt: string,
    reference: { buffer: Buffer; mimeType: string },
    label: string,
  ): Promise<ImageGenerationResult> {
    return this.withRetry(label, async () => {
      const form = new FormData();
      form.append('model', MODEL);
      form.append('prompt', prompt);
      form.append('quality', QUALITY);
      form.append('size', SIZE);
      form.append('n', '1');
      const ext = reference.mimeType.includes('jpeg') || reference.mimeType.includes('jpg')
        ? 'jpg'
        : 'png';
      const blob = new Blob([new Uint8Array(reference.buffer)], { type: reference.mimeType });
      // The edits endpoint accepts repeated `image[]` fields; one reference is enough.
      form.append('image[]', blob, `reference.${ext}`);
      return this.callForm(EDITS_ENDPOINT, form, label);
    });
  }

  private async callJson(
    url: string,
    body: Record<string, unknown>,
    label: string,
  ): Promise<ImageGenerationResult> {
    if (!this.apiKey) return { success: false, error: 'OpenAI is not configured.' };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      console.log(`[gpt-image-client] Sending request for ${label}...`);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return await this.parseResponse(res, label);
    } catch (error) {
      return this.handleThrow(error);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callForm(
    url: string,
    form: FormData,
    label: string,
  ): Promise<ImageGenerationResult> {
    if (!this.apiKey) return { success: false, error: 'OpenAI is not configured.' };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      console.log(`[gpt-image-client] Sending edit request for ${label}...`);
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal: controller.signal,
      });
      return await this.parseResponse(res, label);
    } catch (error) {
      return this.handleThrow(error);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async parseResponse(res: Response, label: string): Promise<ImageGenerationResult> {
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error(`[gpt-image-client] API error ${res.status} for ${label}:`, errBody.slice(0, 500));
      return { success: false, error: `OpenAI Images API error ${res.status}: ${errBody.slice(0, 300)}` };
    }
    const data = (await res.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) {
      console.warn(`[gpt-image-client] no image data for ${label}`);
      return { success: false, error: 'No image data returned from OpenAI.' };
    }
    return {
      success: true,
      imageBuffer: Buffer.from(b64, 'base64'),
      contentType: 'image/png', // gpt-image-1 defaults to PNG output
    };
  }

  private handleThrow(error: unknown): ImageGenerationResult {
    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, error: `OpenAI request timed out after ${TIMEOUT_MS / 1000} seconds` };
    }
    console.error('[gpt-image-client] generation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'OpenAI image generation failed',
    };
  }

  /** 3 attempts with 1s/2s/4s backoff, retrying only transient signatures
   *  (429, 5xx, timeout, empty response, network errors). 4xx and config
   *  errors return immediately. Mirrors the Gemini client's retry policy. */
  private async withRetry(
    label: string,
    attempt: () => Promise<ImageGenerationResult>,
  ): Promise<ImageGenerationResult> {
    const BACKOFF_MS = [1000, 2000, 4000];
    let last: ImageGenerationResult | null = null;
    for (let i = 1; i <= 3; i++) {
      const result = await attempt();
      if (result.success) return result;
      last = result;
      if (!isTransient(result.error)) return result;
      if (i < 3) {
        const delay = BACKOFF_MS[i - 1] ?? 4000;
        console.warn(`[gpt-image-client] transient error on attempt ${i} for ${label}: ${result.error}. Retrying in ${delay}ms…`);
        await sleep(delay);
      }
    }
    console.error(`[gpt-image-client] all attempts failed for ${label}: ${last?.error ?? 'unknown'}`);
    return last!;
  }
}

function isTransient(message: string | undefined): boolean {
  if (!message) return false;
  if (/is not configured/.test(message)) return false;
  if (/No image data returned/.test(message)) return true;
  if (/timed out after/.test(message)) return true;
  const httpMatch = message.match(/API error (\d{3})/);
  if (httpMatch) {
    const status = parseInt(httpMatch[1]!, 10);
    return status === 429 || (status >= 500 && status < 600);
  }
  if (/fetch failed|ECONNRESET|ETIMEDOUT|ENETUNREACH|EAI_AGAIN|EPIPE/i.test(message)) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const gptImageClient = new GptImageClient();
