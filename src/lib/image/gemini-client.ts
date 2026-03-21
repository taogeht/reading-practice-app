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

    try {
      const prompt = `Create a simple, colorful clipart-style illustration of "${word}". The image should show a single clear object or concept on a plain white background, suitable for a young child's spelling flashcard. No text or letters in the image. Friendly, simple, and easy to recognize.`;

      console.log(`[gemini-client] Sending request for "${word}"...`);

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
      console.log('[gemini-client] Got response from Gemini');

      const parts = data.candidates?.[0]?.content?.parts;

      if (!parts) {
        return {
          success: false,
          error: 'No content returned from Gemini.',
        };
      }

      for (const part of parts) {
        if (part.inlineData) {
          const imageBuffer = Buffer.from(part.inlineData.data, 'base64');
          const mimeType = part.inlineData.mimeType || 'image/png';
          return {
            success: true,
            imageBuffer,
            contentType: mimeType,
          };
        }
      }

      return {
        success: false,
        error: 'No image data returned from Gemini. The word may be too abstract to illustrate.',
      };
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
