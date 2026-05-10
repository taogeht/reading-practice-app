export interface ImageGenerationResult {
  success: boolean;
  imageBuffer?: Buffer;
  contentType?: string;
  error?: string;
}

class GeminiImageClient {
  private apiKey: string | null = null;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || null;
    if (!this.apiKey) {
      console.warn('Gemini API key is not configured. Set GEMINI_API_KEY to enable image generation.');
    }
  }

  isConfigured() {
    return this.apiKey !== null;
  }

  async generateImage(word: string): Promise<ImageGenerationResult> {
    if (!this.apiKey) {
      return {
        success: false,
        error: 'Gemini is not configured. Please provide GEMINI_API_KEY.',
      };
    }

    if (!word || !word.trim()) {
      return {
        success: false,
        error: 'No word provided for image generation.',
      };
    }

    const prompt = `Create a simple, colorful clipart-style illustration of "${word}". The image should show a single clear object or concept on a plain white background, suitable for a young child's spelling flashcard. No text or letters in the image. Friendly, simple, and easy to recognize.`;
    return this.generateFromPrompt(prompt, `"${word}"`);
  }

  /**
   * Generate an image from a free-form scene description. Used by practice
   * questions where the picture must depict quantities, positions, or multi-
   * object scenes — not just a single labeled object.
   */
  async generateScene(description: string): Promise<ImageGenerationResult> {
    if (!this.apiKey) {
      return { success: false, error: 'Gemini is not configured. Please provide GEMINI_API_KEY.' };
    }
    if (!description || !description.trim()) {
      return { success: false, error: 'No description provided for image generation.' };
    }

    const prompt = `Create a simple, colorful clipart-style illustration for a Grade 1 ESL practice question. Scene: ${description.trim()}. Plain white background. No text, letters, or numbers anywhere in the image. Friendly, child-appropriate, and visually unambiguous — counts and positions should be obvious at a glance.`;
    return this.generateFromPrompt(prompt, description.slice(0, 60));
  }

  /**
   * Generate an image from a free-form prompt with optional reference
   * image(s) inlined as multi-modal input. Used by the reading-passage
   * pipeline to keep character appearance consistent across pages —
   * page 1 is generated cold, pages 2..N pass page 1's buffer as a
   * reference so the same girl shows up in every panel.
   *
   * Sibling of generateScene/generateImage: those wrap their own
   * curated prompt templates; this one is fully caller-driven.
   */
  async generateImagePanel(opts: {
    prompt: string;
    referenceImage?: { buffer: Buffer; mimeType: string };
    label?: string;
  }): Promise<ImageGenerationResult> {
    if (!this.apiKey) {
      return { success: false, error: 'Gemini is not configured. Please provide GEMINI_API_KEY.' };
    }
    if (!opts.prompt || !opts.prompt.trim()) {
      return { success: false, error: 'No prompt provided for image generation.' };
    }

    // parts ordering: reference-image intro text → image bytes → main
    // prompt. Gemini's image model has been observed to follow the
    // last text instruction more reliably when the reference is sandwiched.
    const parts: Array<
      | { text: string }
      | { inlineData: { mimeType: string; data: string } }
    > = [];
    if (opts.referenceImage) {
      parts.push({
        text: 'REFERENCE IMAGE — use this to keep the character appearance, outfits, and overall art style consistent in the new scene described below.',
      });
      parts.push({
        inlineData: {
          mimeType: opts.referenceImage.mimeType,
          data: opts.referenceImage.buffer.toString('base64'),
        },
      });
    }
    parts.push({ text: opts.prompt });

    const label = opts.label ?? opts.prompt.slice(0, 60);
    return this.runGenerationCall(parts, label);
  }

  /** Wrap runGenerationCallOnce with retry-on-transient. Up to 3 attempts
   *  total with 1s/2s/4s backoff between them. Retries fire only for
   *  transient signatures: empty content/image-data response, 5xx HTTP
   *  status, AbortError on the 30s timeout, or fetch-level network errors.
   *  4xx errors and configuration errors return immediately — those won't
   *  recover with another shot. */
  private async runGenerationCall(
    parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>,
    label: string,
  ): Promise<ImageGenerationResult> {
    const MAX_ATTEMPTS = 3;
    const BACKOFF_MS = [1000, 2000, 4000]; // index = attemptNumber-1
    let lastResult: ImageGenerationResult | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const result = await this.runGenerationCallOnce(parts, label);
      if (result.success) return result;

      lastResult = result;
      if (!isGeminiTransientError(result.error)) {
        // Non-retryable (config / 4xx). Return as-is.
        return result;
      }
      if (attempt < MAX_ATTEMPTS) {
        const delay = BACKOFF_MS[attempt - 1] ?? 4000;
        console.warn(
          `[gemini-client] transient error on attempt ${attempt} for ${label}: ${result.error}. Retrying in ${delay}ms…`,
        );
        await sleep(delay);
      }
    }

    console.error(
      `[gemini-client] all ${MAX_ATTEMPTS} attempts failed for ${label}: ${lastResult?.error ?? 'unknown'}`,
    );
    return lastResult!;
  }

  /** The single-attempt path. Same logic as before; the retry wrapper
   *  above decides whether to call this again. */
  private async runGenerationCallOnce(
    parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>,
    label: string,
  ): Promise<ImageGenerationResult> {
    if (!this.apiKey) {
      return { success: false, error: 'Gemini is not configured.' };
    }
    try {
      console.log(`[gemini-client] Sending request for ${label}...`);

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${this.apiKey}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const errBody = await res.text();
        console.error('[gemini-client] API error:', errBody);
        return { success: false, error: `Gemini API error ${res.status}: ${errBody}` };
      }

      const data = await res.json();
      const responseParts = data.candidates?.[0]?.content?.parts;
      if (!responseParts) {
        // Surface the diagnostic shape the empty-response branch usually
        // hides — promptFeedback.blockReason is the safety-block signal,
        // candidates[0].finishReason can be SAFETY/MAX_TOKENS/OTHER, and
        // safetyRatings call out which category triggered. Without these
        // logs the failure is indistinguishable from a transient.
        const diag = describeEmptyResponse(data, label);
        console.warn(`[gemini-client] empty content for ${label}: ${diag}`);
        return { success: false, error: 'No content returned from Gemini.' };
      }
      for (const part of responseParts) {
        if (part.inlineData) {
          return {
            success: true,
            imageBuffer: Buffer.from(part.inlineData.data, 'base64'),
            contentType: part.inlineData.mimeType || 'image/png',
          };
        }
      }
      // Same diagnostic logging — `parts` was non-empty but had no
      // inlineData (typically Gemini returned a text-only refusal or
      // explanation). Captures finishReason + any text part so we can
      // tell a SAFETY refusal from a model-quirk no-image response.
      const diag = describeNoImageResponse(data, responseParts, label);
      console.warn(`[gemini-client] no image part for ${label}: ${diag}`);
      return { success: false, error: 'No image data returned from Gemini.' };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Gemini request timed out after 30 seconds' };
      }
      console.error('Gemini image generation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Gemini image generation failed',
      };
    }
  }

  private async generateFromPrompt(prompt: string, label: string): Promise<ImageGenerationResult> {
    try {
      console.log(`[gemini-client] Sending request for ${label}...`);

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${this.apiKey}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['TEXT', 'IMAGE'],
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errBody = await res.text();
        console.error('[gemini-client] API error:', errBody);
        return { success: false, error: `Gemini API error ${res.status}: ${errBody}` };
      }

      const data = await res.json();
      const parts = data.candidates?.[0]?.content?.parts;
      if (!parts) {
        return { success: false, error: 'No content returned from Gemini.' };
      }

      for (const part of parts) {
        if (part.inlineData) {
          return {
            success: true,
            imageBuffer: Buffer.from(part.inlineData.data, 'base64'),
            contentType: part.inlineData.mimeType || 'image/png',
          };
        }
      }

      return { success: false, error: 'No image data returned from Gemini.' };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Gemini request timed out after 30 seconds' };
      }
      console.error('Gemini image generation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Gemini image generation failed',
      };
    }
  }
}

export const geminiImageClient = new GeminiImageClient();

// ---------- Retry helpers ----------

/** Match the transient error signatures runGenerationCallOnce emits.
 *  Conservative — only fires on signatures known to recover on retry.
 *  4xx and "Gemini is not configured" errors return false (no retry). */
function isGeminiTransientError(message: string | undefined): boolean {
  if (!message) return false;
  if (/^Gemini is not configured/.test(message)) return false;

  // Empty-content responses: model occasionally returns no parts or a
  // text-only candidate with no inlineData. Re-rolling usually produces
  // an image.
  if (/No content returned from Gemini/.test(message)) return true;
  if (/No image data returned from Gemini/.test(message)) return true;

  // 30s AbortController firing — treat as transient since later attempts
  // routinely succeed on the same prompt.
  if (/timed out after 30 seconds/.test(message)) return true;

  // 5xx server errors are transient by definition; 4xx are not.
  const httpMatch = message.match(/Gemini API error (\d{3})/);
  if (httpMatch) {
    const status = parseInt(httpMatch[1]!, 10);
    return status >= 500 && status < 600;
  }

  // Network-layer fetch failures (DNS / TCP / TLS) bubble up as
  // generic Error messages — retry these too.
  if (/fetch failed|ECONNRESET|ETIMEDOUT|ENETUNREACH|EAI_AGAIN|EPIPE/i.test(message))
    return true;

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- Diagnostic helpers ----------
//
// The Gemini "image returned empty" failure mode has multiple distinct
// causes that look identical at the parts-array level. These two helpers
// mine the response payload for the surface signals (promptFeedback,
// finishReason, safetyRatings, text-only parts) so the logs can answer
// "was this a SAFETY block or a transient empty response?" without
// requiring a fresh probe.

interface GeminiSafetyRating {
  category?: string;
  probability?: string;
  blocked?: boolean;
}

interface GeminiResponseShape {
  promptFeedback?: {
    blockReason?: string;
    safetyRatings?: GeminiSafetyRating[];
  };
  candidates?: Array<{
    finishReason?: string;
    safetyRatings?: GeminiSafetyRating[];
    content?: { parts?: Array<{ text?: string; inlineData?: unknown }> };
  }>;
}

/** Compose a one-line diagnostic from the empty-content branch — when
 *  candidates[0].content.parts is missing entirely. promptFeedback is
 *  the canonical place a safety pre-check shows up; if it's absent we
 *  still capture finishReason from candidates[0] when present. */
function describeEmptyResponse(data: unknown, _label: string): string {
  const r = data as GeminiResponseShape;
  const bits: string[] = [];
  if (r.promptFeedback?.blockReason) {
    bits.push(`promptFeedback.blockReason=${r.promptFeedback.blockReason}`);
  }
  const blockedSafety = r.promptFeedback?.safetyRatings?.filter((s) => s.blocked) ?? [];
  if (blockedSafety.length > 0) {
    bits.push(
      `promptFeedback.blocked=[${blockedSafety
        .map((s) => `${s.category}:${s.probability ?? '?'}`)
        .join(', ')}]`,
    );
  }
  const cand = r.candidates?.[0];
  if (cand?.finishReason) bits.push(`candidate.finishReason=${cand.finishReason}`);
  if (cand?.safetyRatings && cand.safetyRatings.length > 0) {
    bits.push(
      `candidate.safetyRatings=[${cand.safetyRatings
        .map((s) => `${s.category}:${s.probability ?? '?'}${s.blocked ? '!' : ''}`)
        .join(', ')}]`,
    );
  }
  if (bits.length === 0) {
    // Last resort: dump a truncated raw payload so we have *something*.
    bits.push(`raw=${truncateJson(data)}`);
  }
  return bits.join(' ');
}

/** Compose a one-line diagnostic from the no-image-part branch — when
 *  parts existed but none carried inlineData. Surfaces text-part bodies
 *  so a refusal sentence ("I can't generate that…") is visible. */
function describeNoImageResponse(
  data: unknown,
  parts: Array<{ text?: string; inlineData?: unknown }>,
  _label: string,
): string {
  const r = data as GeminiResponseShape;
  const bits: string[] = [];
  const cand = r.candidates?.[0];
  if (cand?.finishReason) bits.push(`finishReason=${cand.finishReason}`);
  if (cand?.safetyRatings && cand.safetyRatings.length > 0) {
    const blocked = cand.safetyRatings.filter((s) => s.blocked);
    if (blocked.length > 0) {
      bits.push(
        `blocked=[${blocked.map((s) => `${s.category}:${s.probability ?? '?'}`).join(', ')}]`,
      );
    } else {
      bits.push(
        `safety=[${cand.safetyRatings
          .map((s) => `${s.category}:${s.probability ?? '?'}`)
          .join(', ')}]`,
      );
    }
  }
  const textParts = parts
    .map((p) => (typeof p.text === 'string' ? p.text : ''))
    .filter((t) => t.length > 0);
  if (textParts.length > 0) {
    bits.push(`text="${textParts.join(' / ').slice(0, 200).replace(/\s+/g, ' ')}"`);
  }
  bits.push(`partTypes=[${parts.map((p) => (p.inlineData ? 'image' : p.text != null ? 'text' : 'other')).join(',')}]`);
  return bits.join(' ');
}

function truncateJson(data: unknown): string {
  try {
    const s = JSON.stringify(data);
    return s.length > 400 ? s.slice(0, 400) + '…' : s;
  } catch {
    return '<unserializable>';
  }
}
